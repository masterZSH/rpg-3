// tests/storage.test.js —— 存档 schema 逐级迁移 / 损坏兜底 / 只读保留 / 节流 flush
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fnv1a, createInitialSave, computeChecksum, verifyChecksum, validateSave,
  migrateSave, saveFromState, applySaveToState, createStorage, SAVE_KEY, CURRENT_V,
} from '../src/storage.js';
import { makeState, fakeLocalStorage } from './helpers.js';

const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `期望 ${b}，实际 ${a}`);

test('fnv1a：空串 = 0x811c9dc5（FNV offset basis，抄自算法定义）', () => {
  assert.equal(fnv1a(''), 0x811c9dc5);
  assert.equal(fnv1a('a'), fnv1a('a'));
  assert.notEqual(fnv1a('a'), fnv1a('b'));
});

test('createInitialSave：v=3、结构合法、checksum 自洽', () => {
  const s = createInitialSave(12345);
  assert.equal(s.v, CURRENT_V);
  assert.equal(s.v, 3);                 // tech §7.1 CURRENT_V = 3
  assert.equal(s.seed, 12345);
  assert.equal(s.meta.daohangTotal, 0);
  assert.equal(s.meta.clears, 0);
  assert.equal(s.meta.firstClearDone, false);
  assert.equal(s.settings.muted, false);
  assert.equal(s.settings.quality, 'auto');
  assert.equal(s.settings.showDamage, true);
  assert.equal(validateSave(s), true);
  assert.equal(verifyChecksum(s), true);
});

test('§7.2 迁移 v1 → v3 逐级不跳级，道行值保留', () => {
  const v1 = { v: 1, daohang: 480 };
  const r = migrateSave(v1);
  assert.equal(r.ok, true);
  assert.equal(r.migrated, true);
  assert.equal(r.fromV, 1);
  assert.equal(r.save.v, 3);
  assert.equal(r.save.meta.daohangTotal, 480);   // v1 的 daohang 平移到 meta.daohangTotal
  assert.equal(r.save.meta.clears, 0);
  assert.equal(r.save.meta.firstClearDone, false);
  assert.equal(r.save.settings.quality, 'auto');
  assert.equal(validateSave(r.save), true);
  assert.equal(verifyChecksum(r.save), true);
});

test('§7.2 迁移 v2 → v3：补 meta/settings，不清既有语义', () => {
  const v2 = {
    v: 2, daohangTotal: 260, clears: 3, firstClearDone: true, seed: 77,
    settings: { muted: true, quality: 'low', showDamage: false },
  };
  const r = migrateSave(v2);
  assert.equal(r.ok, true);
  assert.equal(r.migrated, true);
  assert.equal(r.fromV, 2);
  assert.equal(r.save.v, 3);
  assert.equal(r.save.meta.daohangTotal, 260);
  assert.equal(r.save.meta.clears, 3);
  assert.equal(r.save.meta.firstClearDone, true);
  assert.equal(r.save.seed, 77);
  assert.equal(r.save.settings.muted, true);
  assert.equal(r.save.settings.quality, 'low');
  assert.equal(r.save.settings.showDamage, false);
  assert.equal(verifyChecksum(r.save), true);
});

test('已是当前版本：不迁移、保留原 checksum', () => {
  const s = createInitialSave(9);
  s.meta.daohangTotal = 1502;
  s.checksum = computeChecksum(s);        // 修正数据后重算
  const before = s.checksum;
  const r = migrateSave(s);
  assert.equal(r.ok, true);
  assert.equal(r.migrated, false);
  assert.equal(r.save.meta.daohangTotal, 1502);
  assert.equal(r.save.checksum, before);  // 未迁移不重算 checksum
  assert.equal(verifyChecksum(r.save), true);
});

test('§7.2 s.v > CURRENT_V：不覆盖、不迁移、只读保留', () => {
  const future = {
    v: 4, savedAt: 1, seed: 1,
    meta: { daohangTotal: 9999, clears: 99, firstClearDone: true },
    settings: { muted: false, quality: 'high', showDamage: true },
    checksum: 1,
  };
  const r = migrateSave(future);
  assert.equal(r.ok, true);
  assert.equal(r.readOnly, true);
  assert.equal(r.migrated, false);
  assert.equal(r.save, future);           // 原对象原样返回
  assert.equal(r.save.v, 4);
});

