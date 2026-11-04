// src/ui/screens.js —— [R] 职业选择 / 三选一 / 装备替换对比 / 技能槽替换 / 技能点 / 结算 / 暂停
// 全部只读 state（选职业时的 meta 与解锁态）；用户操作通过回调交还 main.js 驱动 core。
import { balance, theme, allClasses, getSkill } from '../core/tables.js';
import { isClassUnlocked, classUnlockText, compareEquipment } from '../core/progression.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export function createScreens(notify) {
  const overlay = document.getElementById('overlay');
  const toastEl = document.getElementById('toast');
  let toastTimer = 0;
  let pausedByScreen = false;

  function show(html) {
    overlay.innerHTML = html;
    overlay.hidden = false;
  }
  function hide() {
    overlay.hidden = true;
    overlay.innerHTML = '';
    pausedByScreen = false;
  }
  function isShown() { return !overlay.hidden; }

  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
  }

  // ───────── 主界面 / 职业选择 ─────────
  let selectedClass = 'lishi';

  function showClassSelect(state, onStart) {
    selectedClass = 'lishi';
    renderClassSelect(state, onStart);
  }

  function renderClassSelect(state, onStart) {
    const meta = state.meta;
    let cards = '';
    for (const id of ['lishi', 'shushi', 'youxia']) {
      const c = allClasses()[id];
      const unlocked = isClassUnlocked(id, meta);
      const sel = id === selectedClass && unlocked;
      cards += `
      <div class="classCard ${sel ? 'selected' : ''} ${unlocked ? '' : 'locked'}" data-class="${id}">
        ${unlocked ? '' : `<span class="lockTag">${esc(classUnlockText(id))}</span>`}
        <div class="cname">${c.icon} ${esc(c.name)}</div>
        <div class="crole">${esc(c.role)} · 资源：${esc(c.resource.name)} ${c.resource.max}</div>
        <div class="cdesc">${esc(c.desc)}</div>
        <div class="cstats">
          <span>HP ${c.lv1Reference.hp}</span><span>ATK ${c.lv1Reference.atk}</span>
          <span>DEF ${c.lv1Reference.def}</span><span>暴击 ${Math.round(c.lv1Reference.crit * 100)}%</span>
        </div>
      </div>`;
    }
    const dh = meta.daohangTotal;
    const nextUnlock = balance.daohang.unlocks.find((u) => u.at > dh);
    show(`
      <div class="title">夜 行 录</div>
      <div class="subtitle">夜行即除妖 · 单局约 12 分钟</div>
      <div class="sectionHead">道行 ${dh}${nextUnlock ? ` · 下一解锁：${esc(nextUnlock.label)}（还差 ${nextUnlock.at - dh}）` : ' · 已全解锁'}</div>
      ${cards}
      <div class="btnRow">
        <button class="btn primary" id="startBtn">入 夜（${esc(allClasses()[selectedClass] && isClassUnlocked(selectedClass, meta) ? allClasses()[selectedClass].name : '力士')}）</button>
      </div>
      <div class="subtitle" style="margin-top:10px">操作：点技能自动锁定最近敌人 · 闪避左右交替 110px · 红色预警必须闪避</div>
    `);
    overlay.querySelectorAll('.classCard').forEach((card) => {
      card.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        const id = card.dataset.class;
        if (!isClassUnlocked(id, meta)) {
          toast(classUnlockText(id));
          return;
        }
        selectedClass = id;
        renderClassSelect(state, onStart);
      });
    });
    // pointerdown 按下即触发（无 click 延迟，移动端手感）；
    // click 兜底：合成事件（无头测试）/ 键盘 Enter·Space 也能开局。
    // 去重：真实指针点击在 pointerdown 后 ~百 ms 内还会补发一次 click，
    // 600ms 内的 click 视为同一次操作，避免双触发 startRun。
    const startBtn = document.getElementById('startBtn');
    let startArmedAt = -1e9;
    startBtn.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      startArmedAt = ev.timeStamp;
      onStart(selectedClass);
    });
    startBtn.addEventListener('click', (ev) => {
      if (ev.timeStamp - startArmedAt < 600) return;
      ev.preventDefault();
      onStart(selectedClass);
    });
  }

  // ───────── 三选一奖励 ─────────
  function showRewards(state, onChoose) {
    const rs = state.rewards || [];
    let cards = '';
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      cards += `
      <div class="rewardCard" data-i="${i}">
        <div class="rtitle">${r.icon || '✦'} ${esc(r.title)}</div>
        <div class="rdesc">${esc(r.desc || '')}</div>
      </div>`;
    }
    show(`
      <div class="title">行 囊</div>
      <div class="subtitle">${esc(balance.chapterNames[state.chapter - 1])} · 第 ${state.node} 节点清剿完成 · 三选一</div>
      ${cards}
    `);
    overlay.querySelectorAll('.rewardCard').forEach((card) => {
      card.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        onChoose(parseInt(card.dataset.i, 10));
      });
    });
  }

  // ───────── 装备替换对比 ─────────
  function showLootCompare(state, item, onResolve) {
    const p = state.player;
    const cur = p.equipped[item.slot];
    const cmp = compareEquipment(cur, item);
    let rows = '';
    for (const r of cmp.rows) {
      const isDelta = typeof r.delta === 'number';
      const cls = isDelta ? (r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : '') : '';
      const curV = isDelta ? r.cur : esc(r.cur);
      const nextV = isDelta ? r.next : esc(r.next);
      const d = isDelta ? (r.delta !== 0 ? (r.delta > 0 ? ` ↑${r.delta}` : ` ↓${Math.abs(r.delta)}`) : ' —') : '';
      rows += `<tr><td>${esc(r.label)}</td><td class="name">${curV}</td><td class="${cls}">${nextV}${d}</td></tr>`;
    }
    const rc = theme.rarityColor[item.rarity] || theme.ink3;
    show(`
      <div class="title" style="color:${rc}">${item.icon} ${esc(item.name)}</div>
      <div class="subtitle">${esc(balance.rarityNames[item.rarity])}品 · ${esc(balance.slotNames[item.slot])} · 是否替换？</div>
      <table class="compareTable">
        <tr><th></th><th>当前</th><th>新</th></tr>
        ${rows}
        <tr class="verdictRow"><td>综合</td><td>${cmp.curScore.toFixed(0)}</td><td class="verdict ${cmp.verdict}">${cmp.nextScore.toFixed(0)}（${cmp.verdict === 'better' ? '更好' : cmp.verdict === 'worse' ? '更差' : '相当'}）</td></tr>
      </table>
      <div class="btnRow">
        <button class="btn primary" id="replaceBtn">替换</button>
        <button class="btn" id="keepBtn">保留</button>
      </div>
    `);
    document.getElementById('replaceBtn').addEventListener('pointerdown', (ev) => { ev.preventDefault(); onResolve(true); });
    document.getElementById('keepBtn').addEventListener('pointerdown', (ev) => { ev.preventDefault(); onResolve(false); });
  }

  // ───────── 技能栏满：替换哪一格 ─────────
  function showSkillSlotChoice(state, skillId, onPick) {
    const p = state.player;
    const sk = getSkill(skillId);
    let items = '';
    for (let i = 0; i < p.skills.length; i++) {
      const s = p.skills[i];
      const cur = s ? getSkill(s.id) : null;
      items += `
      <div class="item" data-slot="${i}">
        <span class="sicon">${cur ? cur.icon : '—'}</span>
        <span><span class="sname">${cur ? esc(cur.name) : '空槽'}</span><div class="sdesc">${cur ? 'Lv' + s.level : ''}</span></span>
        <span class="slv">${cur ? '替换' : '放入'}</span>
      </div>`;
    }
    show(`
      <div class="title">${sk.icon} ${esc(sk.name)}</div>
      <div class="subtitle">技能栏已满 · 选择要替换的槽位</div>
      <div class="panelList">${items}</div>
      <div class="btnRow"><button class="btn" id="skipSkill">放弃新技能</button></div>
    `);
    overlay.querySelectorAll('.item').forEach((el) => {
      el.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        onPick(parseInt(el.dataset.slot, 10));
      });
    });
    document.getElementById('skipSkill').addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      onPick(-1);
    });
  }

  // ───────── 技能点消耗 ─────────
  function showSkillPoints(state, onDone) {
    const p = state.player;
    let items = '';
    for (let i = 0; i < p.skills.length; i++) {
      const s = p.skills[i];
      const sk = s ? getSkill(s.id) : null;
      const maxed = sk && s.level >= sk.levels.length;
      items += `
      <div class="item ${maxed ? 'locked' : ''}" data-slot="${i}">
        <span class="sicon">${sk ? sk.icon : '—'}</span>
        <span><span class="sname">${sk ? esc(sk.name) : '空槽'}</span><div class="sdesc">${maxed ? '已满级' : sk ? esc(sk.desc || '') : ''}</div></span>
        <span class="slv">${s ? `Lv${s.level}${maxed ? '' : ' → ' + (s.level + 1)}` : ''}</span>
      </div>`;
    }
    show(`
      <div class="title">技能点 × ${p.skillPoints}</div>
      <div class="subtitle">点选技能升级（Lv3 有质变效果）</div>
      <div class="panelList">${items}</div>
      <div class="btnRow"><button class="btn" id="skipSp">跳过</button></div>
    `);
    overlay.querySelectorAll('.item').forEach((el) => {
      if (el.classList.contains('locked')) return;
      el.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        const slot = parseInt(el.dataset.slot, 10);
        if (p.skillPoints > 0) {
        const ok = onDone(slot);
        if (ok) {
          toast('技能升级 +1');
          if (p.skillPoints > 0) showSkillPoints(state, onDone);   // 耗尽则由 main 收尾推进，不再重开面板
        } else toast('已满级');
        }
      });
    });
    document.getElementById('skipSp').addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      onDone(-1);
    });
  }

  // ───────── 结算 ─────────
  function showResult(result, onBack) {
    show(`
      <div class="resultBox">
        <div class="big ${result.won ? 'win' : 'lose'}">${result.won ? '破 晓' : '长 夜 未 尽'}</div>
        <div class="rows">
          本局道行 <b>+${result.daohang}</b><br>
          妖除 <b>${result.kills}</b> · 止步 ${esc(balance.chapterNames[result.chapter - 1])} ${result.node}/${balance.nodesPerChapter}<br>
          累计道行 <b>${result.totalDaohang}</b> · 通关 ${result.totalClears || 0} 次
        </div>
        <div class="btnRow"><button class="btn primary" id="backBtn">回 到 夜 色</button></div>
      </div>
    `);
    document.getElementById('backBtn').addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      onBack();
    });
  }

  // ───────── 暂停 ─────────
  function showPause(hd) {
    pausedByScreen = true;
    show(`
      <div class="title">暂 停</div>
      <div class="subtitle">夜色凝滞 · 妖亦止步</div>
      <div class="panelList">
        <div class="item" id="resumeItem"><span class="sicon">▶</span><span class="sname">继续夜行</span><span class="slv"></span></div>
        <div class="item" id="muteItem"><span class="sicon">${hd.muted ? '🔇' : '🔊'}</span><span class="sname">音效</span><span class="slv">${hd.muted ? '已静音' : '开启'}</span></div>
        <div class="item" id="qualityItem"><span class="sicon">✨</span><span class="sname">画质</span><span class="slv">${hd.quality}</span></div>
        <div class="item" id="quitItem"><span class="sicon">🚪</span><span class="sname">放弃本局</span><span class="slv">道行保留</span></div>
      </div>
    `);
    document.getElementById('resumeItem').addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      hd.onResume();
    });
    document.getElementById('muteItem').addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      hd.onToggleMute();
      showPause(hd);
    });
    document.getElementById('qualityItem').addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      hd.onCycleQuality();
      showPause(hd);
    });
    document.getElementById('quitItem').addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      hd.onQuit();
    });
  }

  function isPauseShown() { return pausedByScreen; }

  return {
    showClassSelect, showRewards, showLootCompare, showSkillSlotChoice,
    showSkillPoints, showResult, showPause,
    hide, isShown, isPauseShown, toast,
  };
}
