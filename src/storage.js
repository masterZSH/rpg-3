// src/storage.js —— [B] 存档：localStorage 单键 + schema 逐级迁移 + 损坏隔离 + 节流 flush
// tech_baseline_v1.md §7.1–7.4
//
// 纯函数部分（createInitialSave / migrateSave / validateSave / fnv1a / computeChecksum /
// verifyChecksum / saveFromState / applySaveToState）零浏览器 API，可被 node --test 直接 import。
// 浏览器读写集中在 createStorage() 内，惰性访问 localStorage；支持注入 fake storage 做测试。
// 本作是 Roguelite：跨局只保留「元进度（道行）+ 设置 + RNG 状态」，
// 不存战斗瞬时状态（怪物位置/子弹/buff tick）——与 §7.1「战斗中断回到检查点」一致。
import { balance } from './core/tables.js';

export const SAVE_KEY = balance.save.key;                     // 'yxlu.save.v1'
export const CURRENT_V = balance.save.currentV;               // 3
export const MIN_FLUSH_INTERVAL_MS = balance.save.minFlushIntervalMs; // 5000
const BAK_KEY = SAVE_KEY + '.bak';

const DEFAULT_SETTINGS = { muted: false, quality: 'auto', showDamage: true };
const QUALITIES = ['auto', 'low', 'mid', 'high'];
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

// FNV-1a 32-bit（§7.3），只防意外损坏，不做防作弊
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// 规范化 JSON：固定键顺序，排除 savedAt / checksum 自身，保证 checksum 稳定可复现
function canonicalPart(s) {
  const m = s.meta || {};
  const st = s.settings || {};
  return JSON.stringify({
    v: s.v,
    seed: num(s.seed) >>> 0,
    meta: {
      daohangTotal: num(m.daohangTotal),
      clears: num(m.clears),
      firstClearDone: !!m.firstClearDone,
    },
    settings: {
      muted: !!st.muted,
      quality: QUALITIES.indexOf(st.quality) >= 0 ? st.quality : 'auto',
      showDamage: !!st.showDamage,
    },
  });
}

export const computeChecksum = (s) => fnv1a(canonicalPart(s));
export const verifyChecksum = (s) =>
  !!s && Number.isInteger(s.checksum) && s.checksum === computeChecksum(s);

export function createInitialSave(seed) {
  const s = {
    v: CURRENT_V,
    savedAt: 0,
    seed: (num(seed) >>> 0),
    meta: { daohangTotal: 0, clears: 0, firstClearDone: false },
    settings: Object.assign({}, DEFAULT_SETTINGS),
    checksum: 0,
  };
  s.checksum = computeChecksum(s);
  return s;
}

// 逐级迁移，不跳级（§7.2）。每个迁移补默认值、不改语义；增改字段一律升版本。
//   v1: { v:1, daohang }                      —— 最早：单个道行数字
//   v2: { v:2, daohangTotal, clears, ... }   —— 加通关数
//   v3: { v:3, seed, meta{}, settings{}, checksum } —— 当前：元进度 + 设置 + 校验
export const migrations = {
  1: (s) => ({
    v: 2,
    seed: num(s.seed),
    daohangTotal: num(s.daohang !== undefined ? s.daohang : s.daohangTotal),
    clears: num(s.clears),
    firstClearDone: !!s.firstClearDone,
    settings: Object.assign({}, DEFAULT_SETTINGS, s.settings || {}),
  }),
  2: (s) => ({
    v: 3,
    savedAt: num(s.savedAt),
    seed: num(s.seed),
    meta: {
      daohangTotal: num(s.meta ? s.meta.daohangTotal : s.daohangTotal),
      clears: num(s.meta ? s.meta.clears : s.clears),
      firstClearDone: !!(s.meta ? s.meta.firstClearDone : s.firstClearDone),
    },
    settings: Object.assign({}, DEFAULT_SETTINGS, s.settings || {}),
    checksum: 0,
  }),
};

