// src/render/canvas.js —— [R] canvas 初始化、DPR、resize、setTransform
import { balance } from '../core/tables.js';

const R = balance.rects.canvas;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let dpr = 1;
  let cssW = R.w;
  let cssH = R.h;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, Math.round(rect.width));
    cssH = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);   // 封顶防高分屏爆内存
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    // 战场坐标系固定 390 × (canvas 逻辑高)；窄屏（360）等比缩放 x
    scaleX = cssW / R.w;
    scaleY = cssH / R.h;
    scale = Math.max(scaleX, scaleY);
  }

  let scaleX = 1, scaleY = 1, scale = 1;
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  return {
    ctx,
    resize,
    get size() { return { w: cssW, h: cssH }; },
    // 进入 390 基准战场坐标系（y 从 canvas 顶部算起）
    begin() {
      ctx.setTransform(dpr * scaleX, 0, 0, dpr * scaleY, 0, 0);
    },
    // 战场 y 坐标（390 坐标系内，活动带 120–560 对应 canvas 内 24–464）
    toStageY(y) { return y - R.y; },
    get scaleX() { return scaleX; },
  };
}
