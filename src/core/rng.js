// src/core/rng.js —— 可播种 PRNG（mulberry32），状态是 state.rng（uint32，可序列化）
// 全项目禁用 Math.random()；所有随机都经这里，保证同种子 + 同输入 → 同结果。
import { balance } from './tables.js';

const R = balance.rng;

export function seedRng(seed) {
  const s = (seed >>> 0);
  return s === 0 ? R.defaultSeed : s;
}

// 原地推进 state.rng，返回 [0,1)
export function nextRandom(state) {
  let t = (state.rng + R.increment) >>> 0;
  state.rng = t;
  let r = t;
  r = Math.imul(r ^ (r >>> 15), r | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return ((r ^ (r >>> 14)) >>> 0) / R.divisor;
}

// [0, maxExclusive) 整数
export function nextInt(state, maxExclusive) {
  return Math.floor(nextRandom(state) * maxExclusive);
}

// [min, max] 区间均匀取整（design §读者约定：区间表示掉落时均匀取整）
export function rollInt(state, min, max) {
  return min + Math.floor(nextRandom(state) * (max - min + 1));
}

export function chance(state, p) {
  return nextRandom(state) < p;
}

// 按整数权重抽取：weights 为 { key: weight } 或 [ [key, weight], ... ]
// 权重为 0 的条目不会被抽中；返回 key。
export function weightedPick(state, weights) {
  const entries = Array.isArray(weights) ? weights : Object.keys(weights).map((k) => [k, weights[k]]);
  let total = 0;
  for (let i = 0; i < entries.length; i++) total += entries[i][1];
  if (total <= 0) return entries.length ? entries[0][0] : null;
  let r = nextRandom(state) * total;
  for (let i = 0; i < entries.length; i++) {
    r -= entries[i][1];
    if (r < 0) return entries[i][0];
  }
  return entries[entries.length - 1][0];
}

// 从数组中按权重抽 key，抽中后从候选里剔除（用于「3 个不重复」）
export function weightedPickWithout(state, weights, excluded) {
  const entries = Object.keys(weights)
    .filter((k) => !excluded.has(k))
    .map((k) => [k, weights[k]]);
  return weightedPick(state, entries);
}
