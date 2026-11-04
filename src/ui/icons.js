// src/ui/icons.js —— 内联 SVG 图标系统（art_spec_v2 §5，emoji 全退役）
// 全部 viewBox="0 0 24 24"、fill="none"、stroke="currentColor"、stroke-width="2"，
// 点缀色直接写死色值（不吃 currentColor）。零外链、零请求。
// 浏览器：icon(k, cls) 返回 DOM 节点；node/测试环境返回 svg 字符串。
// 任何未知 key 一律抛错（负向测试依赖此行为）。

const P = '#E8E3D7';      // 纸白
const O = '#E8734A';      // 橙（力士）
const C = '#4FA8D8';      // 青（术士）
const J = '#6FBF73';      // 翠（游侠）
const V = '#C8362B';      // 朱红
const G = '#E8C46A';      // 金

const wrap = (body, extra) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${extra || ''}>${body}</svg>`;

export const ICONS = {
  // ───── 三职业徽记（§5.2） ─────
  'cls-lishi': wrap(
    `<path d="M5 4h14l-2.5 15.5H7.5L5 4z"/>` +
    `<path d="M12 7v9.5"/><path d="M13.8 7v9.5" stroke="${O}" stroke-width="2.5"/><path d="M9 20.5h6"/>`),
  'cls-shushi': wrap(
    `<circle cx="12" cy="12" r="9"/>` +
    `<circle cx="12" cy="9.6" r="2.4" fill="${P}" stroke="none"/><circle cx="12" cy="15.4" r="3.4" fill="${P}" stroke="none"/>` +
    `<path d="M9.4 12.6h5.2" stroke="${C}"/><path d="M12 4.6l1.6 2.2h-3.2z" fill="${C}" stroke="none"/>`),
  'cls-youxia': wrap(
    `<path d="M12 3L20.5 20h-17L12 3z"/>` +
    `<path d="M8 6.5q7 5.5 0 11" stroke="${P}"/><path d="M6.5 12h11"/>` +
    `<path d="M19 12l-3.4-2v4z" fill="${J}" stroke="none"/>`),

  // ───── 技能 18 枚（§5.3：力士八角框/术士圆框/游侠菱形框） ─────
  // 力士组（点缀橙）
  'sk-mengji': wrap(
    `<path d="M8 3.5h8l4.5 4.5v8L16 20.5H8l-4.5-4.5V8L8 3.5z"/>` +
    `<path d="M8.5 5.5l8 5.5-3.5 3.5-8-5.5z" fill="${P}" stroke="none"/>` +
    `<path d="M5 17l2.5 1M12 18.5l1.5 2M17.5 16l2.5 1.5" stroke="${O}"/>`),
  'sk-handi': wrap(
    `<path d="M8 3.5h8l4.5 4.5v8L16 20.5H8l-4.5-4.5V8L8 3.5z"/>` +
    `<path d="M12 10.5v3"/><path d="M7 12h10"/>` +
    `<path d="M6 18l2.5-3M18 18l-2.5-3M12 19.5v-2.5" stroke="${O}"/>`),
  'sk-tiebi': wrap(
    `<path d="M8 3.5h8l4.5 4.5v8L16 20.5H8l-4.5-4.5V8L8 3.5z"/>` +
    `<path d="M12 5v14"/><path d="M9 9h-1.5M9 13h-1.5M16.5 9H15M16.5 13H15" stroke="${O}"/>`),
  'sk-kuangxue': wrap(
    `<path d="M8 3.5h8l4.5 4.5v8L16 20.5H8l-4.5-4.5V8L8 3.5z"/>` +
    `<path d="M12 18c-3.5-2.5-4.5-4.5-4.5-6.5A4.5 4.5 0 0112 8a4.5 4.5 0 014.5 3.5c0 2-1 4-4.5 6.5z" stroke="${O}"/>` +
    `<path d="M9.5 15l2-3 1.5 2 2-3.5"/>`),
  'sk-xuanfeng': wrap(
    `<path d="M8 3.5h8l4.5 4.5v8L16 20.5H8l-4.5-4.5V8L8 3.5z"/>` +
    `<path d="M17 8a6.5 6.5 0 10.5 6"/><path d="M14.5 11a3 3 0 10.5 3" stroke="${O}"/>`),
  'sk-suiyue': wrap(
    `<path d="M8 3.5h8l4.5 4.5v8L16 20.5H8l-4.5-4.5V8L8 3.5z"/>` +
    `<path d="M6.5 18L12 6l5.5 12z"/>` +
    `<path d="M12 9v7" stroke="${O}" stroke-width="2.5"/>`),
  // 术士组（点缀青）
  'sk-lingdan': wrap(
    `<circle cx="12" cy="12" r="9"/>` +
    `<circle cx="12" cy="12" r="3" fill="${P}" stroke="none"/>` +
    `<path d="M5.5 8.5a8 8 0 000 7M18.5 8.5a8 8 0 010 7" stroke="${C}"/>`),
  'sk-zhuofu': wrap(
    `<circle cx="12" cy="12" r="9"/>` +
    `<rect x="9.5" y="6" width="5" height="9" stroke="${P}"/>` +
    `<path d="M11 8.5h2M11 11h2M11 13.5h2" stroke="${C}" stroke-width="1.5"/>` +
    `<path d="M12 15.5l1.8 3h-3.6z" fill="${O}" stroke="none"/>`),
  'sk-bingfeng': wrap(
    `<circle cx="12" cy="12" r="9"/>` +
    `<path d="M12 5v14M6 8.5l12 7M18 8.5l-12 7" stroke="${C}"/><circle cx="12" cy="12" r="2" fill="${P}" stroke="none"/>`),
  'sk-lingdun': wrap(
    `<circle cx="12" cy="12" r="9"/>` +
    `<path d="M12 5.5l5.5 2v4.5c0 3.5-2.5 5.5-5.5 6.5-3-1-5.5-3-5.5-6.5V7.5l5.5-2z" stroke="${P}"/>` +
    `<path d="M8 13a5.5 5.5 0 008 0" stroke="${C}"/>`),
  'sk-leiyin': wrap(
    `<circle cx="12" cy="12" r="9"/>` +
    `<path d="M13.5 5.5L9.5 12h4l-2.5 6.5" stroke="${C}"/><circle cx="12" cy="19" r="1.2" fill="${P}" stroke="none"/>`),
  'sk-wanling': wrap(
    `<circle cx="12" cy="12" r="9"/>` +
    `<circle cx="12" cy="12.5" r="2.8" fill="${P}" stroke="none"/>` +
    `<circle cx="7" cy="8" r="1.3" stroke="${C}"/><circle cx="17" cy="8" r="1.3" stroke="${C}"/><circle cx="12" cy="6" r="1.3" stroke="${C}"/>` +
    `<path d="M8 9l2.5 2.2M16 9l-2.5 2.2M12 7.3v2.6" stroke="${C}" stroke-width="1.2"/>`),
  // 游侠组（点缀翠）
  'sk-yingxi': wrap(
    `<path d="M12 2.5L21 12l-9 9.5L3 12 12 2.5z"/>` +
    `<path d="M8 7l7 6-3.5 3.5L4.5 10" stroke="${P}" opacity=".55"/>` +
    `<path d="M11 9.5l7 6-3.5 3.5-7-6z" fill="${P}" stroke="none"/><path d="M14 7l4 3.5" stroke="${J}"/>`),
  'sk-zhuiying': wrap(
    `<path d="M12 2.5L21 12l-9 9.5L3 12 12 2.5z"/>` +
    `<path d="M6 15L16 7l-1.5 4.5L18 9" stroke="${P}"/><path d="M9 18l4-3M7.5 18.5l2-1.5" stroke="${J}" stroke-width="1.2"/>`),
  'sk-luoxing': wrap(
    `<path d="M12 2.5L21 12l-9 9.5L3 12 12 2.5z"/>` +
    `<circle cx="15.5" cy="8.5" r="2.2" fill="${P}" stroke="none"/><path d="M13.5 10.5L7 17M11 8l-2.5 2.5M17 12l2 2" stroke="${G}"/>`),
  'sk-jifeng': wrap(
    `<path d="M12 2.5L21 12l-9 9.5L3 12 12 2.5z"/>` +
    `<path d="M5 9.5h9a2 2 0 10-2-3M5 13.5h12a2 2 0 11-2 3M5 17h6" stroke="${J}"/>`),
  'sk-xianjing': wrap(
    `<path d="M12 2.5L21 12l-9 9.5L3 12 12 2.5z"/>` +
    `<path d="M8 18l2-4 2 4zM12 18l2-4 2 4z" stroke="${J}"/><path d="M7 8a5 5 0 0110 0" stroke-dasharray="2 2.4" stroke="${J}"/>`),
  'sk-qianren': wrap(
    `<path d="M12 2.5L21 12l-9 9.5L3 12 12 2.5z"/>` +
    `<path d="M12 19L7 6M12 19l0-14M12 19l5-13M12 19L9 6.5M12 19l3-12.5" stroke="${J}" stroke-width="1.4"/>` +
    `<circle cx="12" cy="19" r="1.6" fill="${P}" stroke="none"/>`),

  // ───── 装备槽位（§5.4：3 图形 ×4 品质边框） ─────
  'eq-weapon': wrap(
    `<path d="M6 18L15.5 8.5" /><path d="M15.5 8.5L19 5l-1 4.5-2.5 2z" fill="${P}" stroke="none"/><path d="M5 21l-2.5-2.5L6 17.5 7 19z" fill="${P}" stroke="none"/>`),
  'eq-armor': wrap(
    `<path d="M12 3.5l6 2.5v6c0 4.5-2.5 7-6 8.5-3.5-1.5-6-4-6-8.5V6l6-2.5z"/><path d="M12 3.5v17"/><path d="M6.5 8h11" stroke-width="1.2"/>`),
  'eq-accessory': wrap(
    `<circle cx="12" cy="13" r="6.5"/><circle cx="12" cy="13" r="3.2"/><path d="M12 6.5V3.5"/>`),

  // ───── 系统图标（§5.5 + 暂停面板所需） ─────
  'potion': wrap(
    `<circle cx="12" cy="8.6" r="3" fill="${P}" stroke="none"/><circle cx="12" cy="15.2" r="4.6" fill="${P}" stroke="none"/>` +
    `<path d="M8.6 15.2h6.8" stroke="#7FD48A"/><rect x="10.3" y="3.4" width="3.4" height="2.6" rx="0.9"/>`),
  'dodge': wrap(
    `<path d="M3 9c6-4 11-4 15 0"/><path d="M6 15c5-3 9-3 12 0" stroke="${P}"/><path d="M16.5 12.5L21 15l-4.5 2.5z" fill="${P}" stroke="none"/>`),
  'warn': wrap(
    `<path d="M12 3.5L21.5 20h-19L12 3.5z" stroke="${V}"/><path d="M12 10v4.5" stroke="${V}"/><circle cx="12" cy="17.2" r="0.8" fill="${V}" stroke="none"/>`),
  'st-burn': wrap(
    `<path d="M12 3.5c2.8 3.8 5.8 5.8 5.8 9.6a5.8 5.8 0 11-11.6 0c0-2.6 1.8-3.8 2.8-6.4.9 1.8 1.9 1.8 3-3.2z"/>`),
  'st-stun': wrap(
    `<path d="M12 12a2.4 2.4 0 104.8 0 5.6 5.6 0 10-11.2 0 8.8 8.8 0 1017.6 0"/>`),
  'st-slow': wrap(
    `<path d="M3.5 10c2-2.2 4-2.2 6 0s4 2.2 6 0 4-2.2 5 0"/><path d="M3.5 15.5c2-2.2 4-2.2 6 0s4 2.2 6 0"/>`),
  'st-shield': wrap(
    `<path d="M12 3.5l7 2.8v5.2c0 4.8-2.8 7.4-7 9-4.2-1.6-7-4.2-7-9V6.3l7-2.8z"/>`),
  'pause': wrap(`<path d="M9 5.5v13M15 5.5v13" stroke-width="3"/>`),
  'scroll': wrap(
    `<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 9h6M9 12.5h6M9 16h3.5"/>`),
  'gift': wrap(
    `<rect x="4" y="10.5" width="16" height="9.5" rx="1"/><path d="M4 10.5h16M12 10.5V20"/>` +
    `<path d="M12 10.5C8.5 10.5 7 9 7 7.6 7 6.4 8 5.5 9.2 5.5c1.6 0 2.8 2.4 2.8 5zm0 0c3.5 0 5-1.5 5-2.9 0-1.2-1-2.1-2.2-2.1-1.6 0-2.8 2.4-2.8 5z" stroke="${G}"/>`),
  'star': wrap(`<path d="M12 3l2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3z" fill="${G}" stroke="none"/>`),
  'resume': wrap(`<path d="M8 5l11 7-11 7V5z" fill="${P}" stroke="none"/>`),
  'sound-on': wrap(
    `<path d="M4 10v4h3.5l5 4V6l-5 4H4z" fill="${P}" stroke="none"/><path d="M15.5 9.5a4 4 0 010 5M18 7a7.5 7.5 0 010 10"/>`),
  'sound-off': wrap(
    `<path d="M4 10v4h3.5l5 4V6l-5 4H4z" fill="${P}" stroke="none"/><path d="M16 9.5l5 5M21 9.5l-5 5" stroke="${V}"/>`),
  'quit': wrap(
    `<path d="M13 4.5h5.5v15H13"/><path d="M10 8l-4 4 4 4M6 12h9"/>`),
  'shake': wrap(
    `<path d="M3 12h3l2-5.5 3.5 11 3-11 2 5.5H21" stroke="${P}"/>`),
  'spark': wrap(
    `<path d="M12 4v16M4 12h16M6.5 6.5l11 11M17.5 6.5l-11 11"/>`),
};

// svg 字符串（缺失 key 抛错）
export function iconSvg(k) {
  const s = ICONS[k];
  if (!s) throw new Error('[icons] 未知图标 key: ' + k);
  return s;
}

// DOM 节点（node/无 document 环境返回字符串，便于测试）
export function icon(k, cls) {
  const s = iconSvg(k);
  if (typeof document === 'undefined') return s;
  const holder = document.createElement('span');
  if (cls) holder.className = cls;
  holder.innerHTML = s;
  const svg = holder.firstChild;
  return svg || holder;
}
