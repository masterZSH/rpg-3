// src/core/tables.js —— core 层唯一读表入口（tech §4.2 / §8.3）
// core 下其它文件只 import 本文件，不直接 import src/data/* 具体文件。
// 本文件保持纯逻辑：零 DOM / 零 Canvas / 零浏览器 API / 零墙钟 / 零 Math.random。

import classes from '../data/classes.js';
import skills from '../data/skills.js';
import equipment from '../data/equipment.js';
import monsters from '../data/monsters.js';
import drops from '../data/drops.js';
import balance, { TICK_HZ, theme } from '../data/balance.js';

export { balance, theme, TICK_HZ };

export const getClass = (id) => classes[id];
export const getSkill = (id) => skills[id];
export const getEquipment = (id) => equipment[id];
export const getMonster = (id) => monsters[id];
export const getDropTable = () => drops;

export const allClassIds = () => Object.keys(classes);
export const allSkillIds = () => Object.keys(skills);
export const allEquipmentIds = () => Object.keys(equipment);
export const allMonsterIds = () => Object.keys(monsters);
export const allClasses = () => classes;
export const allSkills = () => skills;
export const allEquipment = () => equipment;
export const allMonsters = () => monsters;

export const skillsOfClass = (classId) =>
  Object.keys(skills).filter((id) => skills[id].classId === classId);

export const equipmentOfSlotAndRarity = (slot, rarity, chapter) =>
  Object.keys(equipment).filter((id) => {
    const e = equipment[id];
    return e.slot === slot && e.rarity === rarity && e.chapters.indexOf(chapter) >= 0;
  });

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const finiteNonNeg = (v) => finite(v) && v >= 0;

