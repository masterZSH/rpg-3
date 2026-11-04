// src/core/combat.js —— 30Hz 固定步长逻辑 step(state, intents)
// design_v1.md §3.2 / §5.1 / §5.3 / §6 / §7 的确定性实现。
// 纯逻辑：零 DOM / 零 Canvas / 零浏览器 API / 零墙钟 / 零 Math.random / 零 localStorage。
// step() 原地更新 state 并返回同一引用；渲染插值所需的 prevX/prevY 在 tick 开头保存。
import {
  balance, theme, getMonster, getSkill, getDropTable,
} from './tables.js';
import { nextRandom, chance } from './rng.js';
import { pxPerSecondToPerTick } from './time.js';
import { computeDamage, attackIntervalTicks, clampCrit } from './formulas.js';
import {
  createPlayer, gainExp, hasteBonusOf, generateRewards, expGrantFor, settleRun,
} from './progression.js';
import { rollNodeDrop } from './loot.js';
import { EV, emit, acquire, releaseAll } from './state.js';

const F = balance.field;
const AUX = balance.aux;
const EMPTY = [];

// ─────────── §7.2 状态优先级与打断矩阵 ───────────
export const STATE_PRIORITY = { idle: 0, attack: 1, cast: 2, dodge: 3, hurt: 4, dead: 5 };

// 行 = 当前状态，列 = 试图进入的状态（✔/✘ 按 §7.2）
const MATRIX = {
  idle:   { attack: true,  cast: true,  dodge: true,  hurt: true,  dead: true },
  attack: { attack: false, cast: true,  dodge: true,  hurt: true,  dead: true },
  cast:   { attack: false, cast: false, dodge: true,  hurt: true,  dead: true },
  dodge:  { attack: false, cast: false, dodge: false, hurt: true,  dead: true },  // hurt 仅眩晕/定身强制
  hurt:   { attack: false, cast: false, dodge: true,  hurt: false, dead: true },  // dodge 仅普通硬直可受身
  dead:   { attack: false, cast: false, dodge: false, hurt: false, dead: false },
};

export function canTransition(from, to) {
  const row = MATRIX[from];
  return !!(row && row[to]);
}

// §3.5 无敌帧 = 第 0–13 tick（invulnTicks=14），位移 = 第 0–9 tick（moveTicks=10）
export function isInvulnerableAt(dodgeTick) {
  return dodgeTick >= 0 && dodgeTick < balance.dodge.invulnTicks;
}

// ─────────── 工具 ───────────
const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

function resetPoolObj(o, cfg) {
  for (const k in o) if (k !== 'active') o[k] = undefined;
  if (cfg) for (const k in cfg) o[k] = cfg[k];
  return o;
}

function addResource(p, v) {
  p.resource = Math.min(p.resourceMax, p.resource + v);
}

function moveToward(o, tx, ty, step) {
  const dx = tx - o.x, dy = ty - o.y;
  const d = Math.hypot(dx, dy) || 1;
  o.x = clamp(o.x + dx / d * step, F.minX, F.maxX);
  o.y = clamp(o.y + dy / d * step, F.activeTop, F.activeBottom);
}

function moveAway(o, tx, ty, step) {
  moveToward(o, o.x + (o.x - tx), o.y + (o.y - ty), step);
}

function nearestEnemy(state, x, y, excludeUid) {
  let best = null, bd = Infinity;
  const arr = state.enemies;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (!e.active || e.hp <= 0 || e.uid === excludeUid) continue;
    const d = dist(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function enemyByUid(state, uid) {
  const arr = state.enemies;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].active && arr[i].uid === uid) return arr[i];
  }
  return null;
}

function currentTarget(state) {
  const p = state.player;
  let t = p.targetId ? enemyByUid(state, p.targetId) : null;
  if (!t || t.hp <= 0) {
    t = nearestEnemy(state, p.x, p.y);
    p.targetId = t ? t.uid : null;
  }
  return t;
}

export function aliveEnemyCount(state) {
  let n = 0;
  for (let i = 0; i < state.enemies.length; i++) {
    if (state.enemies[i].active && state.enemies[i].hp > 0) n++;
  }
  return n;
}

const MID_R = (1 - balance.formula.varianceBase) / balance.formula.varianceSpan;
function rollFnFor(state, guaranteed) {
  if (!guaranteed) return () => nextRandom(state);
  let n = 0;
  return () => { n += 1; return n === 1 ? AUX.noCrit : MID_R; };
}

// ─────────── 异常状态（§7.3，只有 4 种） ───────────
function applySlow(t, slow) {
  if (!slow) return;
  if (!t.slow) t.slow = { move: slow.move || 0, atk: slow.atk || 0, def: slow.def || 0 };
  else {
    t.slow.move = Math.max(t.slow.move, slow.move || 0);
    t.slow.atk = Math.max(t.slow.atk, slow.atk || 0);
    t.slow.def = Math.max(t.slow.def, slow.def || 0);
  }
  t.slowTicks = Math.max(t.slowTicks || 0, slow.ticks || 0);
}

function applyBurn(t, burn, sourceAtk) {
  if (!burn) return;
  const coef = Math.max(t.burn ? t.burn.coefPerHit : 0, burn.coefPerHit);
  const ticks = Math.max(t.burn ? t.burn.ticks : 0, burn.ticks);
  t.burn = {
    coefPerHit: coef, ticks,
    timer: t.burn ? t.burn.timer : balance.status.burnTickPerHit,
    sourceAtk,
  };
}

function playerDmgReduce(p) {
  let r = 0;
  if (p.passives.dmgReduce) r += p.passives.dmgReduce.value;
  if (p.passives.lowHpReduce && p.hp < p.maxHp * p.passives.lowHpReduce.hpPct) {
    r += p.passives.lowHpReduce.value;
  }
  if (p.passives.postDodgeReduce && p.postDodgeReduceTicks > 0) r += p.passives.postDodgeReduce.value;
  return r;
}

function enterHurt(state, ticks, control) {
  const p = state.player;
  if (!canTransition(p.state, 'hurt')) return;
  if (p.state === 'cast') {
    // §7.2 cast 被 hurt 打断：返还 100% 资源，不进 CD
    p.resource = Math.min(p.resourceMax, p.resource + Math.floor(p.castRefundCost * balance.combat.hurtRefundPct));
    if (p.castSlot >= 0) p.skillCd[p.castSlot] = 0;
    p.castSkillId = null; p.castSlot = -1; p.castLevel = null; p.castRefundCost = 0;
  }
  p.state = 'hurt'; p.stateTicks = 0; p.hurtTotal = ticks;
  if (control) p.stunTicks = Math.max(p.stunTicks || 0, ticks);
}

function triggerShieldBurst(state, burst) {
  const p = state.player;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (!e.active || e.hp <= 0) continue;
    if (dist(p.x, p.y, e.x, e.y) <= burst.radius) {
      dealDamageToEnemy(state, e, damageCtxForPlayer(state, e, burst.coef, 0, false));
    }
  }
  p.shieldBurst = null;
}