export function migrateSave(obj) {
  if (!obj || typeof obj !== 'object' || !Number.isInteger(obj.v) || obj.v < 1) {
    return { ok: false, reason: 'invalid', save: null, migrated: false, readOnly: false, fromV: obj && obj.v };
  }
  if (obj.v > CURRENT_V) {
    // 来自更新版本：不覆盖、不迁移，只读保留（§7.2）
    return { ok: true, reason: 'newer', save: obj, migrated: false, readOnly: true, fromV: obj.v };
  }
  let s = obj;
  const fromV = s.v;
  let migrated = false;
  let guard = 0;
  while (s.v < CURRENT_V && guard++ < 16) {
    const fn = migrations[s.v];
    if (!fn) {
      return { ok: false, reason: 'noMigration', save: null, migrated, readOnly: false, fromV };
    }
    s = fn(s);
    migrated = true;
  }
  if (s.v !== CURRENT_V) {
    return { ok: false, reason: 'incomplete', save: null, migrated, readOnly: false, fromV };
  }
  if (migrated) s.checksum = computeChecksum(s);   // 仅迁移过的档重建；当前版本档保留原 checksum 以便校验
  return { ok: true, reason: 'ok', save: s, migrated, readOnly: false, fromV };
}

// 结构校验（§7.3 第 2 层）：v 为当前整数、必填对象存在、数值有限非负、布尔/枚举合法
export function validateSave(s) {
  if (!s || typeof s !== 'object' || s.v !== CURRENT_V) return false;
  const m = s.meta;
  const st = s.settings;
  if (!m || typeof m !== 'object' || !st || typeof st !== 'object') return false;
  if (!Number.isFinite(m.daohangTotal) || m.daohangTotal < 0) return false;
  if (!Number.isFinite(m.clears) || m.clears < 0) return false;
  if (typeof m.firstClearDone !== 'boolean') return false;
  if (typeof st.muted !== 'boolean' || typeof st.showDamage !== 'boolean') return false;
  if (QUALITIES.indexOf(st.quality) < 0) return false;
  return true;
}

// 从运行时 state 生成存档（只读 state，不修改）
export function saveFromState(state) {
  const m = state.meta || {};
  const s = {
    v: CURRENT_V,
    savedAt: 0,
    seed: (num(state.rng) >>> 0),        // 存 RNG 状态，支持确定性续跑/回放（§7.1）
    meta: {
      daohangTotal: num(m.daohangTotal),
      clears: num(m.clears),
      firstClearDone: !!m.firstClearDone,
    },
    settings: Object.assign({}, DEFAULT_SETTINGS, m.settings || {}),
    checksum: 0,
  };
  s.checksum = computeChecksum(s);
  return s;
}

// 把存档元进度注入新 state（初始化阶段唯一写 state 的桥接点；core 纯逻辑只读 meta）
export function applySaveToState(state, save) {
  if (!save) return;
  if (save.meta) {
    state.meta.daohangTotal = num(save.meta.daohangTotal);
    state.meta.clears = num(save.meta.clears);
    state.meta.firstClearDone = !!save.meta.firstClearDone;
  }
  if (save.settings) Object.assign(state.meta.settings, save.settings);
}

