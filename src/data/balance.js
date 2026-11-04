// src/data/balance.js
// design_v1.md 的全局常量 / 公式系数 / 曲线 / UI 矩形的机器可读镜像。
// 单位约定：时间一律整数 tick（30Hz），距离/速度一律 CSS 像素，概率用 0~1 小数或整数权重。
// 本文件是 data 层，允许数值字面量；core 层禁止硬编码，只能经 core/tables.js 读这里。

export const TICK_HZ = 30;

export const balance = {
  tickHz: TICK_HZ,

  // 种子 PRNG（mulberry32）算法常数（结构常数，集中在表内避免 core 硬编码）
  rng: {
    defaultSeed: 0x9e3779b9,
    increment: 0x6D2B79F5,
    divisor: 4294967296,
  },

  // §5.1 伤害结算公式
  formula: {
    mitiBase: 100,          // MITI = 100 / (100 + EFF_DEF)
    amplifyFloor: 0.2,      // AMPLIFY = max(0.2, 1 + DMG_AMP - DMG_REDUCE)
    varianceBase: 0.95,     // VARIANCE = 0.95 + 0.10 * rng()
    varianceSpan: 0.10,
    critCap: 0.75,          // 暴击率硬封 75%
    critDmgBase: 1.5,       // 基准暴伤 150%
    minDamage: 1,           // TARGET.HP -= max(1, round(RAW))
    hasteBase: 100,         // 攻速基准
    intervalMinTicks: 6,    // INTERVAL_TICKS = max(6, ...)
  },

  // §3.5 闪避（本作核心操作）
  dodge: {
    totalTicks: 17,
    invulnTicks: 14,        // 第 0–13 tick 无敌
    moveTicks: 10,          // 第 0–9 tick 位移
    distancePx: 110,
    cdTicks: 36,
    staminaCost: 30,
    staminaMax: 100,
    staminaRegenPerTick: 0.5,      // 15/s
    staminaRegenDelayTicks: 12,    // 闪避结束后 12 tick 开始回复
  },

  // §3.6 输入缓冲 / 连点 / 误触
  input: {
    bufferWindowTicks: 9,          // CD 剩余 ≤ 9 tick 才进缓冲
    bufferMax: 3,                  // 输入队列上限（每槽只保留最后 1 个指令）
    doubleSkillWindowTicks: 5,
    pointerSlopPx: 12,
    shakeTicks: 4,                 // 0.12s ≈ 4 tick
  },

  // §3.3 / §3.4 / §7.1 战斗通用
  combat: {
    approachFactor: 0.9,           // 停在 攻击距离 × 0.9
    attackWindupTicks: 6,
    castRecoveryTicks: 6,
    cdNumberShowTicks: 45,         // 剩余 CD ≥ 45 tick 才显示数字
    hurtThresholdPct: 0.12,        // 单次伤害 ≥ 12% 最大生命进入 hurt
    hurtTicks: 6,
    dodgeRefundPct: 0.5,           // cast 被 dodge 打断返还 50%
    hurtRefundPct: 1.0,            // cast 被 hurt 打断返还 100%
    potionHealPct: 0.30,
    potionCdTicks: 300,
    potionBaseMax: 3,
  },

  // §4 / §5.2 资源再生
  resource: {
    outOfCombatTicks: 150,         // 力士脱战判定 5s
    comboDecayTicks: 240,          // 游侠 8s 未获得连击点开始衰减
    comboDecayPerTick: 1 / TICK_HZ,
    manaRegenPerTick: 9 / TICK_HZ, // 术士恒定 9/s
    rageDecayPerTick: 5 / TICK_HZ, // 力士脱战 -5/s
  },

  // §6.1 波次
  wave: {
    gapTicks: 36,                  // 波间隔 1.2s
    entryTicks: 60,                // 新波入场并接近约 2.0s
  },

  // §7.3 异常状态
  status: {
    burnTickPerHit: 30,            // 灼烧每满 30 tick 结算一次
  },

  // §8.1 / art §4 战场几何
  field: {
    width: 390,
    height: 844,
    canvasY: 96,
    canvasH: 500,
    activeTop: 120,
    activeBottom: 560,
    spawnY: 150,
    playerX: 195,
    playerY: 470,
    minX: 20,
    maxX: 370,
    bannerX: 45,
    bannerY: 100,
    bannerW: 300,
    bannerH: 32,
  },

  // §8.2 / §9 / tech §6 反馈与性能
  fx: {
    floaterLifeTicks: 18,
    floaterRisePx: 40,
    floaterMax: 12,
    floaterFontPx: 20,
    floaterCritFontPx: 28,
    floaterStrokePx: 3,
    floaterOverlapLiftPx: 22,
    enemyHpBarW: 60,
    enemyHpBarH: 5,
    playerStaminaBarW: 44,
    particleMax: 120,
    particleMaxLow: 40,
    entityMax: 60,
    entityMaxLow: 30,
    domMax: 150,
  },

  // 战斗/布局辅助常量（core 层零硬编码用；视觉计时与布局容差）
  aux: {
    spawnRowGap: 26,
    kiteTolerancePct: 0.08,
    hitFlashTicks: 3,
    critFlashTicks: 5,
    floaterOffsetY: 26,
    playerTargetUid: -1,
    enemyAttackCoef: 1,
    summonSpreadPx: 80,
    bossTeachTicks: 60,          // 教学横幅 2s
    killComboTicks: 30,          // 连斩显示 1s
    minCooldown: 1,
    noCrit: 0,
  },

  // tech §3 主循环
  loop: {
    stepMs: 1000 / TICK_HZ,
    maxFrameMs: 250,
    maxSteps: 5,
  },

  // tech §7 存档
  save: {
    key: 'yxlu.save.v1',
    currentV: 3,
    minFlushIntervalMs: 5000,
  },

  // §5.2 等级
  exp: {
    levelMax: 10,
    perLevel: [90, 210, 340, 500, 700, 920, 1180, 1320, 1500], // 本级所需经验
  },

  // §5.7 道行元进度
  daohang: {
    perKill: 3,
    perNode: 20,
    perBoss: 150,
    firstClearBonus: 500,
    unlocks: [
      { at: 120,  type: 'class',          value: 'shushi',       label: '职业：术士' },
      { at: 260,  type: 'class',          value: 'youxia',       label: '职业：游侠' },
      { at: 380,  type: 'potionMax',      value: 4,             label: '药瓶上限 3 → 4' },
      { at: 520,  type: 'startWeapon',    value: 'jinggangdao',  label: '起始武器替换为 灵·精钢刀' },
      { at: 680,  type: 'startHpPct',     value: 0.08,          label: '起始生命 +8%（三职业通用）' },
      { at: 850,  type: 'extraSkill',     value: 1,             label: '开局额外解锁 1 个本职业技能' },
      { at: 1030, type: 'startArmor',     value: 'suozijia',     label: '起始护甲替换为 灵·锁子甲' },
      { at: 1220, type: 'startSkillLv',   value: 2,             label: '开局的起始技能直接为 Lv2' },
      { at: 1450, type: 'startAccessory', value: 'yujue',        label: '起始饰品替换为 灵·玉珏' },
      { at: 1700, type: 'potionMax',      value: 5,             label: '药瓶上限 4 → 5' },
      { at: 1700, type: 'startHpPct',     value: 0.08,          label: '起始生命再 +8%（叠加为 +16%）' },
    ],
  },

  // §10.5 血线曲线口径：层间回复 15% 最大生命；每章开始 HP 与药瓶补满
  healBetweenNodesPct: 0.15,

  // §5.6 三选一「回血」满血时转为「最大生命 +5%（本局）」
  reward: { fullHealToHpPct: 0.05 },

  // 装备「一眼看出哪件更好」的综合评分权重（§5.5 替换对比用）
  equipScore: {
    atk: 1, def: 1, hp: 0.1, crit: 100, critDmg: 60, haste: 0.5,
    speedPct: 20, resourceMax: 0.2, resourceRegenPct: 20, cdReducePct: 100,
    dodgeCdReduceTicks: 1, passive: 8,
  },
  statLabels: {
    atk: '攻击', def: '防御', hp: '生命', crit: '暴击', critDmg: '暴伤', haste: '攻速',
    speedPct: '移速', resourceMax: '资源上限', resourceRegenPct: '资源回复',
    cdReducePct: '技能CD', dodgeCdReduceTicks: '闪避CD',
  },

  // §5.6 三选一「本局增益」四选一
  runBuffs: [
    { type: 'atkPct',   value: 0.06, label: '攻击 +6%' },
    { type: 'defPct',   value: 0.06, label: '防御 +6%' },
    { type: 'hpPct',    value: 0.08, label: '最大生命 +8%' },
    { type: 'regenPct', value: 0.15, label: '主资源回复 +15%' },
  ],

  // 关卡结构
  chapterCount: 3,
  nodesPerChapter: 5,
  chapterNames: ['荒村', '废寺', '灯市'],
  nodeLabels: ['N1', 'N2', 'N3', 'N4', 'N5'],

  // 品质 / 槽位
  rarities: ['fan', 'ling', 'bao', 'xian'],
  rarityNames: { fan: '凡', ling: '灵', bao: '宝', xian: '仙' },
  slots: ['weapon', 'armor', 'accessory'],
  slotNames: { weapon: '武器', armor: '护甲', accessory: '饰品' },

  // §8.1 竖屏 UI 精确矩形（390 坐标系）
  rects: {
    classIcon: { x: 12,  y: 18,  w: 44, h: 44 },
    hpBar:     { x: 64,  y: 16,  w: 186, h: 22 },
    resBar:    { x: 64,  y: 42,  w: 186, h: 16 },
    expBar:    { x: 64,  y: 62,  w: 186, h: 8 },
    status:    { x: 64,  y: 74,  w: 72,  h: 18 },
    progress:  { x: 262, y: 16,  w: 60,  h: 46 },
    pause:     { x: 334, y: 18,  w: 44,  h: 44 },
    canvas:    { x: 0,   y: 96,  w: 390, h: 500 },
    potion:    { x: 232, y: 574, w: 60,  h: 60 },
    dodge:     { x: 188, y: 648, w: 100, h: 100 },
    skillA:    { x: 298, y: 606, w: 84,  h: 84 },
    skillB:    { x: 290, y: 706, w: 92,  h: 92 },
    skillC:    { x: 194, y: 756, w: 76,  h: 76 },
    banner:    { x: 45,  y: 100, w: 300, h: 32 },
  },

  // §3.7 技能键 / 闪避 / 药瓶 的中心（与 §8.1 一致，供热区校验）
  hotKeys: {
    skillA: { x: 340, y: 648 },
    skillB: { x: 336, y: 752 },
    skillC: { x: 232, y: 794 },
    dodge:  { x: 238, y: 698 },
    potion: { x: 262, y: 604 },
    pause:  { x: 356, y: 40 },
  },
};

// 美术方向包 v1 的占位配色（零外链、纯本地）
export const theme = {
  ink0: '#0B0E14',
  ink1: '#12161F',
  ink2: '#1A1F2B',
  ink3: '#2A3140',
  paper: '#F5F0E4',
  paperDim: '#E8E3D7',
  vermilion: '#C8362B',
  gold: '#E8C46A',
  classColor: { lishi: '#E8734A', shushi: '#4FA8D8', youxia: '#6FBF73' },
  rarityColor: { fan: '#2A3140', ling: '#4FA8D8', bao: '#E8C46A', xian: '#C8362B' },
  warnRed: '#ff3b3b',
  warnOrange: '#ff9a2b',
  heal: '#7FD48A',
  playerHurt: '#FF6B5E',
  fontNum: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontCn: '"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif',
};

export default balance;