// 统一扣血 / 护盾 / hurt / 附加状态 / 死亡判定
function applyPlayerHit(state, toHp, display, absorbed, opts) {
  const p = state.player;
  if (!p || !p.alive) return;
  if (absorbed > 0 && p.shield > 0) {
    p.shield = Math.max(0, p.shield - absorbed);
    if (p.shield === 0 && p.shieldBurst) triggerShieldBurst(state, p.shieldBurst);
  }
  const dealt = Math.max(balance.formula.minDamage, Math.round(toHp));
  p.hp -= dealt;
  p.flashTicks = AUX.hitFlashTicks;
  emit(state, EV.DAMAGE, { x: p.x, y: p.y - AUX.floaterOffsetY, value: display, kind: 'player' });
  if (p.resourceId === 'rage') addResource(p, p.resourceGen.onHurt);
  p.lastHurtTick = state.tick;

  if (opts.slow) applySlow(p, opts.slow);
  if (opts.burn) applyBurn(p, opts.burn, opts.sourceAtk || 0);
  if (opts.stunTicks) {
    p.stunTicks = Math.max(p.stunTicks || 0, opts.stunTicks);
    enterHurt(state, opts.stunTicks, true);
  }
  if (!opts.noHurt && !opts.stunTicks && dealt >= p.maxHp * balance.combat.hurtThresholdPct) {
    enterHurt(state, balance.combat.hurtTicks, false);
  }

  if (p.hp <= 0) {
    if (p.passives.revive && !p.reviveUsed) {
      p.reviveUsed = true;
      p.hp = p.maxHp * p.passives.revive.hpPct;
      emit(state, EV.HEAL, { x: p.x, y: p.y, value: Math.round(p.hp) });
    } else {
      p.alive = false; p.hp = 0; p.state = 'dead';
      settleRun(state, false);
      emit(state, EV.BATTLE_LOSE, {});
    }
  }
}

function damageCtxForPlayer(state, e, coef, critBonus, guaranteed) {
  const p = state.player;
  let dmgAmp = 0;
  if (p.passives.executeBonus && e.hp < e.maxHp * p.passives.executeBonus.hpPct) {
    dmgAmp += p.passives.executeBonus.value;
  }
  return {
    atk: p.atk, coef, flat: 0,
    targetDef: e.def,
    armorPen: p.passives.armorPen ? p.passives.armorPen.value : 0,
    armorReduce: e.slow ? e.slow.def : 0,
    dmgAmp, dmgReduce: 0,
    crit: guaranteed ? 1 : clampCrit(p.crit + (critBonus || 0)),
    critDmg: p.critDmg,
    shield: e.shield,
    skillSlot: -1,
  };
}

function dealDamageToEnemy(state, e, ctx, guaranteed) {
  if (!e || !e.active || e.hp <= 0) return null;
  const r = computeDamage(ctx, rollFnFor(state, guaranteed));
  let toHp = r.toHp;
  const m = e.mechDef;
  if (m.block && chance(state, m.block.chance)) {
    toHp = Math.max(balance.formula.minDamage, Math.round(toHp * m.block.mult));
  }
  if (e.shield > 0) e.shield = Math.max(0, e.shield - r.absorbed);
  e.hp -= toHp;
  e.flashTicks = r.crit ? AUX.critFlashTicks : AUX.hitFlashTicks;
  // A1（制作人放开项）：damage 事件补带技能槽位（ctx.skillSlot core 内已存在；
  // 复用 EKEYS 既有 'slot' 键，state.js 零改动）。-1 = 普攻/灼烧等非技能来源。
  emit(state, EV.DAMAGE, {
    x: e.x, y: e.y - AUX.floaterOffsetY, value: r.final, crit: r.crit,
    targetId: e.uid, kind: 'enemy', slot: ctx.skillSlot,
  });

  const p = state.player;
  if (p.passives.lifesteal) p.hp = Math.min(p.maxHp, p.hp + toHp * p.passives.lifesteal.value);
  if (r.crit) {
    if (p.passives.critHeal) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.passives.critHeal.hpPct);
    if (p.passives.critExtra) {
      const extra = Math.max(balance.formula.minDamage, Math.round(p.atk * p.passives.critExtra.coef));
      e.hp -= extra;
      emit(state, EV.DAMAGE, { x: e.x, y: e.y - AUX.floaterOffsetY, value: extra, kind: 'enemy' });
    }
    if (ctx.skillSlot >= 0 && p.passives.skillCritCdReduce) {
      p.skillCd[ctx.skillSlot] = Math.max(0, p.skillCd[ctx.skillSlot] - p.passives.skillCritCdReduce.ticks);
    }
    if (p.passives.critHaste) {
      p.critHasteBonus = p.passives.critHaste.bonus;
      p.critHasteTicks = p.passives.critHaste.ticks;
    }
  }
  if (e.hp <= 0) killEnemy(state, e);
  return r;
}

function dealDamageToPlayer(state, ctx, opts) {
  const p = state.player;
  if (!p || !p.alive) return null;
  if (p.invulnerable) {
    emit(state, EV.DODGE_SUCCESS, { x: p.x, y: p.y });
    return null;
  }
  const r = computeDamage(ctx, () => nextRandom(state));
  applyPlayerHit(state, r.toHp, r.final, r.absorbed, opts || {});
  return r;
}

// Boss / 精英机制伤害是 design 直接给定的固定值（§6.3），不经过 §5.1 公式
function applyFixedDamageToPlayer(state, amount, opts) {
  const p = state.player;
  if (!p || !p.alive) return null;
  if (p.invulnerable) {
    emit(state, EV.DODGE_SUCCESS, { x: p.x, y: p.y });
    return null;
  }
  const display = Math.max(balance.formula.minDamage, Math.round(amount));
  let toHp = Math.max(balance.formula.minDamage, Math.round(amount * (1 - playerDmgReduce(p))));
  let absorbed = 0;
  if (p.shield > 0) { absorbed = Math.min(p.shield, toHp); toHp -= absorbed; }
  applyPlayerHit(state, toHp, display, absorbed, opts || {});
  return { toHp, display };
}

// ─────────── 敌人生成 ───────────
function spawnEnemy(state, defId, x, y, opts) {
  const m = getMonster(defId);
  const e = acquire(state.enemies);
  resetPoolObj(e, {
    uid: (state.nextUid = (state.nextUid || 0) + 1),
    defId, name: m.name, tier: m.tier, size: m.size, ai: m.ai,
    maxHp: m.hp, hp: m.hp, atk: m.atk, def: m.def,
    intervalTicks: m.intervalTicks, speed: m.speed, rangePx: m.rangePx,
    keepDistance: m.keepDistance || 0, projectileSpeed: m.projectileSpeed || 0,
    retreatPx: m.retreatPx || 0,
    x, y, prevX: x, prevY: y, facing: 1,
    shield: 0, burn: null, stunTicks: 0, slow: null, slowTicks: 0,
    attackCooldown: m.intervalTicks,
    mechanicTimer: m.mechanic ? m.mechanic.everyTicks : 0,
    dashTimer: m.dash ? m.dash.everyTicks : 0,
    divePhase: 0, hasteBuffTicks: 0, hasteBonus: 0,
    dashVx: 0, dashVy: 0, dashMoveTicks: 0,
    flashTicks: 0, lifeTicks: opts && opts.lifeTicks ? opts.lifeTicks : 0,
    summoned: !!(opts && opts.summoned), enrageDone: false,
    bossCd: m.bossMechanics ? m.bossMechanics.map((b) => b.cdTicks) : null,
    mechDef: m, dead: false, hurtTotal: 0,
  });
  return e;
}

function spawnWave(state, idx) {
  const node = getDropTable().chapters[state.chapter].nodes[state.node - 1];
  const wave = node.waves[idx];
  if (!wave) return;
  let total = 0;
  for (let i = 0; i < wave.length; i++) total += wave[i].count;
  let n = 0;
  for (let i = 0; i < wave.length; i++) {
    for (let k = 0; k < wave[i].count; k++) {
      const x = F.minX + (F.maxX - F.minX) * (n + 1) / (total + 1);
      const y = F.spawnY + (n % 2) * AUX.spawnRowGap;
      spawnEnemy(state, wave[i].id, x, y);
      n += 1;
    }
  }
  state.wave = idx;
}

