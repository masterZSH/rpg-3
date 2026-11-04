// src/core/progression.js —— design_v1.md §4 / §5.2 / §5.4 / §5.6 / §5.7
// 职业/等级/装备/技能装配与属性聚合、三选一奖励、道行元进度（纯函数语义，原地更新 player/state）
import {
  balance, getClass, getSkill, getEquipment, skillsOfClass,
} from './tables.js';
import { nextInt, chance } from './rng.js';
import { rollRewardTypes, rollRewardEquipment, getExpGrant } from './loot.js';
import { clampCrit } from './formulas.js';
import { EV, emit } from './state.js';

// ───────────────────────── 起始装备 / 玩家创建 ─────────────────────────

export function makeStarterItem(id) {
  const e = getEquipment(id);
  return {
    id, name: e.name, icon: e.icon, slot: e.slot, rarity: e.rarity,
    stats: Object.assign({}, e.stats), passive: e.passive,
  };
}

function emptyPlayerShape(classId) {
  const c = getClass(classId);
  const F = balance.field;
  return {
    classId, level: 1, exp: 0,
    hp: 0, maxHp: 0, shield: 0, shieldTicks: 0, shieldReflect: 0, shieldBurst: null,
    atk: 0, def: 0, crit: 0, critDmg: 0, haste: 0, speed: 0, range: 0,
    resource: 0, resourceMax: 0, resourceId: c.resource.id, resourceGen: c.resourceGen,
    stamina: balance.dodge.staminaMax, staminaMax: balance.dodge.staminaMax,
    staminaRegenDelay: 0,
    dodgeCd: 0, dodgeCdBase: balance.dodge.cdTicks,
    potionCd: 0, potions: balance.combat.potionBaseMax, potionsMax: balance.combat.potionBaseMax,
    x: F.playerX, y: F.playerY, prevX: F.playerX, prevY: F.playerY, facing: 1,
    state: 'idle', stateTicks: 0,
    invulnerable: false, dodgeDir: -1, dodgeCount: 0, dodgeTicks: 0,
    dodgeSuccessTicks: 0, postDodgeReduceTicks: 0, postDodgeHasteTicks: 0, postDodgeHasteBonus: 0,
    skillCd: [0, 0, 0], skillBuffer: [null, null, null],
    skills: [null, null, null], unlockedSkillIds: [], skillPoints: 0,
    equipped: { weapon: null, armor: null, accessory: null },
    passives: {}, runBuffs: [], startHpPct: 0,
    cdReducePct: 0, dodgeCdReduce: 0, resourceRegenPct: 0,
    burn: null, stunTicks: 0, slow: null, slowTicks: 0,
    hasteBuffTicks: 0, hasteBuffBonus: 0, takenDamageAmp: 0, regenHpPctPerTick: 0, comboPerAuto: 0,
    critHasteTicks: 0, critHasteBonus: 0,
    lastAttackTick: -1, lastHurtTick: -1, lastComboTick: 0, autoCount: 0,
    nextSkillCrit: false, nextSkillCritTimer: 0,
    reviveUsed: false, alive: true,
    targetId: null,
    castSkillId: null, castSlot: -1, castLevel: null, castRefundCost: 0,
    attackCoef: c.attack.coef, attackIntervalBase: c.attack.intervalTicks,
    attackProjectileSpeed: c.attack.projectileSpeed,
  };
}

