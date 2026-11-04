// src/data/classes.js —— design_v1.md §4 / §5.2 / §5.4 的机器可读镜像
// hp/atk/def/crit/critDmg/haste/speed/range 均为 Lv1 裸装初始值；成长见 growthPerLevel。
// 所有时间量为整数 tick，距离 px，速度 px/s，概率为 0~1 小数。

export default {
  lishi: {
    id: 'lishi',
    name: '力士',
    role: '近战坦克 / 爆发',
    desc: '站桩硬吃，越挨打越强。一刀一顿、刀刀见血，攒满怒气后砸下去。',
    icon: '⚔️',
    color: '#E8734A',
    unlockAt: 0,                       // 初始可选
    resource: { id: 'rage', name: '怒气', max: 100, color: '#E8734A' },
    baseStats: { hp: 480, atk: 26, def: 22, crit: 0.05, critDmg: 1.5, haste: 100, speed: 105, range: 70 },
    growthPerLevel: { hp: 46, atk: 3.6, def: 3.0 },
    attack: { intervalTicks: 33, coef: 1.20, projectileSpeed: 0, windupTicks: 6 },
    // §4.1 怒气生成：普攻命中 +8、受到伤害 +6、击杀 +20；脱战后每秒 -5
    resourceGen: { onHit: 8, onHurt: 6, onKill: 20, regenPerTick: 0, decayPerTick: 5 / 30, outOfCombatTicks: 150 },
    startSkillIds: ['mengji'],
    startEquipment: { weapon: 'chaidao', armor: 'mayi', accessory: 'tongling' },
    // §4.4 对照表参考值（含起始装备），仅作文档对照，运行时按装备聚合
    lv1Reference: { hp: 495, atk: 31.0, def: 25.0, crit: 0.06 },
  },

  shushi: {
    id: 'shushi',
    name: '术士',
    role: '远程炮台 / 控场',
    desc: '265px 超远攻击距离，站着就能打。蓝条即续航，见底时输出断崖。',
    icon: '🔮',
    color: '#4FA8D8',
    unlockAt: 120,                     // §5.7 累计道行 120 解锁
    resource: { id: 'mana', name: '灵力', max: 100, color: '#4FA8D8' },
    baseStats: { hp: 380, atk: 30, def: 13, crit: 0.08, critDmg: 1.5, haste: 100, speed: 110, range: 265 },
    growthPerLevel: { hp: 34, atk: 4.4, def: 1.7 },
    attack: { intervalTicks: 32, coef: 0.85, projectileSpeed: 420, windupTicks: 6 },
    // §4.2 灵力：恒定 9/s + 普攻命中 +5 + 击杀 +15；无脱战衰减
    resourceGen: { onHit: 5, onHurt: 0, onKill: 15, regenPerTick: 9 / 30, decayPerTick: 0, outOfCombatTicks: 0 },
    startSkillIds: ['lingdan'],
    startEquipment: { weapon: 'chaidao', armor: 'mayi', accessory: 'tongling' },
    lv1Reference: { hp: 395, atk: 35.0, def: 16.0, crit: 0.09 },
  },

  youxia: {
    id: 'youxia',
    name: '游侠',
    role: '高频近中程 / 暴击流',
    desc: '0.6 秒一刀，像在打快板。暴击驱动连击点，最快的手，最脆的身。',
    icon: '🏹',
    color: '#6FBF73',
    unlockAt: 260,                     // §5.7 累计道行 260 解锁
    resource: { id: 'combo', name: '连击点', max: 5, color: '#6FBF73' },
    baseStats: { hp: 415, atk: 26, def: 16, crit: 0.10, critDmg: 1.5, haste: 100, speed: 125, range: 155 },
    growthPerLevel: { hp: 38, atk: 3.6, def: 2.0 },
    attack: { intervalTicks: 18, coef: 0.52, projectileSpeed: 0, windupTicks: 6 },
    // §4.3 连击点：普攻命中 +0.40、暴击额外 +0.50；8s 内未获得则每秒 -1
    resourceGen: { onHit: 0.40, onCrit: 0.50, onHurt: 0, onKill: 0, regenPerTick: 0, decayPerTick: 1 / 30, comboDecayTicks: 240 },
    startSkillIds: ['yingxi'],
    startEquipment: { weapon: 'chaidao', armor: 'mayi', accessory: 'tongling' },
    lv1Reference: { hp: 430, atk: 31.0, def: 19.0, crit: 0.11 },
  },
};