// ─────────── 弹道 / 预警 / 区域 ───────────
function spawnProjectile(state, cfg) {
  const pr = acquire(state.projectiles);
  return resetPoolObj(pr, cfg);
}

function spawnHazard(state, cfg) {
  return resetPoolObj(acquire(state.hazards), cfg);
}

function spawnTelegraph(state, e, p, mech, isBoss, extraDelay, center) {
  const dx = p.x - e.x, dy = p.y - e.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = center ? center.x : (mech.followPlayer ? p.x : e.x);
  const cy = center ? center.y : (mech.followPlayer ? p.y : e.y);
  const warn = mech.warnTicks + (extraDelay || 0);
  spawnHazard(state, {
    kind: 'telegraph', name: mech.name, color: mech.color, shape: mech.shape,
    cx, cy, radius: mech.radius || 0, width: mech.width || 0, length: mech.length || 0,
    angle: mech.angle || 0, remaining: warn, total: mech.warnTicks,
    damage: mech.damage || 0, stunTicks: mech.stunTicks || 0,
    slow: mech.slow || null, burn: mech.burn || null,
    followPlayer: !!mech.followPlayer, sourceAtk: e ? e.atk : 0,
    originX: e ? e.x : cx, originY: e ? e.y : cy,
    dirX: dx / len, dirY: dy / len,
    isBoss: !!isBoss, zoneTicks: mech.zoneTicks || 0,
    hitEvery: 0, hitTimer: 0, fromPlayer: false, dps: mech.damage || 0,
    coef: 0, statuses: null, skillSlot: -1, guaranteedCrit: false,
    sourceEnemy: e ? e.uid : null,
  });
  if (isBoss) {
    state.bossBanner = { name: mech.name, remaining: mech.warnTicks, total: mech.warnTicks, color: mech.color };
    emit(state, EV.BOSS_WARN, { name: mech.name, color: mech.color });
  }
}

function spawnZone(state, cfg) {
  spawnHazard(state, Object.assign({
    kind: 'zone', color: 'orange', shape: 'circle', remaining: 0, total: 0,
    hitEvery: balance.status.burnTickPerHit, hitTimer: balance.status.burnTickPerHit,
    fromPlayer: false, dps: 0, coef: 0, statuses: null, isBoss: false,
    damage: 0, zoneTicks: 0, skillSlot: -1, guaranteedCrit: false,
  }, cfg));
}

function pointLineDistance(px, py, h) {
  const vx = px - h.originX, vy = py - h.originY;
  const proj = vx * h.dirX + vy * h.dirY;
  if (proj < 0) return Math.hypot(vx, vy);
  if (proj > h.length) return Math.hypot(vx - h.dirX * h.length, vy - h.dirY * h.length);
  return Math.abs(vx * h.dirY - vy * h.dirX);
}

function resolveTelegraph(state, h) {
  const p = state.player;
  if (!p || !p.alive) { h.active = false; return; }
  let dodged;
  if (h.color === 'red') {
    // §6.3 红：只看无敌帧
    dodged = p.invulnerable;
  } else {
    // §6.3 橙：无敌帧，或玩家中心到预警中心距离 > 判定半径
    let out = false;
    if (h.shape === 'circle' || h.shape === 'cone') out = dist(p.x, p.y, h.cx, h.cy) > h.radius;
    else if (h.shape === 'line') out = pointLineDistance(p.x, p.y, h) > h.width / 2;
    dodged = p.invulnerable || out;
  }
  if (dodged) {
    // A2（制作人放开项）：mechMiss/mechHit 补 color（red/orange），渲染层区分
    // 「无敌帧穿过红机制」（隆重反馈）与「走出橙机制」（普通反馈）。
    emit(state, EV.MECH_MISS, { x: p.x, y: p.y, name: h.name, color: h.color });
    if (p.invulnerable) emit(state, EV.DODGE_SUCCESS, { x: p.x, y: p.y });
  } else {
    applyFixedDamageToPlayer(state, h.damage, {
      stunTicks: h.stunTicks, slow: h.slow, burn: h.burn, sourceAtk: h.sourceAtk,
    });
    emit(state, EV.MECH_HIT, { x: p.x, y: p.y, name: h.name, value: h.damage, color: h.color });
  }
  h.active = false;
  // 点将台：预警结束后生成持续区（§6.3）
  if (h.zoneTicks) {
    spawnZone(state, {
      cx: h.cx, cy: h.cy, radius: h.radius, remaining: h.zoneTicks,
      dps: h.damage, slow: h.slow, fromPlayer: false, name: h.name,
    });
  }
}

function zoneTick(state, h) {
  const p = state.player;
  h.hitTimer -= 1;
  if (h.hitTimer > 0) return;
  h.hitTimer = h.hitEvery;
  if (h.fromPlayer) {
    // 陷阱：每 30 tick 对区域内敌人出伤
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (!e.active || e.hp <= 0) continue;
      if (dist(h.cx, h.cy, e.x, e.y) <= h.radius) {
        const ctx = damageCtxForPlayer(state, e, h.coef, 0, false);
        dealDamageToEnemy(state, e, ctx);
        if (h.statuses) {
          if (h.statuses.slow) applySlow(e, h.statuses.slow);
          if (h.statuses.stunTicks) e.stunTicks = Math.max(e.stunTicks, h.statuses.stunTicks);
        }
      }
    }
  } else if (p && p.alive && !p.invulnerable && dist(p.x, p.y, h.cx, h.cy) <= h.radius) {
    // 点将台 / 泥沼：玩家在区域内
    if (h.dps > 0) applyFixedDamageToPlayer(state, h.dps, { slow: h.slow, noHurt: true });
    else if (h.slow) applySlow(p, h.slow);
  }
}

function resolveDelayed(state, h) {
  const p = state.player;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (!e.active || e.hp <= 0) continue;
    if (dist(h.cx, h.cy, e.x, e.y) <= h.radius) {
      const ctx = damageCtxForPlayer(state, e, h.coef, 0, h.guaranteedCrit);
      ctx.skillSlot = h.skillSlot;
      dealDamageToEnemy(state, e, ctx, h.guaranteedCrit);
      if (h.statuses) {
        if (h.statuses.slow) applySlow(e, h.statuses.slow);
        if (h.statuses.stunTicks) e.stunTicks = Math.max(e.stunTicks, h.statuses.stunTicks);
        if (h.statuses.burn) applyBurn(e, h.statuses.burn, p.atk);
      }
    }
  }
}

function advanceHazards(state) {
  for (let i = 0; i < state.hazards.length; i++) {
    const h = state.hazards[i];
    if (!h.active) continue;
    h.remaining -= 1;
    if (h.kind === 'zone') {
      zoneTick(state, h);
      if (h.remaining <= 0) h.active = false;
    } else if (h.kind === 'delayed_damage') {
      if (h.remaining <= 0) { resolveDelayed(state, h); h.active = false; }
    } else if (h.remaining <= 0) {
      resolveTelegraph(state, h);
    }
  }
  if (state.bossBanner) {
    state.bossBanner.remaining -= 1;
    if (state.bossBanner.remaining <= 0) state.bossBanner = null;
  }
}

