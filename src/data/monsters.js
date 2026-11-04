// src/data/monsters.js —— design_v1.md §5.3 / §6.3 的 18 妖 + 3 Boss 机器可读镜像
// HP/ATK/DEF/intervalTicks(tick)/speed(px/s)；ai: chase|kite|dive|boss
// size 决定阶段2 几何剪影体型分档（art §2）。
// 机制颜色：red = 仅无敌帧可躲；orange = 无敌帧或距离 > 半径可躲（§6.3）。

export default {
  // ───────────── 第一章（推荐 Lv1–3） ─────────────
  zhiren: {
    id: 'zhiren', name: '纸人', chapter: 1, tier: 'normal', size: 'medium',
    hp: 170, atk: 12, def: 6, intervalTicks: 72, speed: 90, ai: 'chase', rangePx: 46,
  },
  denglonggui: {
    id: 'denglonggui', name: '灯笼鬼', chapter: 1, tier: 'normal', size: 'small',
    hp: 150, atk: 14, def: 4, intervalTicks: 84, speed: 70, ai: 'kite', rangePx: 200, keepDistance: 200,
    projectileSpeed: 200,
    deathEffect: { warnTicks: 24, radius: 90, damage: 25, color: 'orange', name: '死亡爆燃' },
  },
  zhuying: {
    id: 'zhuying', name: '竹影', chapter: 1, tier: 'normal', size: 'medium',
    hp: 200, atk: 11, def: 10, intervalTicks: 78, speed: 105, ai: 'chase', rangePx: 46,
    dash: { everyTicks: 180, distancePx: 180, moveTicks: 12 },
  },
  nitong: {
    id: 'nitong', name: '泥童', chapter: 1, tier: 'normal', size: 'large',
    hp: 260, atk: 9, def: 14, intervalTicks: 102, speed: 55, ai: 'chase', rangePx: 48,
    deathZone: { radius: 80, ticks: 90, slow: 0.30, name: '泥沼' },
  },
  guque: {
    id: 'guque', name: '骨雀', chapter: 1, tier: 'normal', size: 'small',
    hp: 130, atk: 13, def: 5, intervalTicks: 57, speed: 130, ai: 'chase', rangePx: 42,
    onHitHaste: { bonus: 20, ticks: 60 },
  },
  yangui: {
    id: 'yangui', name: '檐鬼', chapter: 1, tier: 'elite', size: 'large',
    hp: 1300, atk: 19, def: 12, intervalTicks: 75, speed: 95, ai: 'chase', rangePx: 54,
    mechanic: { name: '吊索突袭', everyTicks: 210, warnTicks: 42, shape: 'circle', radius: 100, damage: 45, color: 'orange', followPlayer: true },
  },

  // ───────────── 第二章（推荐 Lv4–6） ─────────────
  shuihou: {
    id: 'shuihou', name: '水猴', chapter: 2, tier: 'normal', size: 'medium',
    hp: 300, atk: 23, def: 14, intervalTicks: 72, speed: 100, ai: 'chase', rangePx: 46,
    onHitSlow: { move: 0.20, atk: 0.20, def: 0, ticks: 60 },
  },
  xiujiabing: {
    id: 'xiujiabing', name: '锈甲兵', chapter: 2, tier: 'normal', size: 'large',
    hp: 420, atk: 26, def: 26, intervalTicks: 90, speed: 60, ai: 'chase', rangePx: 50,
    block: { chance: 0.15, mult: 0.5 },
  },
  tengyao: {
    id: 'tengyao', name: '藤妖', chapter: 2, tier: 'normal', size: 'medium',
    hp: 340, atk: 21, def: 16, intervalTicks: 84, speed: 75, ai: 'kite', rangePx: 230, keepDistance: 230,
    projectileSpeed: 220,
    mechanic: { name: '缠绕', everyTicks: 240, warnTicks: 27, shape: 'line', width: 60, length: 300, damage: 30, color: 'orange', stunTicks: 30 },
  },
  guimianzhu: {
    id: 'guimianzhu', name: '鬼面蛛', chapter: 2, tier: 'normal', size: 'small',
    hp: 300, atk: 28, def: 12, intervalTicks: 63, speed: 135, ai: 'chase', rangePx: 44,
  },
  yexiao: {
    id: 'yexiao', name: '夜枭', chapter: 2, tier: 'normal', size: 'small',
    hp: 280, atk: 25, def: 10, intervalTicks: 69, speed: 120, ai: 'dive', rangePx: 46, retreatPx: 120,
  },
  shiwei: {
    id: 'shiwei', name: '石卫', chapter: 2, tier: 'elite', size: 'large',
    hp: 2900, atk: 36, def: 30, intervalTicks: 78, speed: 65, ai: 'chase', rangePx: 56,
    mechanic: { name: '冲锋', everyTicks: 240, warnTicks: 45, shape: 'line', width: 120, length: 420, damage: 60, color: 'orange' },
  },

  // ───────────── 第三章（推荐 Lv7–10） ─────────────
  xuefu: {
    id: 'xuefu', name: '血蝠', chapter: 3, tier: 'normal', size: 'small',
    hp: 420, atk: 34, def: 16, intervalTicks: 54, speed: 140, ai: 'chase', rangePx: 42,
    lifesteal: 0.30,
  },
  wumianseng: {
    id: 'wumianseng', name: '无面僧', chapter: 3, tier: 'normal', size: 'medium',
    hp: 560, atk: 39, def: 22, intervalTicks: 78, speed: 80, ai: 'chase', rangePx: 50,
    mechanic: { name: '诵经', everyTicks: 180, warnTicks: 48, shape: 'circle', radius: 200, damage: 40, color: 'red', followPlayer: true, stunTicks: 30 },
  },
  zhouou: {
    id: 'zhouou', name: '咒偶', chapter: 3, tier: 'normal', size: 'medium',
    hp: 520, atk: 36, def: 26, intervalTicks: 72, speed: 85, ai: 'chase', rangePx: 48,
    deathEffect: { warnTicks: 45, radius: 110, damage: 70, color: 'orange', name: '死亡自爆' },
  },
  shiguwu: {
    id: 'shiguwu', name: '蚀骨蜈', chapter: 3, tier: 'normal', size: 'large',
    hp: 680, atk: 42, def: 24, intervalTicks: 63, speed: 115, ai: 'chase', rangePx: 50,
    onHitSlow: { move: 0, atk: 0, def: 0.20, ticks: 120 },   // 仅降防（破甲走 SLOW.def）
  },
  huhuo: {
    id: 'huhuo', name: '狐火', chapter: 3, tier: 'normal', size: 'small',
    hp: 460, atk: 44, def: 14, intervalTicks: 57, speed: 100, ai: 'kite', rangePx: 240, keepDistance: 240,
    projectileSpeed: 220,
    tripleProjectile: { count: 3, coef: 0.35, gapTicks: 12, burn: { coefPerHit: 0.12, ticks: 90 } },
  },
  tongjiashi: {
    id: 'tongjiashi', name: '铜甲尸', chapter: 3, tier: 'elite', size: 'large',
    hp: 4300, atk: 49, def: 40, intervalTicks: 84, speed: 55, ai: 'chase', rangePx: 56,
    mechanic: { name: '横扫', everyTicks: 270, warnTicks: 48, shape: 'cone', angle: 120, radius: 200, damage: 90, color: 'orange' },
  },

  // ───────────── 三个 Boss（§6.3） ─────────────
  tidenglaolao: {
    id: 'tidenglaolao', name: '提灯姥姥', chapter: 1, tier: 'boss', size: 'boss',
    hp: 4600, atk: 18, def: 20, intervalTicks: 90, speed: 60, ai: 'boss', rangePx: 60,
    bossMechanics: [
      { name: '灯灭爆燃', color: 'red', cdTicks: 360, warnTicks: 48, shape: 'circle', radius: 140, damage: 70, followPlayer: true, burn: { coefPerHit: 0.12, ticks: 90 }, teach: true },
      { name: '纸人潮', type: 'summon', cdTicks: 660, summonId: 'zhiren', count: 2, lifeTicks: 180 },
    ],
  },
  qiaoji: {
    id: 'qiaoji', name: '桥姬', chapter: 2, tier: 'boss', size: 'boss',
    hp: 9000, atk: 20, def: 28, intervalTicks: 84, speed: 70, ai: 'boss', rangePx: 62,
    enrage: { hpPct: 0.30, intervalTicks: 70 },
    bossMechanics: [
      { name: '水龙卷', color: 'orange', cdTicks: 540, warnTicks: 42, shape: 'line', width: 120, length: 520, damage: 150, slow: { move: 0.40, atk: 0.40, def: 0, ticks: 90 } },
      { name: '水牢', color: 'red', cdTicks: 660, warnTicks: 54, shape: 'circle', radius: 130, damage: 200, followPlayer: true, stunTicks: 36 },
      { name: '唤水猴', type: 'summon', cdTicks: 660, summonId: 'shuihou', count: 2, lifeTicks: 180 },
    ],
  },
  huangquan: {
    id: 'huangquan', name: '黄泉戏班主', chapter: 3, tier: 'boss', size: 'boss',
    hp: 13500, atk: 30, def: 38, intervalTicks: 90, speed: 65, ai: 'boss', rangePx: 64,
    enrage: { hpPct: 0.25, intervalTicks: 69 },
    bossMechanics: [
      { name: '三连鼓', color: 'red', cdTicks: 660, warnTicks: 30, shape: 'cone', angle: 90, radius: 320, damage: 110, count: 3, gapTicks: 42 },
      { name: '点将台', color: 'orange', cdTicks: 540, warnTicks: 45, shape: 'circle', radius: 110, damage: 25, followPlayer: true, zoneTicks: 240, slow: { move: 0.30, atk: 0.30, def: 0, ticks: 60 } },
      { name: '谢幕', color: 'red', cdTicks: 540, warnTicks: 60, shape: 'global', damage: 300, stunTicks: 30, unlockHpPct: 0.40 },
      { name: '唤咒偶', type: 'summon', cdTicks: 720, summonId: 'zhouou', count: 2, lifeTicks: 180 },
    ],
  },
};
