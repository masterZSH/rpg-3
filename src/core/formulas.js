// src/core/formulas.js —— design_v1.md §5.1 伤害/暴击/减伤/攻击间隔的纯函数
// 逐字实现，参数全部来自调用方（tables / state），本文件不含任何玩法数值字面量。
import { balance } from './tables.js';

const F = balance.formula;

// EFF_DEF = max(0, DEF * (1 - ARMOR_PEN) * (1 - ARMOR_REDUCE))；ARMOR_PEN 与 ARMOR_REDUCE 是乘算
export function effectiveDef(def, armorPen, armorReduce) {
  return Math.max(0, (def || 0) * (1 - (armorPen || 0)) * (1 - (armorReduce || 0)));
}

// MITI = 100 / (100 + EFF_DEF)
export function mitigation(effDef) {
  return F.mitiBase / (F.mitiBase + effDef);
}

// AMPLIFY = max(0.2, 1 + DMG_AMP - DMG_REDUCE)
export function amplify(dmgAmp, dmgReduce) {
  return Math.max(F.amplifyFloor, 1 + (dmgAmp || 0) - (dmgReduce || 0));
}

// 暴击率硬封 75%
export function clampCrit(crit) {
  return Math.min(F.critCap, Math.max(0, crit || 0));
}

// INTERVAL_TICKS = max(6, round(BASE_INTERVAL_TICKS * 100 / (100 + HASTE)))
// 口径：HASTE 为「相对基准 100 的攻速增量」（见 §3.4 表 33t / §10.3 +8 → 31t）。
export function attackIntervalTicks(baseTicks, hasteBonus) {
  return Math.max(F.intervalMinTicks, Math.round(baseTicks * F.hasteBase / (F.hasteBase + (hasteBonus || 0))));
}

// 伤害结算（§5.1）。rngFn() ∈ [0,1)，被调用 2 次：暴击判定与 VARIANCE。
// 返回 final（飘字：扣护盾前完整值）、toHp（实际扣血）、absorbed、crit、raw、effDef。
export function computeDamage(ctx, rngFn) {
  const effDef = effectiveDef(ctx.targetDef, ctx.armorPen, ctx.armorReduce);
  const base = ctx.atk * ctx.coef + (ctx.flat || 0);
  const miti = mitigation(effDef);
  const amp = amplify(ctx.dmgAmp, ctx.dmgReduce);
  const critMul = rngFn() < clampCrit(ctx.crit) ? (ctx.critDmg || F.critDmgBase) : 1;
  const variance = F.varianceBase + F.varianceSpan * rngFn();
  const rawBeforeShield = base * miti * amp * critMul * variance;

  let raw = rawBeforeShield;
  let absorbed = 0;
  const shield = ctx.shield || 0;
  if (shield > 0) {
    absorbed = Math.min(shield, raw);
    raw -= absorbed;
  }

  const toHp = Math.max(F.minDamage, Math.round(raw));
  const final = Math.max(F.minDamage, Math.round(rawBeforeShield));
  return { final, toHp, absorbed, crit: critMul > 1, raw: rawBeforeShield, effDef };
}