// ─────────── 敌人 AI（§5.3 / §6.3） ───────────
function enemyAttack(state, e, p) {
  const m = e.mechDef;
  const slowDef = p.slow ? p.slow.def : 0;
  const ctx = {
    atk: e.atk, coef: AUX.enemyAttackCoef, flat: 0,
    targetDef: p.def, armorPen: 0, armorReduce: slowDef,
    dmgAmp: p.takenDamageAmp || 0, dmgReduce: playerDmgReduce(p),
    crit: AUX.noCrit, critDmg: balance.formula.critDmgBase, shield: p.shield,
  };
  const opts = { sourceAtk: e.atk, sourceEnemy: e.uid };
  if (m.onHitSlow) opts.slow = m.onHitSlow;

  if (m.tripleProjectile) {
    for (let k = 0; k < m.tripleProjectile.count; k++) {
      spawnProjectile(state, {
        fromPlayer: false, x: e.x, y: e.y, prevX: e.x, prevY: e.y,
        targetUid: AUX.playerTargetUid, speed: pxPerSecondToPerTick(e.projectileSpeed),
        delayTicks: k * m.tripleProjectile.gapTicks,
        ctx: Object.assign({}, ctx, { coef: m.tripleProjectile.coef }),
        opts, coef: m.tripleProjectile.coef,
        statusBurn: m.tripleProjectile.burn,
      });
    }
  } else if (e.projectileSpeed > 0) {
    spawnProjectile(state, {
      fromPlayer: false, x: e.x, y: e.y, prevX: e.x, prevY: e.y,
      targetUid: AUX.playerTargetUid, speed: pxPerSecondToPerTick(e.projectileSpeed),
      delayTicks: 0, ctx, opts, coef: AUX.enemyAttackCoef,
    });
  } else {
    const r = dealDamageToPlayer(state, ctx, opts);
    if (m.lifesteal && r) e.hp = Math.min(e.maxHp, e.hp + r.toHp * m.lifesteal);
    if (m.onHitHaste && r) {
      e.hasteBonus = m.onHitHaste.bonus; e.hasteBuffTicks = m.onHitHaste.ticks;
    }
  }
}

function moveEnemy(state, e, p) {
  const d = dist(e.x, e.y, p.x, p.y);
  const slowMove = e.slow ? e.slow.move : 0;
  const spd = pxPerSecondToPerTick(e.speed) * (1 - slowMove);
  if (e.ai === 'kite') {
    const tol = e.keepDistance * AUX.kiteTolerancePct;
    if (d > e.keepDistance + tol) moveToward(e, p.x, p.y, spd);
    else if (d < e.keepDistance - tol) moveAway(e, p.x, p.y, spd);
  } else if (e.ai === 'dive') {
    if (e.divePhase === 1) {
      moveAway(e, p.x, p.y, spd);
      if (d >= e.retreatPx) e.divePhase = 0;
    } else if (d > e.rangePx * balance.combat.approachFactor) {
      moveToward(e, p.x, p.y, spd);
    }
  } else if (d > e.rangePx * balance.combat.approachFactor) {
    moveToward(e, p.x, p.y, spd);
  }
  e.facing = p.x >= e.x ? 1 : -1;
}

function tickEnemyMechanic(state, e, p) {
  const m = e.mechDef;
  if (!m.mechanic) return;
  if (e.mechanicTimer > 0) { e.mechanicTimer -= 1; return; }
  e.mechanicTimer = m.mechanic.everyTicks;
  spawnTelegraph(state, e, p, m.mechanic, false, 0);
}

function tickBossMechanics(state, e, p) {
  const m = e.mechDef;
  if (!m.bossMechanics) return;
  for (let i = 0; i < m.bossMechanics.length; i++) {
    const mech = m.bossMechanics[i];
    if (e.bossCd[i] > 0) { e.bossCd[i] -= 1; continue; }
    if (mech.unlockHpPct && e.hp >= e.maxHp * mech.unlockHpPct) continue;
    e.bossCd[i] = mech.cdTicks;
    if (mech.type === 'summon') {
      for (let k = 0; k < mech.count; k++) {
        const off = (k - (mech.count - 1) / 2) * AUX.summonSpreadPx;
        spawnEnemy(state, mech.summonId,
          clamp(p.x + off, F.minX, F.maxX), F.spawnY,
          { lifeTicks: mech.lifeTicks, summoned: true });
      }
      continue;
    }
    const count = mech.count || 1;
    for (let k = 0; k < count; k++) {
      spawnTelegraph(state, e, p, mech, true, k * (mech.gapTicks || 0));
    }
    if (mech.teach && !state.teachShown) {
      state.teachShown = true;
      state.bossBanner = {
        name: '红灯亮起时点闪避', remaining: AUX.bossTeachTicks,
        total: AUX.bossTeachTicks, color: 'red', teach: true,
      };
    }
  }
}

function tickEnemyStatuses(state, e) {
  if (e.burn) {
    e.burn.ticks -= 1; e.burn.timer -= 1;
    if (e.burn.timer <= 0) {
      e.burn.timer = balance.status.burnTickPerHit;
      const amount = Math.max(balance.formula.minDamage, Math.round(e.burn.sourceAtk * e.burn.coefPerHit));
      e.hp -= amount;
      emit(state, EV.DAMAGE, { x: e.x, y: e.y - AUX.floaterOffsetY, value: amount, kind: 'burn' });
      if (e.hp <= 0) { killEnemy(state, e); return; }
    }
    if (e.burn.ticks <= 0) e.burn = null;
  }
  if (e.slowTicks > 0) { e.slowTicks -= 1; if (e.slowTicks <= 0) e.slow = null; }
  if (e.flashTicks > 0) e.flashTicks -= 1;
}

function enemyAIAll(state) {
  const p = state.player;
  if (!p) return;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (!e.active || e.hp <= 0) continue;
    e.prevX = e.x; e.prevY = e.y;
    if (e.lifeTicks > 0) {
      e.lifeTicks -= 1;
      if (e.lifeTicks <= 0) { e.active = false; continue; }
    }
    tickEnemyStatuses(state, e);
    if (!e.active) continue;
    if (e.stunTicks > 0) { e.stunTicks -= 1; continue; }
    if (e.attackCooldown > 0) e.attackCooldown -= 1;
    if (e.hasteBuffTicks > 0) e.hasteBuffTicks -= 1; else e.hasteBonus = 0;

    const m = e.mechDef;
    if (m.enrage && !e.enrageDone && e.hp < e.maxHp * m.enrage.hpPct) {
      e.enrageDone = true;
      e.intervalTicks = m.enrage.intervalTicks;
    }
    moveEnemy(state, e, p);
    const d = dist(e.x, e.y, p.x, p.y);
    if (e.attackCooldown <= 0 && d <= e.rangePx) {
      enemyAttack(state, e, p);
      const slowAtk = e.slow ? e.slow.atk : 0;
      const haste = e.hasteBonus || 0;
      e.attackCooldown = Math.max(AUX.minCooldown,
        Math.round(e.intervalTicks * balance.formula.hasteBase / (balance.formula.hasteBase + haste) / (1 - slowAtk)));
      if (e.ai === 'dive') e.divePhase = 1;
    }
    tickEnemyMechanic(state, e, p);
    if (e.tier === 'boss') tickBossMechanics(state, e, p);
    if (m.dash) {
      e.dashTimer -= 1;
      if (e.dashTimer <= 0) {
        e.dashTimer = m.dash.everyTicks;
        const dl = Math.hypot(p.x - e.x, p.y - e.y) || 1;
        e.dashVx = (p.x - e.x) / dl * m.dash.distancePx / m.dash.moveTicks;
        e.dashVy = (p.y - e.y) / dl * m.dash.distancePx / m.dash.moveTicks;
        e.dashMoveTicks = m.dash.moveTicks;
      }
      if (e.dashMoveTicks > 0) {
        e.x = clamp(e.x + e.dashVx, F.minX, F.maxX);
        e.y = clamp(e.y + e.dashVy, F.activeTop, F.activeBottom);
        e.dashMoveTicks -= 1;
      }
    }
  }
  advanceHazards(state);
}