// §5.2 属性聚合：base + 每级成长 + 装备 + 本局增益 + 元进度起始生命加成
export function recomputeStats(player) {
  const c = getClass(player.classId);
  const lv = player.level - 1;
  const g = c.growthPerLevel;
  const b = c.baseStats;
  let atk = b.atk + g.atk * lv;
  let def = b.def + g.def * lv;
  let maxHp = b.hp + g.hp * lv;
  let crit = b.crit;
  let critDmg = b.critDmg;
  let haste = b.haste;
  let speed = b.speed;
  let resourceMax = c.resource.max;
  let resourceRegenPct = 0;
  let cdReducePct = 0;
  let dodgeCdReduce = 0;
  const passives = {};

  for (let i = 0; i < balance.slots.length; i++) {
    const it = player.equipped[balance.slots[i]];
    if (!it) continue;
    const s = it.stats;
    atk += s.atk || 0;
    def += s.def || 0;
    maxHp += s.hp || 0;
    crit += s.crit || 0;
    critDmg += s.critDmg || 0;
    haste += s.haste || 0;
    speed *= (1 + (s.speedPct || 0));
    resourceMax += s.resourceMax || 0;
    resourceRegenPct += s.resourceRegenPct || 0;
    cdReducePct += s.cdReducePct || 0;
    dodgeCdReduce += s.dodgeCdReduceTicks || 0;
    if (it.passive) passives[it.passive.type] = it.passive;   // 同名不叠加；不同名全额叠加
  }
  if (passives.movePct) speed *= (1 + passives.movePct.value);
  if (passives.dodgeCdReduce) dodgeCdReduce += passives.dodgeCdReduce.ticks;

  for (let i = 0; i < player.runBuffs.length; i++) {
    const buff = player.runBuffs[i];
    if (buff.type === 'atkPct') atk *= (1 + buff.value);
    else if (buff.type === 'defPct') def *= (1 + buff.value);
    else if (buff.type === 'hpPct') maxHp *= (1 + buff.value);
    else if (buff.type === 'regenPct') resourceRegenPct += buff.value;
  }
  maxHp *= (1 + (player.startHpPct || 0));

  player.atk = atk;
  player.def = def;
  player.maxHp = maxHp;
  player.crit = clampCrit(crit);
  player.critDmg = critDmg;
  player.haste = haste;
  player.speed = speed;
  player.range = b.range;
  player.resourceMax = resourceMax;
  player.resourceRegenPct = resourceRegenPct;
  player.cdReducePct = cdReducePct;
  player.dodgeCdReduce = dodgeCdReduce;
  player.dodgeCdBase = Math.max(1, balance.dodge.cdTicks - dodgeCdReduce);
  player.passives = passives;
  if (player.hp === 0 || player.hp === undefined) player.hp = maxHp;
  else player.hp = Math.min(player.hp, maxHp);
  if (player.resource > resourceMax) player.resource = resourceMax;
}

// 攻速增量（相对基准 100），供 attackIntervalTicks 使用
export function hasteBonusOf(p) {
  return (p.haste - balance.formula.hasteBase)
    + (p.hasteBuffBonus || 0) + (p.postDodgeHasteBonus || 0) + (p.critHasteBonus || 0);
}

// §5.7 解锁按累计道行达标判定（达标即永久生效，不扣除）
export function computeUnlocks(daohangTotal) {
  return balance.daohang.unlocks.filter((u) => daohangTotal >= u.at);
}

export function isClassUnlocked(classId, meta) {
  const c = getClass(classId);
  return !!c && (meta ? meta.daohangTotal : 0) >= c.unlockAt;
}

export function classUnlockText(classId) {
  const c = getClass(classId);
  if (!c || c.unlockAt === 0) return '初始可选';
  return `需累计道行 ${c.unlockAt} 解锁`;
}

// 应用已解锁的元进度到新玩家（起始装备替换 / 药瓶上限 / 起始生命 / 额外技能 / 起始技能等级）
function applyMetaUnlocks(state, p, meta) {
  const list = computeUnlocks(meta.daohangTotal);
  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    switch (u.type) {
      case 'potionMax':
        p.potionsMax = Math.max(p.potionsMax, u.value);
        break;
      case 'startWeapon':
        p.equipped.weapon = makeStarterItem(u.value);
        break;
      case 'startArmor':
        p.equipped.armor = makeStarterItem(u.value);
        break;
      case 'startAccessory':
        p.equipped.accessory = makeStarterItem(u.value);
        break;
      case 'startHpPct':
        p.startHpPct += u.value;
        break;
      case 'startSkillLv':
        if (p.skills[0]) p.skills[0].level = u.value;
        break;
      case 'extraSkill': {
        const pool = skillsOfClass(p.classId).filter((id) => p.unlockedSkillIds.indexOf(id) < 0);
        if (pool.length) unlockSkill(p, pool[nextInt(state, pool.length)]);
        break;
      }
      default:
        break;
    }
  }
  p.potions = p.potionsMax;
}

export function createPlayer(state, classId, meta) {
  const c = getClass(classId);
  const p = emptyPlayerShape(classId);
  for (let i = 0; i < balance.slots.length; i++) {
    const slot = balance.slots[i];
    p.equipped[slot] = makeStarterItem(c.startEquipment[slot]);
  }
  p.skills[0] = { id: c.startSkillIds[0], level: 1 };
  p.unlockedSkillIds.push(c.startSkillIds[0]);
  p.resource = c.resource.id === 'mana' ? c.resource.max : 0;
  recomputeStats(p);
  applyMetaUnlocks(state, p, meta);
  recomputeStats(p);
  p.hp = p.maxHp;
  return p;
}

