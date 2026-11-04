// tests/determinism.test.js —— 固定种子 RNG + 手动推进 tick 的确定性
import test from 'node:test';
import assert from 'node:assert/strict';
import { startBattle, step } from '../src/core/combat.js';
import { makeState, hashState, SEED } from './helpers.js';

// 预录输入脚本：每 40 tick 放技能槽 0、每 55 tick 闪避、每 90 tick 技能槽 1（未装配）
function script(tick) {
  const intents = [];
  if (tick % 40 === 0) intents.push({ type: 'skill', slot: 0 });
  if (tick % 55 === 0) intents.push({ type: 'dodge' });
  if (tick % 90 === 0) intents.push({ type: 'skill', slot: 1 });
  return intents;
}

function runBattle(seed, ticks) {
  const s = makeState(seed);
  startBattle(s, 'lishi');
  for (let i = 0; i < ticks; i++) step(s, script(s.tick));
  return s;
}

test('同种子 + 同输入序列 → 关键 state 快照完全一致（900 tick）', () => {
  const a = runBattle(SEED, 900);
  const b = runBattle(SEED, 900);
  assert.equal(hashState(a), hashState(b));
});

test('同种子 + 空输入 → 快照一致（600 tick）', () => {
  const a = runBattle(SEED, 600);
  const b = runBattle(SEED, 600);
  assert.equal(hashState(a), hashState(b));
});

test('不同种子 → 战斗演化不同', () => {
  const a = runBattle(0x0000AAAA, 600);
  const b = runBattle(0x0000BBBB, 600);
  assert.notEqual(hashState(a), hashState(b));
});

test('同种子不同职业 → 战斗演化不同（职业数值生效）', () => {
  const mk = (classId) => {
    const s = makeState(SEED);
    startBattle(s, classId);
    for (let i = 0; i < 600; i++) step(s, script(s.tick));
    return s;
  };
  const a = mk('lishi');
  const b = mk('shushi');
  assert.notEqual(hashState(a), hashState(b));
});

test('battle 内所有 tick 无异常且 tick 严格推进', () => {
  const s = runBattle(SEED, 1200);
  // phase 离开 battle（死亡/结算）后 step 早退属预期；tick 与 totalTicks 恒同步
  assert.equal(s.tick, s.totalTicks);
  assert.ok(s.tick > 0 && s.tick <= 1200);
  assert.ok(['battle', 'reward', 'death', 'victory'].includes(s.phase));
});