function killEnemy(state, e) {
  e.active = false;
  e.dead = true;
  const p = state.player;
  state.kills += 1;
  state.daohangEarned += balance.daohang.perKill;
  if (e.tier === 'boss') state.daohangEarned += balance.daohang.perBoss;
  if (p) {
    if (p.resourceId === 'rage' || p.resourceId === 'mana') addResource(p, p.resourceGen.onKill);
    if (p.passives.killHeal) {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.passives.killHeal.hpPct);
      addResource(p, p.passives.killHeal.resource);
    }
    if (p.passives.killSlow) {
      for (let i = 0; i < state.enemies.length; i++) {
        const o = state.enemies[i];
        if (!o.active || o.hp <= 0) continue;
        if (dist(e.x, e.y, o.x, o.y) <= p.passives.killSlow.radius) {
          applySlow(o, {
            move: p.passives.killSlow.slow, atk: p.passives.killSlow.slow,
            def: 0, ticks: p.passives.killSlow.ticks,
          });
        }
      }
    }
  }
  state.killCombo += 1;
  state.killComboTimer = AUX.killComboTicks;
  if (state.killCombo >= 3) emit(state, EV.KILL_COMBO, { value: state.killCombo });
  emit(state, EV.DEATH, { x: e.x, y: e.y, targetId: e.uid, tier: e.tier });

  const m = e.mechDef;
  if (m.deathEffect) {
    spawnTelegraph(state, e, p, {
      name: m.deathEffect.name, color: m.deathEffect.color, shape: 'circle',
      radius: m.deathEffect.radius, warnTicks: m.deathEffect.warnTicks,
      damage: m.deathEffect.damage, followPlayer: false,
    }, false, 0, { x: e.x, y: e.y });
  }
  if (m.deathZone) {
    spawnZone(state, {
      cx: e.x, cy: e.y, radius: m.deathZone.radius, remaining: m.deathZone.ticks,
      dps: 0, slow: { move: m.deathZone.slow, atk: 0, def: 0, ticks: m.deathZone.ticks },
      fromPlayer: false, name: m.deathZone.name,
    });
  }
}

// ─────────── 玩家输入意图（§3.3 / §3.6） ───────────
function beginCast(state, slot, sk) {
  const p = state.player;
  const s = p.skills[slot];
  const lv = sk.levels[s.level - 1];
  p.resource -= sk.cost;
  p.state = 'cast'; p.stateTicks = 0;
  p.castSkillId = sk.id; p.castSlot = slot; p.castLevel = lv; p.castRefundCost = sk.cost;
  p.castTicks = sk.castTicks;
  p.skillCd[slot] = Math.max(AUX.minCooldown, Math.round(sk.cdTicks * (1 - p.cdReducePct)));
  p.lastSkillTick = state.tick;
  emit(state, EV.SKILL, { x: p.x, y: p.y, name: sk.name, slot, color: theme.classColor[p.classId] });
}

export function tryCastSkill(state, slot) {
  const p = state.player;
  if (!p || !p.alive || slot < 0 || slot >= p.skills.length) return 'blocked';
  const s = p.skills[slot];
  if (!s) return 'empty';
  const sk = getSkill(s.id);
  if (!sk) return 'empty';
  const cd = p.skillCd[slot];
  if (cd > 0) {
    if (cd > balance.input.bufferWindowTicks) {
      emit(state, EV.NOT_READY, { slot });
      return 'notReady';
    }
    p.skillBuffer[slot] = true;   // 后一次点击覆盖前一次，缓冲只保留 1 个指令
    return 'buffered';
  }
  if (p.resource < sk.cost) { emit(state, EV.NOT_READY, { slot }); return 'noResource'; }
  if (!canTransition(p.state, 'cast')) {
    // §3.6 5 tick 内两个不同技能：前者已进入 cast → 后者丢弃并提示
    emit(state, EV.NOT_READY, { slot });
    return 'blocked';
  }
  beginCast(state, slot, sk);
  return 'cast';
}

export function tryDodge(state) {
  const p = state.player;
  if (!p || !p.alive) return false;
  if (p.stamina < balance.dodge.staminaCost || p.dodgeCd > 0) {
    emit(state, EV.NOT_READY, { slot: 'dodge' });
    return false;
  }
  if (p.state === 'hurt' && p.stunTicks > 0) return false;  // 控制硬直不可受身
  if (!canTransition(p.state, 'dodge')) return false;
  if (p.state === 'cast') {
    // §3.5 / §7.2 打断 cast：返还 50% 资源，不进 CD
    p.resource = Math.min(p.resourceMax,
      p.resource + Math.floor(p.castRefundCost * balance.combat.dodgeRefundPct));
    if (p.castSlot >= 0) p.skillCd[p.castSlot] = 0;
    p.castSkillId = null; p.castSlot = -1; p.castLevel = null; p.castRefundCost = 0;
  }
  p.stamina -= balance.dodge.staminaCost;
  p.dodgeCd = p.dodgeCdBase;
  p.state = 'dodge'; p.stateTicks = 0; p.dodgeTicks = 0;
  p.invulnerable = true;
  const t = currentTarget(state);
  let dx = 0, dy = -1;
  if (t) { dx = t.x - p.x; dy = t.y - p.y; }
  const len = Math.hypot(dx, dy) || 1;
  const sign = (p.dodgeCount % 2 === 0) ? -1 : 1;   // 第 1 次左、第 2 次右
  const stepv = balance.dodge.distancePx / balance.dodge.moveTicks;
  p.dodgeVx = (-dy / len) * sign * stepv;
  p.dodgeVy = (dx / len) * sign * stepv;
  p.dodgeCount += 1;
  p.staminaRegenDelay = 0;
  emit(state, EV.DODGE, { x: p.x, y: p.y });
  return true;
}

export function tryPotion(state) {
  const p = state.player;
  if (!p || !p.alive) return false;
  if (p.potions <= 0 || p.potionCd > 0) {
    emit(state, EV.NOT_READY, { slot: 'potion' });
    return false;
  }
  p.potions -= 1;
  p.potionCd = balance.combat.potionCdTicks;
  p.hp = Math.min(p.maxHp, p.hp + p.maxHp * balance.combat.potionHealPct);
  emit(state, EV.POTION, { x: p.x, y: p.y });
  return true;
}

function handleIntents(state, intents) {
  const list = intents || EMPTY;
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (!it) continue;
    if (it.type === 'skill') tryCastSkill(state, it.slot);
    else if (it.type === 'dodge') tryDodge(state);
    else if (it.type === 'potion') tryPotion(state);
  }
}

// ─────────── 技能效果分派（§5.4） ───────────
function hasStatus(e, when) {
  for (let i = 0; i < when.length; i++) {
    if (when[i] === 'stun' && e.stunTicks > 0) return true;
    if (when[i] === 'slow' && e.slow) return true;
  }
  return false;
}