// ───────────────────────── 等级 / 装备 ─────────────────────────

// §5.6 经验曲线：升级不发属性点，按表自动成长
export function gainExp(player, amount) {
  player.exp += amount;
  let gained = 0;
  while (player.level < balance.exp.levelMax
         && player.exp >= balance.exp.perLevel[player.level - 1]) {
    player.exp -= balance.exp.perLevel[player.level - 1];
    player.level += 1;
    gained += 1;
  }
  if (gained > 0) recomputeStats(player);
  return gained;
}

export function equipItem(player, slot, item) {
  player.equipped[slot] = item;
  recomputeStats(player);
}

function scoreItem(item) {
  if (!item) return 0;
  const W = balance.equipScore;
  let s = 0;
  for (const k in item.stats) s += (item.stats[k] || 0) * (W[k] || 0);
  if (item.passive) s += W.passive;
  return s;
}

// §5.5 掉落即穿：一眼看出哪件更好的替换对比
export function compareEquipment(current, candidate) {
  const rows = [];
  const keys = Object.keys(balance.statLabels);
  const a = current ? current.stats : {};
  const n = candidate ? candidate.stats : {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const av = a[k] || 0;
    const nv = n[k] || 0;
    if (av === 0 && nv === 0) continue;
    rows.push({ key: k, label: balance.statLabels[k], cur: av, next: nv, delta: nv - av });
  }
  rows.push({
    key: 'rarity', label: '品质',
    cur: current ? balance.rarityNames[current.rarity] : '无',
    next: candidate ? balance.rarityNames[candidate.rarity] : '无',
  });
  rows.push({
    key: 'passive', label: '被动词条',
    cur: current && current.passive ? current.passive.label : '无',
    next: candidate && candidate.passive ? candidate.passive.label : '无',
  });
  const curScore = scoreItem(current);
  const nextScore = scoreItem(candidate);
  const verdict = nextScore > curScore ? 'better' : (nextScore < curScore ? 'worse' : 'equal');
  return { rows, curScore, nextScore, verdict };
}

export function applyRunBuff(p, buff) {
  p.runBuffs.push(buff);
  recomputeStats(p);
}

// ───────────────────────── 技能装配 / 升级 ─────────────────────────

export function unlockSkillToSlot(player, skillId, slot) {
  if (player.unlockedSkillIds.indexOf(skillId) < 0) player.unlockedSkillIds.push(skillId);
  player.skills[slot] = { id: skillId, level: 1 };
  player.skillCd[slot] = 0;
  player.skillBuffer[slot] = null;
}

export function unlockSkill(player, skillId) {
  if (player.unlockedSkillIds.indexOf(skillId) >= 0) return false;
  let slot = -1;
  for (let i = 0; i < player.skills.length; i++) {
    if (!player.skills[i]) { slot = i; break; }
  }
  if (slot < 0) return false;   // 已满，交由 UI 走「替换哪一格」
  unlockSkillToSlot(player, skillId, slot);
  return true;
}

export function upgradeSkillAt(player, slot) {
  const s = player.skills[slot];
  if (!s) return false;
  const defs = getSkill(s.id).levels;
  if (s.level >= defs.length) return false;
  s.level += 1;
  return true;
}

// ───────────────────────── 三选一奖励 ─────────────────────────

function pickUnlockedSkill(state, p) {
  const pool = skillsOfClass(p.classId).filter((id) => p.unlockedSkillIds.indexOf(id) < 0);
  return pool.length ? pool[nextInt(state, pool.length)] : null;
}

function pickUpgradeSlot(state, p) {
  const slots = [];
  for (let i = 0; i < p.skills.length; i++) {
    const s = p.skills[i];
    if (s && s.level < getSkill(s.id).levels.length) slots.push(i);
  }
  return slots.length ? slots[nextInt(state, slots.length)] : null;
}