// ───────────────────────── 浏览器 IO 层 ─────────────────────────
// 惰性访问 localStorage；不可用时降级为内存存档 + 提示（§7.3 第 3 层）。
export function createStorage(injected) {
  let ls = null;
  let probed = false;
  let memory = null;
  let degraded = false;
  let dirty = false;
  let lastFlushMs = 0;
  let notice = '';
  let corruptTag = 0;
  let readOnly = false;   // 来自更新版本的档：只读，禁止写回覆盖

  const backend = () => {
    if (injected) return injected;
    if (!probed) {
      probed = true;
      try { ls = (typeof localStorage !== 'undefined') ? localStorage : null; }
      catch { ls = null; }
    }
    return ls || null;
  };

  function readRaw(key) {
    const b = backend();
    if (!b) return null;
    try { return b.getItem(key); } catch { return null; }
  }

  function writeRaw(key, val) {
    const b = backend();
    if (!b) { degraded = true; return false; }
    try { b.setItem(key, val); return true; }
    catch {
      degraded = true;
      notice = '当前环境无法保存进度（已降级为内存存档）';
      return false;
    }
  }

  // 损坏兜底：不静默清空 → 原文转存 .corrupt.<tag>，优先尝试 .bak，都失败才开新档
  function recoverCorrupt(raw) {
    readOnly = false;
    let tag = 0;
    try { tag = Date.now(); } catch { tag = ++corruptTag; }
    if (raw != null) writeRaw(SAVE_KEY + '.corrupt.' + tag, String(raw));
    const bak = readRaw(BAK_KEY);
    if (bak) {
      let obj = null;
      try { obj = JSON.parse(bak); } catch { obj = null; }
      if (obj) {
        const res = migrateSave(obj);
        if (res.ok && validateSave(res.save)) {
          notice = '存档损坏，已从备份恢复';
          return { save: res.save, notice, readOnly: res.readOnly, fresh: false, recovered: true };
        }
      }
    }
    notice = '存档损坏，已重置';
    return { save: createInitialSave(0), notice, readOnly: false, fresh: true, recovered: false };
  }

  function load() {
    readOnly = false;
    let raw = readRaw(SAVE_KEY);
    if (raw == null) raw = memory;
    if (!raw) {
      return { save: createInitialSave(0), notice: '', readOnly: false, fresh: true, recovered: false };
    }
    let obj = null;
    try { obj = JSON.parse(raw); }
    catch { return recoverCorrupt(raw); }
    const res = migrateSave(obj);
    if (!res.ok) return recoverCorrupt(raw);
    // 已是当前版本且未被迁移过 → 校验 checksum（§7.3 第 3 层）
    if (!res.readOnly && !res.migrated && !verifyChecksum(res.save)) {
      return recoverCorrupt(raw);
    }
    if (!res.readOnly && !validateSave(res.save)) return recoverCorrupt(raw);
    readOnly = res.readOnly;
    notice = res.readOnly
      ? '存档来自更新版本，已只读保留（不会覆盖）'
      : (res.migrated ? '存档已升级到最新版本' : '');
    return { save: res.save, notice, readOnly: res.readOnly, fresh: false, recovered: false };
  }

  function markDirty() { dirty = true; }

  // force=true 用于 visibilitychange hidden / pagehide：即使战斗中也要同步 flush 一次（§7.4）
  function flush(state, force, nowMs) {
    if (readOnly) return false;                           // 更新版本档：不覆盖
    const inBattle = state.phase === 'battle';
    if (inBattle && !force) return false;                 // 战斗中不写
    let now;
    if (nowMs !== undefined) now = nowMs;
    else { try { now = Date.now(); } catch { now = lastFlushMs + MIN_FLUSH_INTERVAL_MS; } }
    if (!force && !dirty) return false;
    if (!force && now - lastFlushMs < MIN_FLUSH_INTERVAL_MS) return false;
    const save = saveFromState(state);
    save.savedAt = now;                                   // savedAt 不参与 checksum
    const json = JSON.stringify(save);
    const prev = readRaw(SAVE_KEY);
    if (prev) writeRaw(BAK_KEY, prev);                    // 写前把原档备份到 .bak
    const ok = writeRaw(SAVE_KEY, json);
    memory = json;                                       // 内存始终留一份兜底
    if (!ok) degraded = true;
    lastFlushMs = now;
    dirty = false;
    return ok;                                           // false = 持久层写入失败（已降级内存）
  }

  return {
    load,
    markDirty,
    flush,
    getNotice: () => notice,
    clearNotice: () => { notice = ''; },
    isDegraded: () => degraded,
  };
}
