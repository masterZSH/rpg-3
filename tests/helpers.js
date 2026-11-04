// tests/helpers.js —— 零依赖测试辅助（node --test tests/）
import { createInitialState } from '../src/core/state.js';
import { step } from '../src/core/combat.js';

export const SEED = 0x12345678;

export function makeState(seed = SEED) {
  return createInitialState(seed);
}

// 手动推进 n 个 tick；inputs 为数组（每 tick 相同意图）或函数 (tick)=>intents
export function stepN(state, inputs, n) {
  for (let i = 0; i < n; i++) {
    const intents = typeof inputs === 'function' ? inputs(state.tick) : (inputs || []);
    step(state, intents);
  }
  return state;
}

// 关键字段快照 → 可比较字符串，用于确定性断言（不依赖墙钟/随机）
export function hashState(state) {
  const p = state.player;
  return JSON.stringify({
    tick: state.tick,
    totalTicks: state.totalTicks,
    rng: state.rng,
    phase: state.phase,
    kills: state.kills,
    daohang: state.daohangEarned,
    chapter: state.chapter,
    node: state.node,
    wave: state.wave,
    p: p ? [
      p.hp, p.x, p.y, p.resource, p.stamina, p.level, p.exp,
      p.state, p.stateTicks, p.dodgeCount, p.invulnerable,
      p.skillCd[0], p.skillCd[1], p.skillCd[2],
    ] : null,
    enemies: state.enemies.filter((e) => e.active).map((e) => [e.uid, e.hp, e.x, e.y, e.attackCooldown]),
    projectiles: state.projectiles.filter((r) => r.active).map((r) => [r.x, r.y, r.active]),
    hazards: state.hazards.filter((h) => h.active).map((h) => [h.kind, h.cx, h.cy, h.remaining]),
  });
}

export function snapshot(state) {
  return JSON.parse(hashState(state));
}

// 内存版 localStorage（供 storage.js 注入测试）
export function fakeLocalStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}
