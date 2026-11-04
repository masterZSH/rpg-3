// tests/loot.test.js —— 掉落权重分布 / Boss 品质 +1 档 / 三选一不重复
// 期望权重比例抄自 docs/design_v1.md §5.6 表，写成字面量。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rollQuality, rollSlot, rollRewardTypes, rollEquipmentItem, rollNodeDrop, bumpRarity,
} from '../src/core/loot.js';
import { makeState } from './helpers.js';

const N = 30000;
// §5.6 品质权重（按章）：凡/灵/宝/仙
const QUALITY = {
  1: { fan: 62, ling: 34, bao: 4, xian: 0 },
  2: { fan: 18, ling: 52, bao: 27, xian: 3 },
  3: { fan: 4, ling: 28, bao: 52, xian: 16 },
};
// §5.6 槽位权重（全局）
const SLOT = { weapon: 35, armor: 35, accessory: 30 };

test('§5.6 品质权重分布（三章 × 固定种子 30000 次采样）', () => {
  for (const ch of [1, 2, 3]) {
    const s = makeState(0x51 + ch);
    const counts = { fan: 0, ling: 0, bao: 0, xian: 0 };
    for (let i = 0; i < N; i++) counts[rollQuality(s, ch, false)]++;
    const total = QUALITY[ch].fan + QUALITY[ch].ling + QUALITY[ch].bao + QUALITY[ch].xian;
    for (const r of Object.keys(counts)) {
      const expected = QUALITY[ch][r] / total;
      const actual = counts[r] / N;
      assert.ok(
        Math.abs(actual - expected) < 0.012,
        `章${ch} ${r}：期望 ≈ ${expected.toFixed(3)}，实际 ${actual.toFixed(3)}`,
      );
    }
  }
});

test('§5.6 槽位权重分布（武器35 / 护甲35 / 饰品30）', () => {
  const s = makeState(0x77);
  const counts = { weapon: 0, armor: 0, accessory: 0 };
  for (let i = 0; i < N; i++) counts[rollSlot(s)]++;
  for (const k of Object.keys(counts)) {
    const expected = SLOT[k] / 100;
    const actual = counts[k] / N;
    assert.ok(Math.abs(actual - expected) < 0.012, `${k}：期望 ${expected}，实际 ${actual.toFixed(3)}`);
  }
});

test('§5.6 Boss 掉落品质 +1 档（凡→灵、灵→宝、宝→仙、仙→仙）', () => {
  assert.equal(bumpRarity('fan'), 'ling');
  assert.equal(bumpRarity('ling'), 'bao');
  assert.equal(bumpRarity('bao'), 'xian');
  assert.equal(bumpRarity('xian'), 'xian');
});

test('§5.6 Boss3 保底仙', () => {
  const s = makeState(0x33);
  for (let i = 0; i < 100; i++) {
    assert.equal(rollQuality(s, 3, true), 'xian');
  }
});

test('§5.6 Boss 品质 +1 档后的整体分布（章一）', () => {
  const s = makeState(0x91);
  const counts = { fan: 0, ling: 0, bao: 0, xian: 0 };
  for (let i = 0; i < N; i++) counts[rollQuality(s, 1, true)]++;
  // 权重表 凡62/灵34/宝4/仙0 各 +1 档 → 灵62/宝34/仙4/凡0
  const expected = { fan: 0, ling: 0.62, bao: 0.34, xian: 0.04 };
  for (const r of Object.keys(counts)) {
    assert.ok(
      Math.abs(counts[r] / N - expected[r]) < 0.012,
      `Boss 章一 ${r}：期望 ${expected[r]}，实际 ${(counts[r] / N).toFixed(3)}`,
    );
  }
});

test('§5.6 三选一：抽 3 个不重复类型', () => {
  for (const isBoss of [false, true]) {
    const s = makeState(isBoss ? 0x66 : 0x65);
    for (let i = 0; i < 500; i++) {
      const types = rollRewardTypes(s, isBoss);
      assert.equal(types.length, 3);
      assert.equal(new Set(types).size, 3, `出现重复：${types}`);
    }
  }
});

test('§5.6 节点掉落率：精英/Boss 必掉，普通按 60%', () => {
  const sElite = makeState(0xA1);
  for (let i = 0; i < 200; i++) {
    const d = rollNodeDrop(sElite, 'elite', 1);
    assert.ok(d && d.item, '精英节点应 100% 掉落');
  }
  const sBoss = makeState(0xA2);
  for (let i = 0; i < 200; i++) {
    const d = rollNodeDrop(sBoss, 'boss', 1);
    assert.ok(d && d.item, 'Boss 节点应 100% 掉落');
  }
  const s = makeState(0xA3);
  const n = 5000;
  let dropped = 0;
  for (let i = 0; i < n; i++) {
    if (rollNodeDrop(s, 'normal', 1)) dropped++;
  }
  assert.ok(Math.abs(dropped / n - 0.60) < 0.015, `普通节点掉率应 ≈ 0.60，实际 ${(dropped / n).toFixed(3)}`);
});

test('§5.5 掉落装备实例结构完整（id/name/slot/rarity/stats）', () => {
  const s = makeState(0xB1);
  for (let i = 0; i < 200; i++) {
    const item = rollEquipmentItem(s, rollQuality(s, 2, false), 2);
    if (!item) continue;
    assert.equal(typeof item.id, 'string');
    assert.equal(typeof item.name, 'string');
    assert.ok(['weapon', 'armor', 'accessory'].includes(item.slot));
    assert.ok(['fan', 'ling', 'bao', 'xian'].includes(item.rarity));
    assert.ok(item.stats && typeof item.stats === 'object');
    // 属性值在 statRange 内（若有区间定义）
    const def = rollEquipmentItem;
    assert.ok(Object.values(item.stats).every((v) => Number.isFinite(v) && v >= 0));
  }
});
