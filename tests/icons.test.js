// tests/icons.test.js —— 图标系统全 key 覆盖（art_spec_v2 §5：emoji 退役）
import test from 'node:test';
import assert from 'node:assert/strict';
import { ICONS, icon, iconSvg } from '../src/ui/icons.js';
import classes from '../src/data/classes.js';
import skills from '../src/data/skills.js';
import equipment from '../src/data/equipment.js';

test('data 层引用的每个 icon key 必须存在（classes 3 / skills 18 / equipment 24 全覆盖）', () => {
  assert.equal(Object.keys(classes).length, 3);
  assert.equal(Object.keys(skills).length, 18);
  assert.equal(Object.keys(equipment).length, 24);
  for (const c of Object.values(classes)) assert.ok(ICONS[c.icon], `classes.${c.id} → ${c.icon}`);
  for (const s of Object.values(skills)) assert.ok(ICONS[s.icon], `skills.${s.id} → ${s.icon}`);
  for (const it of Object.values(equipment)) assert.ok(ICONS[it.icon], `equipment.${it.id} → ${it.icon}`);
  // 每个映射值必须是内联 svg（零外链：禁 href/src/url() 引用）
  for (const k of Object.keys(ICONS)) {
    assert.match(ICONS[k], /^<svg /, `ICONS.${k} 不是 svg`);
    assert.ok(!/href|url\(|src=/.test(ICONS[k]), `ICONS.${k} 含外链引用`);
  }
});

test('系统图标关键 key 存在（§5.5）', () => {
  for (const k of ['cls-lishi', 'cls-shushi', 'cls-youxia',
    'potion', 'dodge', 'warn', 'pause',
    'st-burn', 'st-stun', 'st-slow', 'st-shield']) {
    assert.ok(ICONS[k], k);
  }
  assert.ok(Object.keys(ICONS).length >= 38);
});

test('负向：不存在的 key 抛错', () => {
  assert.throws(() => iconSvg('sk-notexist'), /未知图标/);
  assert.throws(() => icon('eq-notexist'), /未知图标/);
  assert.throws(() => icon(''), /未知图标/);
});