// 启动校验：id 唯一（对象键天然唯一）、外键完整、字段类型正确、数值有限且非负。
// 返回 { ok, errors }；dev 抛错、prod 在 #fatal 上报。
export function validateTables() {
  const errors = [];
  const push = (msg) => errors.push(msg);
  const rarities = balance.rarities;
  const slots = balance.slots;

  // 职业
  for (const id of Object.keys(classes)) {
    const c = classes[id];
    if (c.id !== id) push(`classes: ${id}.id 与键不一致`);
    for (const k of ['hp', 'atk', 'def', 'crit', 'critDmg', 'haste', 'speed', 'range']) {
      if (!finiteNonNeg(c.baseStats[k])) push(`classes: ${id}.baseStats.${k} 非法`);
    }
    if (!finiteNonNeg(c.unlockAt)) push(`classes: ${id}.unlockAt 非法`);
    if (!c.attack || !finiteNonNeg(c.attack.intervalTicks) || !finiteNonNeg(c.attack.coef)) {
      push(`classes: ${id}.attack 非法`);
    }
    for (const sid of c.startSkillIds) {
      if (!skills[sid]) push(`classes: ${id}.startSkillIds 引用了不存在的技能 ${sid}`);
      else if (skills[sid].classId !== id) push(`classes: ${id}.startSkillIds 引用了其它职业技能 ${sid}`);
    }
    for (const slot of slots) {
      const eid = c.startEquipment[slot];
      if (eid && !equipment[eid]) push(`classes: ${id}.startEquipment.${slot} 引用了不存在的装备 ${eid}`);
    }
  }

  // 技能
  for (const id of Object.keys(skills)) {
    const s = skills[id];
    if (s.id !== id) push(`skills: ${id}.id 与键不一致`);
    if (!classes[s.classId]) push(`skills: ${id}.classId 引用了不存在的职业 ${s.classId}`);
    if (!finiteNonNeg(s.cdTicks)) push(`skills: ${id}.cdTicks 非法`);
    if (!finiteNonNeg(s.cost)) push(`skills: ${id}.cost 非法`);
    if (!finiteNonNeg(s.castTicks)) push(`skills: ${id}.castTicks 非法`);
    if (!Array.isArray(s.levels) || s.levels.length !== 3) {
      push(`skills: ${id}.levels 长度必须为 3（Lv1/Lv2/Lv3）`);
    } else {
      s.levels.forEach((lv, i) => {
        if (!finiteNonNeg(lv.coef || 0) || !finiteNonNeg(lv.hits)) {
          push(`skills: ${id}.levels[${i}] coef/hits 非法`);
        }
      });
    }
  }

  // 装备
  for (const id of Object.keys(equipment)) {
    const e = equipment[id];
    if (e.id !== id) push(`equipment: ${id}.id 与键不一致`);
    if (slots.indexOf(e.slot) < 0) push(`equipment: ${id}.slot 非法`);
    if (rarities.indexOf(e.rarity) < 0) push(`equipment: ${id}.rarity 非法`);
    if (!finiteNonNeg(e.weight)) push(`equipment: ${id}.weight 非法`);
    if (!Array.isArray(e.chapters) || e.chapters.length === 0) push(`equipment: ${id}.chapters 非法`);
    if (e.weightByChapter) {
      for (const ch of Object.keys(e.weightByChapter)) {
        if (!finiteNonNeg(e.weightByChapter[ch])) push(`equipment: ${id}.weightByChapter[${ch}] 非法`);
      }
    }
    for (const k of Object.keys(e.stats)) {
      if (!finiteNonNeg(e.stats[k])) push(`equipment: ${id}.stats.${k} 非法`);
    }
  }

  // 怪物
  for (const id of Object.keys(monsters)) {
    const m = monsters[id];
    if (m.id !== id) push(`monsters: ${id}.id 与键不一致`);
    for (const k of ['hp', 'atk', 'def', 'intervalTicks', 'speed']) {
      if (!finiteNonNeg(m[k])) push(`monsters: ${id}.${k} 非法`);
    }
    if (!finiteNonNeg(m.rangePx)) push(`monsters: ${id}.rangePx 非法`);
    if (m.bossMechanics) {
      for (const mech of m.bossMechanics) {
        if (finiteNonNeg(mech.cdTicks) === false) push(`monsters: ${id} 机制 cdTicks 非法`);
        if (mech.summonId && !monsters[mech.summonId]) push(`monsters: ${id} 召唤引用不存在 ${mech.summonId}`);
      }
    }
  }

  // 关卡组合外键
  for (const ch of Object.keys(drops.chapters)) {
    const chapter = drops.chapters[ch];
    if (!Array.isArray(chapter.nodes) || chapter.nodes.length !== balance.nodesPerChapter) {
      push(`drops: 章 ${ch} 节点数应为 ${balance.nodesPerChapter}`);
    }
    for (const node of chapter.nodes) {
      for (const wave of node.waves) {
        for (const entry of wave) {
          if (!monsters[entry.id]) push(`drops: 章 ${ch} 引用了不存在的怪物 ${entry.id}`);
          if (!finiteNonNeg(entry.count)) push(`drops: 章 ${ch} 怪物数量非法`);
        }
      }
    }
  }

  // 经验 / 权重表
  for (const key of Object.keys(drops.rewardWeights)) {
    if (!finiteNonNeg(drops.rewardWeights[key])) push(`drops: rewardWeights.${key} 非法`);
  }
  for (const key of Object.keys(drops.bossRewardWeights)) {
    if (!finiteNonNeg(drops.bossRewardWeights[key])) push(`drops: bossRewardWeights.${key} 非法`);
  }
  for (const ch of Object.keys(drops.qualityWeights)) {
    for (const r of rarities) {
      if (!finiteNonNeg(drops.qualityWeights[ch][r])) push(`drops: qualityWeights[${ch}].${r} 非法`);
    }
  }
  for (const slot of slots) {
    if (!finiteNonNeg(drops.slotWeights[slot])) push(`drops: slotWeights.${slot} 非法`);
  }

  // 道行解锁外键
  for (const u of balance.daohang.unlocks) {
    if (!finiteNonNeg(u.at)) push(`balance: unlock.at 非法`);
    if (u.type === 'class' && !classes[u.value]) push(`balance: 解锁职业引用不存在 ${u.value}`);
    if ((u.type === 'startWeapon' || u.type === 'startArmor' || u.type === 'startAccessory')
        && !equipment[u.value]) push(`balance: 解锁装备引用不存在 ${u.value}`);
  }

  return { ok: errors.length === 0, errors };
}

// 冻结所有表，防止运行时写回（tech §8.3）
export function freezeTables() {
  for (const table of [classes, skills, equipment, monsters, drops, balance]) {
    Object.freeze(table);
  }
}
