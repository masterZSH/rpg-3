// src/main.js —— [B] 装配入口：把 core / data / render / ui / 桥接层串成可玩闭环。
// 职责：启动校验 → 读档 → 建各层 → 绑输入 → 主循环 → phase 驱动界面 → 切后台暂停 + 强制 flush。
// 本文件是唯一允许「写 state 的非 core 调用点」集中地（startBattle / applyReward / resolveLoot 等）。
import { validateTables } from './core/tables.js';
import { createInitialState, clearEvents } from './core/state.js';
import { step, startBattle, advanceNode, peekLoot } from './core/combat.js';
import { applyReward, resolveLoot, resolveSkillSlot, upgradeSkillAt, settleRun } from './core/progression.js';
import { createStorage, applySaveToState } from './storage.js';
import { createInput } from './input.js';
import { createLoop } from './loop.js';
import { createAudio } from './audio.js';
import { createPerf } from './perf.js';
import { createRenderer } from './render/canvas.js';
import { createParticles } from './render/particles.js';
import { createWorldRenderer } from './render/worldRenderer.js';
import { createHud } from './render/hud.js';
import { createScreens } from './ui/screens.js';
import { initOrientation } from './ui/orientation.js';

// ─────────── 启动校验（tech §4.2：失败不上线） ───────────
const tables = validateTables();
if (!tables.ok) {
  throw new Error('数值表校验失败：\n' + tables.errors.join('\n'));
}

initOrientation();

// ─────────── 存档 / state ───────────
const storage = createStorage();
const loaded = storage.load();
// 新档用墙钟播种（首次可玩性）；读档沿用存档 seed（确定性续跑，tech §7.1）
const seed = loaded.fresh ? (Date.now() >>> 0) : (loaded.save.seed >>> 0);
const state = createInitialState(seed);
applySaveToState(state, loaded.save);

const settings = state.meta.settings;

// ─────────── 各层 ───────────
const audio = createAudio(settings.muted);
const perf = createPerf(settings);
const renderer = createRenderer(document.getElementById('stage'));
const particles = createParticles(perf);
const world = createWorldRenderer(renderer, particles, perf, settings);
const hud = createHud();
const input = createInput();
const screens = createScreens();

let skipSkillPoints = false;   // 玩家主动跳过技能点面板（本节点不再追问）
let lastRenderAt = 0;

// ─────────── 存档落盘辅助 ───────────
function flushNow(force) {
  storage.markDirty();
  storage.flush(state, !!force);
}

// ─────────── 事件 → 视觉 / 听觉反馈（渲染帧 drain，tech §3.2） ───────────
function sfxFor(e) {
  switch (e.type) {
    case 'damage':
      if (e.crit) return 'crit';
      if (e.kind === 'player') return 'hurt';
      if (e.kind === 'burn') return null;
      return 'hit';
    case 'heal': return 'potion';
    case 'shield': return 'shield';
    case 'death': return 'kill';
    case 'skill': return 'skill';
    case 'dodge': return 'dodge';
    case 'dodgeSuccess':
    case 'mechMiss': return 'dodgeSuccess';
    case 'mechHit': return 'mechHit';
    case 'bossWarn': return 'bossWarn';
    case 'levelUp': return 'levelUp';
    case 'potion': return 'potion';
    case 'notReady': return 'notReady';
    case 'nodeClear': return 'nodeClear';
    case 'battleWin': return 'win';
    case 'battleLose': return 'lose';
    case 'loot':
    case 'replace': return 'loot';
    default: return null;
  }
}

function drainEvents() {
  const evs = state.events;
  if (evs.length === 0) return;
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    world.handleEvent(state, e);
    const sfx = sfxFor(e);
    if (sfx) audio.play(sfx);
  }
  clearEvents(state);
}

