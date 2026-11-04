// tests/data.test.js —— 表引用完整性 / 条目数 / 关键数值与 design_v1.md 对账
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTables, allClassIds, allSkillIds, allEquipmentIds, allMonsterIds, getDropTable,
  getSkill, balance,
} from '../src/core/tables.js';

test('validateTables：id 一致 / 外键完整 / 字段合法', () => {
  const r = validateTables();
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('条目数对账（design §4 / §5.3 / §5.4 / §5.5 / §6.2）', () => {
  assert.equal(allClassIds().length, 3);            // 3 职业
  assert.equal(allSkillIds().length, 18);           // 18 技能（3 职业 × 6）
  assert.equal(allEquipmentIds().length, 24);       // 24 装备
  assert.equal(allMonsterIds().length, 21);         // 18 妖 + 3 Boss
  const chapters = getDropTable().chapters;
  assert.equal(Object.keys(chapters).length, 3);    // 3 章
  for (const ch of Object.keys(chapters)) {
    assert.equal(chapters[ch].nodes.length, balance.nodesPerChapter);   // 每章 5 节点
    for (const node of chapters[ch].nodes) {
      assert.ok(node.waves.length >= 1);
      assert.ok(['normal', 'elite', 'boss'].includes(node.type));
      for (const wave of node.waves) {
        for (const entry of wave) {
          assert.equal(typeof entry.id, 'string');
          assert.ok(entry.count >= 1);
        }
      }
    }
  }
});

test('三职业互异且技能归属正确', () => {
  const ids = allClassIds();
  assert.deepEqual(ids.sort(), ['lishi', 'shushi', 'youxia']);
  const byClass = {};
  for (const id of allSkillIds()) {
    const sk = getSkill(id);
    byClass[sk.classId] = (byClass[sk.classId] || 0) + 1;
  }
  assert.equal(byClass.lishi, 6);
  assert.equal(byClass.shushi, 6);
  assert.equal(byClass.youxia, 6);
});

test('闪避参数对账（design §3.5）', () => {
  const d = balance.dodge;
  assert.equal(d.totalTicks, 17);       // 17 tick 总时长
  assert.equal(d.invulnTicks, 14);      // 无敌 0–13 tick
  assert.equal(d.moveTicks, 10);        // 位移 0–9 tick
  assert.equal(d.distancePx, 110);      // 110 px
  assert.equal(d.cdTicks, 36);          // CD 36 tick
  assert.equal(d.staminaCost, 30);      // 消耗 30
  assert.equal(d.staminaMax, 100);
});

test('输入缓冲参数对账（design §3.6）', () => {
  const i = balance.input;
  assert.equal(i.bufferWindowTicks, 9);
  assert.equal(i.doubleSkillWindowTicks, 5);
  assert.equal(i.pointerSlopPx, 12);
  assert.equal(i.shakeTicks, 4);
});

test('经验曲线对账（design §5.6）', () => {
  const e = balance.exp;
  assert.equal(e.levelMax, 10);
  assert.deepEqual(e.perLevel, [90, 210, 340, 500, 700, 920, 1180, 1320, 1500]);
});

test('道行解锁表对账（design §5.7）', () => {
  const u = balance.daohang;
  assert.equal(u.perKill, 3);
  assert.equal(u.perNode, 20);
  assert.equal(u.perBoss, 150);
  assert.equal(u.firstClearBonus, 500);
  const ats = u.unlocks.map((x) => x.at);
  for (let i = 1; i < ats.length; i++) assert.ok(ats[i] >= ats[i - 1], '解锁道行应非降序');
  // §5.7 第 10 行：1700 同档并列两条（药瓶上限 + 起始生命）
  assert.equal(ats.filter((a) => a === 1700).length, 2);
  // 首两条：120 术士 / 260 游侠
  assert.equal(u.unlocks[0].at, 120);
  assert.equal(u.unlocks[0].value, 'shushi');
  assert.equal(u.unlocks[1].at, 260);
  assert.equal(u.unlocks[1].value, 'youxia');
});

test('UI 矩形热区对账（design §8.1）', () => {
  const r = balance.rects;
  const zones = ['potion', 'dodge', 'skillA', 'skillB', 'skillC', 'pause'];
  for (const z of zones) {
    assert.ok(r[z].w >= 44 && r[z].h >= 44, `${z} 热区应 ≥ 44×44`);
  }
  // 战场几何
  assert.equal(r.canvas.w, 390);
  assert.equal(r.canvas.h, 500);
  assert.equal(balance.field.activeTop, 120);
  assert.equal(balance.field.activeBottom, 560);
});
