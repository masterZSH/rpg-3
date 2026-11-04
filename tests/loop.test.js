// tests/loop.test.js —— A3 慢镜回归：loop 层累加器时间缩放（0.4× / 45 逻辑 tick）
// 逻辑 tick 率恒 30Hz、确定性不受影响（本文件只动 wall-clock → 累加器的映射）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoop } from '../src/loop.js';

// node 环境无 rAF：注入桩，手动喂帧时间戳
let rafCb = null;
globalThis.requestAnimationFrame = (fn) => { rafCb = fn; return 1; };
globalThis.cancelAnimationFrame = () => {};

const FRAME = 16.667;      // 60fps 渲染帧（略大于精确值，避开浮点步进边界）

test('A3 慢镜：0.4× 期间逻辑 tick 恰 45 个，结束自动恢复 1.0', () => {
  let steps = 0;
  const loop = createLoop(() => { steps += 1; }, () => {});
  loop.start();
  rafCb(0);                       // 预热一帧，设定 last
  loop.slowMo(0.4, 45);
  assert.equal(loop.timeScale, 0.4);
  // 0.4× 下 45 个逻辑 tick 需 45/30/0.4 = 3.75s 墙钟 = 225 个 60fps 帧
  for (let i = 1; i <= 225; i++) rafCb(i * FRAME);
  assert.equal(steps, 45);        // 慢镜期间逻辑 tick 数 = 45
  assert.equal(loop.timeScale, 1);      // 结束后恢复 1.0
  assert.equal(loop.slowTicksLeft, 0);
  loop.pause();
});

test('A3 慢镜结束后：逻辑 tick 率回到恒定 30Hz（1 秒 30 tick）', () => {
  let steps = 0;
  const loop = createLoop(() => { steps += 1; }, () => {});
  loop.start();
  rafCb(0);
  loop.slowMo(0.4, 45);
  for (let i = 1; i <= 225; i++) rafCb(i * FRAME);
  const mid = steps;
  for (let i = 226; i <= 285; i++) rafCb(i * FRAME);   // 再走 1 秒
  assert.equal(steps - mid, 30);  // 30Hz 恒定
  loop.pause();
});

test('A3 慢镜非法入参被忽略（不改变 tick 率）', () => {
  let steps = 0;
  const loop = createLoop(() => { steps += 1; }, () => {});
  loop.start();
  rafCb(0);
  loop.slowMo(1.5, 45);     // >1 无效
  loop.slowMo(0.4, 0);      // 0 tick 无效
  assert.equal(loop.timeScale, 1);
  for (let i = 1; i <= 60; i++) rafCb(i * FRAME);
  assert.equal(steps, 30);  // 正常 30Hz
  loop.pause();
});