test('非法输入：ok=false', () => {
  assert.equal(migrateSave(null).ok, false);
  assert.equal(migrateSave(undefined).ok, false);
  assert.equal(migrateSave({}).ok, false);
  assert.equal(migrateSave('string').ok, false);
  assert.equal(migrateSave({ v: '3' }).ok, false);
  assert.equal(migrateSave({ v: 0 }).ok, false);
  assert.equal(migrateSave({ v: -1 }).ok, false);
});

test('§7.3 checksum 篡改检测', () => {
  const s = createInitialSave(5);
  s.meta.daohangTotal = 99999;           // 改数据不重算 checksum
  assert.equal(verifyChecksum(s), false);
  s.meta.daohangTotal = 0;
  s.meta.clears = 1;
  assert.equal(verifyChecksum(s), false);
  // 重算后恢复
  s.checksum = computeChecksum(s);
  assert.equal(verifyChecksum(s), true);
});

test('§7.3 validateSave 结构校验拒绝非法档', () => {
  assert.equal(validateSave(null), false);
  assert.equal(validateSave({}), false);
  assert.equal(validateSave({ v: 2 }), false);
  const s = createInitialSave(1);
  const bad1 = createInitialSave(1); bad1.meta.daohangTotal = -1;
  assert.equal(validateSave(bad1), false);
  const bad2 = createInitialSave(1); bad2.meta.clears = Infinity;
  assert.equal(validateSave(bad2), false);
  const bad3 = createInitialSave(1); bad3.meta.clears = NaN;
  assert.equal(validateSave(bad3), false);
  const bad4 = createInitialSave(1); bad4.settings.quality = 'ultra';
  assert.equal(validateSave(bad4), false);
  const bad5 = createInitialSave(1); bad5.meta = null;
  assert.equal(validateSave(bad5), false);
});

test('saveFromState / applySaveToState 往返', () => {
  const state = makeState(0x4242);
  state.meta.daohangTotal = 850;
  state.meta.clears = 2;
  state.meta.firstClearDone = true;
  state.meta.settings.muted = true;
  const save = saveFromState(state);
  assert.equal(save.meta.daohangTotal, 850);
  assert.equal(save.meta.clears, 2);
  assert.equal(save.meta.firstClearDone, true);
  assert.equal(save.settings.muted, true);
  assert.equal(verifyChecksum(save), true);

  const fresh = makeState(0x4242);
  applySaveToState(fresh, save);
  assert.equal(fresh.meta.daohangTotal, 850);
  assert.equal(fresh.meta.clears, 2);
  assert.equal(fresh.meta.firstClearDone, true);
  assert.equal(fresh.meta.settings.muted, true);
});

test('§7.4 flush：战斗中不写（force 除外）', () => {
  const ls = fakeLocalStorage();
  const storage = createStorage(ls);
  const s = makeState(0x11);
  s.phase = 'battle';
  s.meta.daohangTotal = 123;
  storage.markDirty();
  assert.equal(storage.flush(s, false, 1000), false);   // 战斗中不写
  assert.equal(ls._map.has(SAVE_KEY), false);
  assert.equal(storage.flush(s, true, 1000), true);     // hidden/pagehide 强制写
  assert.equal(ls._map.has(SAVE_KEY), true);
});

test('§7.4 flush：5s 节流（事件驱动 + 最低写入间隔）', () => {
  const ls = fakeLocalStorage();
  const storage = createStorage(ls);
  const s = makeState(0x22);
  s.phase = 'menu';
  storage.markDirty();
  assert.equal(storage.flush(s, false, 10000), true);
  storage.markDirty();
  assert.equal(storage.flush(s, false, 11000), false);  // 距上次 1000ms < 5000ms
  assert.equal(storage.flush(s, false, 14999), false);  // 4999ms 仍不足
  assert.equal(storage.flush(s, false, 15001), true);   // 5001ms 可写
  assert.equal(storage.flush(s, false, 60000), false);  // 无脏标记不写
});