function pickSkillTargets(state, lv, target) {
  const p = state.player;
  const arr = [];
  if (lv.shape === 'single' || lv.shape === 'projectile') {
    if (target) arr.push(target);
    return arr;
  }
  let cx = p.x, cy = p.y;
  if (lv.origin === 'target' && target) { cx = target.x; cy = target.y; }
  if (lv.shape === 'aoe') {
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.active && e.hp > 0 && dist(cx, cy, e.x, e.y) <= lv.radius) arr.push(e);
    }
    if (arr.length === 0 && target) arr.push(target);
  } else if (lv.shape === 'multi_target') {
    const all = [];
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.active && e.hp > 0) all.push(e);
    }
    all.sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y));
    const n = Math.min(lv.maxTargets || all.length, all.length);
    for (let i = 0; i < n; i++) arr.push(all[i]);
  }
  return arr;
}

function applySkillStatuses(state, e, lv) {
  if (!e || !e.active || e.hp <= 0) return;
  if (lv.slow) applySlow(e, lv.slow);
  if (lv.stunTicks) e.stunTicks = Math.max(e.stunTicks, lv.stunTicks);
  if (lv.burn) applyBurn(e, lv.burn, state.player.atk);
}

function castSkillEffects(state, lv, sk) {
  const p = state.player;
  const target = currentTarget(state);

  if (lv.shieldHpPct) {
    p.shield += p.maxHp * lv.shieldHpPct;
    p.shieldTicks = Math.max(p.shieldTicks, lv.shieldTicks);
    p.shieldReflect = lv.reflectPct || 0;
    p.shieldBurst = lv.burst || null;
    emit(state, EV.SHIELD, { x: p.x, y: p.y, value: Math.round(p.shield) });
  }
  if (lv.hasteBonus) {
    p.hasteBuffBonus = lv.hasteBonus; p.hasteBuffTicks = lv.buffTicks;
    p.takenDamageAmp = lv.takenDamageAmp || 0;
    p.regenHpPctPerTick = lv.regenHpPctPerTick || 0;
    p.comboPerAuto = lv.comboPerAuto || 0;
  }
  if (lv.healHpPct) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * lv.healHpPct);
  if (lv.dashPx && target) {
    const d = dist(p.x, p.y, target.x, target.y) || 1;
    p.x = clamp(target.x - (target.x - p.x) / d * lv.dashPx, F.minX, F.maxX);
    p.y = clamp(target.y - (target.y - p.y) / d * lv.dashPx, F.activeTop, F.activeBottom);
  }
  if (lv.zone) {
    const z = lv.zone;
    spawnZone(state, {
      cx: target ? target.x : p.x, cy: target ? target.y : p.y,
      radius: z.radius, remaining: z.ticks, hitEvery: z.hitEveryTicks,
      hitTimer: z.hitEveryTicks, coef: z.coef, fromPlayer: true, sourceAtk: p.atk,
      statuses: { slow: z.slow, stunTicks: z.stunTicks }, name: sk.name,
    });
  }
  if (!(lv.hits > 0 && lv.coef > 0)) return;

  const guaranteed = !!lv.guaranteedCrit || p.nextSkillCrit;
  if (p.nextSkillCrit) { p.nextSkillCrit = false; p.nextSkillCritTimer = 0; }
  let coef = lv.coef;
  if (lv.execute && target && hasStatus(target, lv.execute.when)) coef *= lv.execute.mult;

  if (lv.shape === 'delayed_aoe') {
    spawnHazard(state, {
      kind: 'delayed_damage', name: sk.name, color: theme.classColor[p.classId],
      shape: 'aoe', cx: target ? target.x : p.x, cy: target ? target.y : p.y,
      radius: lv.radius, remaining: lv.delayTicks, total: lv.delayTicks,
      coef, skillSlot: p.castSlot, guaranteedCrit: guaranteed,
      statuses: { slow: lv.slow, stunTicks: lv.stunTicks, burn: lv.burn },
    });
    return;
  }

  if (lv.shape === 'projectile') {
    if (target) {
      const ctx = damageCtxForPlayer(state, target, coef, lv.critBonus || 0, guaranteed);
      ctx.skillSlot = p.castSlot;
      spawnProjectile(state, {
        fromPlayer: true, x: p.x, y: p.y, prevX: p.x, prevY: p.y,
        targetUid: target.uid, speed: pxPerSecondToPerTick(lv.projectileSpeed),
        delayTicks: 0, ctx, coef, guaranteedCrit: guaranteed,
        splashRadius: lv.splashRadius || 0, splashCoef: lv.splashCoef || 0,
        chain: lv.chain || 0, chainCoef: lv.chainCoef || 0,
        skillSlot: p.castSlot,
        statuses: { slow: lv.slow, stunTicks: lv.stunTicks, burn: lv.burn },
      });
    }
  } else {
    const targets = pickSkillTargets(state, lv, target);
    for (let h = 0; h < lv.hits; h++) {
      for (let i = 0; i < targets.length; i++) {
        const e = targets[i];
        if (!e.active || e.hp <= 0) continue;
        const ctx = damageCtxForPlayer(state, e, coef, lv.critBonus || 0, guaranteed);
        ctx.skillSlot = p.castSlot;
        dealDamageToEnemy(state, e, ctx, guaranteed);
        applySkillStatuses(state, e, lv);
      }
      if (lv.refundPerHit) addResource(p, lv.refundPerHit);
    }
    if (lv.manaOnHit) addResource(p, lv.manaOnHit * targets.length);
  }
  if (p.passives.skillHitMana) addResource(p, p.resourceMax * p.passives.skillHitMana.manaPct);
}

// ─────────── 弹道命中 ───────────
function hitEnemyWithProjectile(state, pr, e) {
  const ctx = pr.ctx;
  const r = dealDamageToEnemy(state, e, ctx, pr.guaranteedCrit);
  if (pr.statuses) {
    if (pr.statuses.slow) applySlow(e, pr.statuses.slow);
    if (pr.statuses.stunTicks) e.stunTicks = Math.max(e.stunTicks, pr.statuses.stunTicks);
    if (pr.statuses.burn) applyBurn(e, pr.statuses.burn, state.player.atk);
  }
  if (pr.splashRadius > 0) {
    for (let i = 0; i < state.enemies.length; i++) {
      const o = state.enemies[i];
      if (!o.active || o.hp <= 0 || o === e) continue;
      if (dist(e.x, e.y, o.x, o.y) <= pr.splashRadius) {
        const sctx = Object.assign({}, ctx, { coef: ctx.coef * pr.splashCoef });
        dealDamageToEnemy(state, o, sctx);
      }
    }
  }
  if (pr.chain > 0) {
    let from = e;
    let coef = ctx.coef * pr.chainCoef;
    for (let k = 0; k < pr.chain; k++) {
      const next = nearestEnemy(state, from.x, from.y, from.uid);
      if (!next) break;
      const cctx = Object.assign({}, ctx, { coef });
      dealDamageToEnemy(state, next, cctx);
      from = next;
      coef *= pr.chainCoef;
    }
  }
  return r;
}

