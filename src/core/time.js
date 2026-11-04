// src/core/time.js —— tick ↔ 秒换算（tech §8.2 单位约定）
// 所有时间量以整数 tick 计；秒值只作展示/换算，绝不作为逻辑计时的存储。
import { balance, TICK_HZ } from './tables.js';

export const ticksToSeconds = (t) => t / balance.tickHz;
export const secondsToTicks = (s) => Math.round(s * balance.tickHz);
export const perSecondToPerTick = (v) => v / balance.tickHz;
export const pxPerSecondToPerTick = (v) => v / balance.tickHz;

export { TICK_HZ };
