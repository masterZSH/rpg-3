// src/ui/orientation.js —— [R] 横屏提示（CSS media query 已做）、桌面预览手机框标记
export function initOrientation() {
  const wrap = document.getElementById('wrap');
  const isDesktop = !('ontouchstart' in window) && window.matchMedia('(pointer: fine)').matches;
  if (isDesktop) wrap.classList.add('desktop');
  return { isDesktop };
}
