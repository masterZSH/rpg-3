// src/perf.js —— [B] 帧耗时采样、画质档位、URL ?q= 覆盖（tech §6）
// 逻辑 tick 恒 30Hz 不变；低画质只降渲染侧（粒子数 / 飘字上限 / 视差层数）。
import { balance } from './core/tables.js';

const FX = balance.fx;

export function createPerf(settings) {
  let quality = settings && settings.quality ? settings.quality : 'auto';
  // URL ?q=low|mid|high 覆盖（测试与用户自救）
  try {
    const q = new URLSearchParams(location.search).get('q');
    if (q && ['low', 'mid', 'high'].indexOf(q) >= 0) quality = q;
  } catch { /* location 不可用时忽略 */ }

  let frameCost = 0;      // 最近一帧渲染耗时（ms）
  let slowFrames = 0;     // 连续超预算帧计数
  let auto = quality === 'auto';
  let level = 1;          // auto 档实际等级：0 low / 1 mid / 2 high

  return {
    get quality() { return quality; },
    setQuality(q) {
      if (['auto', 'low', 'mid', 'high'].indexOf(q) >= 0) {
        quality = q;
        auto = q === 'auto';
      }
    },
    // 每渲染帧调用：cost = 该帧渲染毫秒
    sample(cost) {
      frameCost = cost;
      if (!auto) return;
      if (cost > 20) {
        slowFrames += 1;
        if (slowFrames >= 30 && level > 0) { level -= 1; slowFrames = 0; }   // 持续掉帧 → 降档
      } else if (cost < 9) {
        slowFrames = Math.max(0, slowFrames - 2);
      }
    },
    get frameCost() { return frameCost; },
    // 渲染侧预算
    get particleMax() {
      if (quality === 'low') return FX.particleMaxLow;
      if (quality === 'high') return FX.particleMax;
      return auto ? (level >= 1 ? FX.particleMax : FX.particleMaxLow) : FX.particleMax;
    },
    get entityMax() {
      if (quality === 'low') return FX.entityMaxLow;
      return FX.entityMax;
    },
    get floaterMax() { return quality === 'low' ? 6 : FX.floaterMax; },
    get parallaxLayers() { return quality === 'low' ? 2 : 3; },
  };
}