function advanceProjectiles(state) {
  const p = state.player;
  for (let i = 0; i < state.projectiles.length; i++) {
    const pr = state.projectiles[i];
    if (!pr.active) continue;
    pr.prevX = pr.x; pr.prevY = pr.y;
    if (pr.delayTicks > 0) { pr.delayTicks -= 1; continue; }
    let tx, ty, target = null;
    if (pr.targetUid === AUX.playerTargetUid) {
      if (!p || !p.alive) { pr.active = false; continue; }
      tx = p.x; ty = p.y;
    } else {
      target = enemyByUid(state, pr.targetUid);
      if (!target && pr.fromPlayer) target = nearestEnemy(state, pr.x, pr.y);
      if (!target) { pr.active = false; continue; }
      tx = target.x; ty = target.y;
    }
    const dx = tx - pr.x, dy = ty - pr.y;
    const d = Math.hypot(dx, dy);
    if (d <= pr.speed || d === 0) {
      if (pr.fromPlayer) {
        if (target) hitEnemyWithProjectile(state, pr, target);
      } else if (p && p.alive) {
        const r = dealDamageToPlayer(state, pr.ctx, pr.opts);
        if (r && pr.opts && pr.opts.slow) applySlow(p, pr.opts.slow);
        if (pr.statusBurn) applyBurn(p, pr.statusBurn, pr.ctx.atk);
      }
      pr.active = false;
    } else {
      pr.x += dx / d * pr.speed;
      pr.y += dy / d * pr.speed;
    }
  }
}

// ─────────── 普攻 ───────────
function playerAutoHit(state) {
  const p = state.player;
  const t = currentTarget(state);
  if (!t) return;
  if (dist(p.x, p.y, t.x, t.y) > p.range) return;
  const ctx = damageCtxForPlayer(state, t, p.attackCoef, 0, false);
  if (p.attackProjectileSpeed > 0) {
    spawnProjectile(state, {
      fromPlayer: true, x: p.x, y: p.y, prevX: p.x, prevY: p.y,
      targetUid: t.uid, speed: pxPerSecondToPerTick(p.attackProjectileSpeed),
      delayTicks: 0, ctx, coef: p.attackCoef,
      statuses: p.passives.autoBurn
        ? { burn: { coefPerHit: p.passives.autoBurn.coef, ticks: p.passives.autoBurn.ticks } } : null,
    });
  } else {
    const r = dealDamageToEnemy(state, t, ctx);
    if (r) {
      addResource(p, p.resourceGen.onHit);
      if (r.crit && p.resourceGen.onCrit) addResource(p, p.resourceGen.onCrit);
      if (p.comboPerAuto) addResource(p, p.comboPerAuto);
      p.lastComboTick = state.tick;
      p.autoCount += 1;
      if (p.passives.every4thAuto && p.autoCount % p.passives.every4thAuto.nth === 0) {
        const pa = p.passives.every4thAuto;
        for (let i = 0; i < state.enemies.length; i++) {
          const o = state.enemies[i];
          if (!o.active || o.hp <= 0 || o === t) continue;
          if (dist(t.x, t.y, o.x, o.y) <= pa.radius) {
            dealDamageToEnemy(state, o, damageCtxForPlayer(state, o, pa.coef, 0, false));
          }
        }
      }
      if (p.passives.autoBurn) {
        applyBurn(t, { coefPerHit: p.passives.autoBurn.coef, ticks: p.passives.autoBurn.ticks }, p.atk);
      }
    }
  }
  p.lastAttackTick = state.tick;
}

// ─────────── 每 tick 各系统（§7.4） ───────────
function regenResources(state) {
  const p = state.player;
  const gen = p.resourceGen;
  if (p.resourceId === 'mana') {
    addResource(p, gen.regenPerTick * (1 + p.resourceRegenPct));
  } else if (p.resourceId === 'rage') {
    if (state.tick - p.lastHurtTick > gen.outOfCombatTicks
        && state.tick - p.lastAttackTick > gen.outOfCombatTicks) {
      p.resource = Math.max(0, p.resource - gen.decayPerTick);
    }
  } else if (p.resourceId === 'combo') {
    if (state.tick - p.lastComboTick > gen.comboDecayTicks) {
      p.resource = Math.max(0, p.resource - gen.decayPerTick);
    }
  }
  if (p.staminaRegenDelay > 0) p.staminaRegenDelay -= 1;
  else p.stamina = Math.min(p.staminaMax, p.stamina + balance.dodge.staminaRegenPerTick);
  if (p.regenHpPctPerTick > 0) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.regenHpPctPerTick);
  if (p.passives.regenHp && state.tick % p.passives.regenHp.everyTicks === 0) {
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.passives.regenHp.hpPct);
  }
  if (p.passives.nextSkillCrit) {
    p.nextSkillCritTimer += 1;
    if (p.nextSkillCritTimer >= p.passives.nextSkillCrit.everyTicks) {
      p.nextSkillCritTimer = 0; p.nextSkillCrit = true;
    }
  }
  if (p.postDodgeReduceTicks > 0) p.postDodgeReduceTicks -= 1;
  if (p.critHasteTicks > 0) p.critHasteTicks -= 1; else p.critHasteBonus = 0;
  if (p.postDodgeHasteTicks > 0) p.postDodgeHasteTicks -= 1; else p.postDodgeHasteBonus = 0;
  if (p.flashTicks > 0) p.flashTicks -= 1;
}

function tickStatuses(state) {
  const p = state.player;
  if (p.burn) {
    p.burn.ticks -= 1; p.burn.timer -= 1;
    if (p.burn.timer <= 0) {
      p.burn.timer = balance.status.burnTickPerHit;
      const amount = Math.max(balance.formula.minDamage, Math.round(p.burn.sourceAtk * p.burn.coefPerHit));
      let toHp = amount, absorbed = 0;
      if (p.shield > 0) { absorbed = Math.min(p.shield, toHp); toHp -= absorbed; }
      applyPlayerHit(state, toHp, amount, absorbed, { noHurt: true });
    }
    if (p.burn.ticks <= 0) p.burn = null;
  }
  if (p.slowTicks > 0) { p.slowTicks -= 1; if (p.slowTicks <= 0) p.slow = null; }
  if (p.shieldTicks > 0) {
    p.shieldTicks -= 1;
    if (p.shieldTicks <= 0) { p.shield = 0; p.shieldReflect = 0; p.shieldBurst = null; }
  }
  if (p.hasteBuffTicks > 0) {
    p.hasteBuffTicks -= 1;
    if (p.hasteBuffTicks <= 0) {
      p.hasteBuffBonus = 0; p.takenDamageAmp = 0;
      p.regenHpPctPerTick = 0; p.comboPerAuto = 0;
    }
  }
}

function tickCooldowns(state) {
  const p = state.player;
  for (let i = 0; i < p.skillCd.length; i++) if (p.skillCd[i] > 0) p.skillCd[i] -= 1;
  if (p.dodgeCd > 0) p.dodgeCd -= 1;
  if (p.potionCd > 0) p.potionCd -= 1;
}

function resolveBuffers(state) {
  const p = state.player;
  for (let i = 0; i < p.skillBuffer.length; i++) {
    if (p.skillBuffer[i] && p.skillCd[i] <= 0) {
      p.skillBuffer[i] = null;
      tryCastSkill(state, i);
    }
  }
}

function movePlayer(state) {
  const p = state.player;
  if (!p.alive || p.state === 'dodge' || p.state === 'hurt' || p.state === 'dead') return;
  const t = currentTarget(state);
  if (!t) return;
  const d = dist(p.x, p.y, t.x, t.y);
  const ideal = p.range * balance.combat.approachFactor;
  const slowMove = p.slow ? p.slow.move : 0;
  const spd = pxPerSecondToPerTick(p.speed) * (1 - slowMove);
  if (d > ideal) moveToward(p, t.x, t.y, Math.min(spd, d - ideal));
  p.facing = t.x >= p.x ? 1 : -1;
}

