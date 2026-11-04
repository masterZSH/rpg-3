// src/perf.js —— [B] 帧耗时采样、画质档位、URL ?q= 覆盖（tech §6）
// 逻辑 tick 恒 30Hz 不变；低画质只降渲染侧。
// 降档清单：art_spec_v2 §7 + vfx_spec_v1 §7.3（视差/雾/尘埃/呼吸/残影/顿帧/震屏/描边发光/拖尾）。
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

  // 当前是否处于「低档」判定（手动 low 或 auto 降到 0）。
  // 所有降档开关统一读它，保证 ?q=low 与自动降档行为一致。
  const isLow = () =>
    quality === 'low' || (auto && level === 0);

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
    get low() { return isLow(); },
    // ── art §7 / vfx §7.3 降档开关 ──
    get fogOn() { return !isLow(); },            // 2 雾带 → 0
    get dustMax() { return isLow() ? 8 : 24; },  // 尘埃 24 → 8
    get breathing() { return !isLow(); },        // 光斑呼吸 / 低血呼吸 / 就绪呼吸（CSS 侧走 body.lowq）
    get critSeal() { return !isLow(); },         // 暴击朱砂印
    get hitStop() { return !isLow(); },          // 暴击顿帧
    get shakeOn() { return !isLow(); },          // 震屏（降档自动关，与晕动开关独立）
    get glowLineWidth() { return isLow() ? 3 : 6; },  // Boss 光晕等描边发光减半
    get trails() { return !isLow(); },           // 弹道/环境拖尾
  };
}
