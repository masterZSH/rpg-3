// src/loop.js —— [B] rAF + 累加器 + alpha + pause/resume（tech §3.2 / §3.3）
// 30Hz 固定步长逻辑；渲染插值 alpha 只进渲染层，绝不进入 core。
// 恢复不追帧：暂停期间不累积时间；单帧最多 5 步、超出丢弃积压。
// A3（制作人放开项）：Boss 死亡 0.4× 慢镜 45 tick —— 实现为「累加器时间缩放」：
// 只把进入累加器的 wall-clock 乘以 timeScale，stepFn 仍以恒定 30Hz 逻辑节奏被调，
// 逻辑 tick 率与确定性完全不变（tests 手动推 tick 不经过本文件）。慢镜按剩余
// 「逻辑 tick 数」计费：走满 45 个逻辑 tick 后自动恢复 1.0。
import { balance } from './core/tables.js';

const L = balance.loop;

export function createLoop(stepFn, renderFn) {
  let acc = 0;
  let last = 0;
  let running = false;
  let rafId = 0;
  let timeScale = 1;        // 累加器时间缩放系数（慢镜时 <1）
  let slowTicksLeft = 0;    // 慢镜剩余逻辑 tick 数

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (!running) { last = now; return; }        // 暂停：不累积时间

    let delta = now - last;
    last = now;
    if (delta > L.maxFrameMs) delta = L.maxFrameMs;   // 防后台回来瞬移
    if (delta < 0) delta = 0;                         // rAF 时间戳早于 start 时防负累积
    acc += delta * timeScale;

    let steps = 0;
    while (acc >= L.stepMs && steps < L.maxSteps) {
      stepFn();
      acc -= L.stepMs;
      steps += 1;
    }
    if (steps === L.maxSteps) acc = 0;           // 丢弃积压，防死亡螺旋

    // 慢镜计费按实际发生的逻辑 tick 数走，走满恢复 1.0
    if (slowTicksLeft > 0) {
      slowTicksLeft -= steps;
      if (slowTicksLeft <= 0) { slowTicksLeft = 0; timeScale = 1; }
    }

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

  // A3：Boss 死亡慢镜。scale<1 拉长 tick 间隔的观感，ticks=慢镜期间逻辑 tick 总数。
  function slowMo(scale, ticks) {
    if (!(scale > 0 && scale < 1) || !(ticks > 0)) return;
    timeScale = scale;
    slowTicksLeft = Math.round(ticks);
  }

  return {
    start, pause, slowMo,
    get running() { return running; },
    get timeScale() { return timeScale; },
    get slowTicksLeft() { return slowTicksLeft; },
  };
}
