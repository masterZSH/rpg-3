// tests/formulas.test.js —— 伤害/减伤/暴击/攻击间隔公式
// 期望值全部按 docs/design_v1.md §5.1 公式手算后写成字面量，不引用被测模块常量。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveDef, mitigation, amplify, clampCrit, attackIntervalTicks, computeDamage,
} from '../src/core/formulas.js';

const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `期望 ${b}，实际 ${a}`);

// 固定序列 rng：computeDamage 内 rngFn 被调用 2 次（暴击判定、VARIANCE）
function seq(...vals) {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
}

test('§5.1 EFF_DEF：ARMOR_PEN 与 ARMOR_REDUCE 是乘算不是加算', () => {
  // DEF=100, PEN=0.2, REDUCE=0.25 → 100 × 0.8 × 0.75 = 60（若加算会算成 100×(1−0.45)=55）
  approx(effectiveDef(100, 0.2, 0.25), 60);
  approx(effectiveDef(100, 0, 0), 100);
  // 下限 0（输入域 PEN/REDUCE ∈ [0,1]）
  approx(effectiveDef(-50, 0, 0), 0);
  approx(effectiveDef(100, 1, 0), 0);    // 穿透 100%
  approx(effectiveDef(100, 0, 1), 0);    // 破甲 100%
});

test('§5.1 MITI 速查表（文档直接抄录，保留 3 位）', () => {
  const table = [
    [10, 0.909], [20, 0.833], [30, 0.769], [40, 0.714],
    [50, 0.667], [61, 0.621], [80, 0.556],
  ];
  for (const [def, expected] of table) {
    assert.equal(mitigation(def).toFixed(3), expected.toFixed(3), `DEF=${def}`);
  }
  approx(mitigation(100), 0.5);
});

test('§5.1 AMPLIFY：max(0.2, 1 + DMG_AMP − DMG_REDUCE)', () => {
  approx(amplify(0.3, 0.1), 1.2);
  approx(amplify(0, 0), 1);
  approx(amplify(0, 2), 0.2);   // 下限 0.2
  approx(amplify(0, 5), 0.2);
});

test('§5.1 暴击率硬封 75%', () => {
  approx(clampCrit(0.9), 0.75);
  approx(clampCrit(0.75), 0.75);
  approx(clampCrit(0.1), 0.1);
  approx(clampCrit(-1), 0);
});

test('§5.1 INTERVAL_TICKS = max(6, round(BASE × 100 / (100 + HASTE)))', () => {
  assert.equal(attackIntervalTicks(33, 0), 33);
  assert.equal(attackIntervalTicks(33, 8), 31);   // 33×100/108 = 30.55 → 31
  assert.equal(attackIntervalTicks(33, 100), 17); // 33×100/200 = 16.5 → 17（round）
  assert.equal(attackIntervalTicks(6, 1000), 6);  // 下限 6
  assert.equal(attackIntervalTicks(6, 10000), 6);
});

test('§5.1 computeDamage 无暴击：RAW = BASE × MITI × AMPLIFY × VARIANCE', () => {
  // ATK=100, COEF=1.0, DEF=100 → EFF_DEF=100, MITI=0.5, BASE=100, AMPLIFY=1
  // rng：第 1 次 0.5（0.5 < crit=0 为 false，不暴击）；第 2 次 0.5 → VARIANCE=0.95+0.10×0.5=1.0
  // RAW = 100 × 0.5 × 1 × 1 × 1.0 = 50 → HP -= 50, FINAL = 50
  const ctx = {
    atk: 100, coef: 1.0, flat: 0, targetDef: 100,
    armorPen: 0, armorReduce: 0, dmgAmp: 0, dmgReduce: 0,
    crit: 0, critDmg: 1.5, shield: 0,
  };
  const r = computeDamage(ctx, seq(0.5, 0.5));
  approx(r.effDef, 100);
  approx(r.raw, 50);
  assert.equal(r.crit, false);
  assert.equal(r.final, 50);
  assert.equal(r.toHp, 50);
  assert.equal(r.absorbed, 0);
});

test('§5.1 computeDamage 暴击：CRIT_MUL 生效', () => {
  // crit=0.5, critDmg=2.0；rng 第 1 次 0.1（<0.5 暴击），第 2 次 0.5 → VARIANCE=1.0
  // RAW = 100 × 0.5 × 1 × 2.0 × 1.0 = 100
  const ctx = {
    atk: 100, coef: 1.0, flat: 0, targetDef: 100,
    armorPen: 0, armorReduce: 0, dmgAmp: 0, dmgReduce: 0,
    crit: 0.5, critDmg: 2.0, shield: 0,
  };
  const r = computeDamage(ctx, seq(0.1, 0.5));
  assert.equal(r.crit, true);
  approx(r.raw, 100);
  assert.equal(r.final, 100);
  assert.equal(r.toHp, 100);
});

test('§5.1 computeDamage 护盾：FINAL 显示扣护盾前完整值，toHp 为扣血', () => {
  // 同上无暴击 RAW_BEFORE_SHIELD=50，shield=30 → absorbed=30, raw=20
  // toHp=max(1,round(20))=20, FINAL=max(1,round(50))=50
  const ctx = {
    atk: 100, coef: 1.0, flat: 0, targetDef: 100,
    armorPen: 0, armorReduce: 0, dmgAmp: 0, dmgReduce: 0,
    crit: 0, critDmg: 1.5, shield: 30,
  };
  const r = computeDamage(ctx, seq(0.5, 0.5));
  approx(r.absorbed, 30);
  assert.equal(r.toHp, 20);
  assert.equal(r.final, 50);
});

test('§5.1 最低伤害 max(1, round(RAW))', () => {
  const ctx = {
    atk: 0.0001, coef: 1.0, flat: 0, targetDef: 100,
    armorPen: 0, armorReduce: 0, dmgAmp: 0, dmgReduce: 0,
    crit: 0, critDmg: 1.5, shield: 0,
  };
  const r = computeDamage(ctx, seq(0.5, 0.5));
  assert.equal(r.toHp, 1);
  assert.equal(r.final, 1);
});

test('§5.1 DMG_AMP / DMG_REDUCE / FLAT 综合手算', () => {
  // ATK=200, COEF=0.5, FLAT=20 → BASE=120
  // DEF=60, ARMOR_PEN=0.5, ARMOR_REDUCE=0 → EFF_DEF=30, MITI=100/130
  // DMG_AMP=0.3, DMG_REDUCE=0.1 → AMPLIFY=1.2
  // 不暴击，VARIANCE=1.0 → RAW = 120 × (100/130) × 1.2 = 14400/130 ≈ 110.769 → round=111
  const ctx = {
    atk: 200, coef: 0.5, flat: 20, targetDef: 60,
    armorPen: 0.5, armorReduce: 0, dmgAmp: 0.3, dmgReduce: 0.1,
    crit: 0, critDmg: 1.5, shield: 0,
  };
  const r = computeDamage(ctx, seq(0.5, 0.5));
  approx(r.effDef, 30);
  approx(r.raw, 120 * (100 / 130) * 1.2, 1e-6);
  assert.equal(r.final, 111);
  assert.equal(r.toHp, 111);
});
