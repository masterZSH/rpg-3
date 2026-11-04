// src/core/state.js —— state 形状定义、createInitialState、事件队列、对象池
// 纯逻辑：零 DOM / 零 Canvas / 零浏览器 API / 零墙钟 / 零 Math.random。
// step() 原地更新 state 并返回同一引用（tech §3.1），禁止每 tick 深拷贝。
import { seedRng } from './rng.js';

// 事件类型（渲染层 / 音频层消费，不参与结算）
export const EV = {
  DAMAGE: 'damage',           // 造成伤害 {x,y,value,crit,targetId,kind}
  HEAL: 'heal',
  SHIELD: 'shield',
  DEATH: 'death',             // {x,y,targetId,tier}
  SKILL: 'skill',             // {x,y,name,slot,color}
  DODGE: 'dodge',
  DODGE_SUCCESS: 'dodgeSuccess',
  MECH_HIT: 'mechHit',
  MECH_MISS: 'mechMiss',
  BOSS_WARN: 'bossWarn',
  LEVEL_UP: 'levelUp',
  LOOT: 'loot',
  POTION: 'potion',
  NOT_READY: 'notReady',
  NODE_CLEAR: 'nodeClear',
  BATTLE_WIN: 'battleWin',
  BATTLE_LOSE: 'battleLose',
  KILL_COMBO: 'killCombo',
  REPLACE: 'replace',
};

// 事件对象固定字段，避免字段残留与隐藏类抖动
const EKEYS = ['x', 'y', 'value', 'crit', 'targetId', 'sourceId', 'name', 'color', 'slot',
  'itemId', 'level', 'kind', 'tier', 'extra'];

// 从对象池取一个 inactive 对象复用，没有才新建（就地增长，不用 splice）
export function acquire(pool) {
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].active) {
      pool[i].active = true;
      return pool[i];
    }
  }
  const o = { active: true };
  pool.push(o);
  return o;
}

export function countActive(pool) {
  let n = 0;
  for (let i = 0; i < pool.length; i++) if (pool[i].active) n++;
  return n;
}

export function releaseAll(pool) {
  for (let i = 0; i < pool.length; i++) pool[i].active = false;
}

export function emit(state, type, data) {
  const e = acquire(state.eventPool);
  e.type = type;
  for (let i = 0; i < EKEYS.length; i++) e[EKEYS[i]] = undefined;
  if (data) {
    for (const k in data) e[k] = data[k];
  }
  state.events.push(e);
  return e;
}

// 渲染层每帧 drain 后调用：把事件对象标记回池并清空队列（不新建数组）
export function clearEvents(state) {
  const arr = state.events;
  for (let i = 0; i < arr.length; i++) arr[i].active = false;
  arr.length = 0;
}

export function createInitialState(seed) {
  return {
    phase: 'menu',           // menu | battle | reward | death | victory
    paused: false,
    rng: seedRng(seed),
    tick: 0,
    totalTicks: 0,

    // 元进度（由 src/storage.js 注入；纯逻辑只读）
    meta: {
      daohangTotal: 0,
      clears: 0,
      firstClearDone: false,
      settings: { muted: false, quality: 'auto', showDamage: true },
    },

    player: null,

    // 对象池：数组即遍历表，元素带 active 标记；不 splice
    enemies: [],
    projectiles: [],
    hazards: [],             // telegraph（预警） / zone（持续区） / death（死亡爆燃预警）
    eventPool: [],
    events: [],

    // 关卡进度
    chapter: 1,
    node: 1,
    wave: 0,
    waveTimer: 0,
    nodeType: 'normal',

    // 局内统计
    kills: 0,
    daohangEarned: 0,
    runBuffs: [],
    killCombo: 0,
    killComboTimer: 0,

    // 交互暂存
    rewards: null,           // 三选一选项数组
    lootQueue: [],           // 待「替换/保留」的装备实例队列（节点掉落 + 三选一装备）
    pendingLoot: null,       // 当前展示的替换对比项（= lootQueue[0] 的镜像，供 UI 只读）
    skillSlotChoice: null,   // 技能栏已满时待玩家选「替换哪一格」 { skillId }
    teachShown: false,       // Boss1 首次机制教学横幅
    bossBanner: null,        // 当前机制横幅 {name, remaining, total, color}
    shake: 0,                // 屏幕震动剩余 tick（渲染只读）
    battleResult: null,
    victory: false,
  };
}
