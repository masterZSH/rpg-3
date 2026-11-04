// src/data/equipment.js —— design_v1.md §5.5 的 24 件装备表镜像
// slot: weapon|armor|accessory；rarity: fan|ling|bao|xian；全职业通用。
// stats 为该件的固定属性值（起始装取此值）；statRange 为掉落时均匀取整的区间。
// chapters 为可掉落章节；weight 为层内抽取权重，weightByChapter 覆盖特定章（设计表 "10 / 20"）。
// passive.type 由 core/progression.js 聚合进 player.passives；同名不叠加，不同名全额叠加。

export default {
  // ───────────── 武器 8 件 ─────────────
  chaidao: {
    id: 'chaidao', name: '柴刀', icon: '⚔️', slot: 'weapon', rarity: 'fan', chapters: [1], weight: 18,
    stats: { atk: 5 }, statRange: { atk: [5, 7] },
    passive: { type: 'executeBonus', value: 0.08, hpPct: 0.30, label: '劈砍：对生命低于 30% 的目标伤害 +8%' },
  },
  taomuzhang: {
    id: 'taomuzhang', name: '桃木杖', icon: '⚔️', slot: 'weapon', rarity: 'fan', chapters: [1], weight: 18,
    stats: { atk: 4, haste: 3 }, statRange: { atk: [4, 6] },
    passive: { type: 'regenHp', everyTicks: 300, hpPct: 0.01, label: '净气：每 10 s 回复 1% 最大生命' },
  },
  jinggangdao: {
    id: 'jinggangdao', name: '精钢刀', icon: '⚔️', slot: 'weapon', rarity: 'ling', chapters: [1, 2], weight: 14,
    stats: { atk: 10 }, statRange: { atk: [10, 13] },
    passive: { type: 'critExtra', coef: 0.20, label: '锋锐：暴击时附加 20% ATK 无视护盾的伤害' },
  },
  fubi: {
    id: 'fubi', name: '符笔', icon: '⚔️', slot: 'weapon', rarity: 'ling', chapters: [1, 2], weight: 12,
    stats: { atk: 8, haste: 5 }, statRange: { atk: [8, 11] },
    passive: { type: 'skillHitMana', manaPct: 0.03, label: '引灵：技能命中回复 3% 最大灵力' },
  },
  liuyebi: {
    id: 'liuyebi', name: '柳叶匕', icon: '⚔️', slot: 'weapon', rarity: 'ling', chapters: [2], weight: 12,
    stats: { atk: 9, crit: 0.04 }, statRange: { atk: [9, 12] },
    passive: { type: 'critHaste', bonus: 8, ticks: 90, label: '见血：暴击后 3 s 内攻速 +8' },
  },
  zhanyaoren: {
    id: 'zhanyaoren', name: '斩妖刃', icon: '⚔️', slot: 'weapon', rarity: 'bao', chapters: [2, 3], weight: 10,
    weightByChapter: { 2: 10, 3: 20 },
    stats: { atk: 17 }, statRange: { atk: [17, 21] },
    passive: { type: 'armorPen', value: 0.20, label: '破邪：无视目标 20% 防御' },
  },
  leifulu: {
    id: 'leifulu', name: '雷符箓', icon: '⚔️', slot: 'weapon', rarity: 'bao', chapters: [3], weight: 16,
    stats: { atk: 15, haste: 8 }, statRange: { atk: [15, 19] },
    passive: { type: 'every4thAuto', nth: 4, coef: 0.60, radius: 90, label: '引雷：每第 4 次普攻附加 60% ATK 范围伤害' },
  },
  huangquanyin: {
    id: 'huangquanyin', name: '黄泉引', icon: '⚔️', slot: 'weapon', rarity: 'xian', chapters: [3], weight: 6,
    stats: { atk: 24, critDmg: 0.20 }, statRange: { atk: [24, 28] },
    passive: { type: 'killHeal', hpPct: 0.08, resource: 10, label: '摄魂：击杀回复 8% 最大生命并 +10 主资源' },
  },

  // ───────────── 护甲 8 件 ─────────────
  mayi: {
    id: 'mayi', name: '麻衣', icon: '🛡️', slot: 'armor', rarity: 'fan', chapters: [1], weight: 22,
    stats: { def: 3, hp: 12 }, statRange: { def: [3, 4], hp: [12, 18] },
    passive: null,
  },
  pijia: {
    id: 'pijia', name: '皮甲', icon: '🛡️', slot: 'armor', rarity: 'fan', chapters: [1], weight: 18,
    stats: { def: 4, hp: 8 }, statRange: { def: [4, 5], hp: [8, 14] },
    passive: { type: 'movePct', value: 0.04, label: '轻身：移速 +4%' },
  },
  suozijia: {
    id: 'suozijia', name: '锁子甲', icon: '🛡️', slot: 'armor', rarity: 'ling', chapters: [1, 2], weight: 14,
    stats: { def: 8, hp: 35 }, statRange: { def: [8, 10], hp: [35, 45] },
    passive: { type: 'dmgReduce', value: 0.04, label: '坚壁：受到伤害 −4%' },
  },
  daopao: {
    id: 'daopao', name: '道袍', icon: '🛡️', slot: 'armor', rarity: 'ling', chapters: [1, 2], weight: 12,
    stats: { def: 6, hp: 30 }, statRange: { def: [6, 8], hp: [30, 40] },
    passive: { type: 'regenHp', everyTicks: 150, hpPct: 0.006, label: '养气：每 5 s 回复 0.6% 最大生命' },
  },
  yexingyi: {
    id: 'yexingyi', name: '夜行衣', icon: '🛡️', slot: 'armor', rarity: 'ling', chapters: [2], weight: 12,
    stats: { def: 7, hp: 25 }, statRange: { def: [7, 9], hp: [25, 35] },
    passive: { type: 'dodgeCdReduce', ticks: 5, label: '匿影：闪避冷却 −5 tick' },
  },
  xuantiekai: {
    id: 'xuantiekai', name: '玄铁铠', icon: '🛡️', slot: 'armor', rarity: 'bao', chapters: [2, 3], weight: 10,
    weightByChapter: { 2: 10, 3: 18 },
    stats: { def: 14, hp: 70 }, statRange: { def: [14, 17], hp: [70, 85] },
    passive: { type: 'lowHpReduce', value: 0.12, hpPct: 0.40, label: '镇岳：生命低于 40% 时受到伤害 −12%' },
  },
  jiaoxiaojia: {
    id: 'jiaoxiaojia', name: '鲛绡甲', icon: '🛡️', slot: 'armor', rarity: 'bao', chapters: [3], weight: 14,
    stats: { def: 11, hp: 60 }, statRange: { def: [11, 14], hp: [60, 75] },
    passive: { type: 'postDodgeReduce', value: 0.15, ticks: 60, label: '回澜：闪避结束后 2 s 内受到伤害 −15%' },
  },
  wuchangchang: {
    id: 'wuchangchang', name: '无常氅', icon: '🛡️', slot: 'armor', rarity: 'xian', chapters: [3], weight: 6,
    stats: { def: 19, hp: 100 }, statRange: { def: [19, 23], hp: [100, 120] },
    passive: { type: 'revive', hpPct: 0.25, label: '还魂：每局一次，致死伤害改为回复 25% 最大生命' },
  },

  // ───────────── 饰品 8 件 ─────────────
  tongling: {
    id: 'tongling', name: '铜铃', icon: '💠', slot: 'accessory', rarity: 'fan', chapters: [1], weight: 20,
    stats: { crit: 0.02 }, statRange: {},
    passive: { type: 'killSlow', radius: 120, slow: 0.20, ticks: 60, label: '惊魂：击杀使 r=120 内敌人缓滞 0.20 / 2 s' },
  },
  caobianfu: {
    id: 'caobianfu', name: '草编符', icon: '💠', slot: 'accessory', rarity: 'fan', chapters: [1], weight: 18,
    stats: { hp: 10, resourceRegenPct: 0.08 }, statRange: {},
    passive: null,
  },
  yujue: {
    id: 'yujue', name: '玉珏', icon: '💠', slot: 'accessory', rarity: 'ling', chapters: [1, 2], weight: 14,
    stats: { crit: 0.04, critDmg: 0.08 }, statRange: {},
    passive: { type: 'critHeal', hpPct: 0.01, label: '碎玉：暴击回复 1% 最大生命' },
  },
  wudunang: {
    id: 'wudunang', name: '五毒囊', icon: '💠', slot: 'accessory', rarity: 'ling', chapters: [1, 2], weight: 12,
    stats: { haste: 5 }, statRange: {},
    passive: { type: 'autoBurn', coef: 0.12, ticks: 60, label: '蚀骨：普攻附加 12% ATK 灼烧 / 2 s' },
  },
  fengling: {
    id: 'fengling', name: '风铃', icon: '💠', slot: 'accessory', rarity: 'ling', chapters: [2], weight: 12,
    stats: { speedPct: 0.08, dodgeCdReduceTicks: 3 }, statRange: {},
    passive: { type: 'postDodgeHaste', bonus: 12, ticks: 45, label: '听风：闪避成功后 1.5 s 内攻速 +12' },
  },
  xueyu: {
    id: 'xueyu', name: '血玉', icon: '💠', slot: 'accessory', rarity: 'bao', chapters: [2, 3], weight: 10,
    weightByChapter: { 2: 10, 3: 18 },
    stats: { crit: 0.07, critDmg: 0.15 }, statRange: {},
    passive: { type: 'lifesteal', value: 0.04, label: '饮血：造成伤害的 4% 转化为生命' },
  },
  leiyinling: {
    id: 'leiyinling', name: '雷音铃', icon: '💠', slot: 'accessory', rarity: 'bao', chapters: [3], weight: 14,
    stats: { haste: 10, resourceMax: 20 }, statRange: {},
    passive: { type: 'skillCritCdReduce', ticks: 30, label: '雷音：技能暴击时该技能 CD −30 tick' },
  },
  bianhua: {
    id: 'bianhua', name: '彼岸花', icon: '💠', slot: 'accessory', rarity: 'xian', chapters: [3], weight: 6,
    stats: { crit: 0.10, critDmg: 0.25, cdReducePct: 0.08 }, statRange: {},
    passive: { type: 'nextSkillCrit', everyTicks: 900, label: '轮回：每 30 s，下一次技能必定暴击' },
  },
};
