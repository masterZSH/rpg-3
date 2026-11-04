// src/data/skills.js —— design_v1.md §5.4 的 3×6=18 技能表镜像
// 每技能 levels 固定 3 项（Lv1/Lv2/Lv3）。字段说明：
//   cost/cdTicks/castTicks  资源消耗 / 冷却 tick / 前摇 tick
//   coef  单段伤害系数（乘 ATK）；hits 段数（0 = 无直接伤害）
//   shape single|aoe|projectile|delayed_aoe|multi_target|zone|self
//   origin player|target（aoe 圆心）；radius / projectileSpeed / delayTicks
//   slow  {move,atk,def,ticks} 是 §7.3 SLOW 的三分量（破甲=def 分量）
//   burn  {coefPerHit,ticks} 每满 30 tick 结算 ATK*coefPerHit
//   execute {mult,when:['stun','slow']} 目标处于异常时系数倍率
//   shieldHpPct/shieldTicks/reflectPct/burst 护盾系
//   hasteBonus/buffTicks/takenDamageAmp/regenHpPctPerTick/comboPerAuto 增益系
//   zone {radius,ticks,hitEveryTicks,coef,slow,stunTicks} 地面持续区

export default {
  // ───────────── 力士（怒气） ─────────────
  mengji: {
    id: 'mengji', name: '猛击', icon: 'sk-mengji', classId: 'lishi', cost: 25, cdTicks: 120, castTicks: 4,
    desc: '沉重一击，Lv3 附带破甲',
    levels: [
      { coef: 2.40, hits: 1, shape: 'single' },
      { coef: 2.80, hits: 1, shape: 'single' },
      { coef: 3.40, hits: 1, shape: 'single', slow: { move: 0, atk: 0, def: 0.20, ticks: 120 } },
    ],
  },
  handi: {
    id: 'handi', name: '撼地', icon: 'sk-handi', classId: 'lishi', cost: 30, cdTicks: 240, castTicks: 6,
    desc: '范围砸地并眩晕',
    levels: [
      { coef: 1.60, hits: 1, shape: 'aoe', origin: 'player', radius: 120, stunTicks: 36 },
      { coef: 2.00, hits: 1, shape: 'aoe', origin: 'player', radius: 120, stunTicks: 45 },
      { coef: 2.50, hits: 1, shape: 'aoe', origin: 'player', radius: 120, stunTicks: 60 },
    ],
  },
  tiebi: {
    id: 'tiebi', name: '铁壁', icon: 'sk-tiebi', classId: 'lishi', cost: 25, cdTicks: 360, castTicks: 2,
    desc: '护盾，Lv3 期间反弹伤害',
    levels: [
      { hits: 0, shieldHpPct: 0.25, shieldTicks: 180 },
      { hits: 0, shieldHpPct: 0.30, shieldTicks: 210 },
      { hits: 0, shieldHpPct: 0.35, shieldTicks: 240, reflectPct: 0.30 },
    ],
  },
  kuangxue: {
    id: 'kuangxue', name: '狂血', icon: 'sk-kuangxue', classId: 'lishi', cost: 0, cdTicks: 600, castTicks: 2,
    desc: '攻速大涨，但期间受伤 +10%',
    levels: [
      { hits: 0, hasteBonus: 30, buffTicks: 240, takenDamageAmp: 0.10 },
      { hits: 0, hasteBonus: 40, buffTicks: 270, takenDamageAmp: 0.10 },
      { hits: 0, hasteBonus: 50, buffTicks: 300, takenDamageAmp: 0.10, regenHpPctPerTick: 0.03 / 30 },
    ],
  },
  xuanfeng: {
    id: 'xuanfeng', name: '旋风', icon: 'sk-xuanfeng', classId: 'lishi', cost: 45, cdTicks: 300, castTicks: 6,
    desc: '3 段范围斩，每段回 5 怒气',
    levels: [
      { coef: 0.90, hits: 3, shape: 'aoe', origin: 'player', radius: 90, refundPerHit: 5 },
      { coef: 1.20, hits: 3, shape: 'aoe', origin: 'player', radius: 90, refundPerHit: 5 },
      { coef: 1.50, hits: 3, shape: 'aoe', origin: 'player', radius: 90, refundPerHit: 5 },
    ],
  },
  suiyue: {
    id: 'suiyue', name: '碎岳', icon: 'sk-suiyue', classId: 'lishi', cost: 60, cdTicks: 480, castTicks: 8,
    desc: '目标眩晕/缓滞时伤害 ×1.5',
    levels: [
      { coef: 4.00, hits: 1, shape: 'single', execute: { mult: 1.5, when: ['stun', 'slow'] } },
      { coef: 5.00, hits: 1, shape: 'single', execute: { mult: 1.5, when: ['stun', 'slow'] } },
      { coef: 6.00, hits: 1, shape: 'single', execute: { mult: 1.5, when: ['stun', 'slow'] } },
    ],
  },

  // ───────────── 术士（灵力） ─────────────
  lingdan: {
    id: 'lingdan', name: '灵弹', icon: 'sk-lingdan', classId: 'shushi', cost: 18, cdTicks: 90, castTicks: 5,
    desc: '弹道法术，高级可弹射',
    levels: [
      { coef: 1.50, hits: 1, shape: 'projectile', projectileSpeed: 380 },
      { coef: 1.90, hits: 1, shape: 'projectile', projectileSpeed: 380, chain: 1, chainCoef: 0.60 },
      { coef: 2.40, hits: 1, shape: 'projectile', projectileSpeed: 380, chain: 2, chainCoef: 0.60 },
    ],
  },
  zhuofu: {
    id: 'zhuofu', name: '灼符', icon: 'sk-zhuofu', classId: 'shushi', cost: 28, cdTicks: 240, castTicks: 6,
    desc: '范围伤害并附加灼烧',
    levels: [
      { coef: 0.80, hits: 1, shape: 'aoe', origin: 'target', radius: 100, burn: { coefPerHit: 0.30, ticks: 90 } },
      { coef: 1.00, hits: 1, shape: 'aoe', origin: 'target', radius: 100, burn: { coefPerHit: 0.35, ticks: 120 } },
      { coef: 1.30, hits: 1, shape: 'aoe', origin: 'target', radius: 100, burn: { coefPerHit: 0.40, ticks: 150 } },
    ],
  },
  bingfeng: {
    id: 'bingfeng', name: '冰封', icon: 'sk-bingfeng', classId: 'shushi', cost: 30, cdTicks: 300, castTicks: 6,
    desc: '范围伤害 + 强缓滞，Lv3 附加眩晕',
    levels: [
      { coef: 1.00, hits: 1, shape: 'aoe', origin: 'target', radius: 110, slow: { move: 0.50, atk: 0.50, def: 0, ticks: 90 } },
      { coef: 1.30, hits: 1, shape: 'aoe', origin: 'target', radius: 110, slow: { move: 0.60, atk: 0.60, def: 0, ticks: 120 } },
      { coef: 1.60, hits: 1, shape: 'aoe', origin: 'target', radius: 110, slow: { move: 0.70, atk: 0.70, def: 0, ticks: 150 }, stunTicks: 30 },
    ],
  },
  lingdun: {
    id: 'lingdun', name: '灵盾', icon: 'sk-lingdun', classId: 'shushi', cost: 25, cdTicks: 420, castTicks: 2,
    desc: '护盾，Lv3 破裂时范围爆炸',
    levels: [
      { hits: 0, shieldHpPct: 0.20, shieldTicks: 150 },
      { hits: 0, shieldHpPct: 0.25, shieldTicks: 150 },
      { hits: 0, shieldHpPct: 0.30, shieldTicks: 150, burst: { coef: 1.50, radius: 140 } },
    ],
  },
  leiyin: {
    id: 'leiyin', name: '雷引', icon: 'sk-leiyin', classId: 'shushi', cost: 35, cdTicks: 270, castTicks: 8,
    desc: '延迟落雷，Lv3 附加眩晕',
    levels: [
      { coef: 2.20, hits: 1, shape: 'delayed_aoe', origin: 'target', radius: 130, delayTicks: 24 },
      { coef: 2.80, hits: 1, shape: 'delayed_aoe', origin: 'target', radius: 130, delayTicks: 24 },
      { coef: 3.50, hits: 1, shape: 'delayed_aoe', origin: 'target', radius: 130, delayTicks: 24, stunTicks: 24 },
    ],
  },
  wanling: {
    id: 'wanling', name: '万灵归一', icon: 'sk-wanling', classId: 'shushi', cost: 50, cdTicks: 540, castTicks: 8,
    desc: '按命中敌人数倍率，Lv3 每命中回 8 灵力',
    levels: [
      { coef: 1.20, hits: 1, shape: 'multi_target', maxTargets: 5 },
      { coef: 1.50, hits: 1, shape: 'multi_target', maxTargets: 5 },
      { coef: 1.90, hits: 1, shape: 'multi_target', maxTargets: 5, manaOnHit: 8 },
    ],
  },

  // ───────────── 游侠（连击点） ─────────────
  yingxi: {
    id: 'yingxi', name: '影袭', icon: 'sk-yingxi', classId: 'youxia', cost: 1, cdTicks: 90, castTicks: 4,
    desc: '多段快斩，Lv3 质变 3 段',
    levels: [
      { coef: 0.80, hits: 2, shape: 'single' },
      { coef: 1.00, hits: 2, shape: 'single' },
      { coef: 1.20, hits: 3, shape: 'single' },
    ],
  },
  zhuiying: {
    id: 'zhuiying', name: '追影', icon: 'sk-zhuiying', classId: 'youxia', cost: 2, cdTicks: 120, castTicks: 4,
    desc: '突进至目标身前，Lv3 必定暴击',
    levels: [
      { coef: 1.50, hits: 1, shape: 'single', dashPx: 60 },
      { coef: 2.00, hits: 1, shape: 'single', dashPx: 60 },
      { coef: 2.60, hits: 1, shape: 'single', dashPx: 60, guaranteedCrit: true },
    ],
  },
  luoxing: {
    id: 'luoxing', name: '落星', icon: 'sk-luoxing', classId: 'youxia', cost: 3, cdTicks: 180, castTicks: 6,
    desc: '远程弹道，高级附带溅射',
    levels: [
      { coef: 2.40, hits: 1, shape: 'projectile', projectileSpeed: 500 },
      { coef: 3.00, hits: 1, shape: 'projectile', projectileSpeed: 500, splashRadius: 100, splashCoef: 0.50 },
      { coef: 3.80, hits: 1, shape: 'projectile', projectileSpeed: 500, splashRadius: 140, splashCoef: 0.50 },
    ],
  },
  jifeng: {
    id: 'jifeng', name: '疾风', icon: 'sk-jifeng', classId: 'youxia', cost: 2, cdTicks: 360, castTicks: 2,
    desc: '攻速大涨，Lv3 普攻额外产连击点',
    levels: [
      { hits: 0, hasteBonus: 40, buffTicks: 180 },
      { hits: 0, hasteBonus: 55, buffTicks: 210 },
      { hits: 0, hasteBonus: 70, buffTicks: 240, comboPerAuto: 0.20 },
    ],
  },
  xianjing: {
    id: 'xianjing', name: '陷阱', icon: 'sk-xianjing', classId: 'youxia', cost: 2, cdTicks: 300, castTicks: 4,
    desc: '地面持续区，每 30 tick 出伤并缓滞',
    levels: [
      { hits: 0, zone: { radius: 90, ticks: 120, hitEveryTicks: 30, coef: 0.50, slow: { move: 0.40, atk: 0.40, def: 0, ticks: 30 } } },
      { hits: 0, zone: { radius: 90, ticks: 150, hitEveryTicks: 30, coef: 0.65, slow: { move: 0.40, atk: 0.40, def: 0, ticks: 30 } } },
      { hits: 0, zone: { radius: 90, ticks: 180, hitEveryTicks: 30, coef: 0.80, slow: { move: 0.40, atk: 0.40, def: 0, ticks: 30 }, stunTicks: 30 } },
    ],
  },
  qianren: {
    id: 'qianren', name: '千刃', icon: 'sk-qianren', classId: 'youxia', cost: 5, cdTicks: 600, castTicks: 8,
    desc: '终结技，段数与暴击率随等级提升',
    levels: [
      { coef: 0.50, hits: 8, shape: 'single' },
      { coef: 0.55, hits: 10, shape: 'single', critBonus: 0.05 },
      { coef: 0.65, hits: 12, shape: 'single', critBonus: 0.10 },
    ],
  },
};
