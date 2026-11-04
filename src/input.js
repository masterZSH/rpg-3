// src/input.js —— [R] 底部按键 → 离散意图队列（tech §4.1 / design §3.1 / §3.6）
// 触发时机：pointerdown 按下即触发（无 click 延迟、无长按拖拽语义）。
// 多点触控：每根手指各自触发 pointerdown → 各自入队，天然支持「同时点闪避与技能」。
// pointercancel（来电/系统手势）：只清该 pointer 的挂起态，已入队指令不撤单。
export function createInput() {
  let queue = [];
  let lastPointerSlot = {};   // pointerId → slot（用于取消时定位，不做撤销）

  function push(type, slot) {
    queue.push({ type, slot });
    if (queue.length > 8) queue.shift();   // 极端连点防积压（每槽缓冲裁决在 core）
  }

  function bindKey(el, type, slot) {
    const down = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      lastPointerSlot[ev.pointerId] = slot !== undefined ? slot : type;
      push(type, slot);
    };
    el.addEventListener('pointerdown', down);
    // 手指滑出按钮不产生任何取消（design §3.6：技能已按下即触发，不撤单）
    el.addEventListener('pointerup', (ev) => { ev.preventDefault(); });
    el.addEventListener('pointercancel', (ev) => { delete lastPointerSlot[ev.pointerId]; });
    el.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }

  return {
    bindKey,
    push,
    // loop 每逻辑 tick 调用：取走本 tick 意图（不直接改 world，交由 core.step 裁决）
    drain() {
      if (queue.length === 0) return null;
      const q = queue;
      queue = [];
      return q;
    },
    clear() { queue = []; },
    clearAll() { queue = []; lastPointerSlot = {}; },
  };
}
