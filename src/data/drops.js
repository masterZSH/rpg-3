// src/data/drops.js —— design_v1.md §5.6 / §6.1 / §6.2 的掉落、经验、关卡组合镜像
// weight 为整数权重；概率用 0~1 小数。章节下标从 1 开始。

export default {
  // §5.6 品质权重（按章）
  qualityWeights: {
    1: { fan: 62, ling: 34, bao: 4, xian: 0 },
    2: { fan: 18, ling: 52, bao: 27, xian: 3 },
    3: { fan: 4, ling: 28, bao: 52, xian: 16 },
  },
  // Boss 掉落：在当前章权重表内品质 +1 档；Boss3 保底仙
  bossQualityBump: true,
  boss3GuaranteeXian: true,

  // §5.6 槽位权重（全局）
  slotWeights: { weapon: 35, armor: 35, accessory: 30 },

  // §5.6 节点战斗掉落率
  nodeDropChance: { normal: 0.60, elite: 1.0, boss: 1.0 },

  // §5.6 三选一奖励权重（抽 3 个不重复类型）
  rewardWeights: { equipment: 42, skillPoint: 18, unlockSkill: 14, upgradeSkill: 12, heal: 9, buff: 5 },
  // Boss 后：装备权重 60，其余按文档给定值
  bossRewardWeights: { equipment: 60, skillPoint: 12, unlockSkill: 9, upgradeSkill: 8, heal: 6, buff: 5 },

  // §5.6 经验发放表：expGrant[章][层-1]，每层结算一次性发放（含该层全部击杀经验）
  expGrant: {
    1: [100, 120, 150, 170, 280],
    2: [240, 270, 330, 360, 600],
    3: [900, 1000, 1100, 1140, 1400],
  },

  // §6.2 每章敌人组合：每节点 2 波（Boss 层为单波 Boss）
  chapters: {
    1: {
      nodes: [
        { type: 'normal', waves: [[{ id: 'zhiren', count: 3 }], [{ id: 'zhiren', count: 2 }, { id: 'guque', count: 1 }]] },
        { type: 'normal', waves: [[{ id: 'denglonggui', count: 2 }, { id: 'zhuying', count: 1 }], [{ id: 'zhiren', count: 2 }, { id: 'nitong', count: 1 }]] },
        { type: 'elite',  waves: [[{ id: 'yangui', count: 1 }], [{ id: 'guque', count: 2 }, { id: 'zhiren', count: 2 }]] },
        { type: 'normal', waves: [[{ id: 'zhuying', count: 2 }, { id: 'nitong', count: 1 }], [{ id: 'denglonggui', count: 2 }, { id: 'guque', count: 1 }]] },
        { type: 'boss',   waves: [[{ id: 'tidenglaolao', count: 1 }]] },
      ],
    },
    2: {
      nodes: [
        { type: 'normal', waves: [[{ id: 'shuihou', count: 3 }], [{ id: 'shuihou', count: 2 }, { id: 'guimianzhu', count: 1 }]] },
        { type: 'normal', waves: [[{ id: 'tengyao', count: 2 }, { id: 'guimianzhu', count: 2 }], [{ id: 'yexiao', count: 3 }]] },
        { type: 'elite',  waves: [[{ id: 'shiwei', count: 1 }], [{ id: 'shuihou', count: 2 }, { id: 'yexiao', count: 1 }]] },
        { type: 'normal', waves: [[{ id: 'xiujiabing', count: 2 }, { id: 'guimianzhu', count: 2 }], [{ id: 'yexiao', count: 2 }, { id: 'tengyao', count: 2 }]] },
        { type: 'boss',   waves: [[{ id: 'qiaoji', count: 1 }]] },
      ],
    },
    3: {
      nodes: [
        { type: 'normal', waves: [[{ id: 'xuefu', count: 3 }], [{ id: 'xuefu', count: 2 }, { id: 'huhuo', count: 1 }]] },
        { type: 'normal', waves: [[{ id: 'zhouou', count: 2 }, { id: 'shiguwu', count: 1 }], [{ id: 'huhuo', count: 3 }]] },
        { type: 'elite',  waves: [[{ id: 'tongjiashi', count: 1 }], [{ id: 'shiguwu', count: 2 }, { id: 'xuefu', count: 2 }]] },
        { type: 'normal', waves: [[{ id: 'wumianseng', count: 2 }, { id: 'huhuo', count: 2 }], [{ id: 'zhouou', count: 2 }, { id: 'xuefu', count: 2 }]] },
        { type: 'boss',   waves: [[{ id: 'huangquan', count: 1 }]] },
      ],
    },
  },
};