test('§7.4 flush 前把原档备份到 .bak', () => {
  const ls = fakeLocalStorage();
  const storage = createStorage(ls);
  const s = makeState(0x33);
  s.meta.daohangTotal = 100;
  storage.markDirty();
  storage.flush(s, true, 1000);
  s.meta.daohangTotal = 200;
  storage.markDirty();
  storage.flush(s, true, 2000);
  const bak = JSON.parse(ls._map.get(SAVE_KEY + '.bak'));
  assert.equal(bak.meta.daohangTotal, 100);             // 备份的是前一个版本
  const cur = JSON.parse(ls._map.get(SAVE_KEY));
  assert.equal(cur.meta.daohangTotal, 200);
});

test('load：损坏 JSON → 不静默清空，原文转存 .corrupt.*，重置为新档', () => {
  const ls = fakeLocalStorage();
  ls.setItem(SAVE_KEY, '{not valid json');
  const storage = createStorage(ls);
  const r = storage.load();
  assert.equal(r.save.v, 3);
  assert.equal(r.save.meta.daohangTotal, 0);
  assert.ok(storage.getNotice().includes('损坏'));
  const corruptKeys = [...ls._map.keys()].filter((k) => k.startsWith(SAVE_KEY + '.corrupt.'));
  assert.ok(corruptKeys.length >= 1, '原文应保留到 .corrupt.* 键');
  assert.equal(ls._map.get(corruptKeys[0]), '{not valid json');
});

test('load：checksum 不符 → 走损坏兜底', () => {
  const ls = fakeLocalStorage();
  const s = createInitialSave(1);
  s.meta.daohangTotal = 555;
  s.checksum = 1;                                        // 伪 checksum
  ls.setItem(SAVE_KEY, JSON.stringify(s));
  const storage = createStorage(ls);
  const r = storage.load();
  assert.ok(storage.getNotice().includes('损坏'));
  assert.ok(!r.recovered || r.save.meta.daohangTotal !== 555);
});

test('load：来自更新版本 → 只读，flush 拒绝写回', () => {
  const ls = fakeLocalStorage();
  ls.setItem(SAVE_KEY, JSON.stringify({
    v: 4, savedAt: 1, seed: 1,
    meta: { daohangTotal: 9999, clears: 1, firstClearDone: false },
    settings: { muted: false, quality: 'high', showDamage: true },
    checksum: 12345,
  }));
  const storage = createStorage(ls);
  const r = storage.load();
  assert.equal(r.readOnly, true);
  assert.equal(r.save.v, 4);
  assert.ok(storage.getNotice().includes('更新版本'));
  const s = makeState(0x55);
  storage.markDirty();
  assert.equal(storage.flush(s, true, 99999), false);    // 只读档不覆盖
  assert.equal(JSON.parse(ls._map.get(SAVE_KEY)).v, 4);  // 原档原样
});

test('load：正常往返（写入 → 读回 → meta 一致）', () => {
  const ls = fakeLocalStorage();
  const st1 = createStorage(ls);
  const s = makeState(0x66);
  applySaveToState(s, st1.load().save);
  s.meta.daohangTotal = 1700;
  st1.markDirty();
  st1.flush(s, true, 1000);
  const st2 = createStorage(ls);
  const r2 = st2.load();
  assert.equal(r2.fresh, false);
  assert.equal(r2.save.meta.daohangTotal, 1700);
  assert.equal(r2.save.v, 3);
});

test('§7.3 localStorage 不可用 / QuotaExceeded → 降级内存存档不崩溃', () => {
  const broken = {
    getItem: () => { throw new Error('unavailable'); },
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {},
  };
  const storage = createStorage(broken);
  const s = makeState(0x77);
  storage.markDirty();
  assert.equal(storage.flush(s, true, 1000), false);    // 写失败
  assert.equal(storage.isDegraded(), true);
  assert.ok(storage.getNotice().includes('无法保存'));
  // 不崩溃：load 仍返回可用的新档
  const r = storage.load();
  assert.equal(r.save.v, 3);
});
