// src/loop.js —— [B] rAF + 累加器 + alpha + pause/resume（tech §3.2 / §3.3）
// 30Hz 固定步长逻辑；渲染插值 alpha 只进渲染层，绝不进入 core。
// 恢复不追帧：暂停期间不累积时间；单帧最多 5 步、超出丢弃积压。
import { balance } from './core/tables.js';

const L = balance.loop;

export function createLoop(stepFn, renderFn) {
  let acc = 0;
  let last = 0;
  let running = false;
  let rafId = 0;

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (!running) { last = now; return; }        // 暂停：不累积时间

    let delta = now - last;
    last = now;
    if (delta > L.maxFrameMs) delta = L.maxFrameMs;   // 防后台回来瞬移
    acc += delta;

    let steps = 0;
    while (acc >= L.stepMs && steps < L.maxSteps) {
      stepFn();
      acc -= L.stepMs;
      steps += 1;
    }
    if (steps === L.maxSteps) acc = 0;           // 丢弃积压，防死亡螺旋

    const alpha = acc / L.stepMs;                // 0..1，仅用于渲染插值
    renderFn(alpha);
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    acc = 0;
    rafId = requestAnimationFrame(frame);
  }

  function pause() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    acc = 0;
  }

  return { start, pause, get running() { return running; } };
}