function advancePlayerState(state) {
  const p = state.player;
  if (!p || !p.alive) return;
  p.stateTicks += 1;

  if (p.state === 'dodge') {
    const t = p.dodgeTicks;
    p.invulnerable = isInvulnerableAt(t);
    if (t < balance.dodge.moveTicks) {
      p.x = clamp(p.x + p.dodgeVx, F.minX, F.maxX);
      p.y = clamp(p.y + p.dodgeVy, F.activeTop, F.activeBottom);
    }
    p.dodgeTicks += 1;
    if (p.dodgeTicks >= balance.dodge.totalTicks) {
      p.state = 'idle'; p.stateTicks = 0; p.invulnerable = false; p.dodgeTicks = 0;
      p.staminaRegenDelay = balance.dodge.staminaRegenDelayTicks;
      if (p.passives.postDodgeReduce) p.postDodgeReduceTicks = p.passives.postDodgeReduce.ticks;
      if (p.passives.postDodgeHaste) {
        p.postDodgeHasteTicks = p.passives.postDodgeHaste.ticks;
        p.postDodgeHasteBonus = p.passives.postDodgeHaste.bonus;
      }
    }
    return;
  }
  if (p.state === 'hurt') {
    if (p.stunTicks > 0) p.stunTicks -= 1;
    if (p.stunTicks <= 0 && p.stateTicks >= p.hurtTotal) {
      p.state = 'idle'; p.stateTicks = 0;
    }
    return;
  }
  if (p.state === 'attack') {
    if (p.stateTicks === balance.combat.attackWindupTicks) playerAutoHit(state);
    if (p.stateTicks >= attackIntervalTicks(p.attackIntervalBase, hasteBonusOf(p))) {
      p.state = 'idle'; p.stateTicks = 0;
    }
    return;
  }
  if (p.state === 'cast') {
    if (p.stateTicks === p.castTicks && p.castLevel) {
      castSkillEffects(state, p.castLevel, getSkill(p.castSkillId));
    }
    if (p.stateTicks >= p.castTicks + balance.combat.castRecoveryTicks) {
      p.state = 'idle'; p.stateTicks = 0;
      p.castSkillId = null; p.castSlot = -1; p.castLevel = null; p.castRefundCost = 0;
    }
    return;
  }
  // idle：自动普攻判定（§3.2 #7）
  const t = currentTarget(state);
  if (t && dist(p.x, p.y, t.x, t.y) <= p.range
      && state.tick - p.lastAttackTick >= attackIntervalTicks(p.attackIntervalBase, hasteBonusOf(p))
      && canTransition(p.state, 'attack')) {
    p.state = 'attack'; p.stateTicks = 0;
  }
}

function advanceWaves(state) {
  if (state.phase !== 'battle') return;
  if (state.killComboTimer > 0) {
    state.killComboTimer -= 1;
    if (state.killComboTimer <= 0) state.killCombo = 0;
  }
  if (aliveEnemyCount(state) > 0) return;
  const node = getDropTable().chapters[state.chapter].nodes[state.node - 1];
  if (state.wave < node.waves.length - 1) {
    if (state.waveTimer === 0) state.waveTimer = balance.wave.gapTicks;
    else {
      state.waveTimer -= 1;
      if (state.waveTimer <= 0) { spawnWave(state, state.wave + 1); state.waveTimer = 0; }
    }
  } else {
    finishNode(state);
  }
}

// ─────────── 流程 ───────────
export function finishNode(state) {
  const p = state.player;
  const gained = gainExp(p, expGrantFor(state.chapter, state.node));
  if (gained > 0) emit(state, EV.LEVEL_UP, { level: p.level });
  state.daohangEarned += balance.daohang.perNode;
  const drop = rollNodeDrop(state, state.nodeType, state.chapter);
  if (drop && drop.item) state.lootQueue.push(drop.item);
  generateRewards(state);
  state.phase = 'reward';
  emit(state, EV.NODE_CLEAR, { name: `${state.chapter} · ${state.node}` });
}

export function startNode(state) {
  releaseAll(state.enemies);
  releaseAll(state.projectiles);
  releaseAll(state.hazards);
  state.lootQueue.length = 0;
  state.rewards = null;
  state.skillSlotChoice = null;
  state.pendingLoot = null;
  const node = getDropTable().chapters[state.chapter].nodes[state.node - 1];
  state.nodeType = node.type;
  state.wave = 0;
  state.waveTimer = 0;
  state.bossBanner = null;
  state.killCombo = 0;
  spawnWave(state, 0);
  state.phase = 'battle';
  state.paused = false;
}

export function advanceNode(state) {
  releaseAll(state.hazards);
  state.bossBanner = null;
  state.node += 1;
  if (state.node > balance.nodesPerChapter) {
    state.node = 1;
    state.chapter += 1;
    if (state.chapter > balance.chapterCount) {
      settleRun(state, true);
      emit(state, EV.BATTLE_WIN, {});
      return;
    }
    // §10.5 每章开始生命回满、药瓶补满
    state.player.hp = state.player.maxHp;
    state.player.potions = state.player.potionsMax;
  } else {
    // §10.5 层间回复 15%
    state.player.hp = Math.min(state.player.maxHp,
      state.player.hp + state.player.maxHp * balance.healBetweenNodesPct);
  }
  startNode(state);
}

export function startBattle(state, classId) {
  state.player = createPlayer(state, classId, state.meta);
  state.chapter = 1;
  state.node = 1;
  state.kills = 0;
  state.daohangEarned = 0;
  state.runBuffs.length = 0;
  state.battleResult = null;
  state.victory = false;
  state.totalTicks = 0;
  state.tick = 0;
  state.nextUid = 0;
  state.teachShown = false;
  startNode(state);
}

// ─────────── 主 step（§7.4 固定顺序） ───────────
export function step(state, intents) {
  if (state.phase !== 'battle' || state.paused) return state;
  const p = state.player;
  if (!p || !p.alive) return state;
  state.tick += 1;
  state.totalTicks += 1;

  // 插值旧值（渲染层只读 prevX/prevY + alpha）
  p.prevX = p.x; p.prevY = p.y;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (e.active) { e.prevX = e.x; e.prevY = e.y; }
  }

  // #4 输入裁决（pointerdown 已入队，这里按 CD/前摇裁决释放/缓冲/丢弃）
  handleIntents(state, intents);
  // 无敌帧快照：本 tick 所有伤害都读它
  p.invulnerable = (p.state === 'dodge' && isInvulnerableAt(p.dodgeTicks));

  // #1 资源再生
  regenResources(state);
  // #2 异常 / Buff 计时（含灼烧每 30 tick 结算）
  tickStatuses(state);
  // #3 冷却递减
  tickCooldowns(state);
  // #4 输入缓冲裁决（CD 归零 tick 立即释放）
  resolveBuffers(state);
  // #5 敌人 AI（含机制预警推进与判定）
  enemyAIAll(state);
  if (state.phase !== 'battle') return state;
  // #6 玩家自动移动
  movePlayer(state);
  // #7 状态机推进（含普攻命中帧 / 施法结束出伤）
  advancePlayerState(state);
  // #8 弹道推进与命中检测
  advanceProjectiles(state);
  // #9 伤害已在命中点即时结算，此处做死亡后收尾
  // #10 波次推进（本波全灭 → 36 tick 后下一波 / 节点结算）
  advanceWaves(state);
  return state;
}

// 供测试与 UI 读取当前待替换装备
export function peekLoot(state) {
  return state.lootQueue.length ? state.lootQueue[0] : null;
}

export { balance };