// ─────────── 屏幕流程驱动（phase = menu | battle | reward | death | victory） ───────────
// 节点结算链：节点掉落（替换对比）→ 技能栏满选槽 → 三选一 → 技能点 → 进入下一节点。
function driveScreens() {
  if (screens.isShown()) return;
  const p = state.player;

  if (state.phase === 'menu') {
    screens.showClassSelect(state, startRun);
    return;
  }
  if (state.phase === 'death' || state.phase === 'victory') {
    flushNow(true);      // 结算必落盘：道行 localStorage 保留（design §5.7）
    const r = state.battleResult || {};
    screens.showResult({
      won: !!r.won,
      daohang: r.daohang || 0,
      kills: r.kills || 0,
      chapter: r.chapter || state.chapter,
      node: r.node || state.node,
      totalDaohang: state.meta.daohangTotal,
      totalClears: state.meta.clears,
    }, backToMenu);
    return;
  }
  if (state.phase !== 'reward') return;

  // ① 待处理装备（节点掉落 + 三选一装备奖励，先进先出）
  if (state.lootQueue.length) {
    const item = peekLoot(state);
    state.pendingLoot = item;
    screens.showLootCompare(state, item, (replace) => {
      resolveLoot(state, replace);
      audio.play('loot');
      screens.hide();
      driveScreens();
    });
    return;
  }
  // ② 技能栏已满：选替换哪一格（-1 = 放弃）
  if (state.skillSlotChoice) {
    const skillId = state.skillSlotChoice.skillId;
    screens.showSkillSlotChoice(state, skillId, (slot) => {
      if (slot >= 0) resolveSkillSlot(state, slot);
      else state.skillSlotChoice = null;
      screens.hide();
      driveScreens();
    });
    return;
  }
  // ③ 三选一奖励（每个节点必给 1 次，design §5.6）
  if (state.rewards) {
    screens.showRewards(state, (i) => {
      applyReward(state, i);
      screens.hide();
      driveScreens();
    });
    return;
  }
  // ④ 技能点池（有存点且未跳过 → 追问；点选升级 / 跳过继续）
  if (p && p.skillPoints > 0 && !skipSkillPoints) {
    screens.showSkillPoints(state, (slot) => {
      if (slot >= 0 && p.skillPoints > 0 && upgradeSkillAt(p, slot)) {
        p.skillPoints -= 1;
        if (p.skillPoints <= 0) { screens.hide(); driveScreens(); }
        return true;
      }
      if (slot === -1) {
        skipSkillPoints = true;
        screens.hide();
        driveScreens();
      }
      return false;
    });
    return;
  }
  // ⑤ 本节点流程完毕 → 下一节点（非强制 flush，受 5s 节流；phase 尚在 reward 可写）
  skipSkillPoints = false;
  storage.markDirty();
  storage.flush(state, false);
  world.clearFx();
  advanceNode(state);
}

function startRun(classId) {
  startBattle(state, classId);
  skipSkillPoints = false;
  world.clearFx();
  screens.hide();
  input.clearAll();
  audio.unlock();
}

function backToMenu() {
  flushNow(true);
  state.phase = 'menu';
  state.player = null;
  state.battleResult = null;
  world.clearFx();
  screens.hide();
  driveScreens();
}

// ─────────── 暂停（暂停不追帧，tech §3.3） ───────────
function pauseGame() {
  loop.pause();
  input.clearAll();
  audio.suspend();
  screens.showPause({
    get muted() { return settings.muted; },
    get quality() { return perf.quality; },
    onResume() {
      screens.hide();
      loop.start();
      audio.resume();
    },
    onToggleMute() {
      settings.muted = !settings.muted;
      audio.setMuted(settings.muted);
      flushNow(true);
    },
    onCycleQuality() {
      const order = ['auto', 'low', 'mid', 'high'];
      const q = order[(order.indexOf(perf.quality) + 1) % order.length];
      perf.setQuality(q);
      settings.quality = q;
      flushNow(true);
    },
    onQuit() {
      screens.hide();
      if (state.phase === 'battle') settleRun(state, false);   // 放弃本局：道行保留
      loop.start();       // 恢复渲染循环以驱动结算界面（step 因 phase≠battle 早退，无害）
    },
  });
}

const pauseBtn = document.getElementById('pauseBtn');
pauseBtn.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  if (state.phase === 'battle' && !screens.isShown()) pauseGame();
});

// ─────────── 底部按键绑定（pointerdown 按下即触发，design §3.1 / §3.6） ───────────
input.bindKey(document.getElementById('btnPotion'), 'potion');
input.bindKey(document.getElementById('btnDodge'), 'dodge');
input.bindKey(document.getElementById('btnSkillA'), 'skill', 0);
input.bindKey(document.getElementById('btnSkillB'), 'skill', 1);
input.bindKey(document.getElementById('btnSkillC'), 'skill', 2);

// 首次用户手势解锁 WebAudio（移动端 autoplay 策略）
document.addEventListener('pointerdown', () => audio.unlock());

// ─────────── 主循环：30Hz 固定步长 + 渲染插值（tech §3.2 / §3.3） ───────────
function stepFn() {
  step(state, input.drain());
}

function renderFn(alpha) {
  const t0 = performance.now();
  const dtSec = Math.min(0.05, lastRenderAt ? (t0 - lastRenderAt) / 1000 : 1 / 30);
  lastRenderAt = t0;

  drainEvents();
  driveScreens();

  world.update(dtSec);
  world.draw(state, alpha, dtSec);
  hud.update(state);
  perf.sample(performance.now() - t0);
}

const loop = createLoop(stepFn, renderFn);

// ─────────── 切后台 / 页面隐藏：暂停 + 不追帧 + 强制 flush（tech §3.3 / §7.4） ───────────
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    loop.pause();
    input.clearAll();
    audio.suspend();
    flushNow(true);      // 即使战斗中也同步写一次
    if (state.phase === 'battle' && !screens.isShown()) pauseGame();  // 回前台不自动开打
  } else {
    audio.resume();
  }
});
window.addEventListener('pagehide', () => flushNow(true));

// ─────────── 启动 ───────────
driveScreens();          // 打开职业选择（或读档后仍回主界面，Roguelite 每局重来）
if (loaded.notice) screens.toast(loaded.notice);
if (storage.isDegraded()) screens.toast(storage.getNotice());
loop.start();