function makeRewardOption(state, type) {
  const p = state.player;
  switch (type) {
    case 'equipment': {
      const item = rollRewardEquipment(state, state.chapter);
      if (!item) return { type: 'skillPoint', title: '技能点 +1', desc: '未抽到可用装备，转为技能点', icon: '📜', value: 1 };
      return { type, title: '装备', desc: `${balance.rarityNames[item.rarity]}·${item.name}`, icon: '🎁', item };
    }
    case 'skillPoint':
      return { type, title: '技能点 +1', desc: '存入技能点池，可立即用于升级', icon: '📜', value: 1 };
    case 'unlockSkill': {
      const id = pickUnlockedSkill(state, p);
      if (!id) return { type: 'skillPoint', title: '技能点 +1', desc: '技能已全解锁，转为技能点', icon: '📜', value: 1 };
      const sk = getSkill(id);
      return { type, title: '解锁新技能', desc: `${sk.icon} ${sk.name}`, icon: sk.icon, skillId: id };
    }
    case 'upgradeSkill': {
      const slot = pickUpgradeSlot(state, p);
      if (slot === null) {
        const buff = balance.runBuffs[nextInt(state, balance.runBuffs.length)];
        return { type: 'buff', title: '本局增益', desc: buff.label, icon: '✦', buff, converted: true };
      }
      const sk = getSkill(p.skills[slot].id);
      return { type, title: '技能升级 +1', desc: `${sk.icon} ${sk.name} → Lv${p.skills[slot].level + 1}`, icon: sk.icon, slot };
    }
    case 'heal':
      return { type, title: '回复 30% 生命', desc: '满血时转为最大生命 +5%（本局）', icon: '🧪' };
    case 'buff': {
      const buff = balance.runBuffs[nextInt(state, balance.runBuffs.length)];
      return { type, title: '本局增益', desc: buff.label, icon: '✦', buff };
    }
    default:
      return { type: 'skillPoint', title: '技能点 +1', desc: '', icon: '📜', value: 1 };
  }
}

// 每个节点结算后必给 1 次三选一（§5.6）
export function generateRewards(state) {
  const types = rollRewardTypes(state, state.nodeType === 'boss');
  state.rewards = types.map((t) => makeRewardOption(state, t));
  return state.rewards;
}

export function applyReward(state, index) {
  const opt = state.rewards && state.rewards[index];
  if (!opt) return;
  const p = state.player;
  switch (opt.type) {
    case 'equipment':
      if (opt.item) state.lootQueue.push(opt.item);
      break;
    case 'skillPoint':
      p.skillPoints += opt.value || 1;
      break;
    case 'unlockSkill':
      if (!unlockSkill(p, opt.skillId)) state.skillSlotChoice = { skillId: opt.skillId };
      break;
    case 'upgradeSkill':
      upgradeSkillAt(p, opt.slot);
      break;
    case 'heal':
      if (p.hp >= p.maxHp) {
        applyRunBuff(p, { type: 'hpPct', value: balance.reward.fullHealToHpPct, label: '最大生命 +5%（本局）' });
      } else {
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * balance.combat.potionHealPct);
      }
      break;
    case 'buff':
      applyRunBuff(p, opt.buff);
      break;
    default:
      break;
  }
  state.rewards = null;
  emit(state, EV.REPLACE, { name: opt.title });
}

export function resolveSkillSlot(state, slot) {
  const c = state.skillSlotChoice;
  if (!c) return;
  unlockSkillToSlot(state.player, c.skillId, slot);
  state.skillSlotChoice = null;
}

export function resolveLoot(state, replace) {
  const item = state.lootQueue.shift();
  if (!item) return;
  if (replace) {
    equipItem(state.player, item.slot, item);
    emit(state, EV.REPLACE, { name: item.name, color: balance.rarities.indexOf(item.rarity) });
  }
  state.pendingLoot = null;
}

// ───────────────────────── 结算 ─────────────────────────

// §5.7 道行：战斗中已累加击杀/节点/Boss，这里补首次通关奖励并入账
export function settleRun(state, won) {
  const dh = balance.daohang;
  let total = state.daohangEarned;
  if (won && !state.meta.firstClearDone) {
    total += dh.firstClearBonus;
    state.meta.firstClearDone = true;
  }
  state.meta.daohangTotal += total;
  if (won) state.meta.clears += 1;
  state.battleResult = {
    won, daohang: total, kills: state.kills,
    chapter: state.chapter, node: state.node,
    totalDaohang: state.meta.daohangTotal,
  };
  state.phase = won ? 'victory' : 'death';
  state.victory = won;
  return state.battleResult;
}

export function expGrantFor(chapter, node) {
  return getExpGrant(chapter, node);
}
