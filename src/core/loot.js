// src/core/loot.js —— design_v1.md §5.5 / §5.6 掉落判定与权重抽取（确定性纯逻辑）
// 签名统一 (state, ...) => 结果；RNG 状态随 state.rng 原地推进。
import { balance, getDropTable, getEquipment, allEquipment } from './tables.js';
import { chance, rollInt, weightedPick, weightedPickWithout } from './rng.js';

const D = getDropTable();
const EQUIP = allEquipment();

export function bumpRarity(rarity) {
  const list = balance.rarities;
  const i = list.indexOf(rarity);
  return list[Math.min(list.length - 1, i + 1)];
}

// §5.6 品质权重（按章）；Boss 掉落品质 +1 档，Boss3 保底仙
export function rollQuality(state, chapter, isBoss) {
  if (isBoss && chapter === balance.chapterCount && D.boss3GuaranteeXian) {
    return balance.rarities[balance.rarities.length - 1];
  }
  let r = weightedPick(state, D.qualityWeights[chapter]);
  if (isBoss && D.bossQualityBump) r = bumpRarity(r);
  return r;
}

// §5.6 槽位权重（全局）
export function rollSlot(state) {
  return weightedPick(state, D.slotWeights);
}

function rollStats(state, item) {
  const out = {};
  const fixed = item.stats;
  for (const k in fixed) {
    const range = item.statRange && item.statRange[k];
    out[k] = range ? rollInt(state, range[0], range[1]) : fixed[k];
  }
  return out;
}

// 在「指定品质 + 指定槽位 + 可掉章节」的层内按 weight 抽 1 件；该层无货时按品质档位就近替代。
// 存在意义：design §5.6 章一权重含 bao=4，但 §5.5 章一装备只有凡/灵——
// 抽到空层时向相邻品质扩展（先本档，再 ±1 档、±2 档……），保证节点掉落率不被品质层吃掉。
export function rollEquipmentItem(state, rarity, chapter, forcedSlot) {
  const order = balance.rarities;
  const start = order.indexOf(rarity);
  if (start < 0) return null;
  for (let d = 0; d < order.length; d++) {
    const offsets = d === 0 ? [0] : [d, -d];
    for (let j = 0; j < offsets.length; j++) {
      const idx = start + offsets[j];
      if (idx < 0 || idx >= order.length) continue;
      const item = tryRollEquipment(state, order[idx], chapter, forcedSlot);
      if (item) return item;
    }
  }
  return null;
}

function tryRollEquipment(state, rarity, chapter, forcedSlot) {
  const slot = forcedSlot || rollSlot(state);
  const candidates = [];
  const weights = [];
  for (const id of Object.keys(EQUIP)) {
    const e = EQUIP[id];
    if (e.slot !== slot || e.rarity !== rarity || e.chapters.indexOf(chapter) < 0) continue;
    const w = e.weightByChapter && e.weightByChapter[chapter] !== undefined
      ? e.weightByChapter[chapter] : e.weight;
    candidates.push(id);
    weights.push(w);
  }
  if (candidates.length === 0) return null;
  const id = weightedPick(state, candidates.map((c, i) => [c, weights[i]]));
  const item = getEquipment(id);
  return {
    id,
    name: item.name,
    icon: item.icon,
    slot: item.slot,
    rarity: item.rarity,
    stats: rollStats(state, item),
    passive: item.passive,
  };
}

// §5.6 节点战斗掉落：返回 { item, qualityBumped } 或 null
export function rollNodeDrop(state, nodeType, chapter) {
  const p = D.nodeDropChance[nodeType];
  if (!chance(state, p)) return null;
  const isBoss = nodeType === 'boss';
  const rarity = rollQuality(state, chapter, isBoss);
  const item = rollEquipmentItem(state, rarity, chapter);
  return { item, qualityBumped: isBoss };
}

// §5.6 三选一：抽 3 个不重复类型
export function rollRewardTypes(state, isBoss) {
  const w = isBoss ? D.bossRewardWeights : D.rewardWeights;
  const excluded = new Set();
  const out = [];
  for (let i = 0; i < 3; i++) {
    const k = weightedPickWithout(state, w, excluded);
    if (k === null) break;
    excluded.add(k);
    out.push(k);
  }
  return out;
}

// 三选一里「装备」类型每件独立生成（design §5.6）
export function rollRewardEquipment(state, chapter) {
  const rarity = rollQuality(state, chapter, false);
  return rollEquipmentItem(state, rarity, chapter);
}

export function getExpGrant(chapter, node) {
  return D.expGrant[chapter][node - 1];
}
