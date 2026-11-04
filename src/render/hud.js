// src/render/hud.js —— [R] DOM HUD：顶栏 + 底部按键 + Boss 横幅。仅数值变化时写 DOM。
// art v2：内联 SVG 图标（emoji 退役）、CD 扇形 40° 渐变尾、血条损耗残影 ghost 层、低血呼吸。
import { balance, theme, getSkill } from '../core/tables.js';
import { icon, iconSvg } from '../ui/icons.js';

const COMBAT = balance.combat;

// 数值 → 展示文本（缓存比对，零重复写 DOM）
function setter(el, prop) {
  let last;
  return (v) => {
    if (v === last) return;
    last = v;
    el[prop] = v;
  };
}

// 资源条填充（亮=职业色提亮版，art §4.2）
const RES_GRAD = {
  rage: 'linear-gradient(180deg,#F09A6E 20%,#E8734A 100%)',
  mana: 'linear-gradient(180deg,#7CC0E4 20%,#4FA8D8 100%)',
  combo: 'linear-gradient(180deg,#93D29A 20%,#6FBF73 100%)',
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    classIcon: $('classIcon'),
    hpFill: $('hpFill'), hpNum: $('hpNum'),
    resFill: $('resFill'), resNum: $('resNum'),
    expFill: $('expFill'), lvTag: $('lvTag'),
    progress: $('progress'),
    stBurn: $('stBurn'), stStun: $('stStun'), stSlow: $('stSlow'), stShield: $('stShield'),
    banner: $('banner'), bannerText: $('bannerText'), bannerFill: $('bannerFill'),
    btnPotion: $('btnPotion'), potionCount: $('potionCount'),
    btnDodge: $('btnDodge'), staminaTag: $('staminaTag'),
    cdPotion: $('cdPotion'), cdnPotion: $('cdnPotion'),
    cdDodge: $('cdDodge'), cdnDodge: $('cdnDodge'),
    keys: [
      { btn: $('btnSkillA'), icon: $('icoA'), lv: $('lvA'), cd: $('cdA'), cdn: $('cdnA') },
      { btn: $('btnSkillB'), icon: $('icoB'), lv: $('lvB'), cd: $('cdB'), cdn: $('cdnB') },
      { btn: $('btnSkillC'), icon: $('icoC'), lv: $('lvC'), cd: $('cdC'), cdn: $('cdnC') },
    ],
  };

  // ── 静态 SVG 注入（emoji 退役：药瓶 / 闪避 / 暂停 / 异常 4 格） ──
  const potionIconBox = els.btnPotion.querySelector('.icon');
  const dodgeIconBox = els.btnDodge.querySelector('.icon');
  if (potionIconBox) potionIconBox.innerHTML = iconSvg('potion');
  if (dodgeIconBox) dodgeIconBox.innerHTML = iconSvg('dodge');
  $('pauseBtn').innerHTML = iconSvg('pause');
  for (const [id, key] of [['stBurn', 'st-burn'], ['stStun', 'st-stun'], ['stSlow', 'st-slow'], ['stShield', 'st-shield']]) {
    $(id).innerHTML = iconSvg(key);
  }

  // ── 血条损耗残影层（顶栏矩形内加层，非新增 HUD 元素；art §4.2） ──
  const hpBar = els.hpFill.parentElement;
  const ghost = document.createElement('div');
  ghost.id = 'hpGhost';
  hpBar.insertBefore(ghost, els.hpFill.nextSibling);

  let lowHpOn = false;
  function setLowHp(on) {
    if (on === lowHpOn) return;
    lowHpOn = on;
    hpBar.classList.toggle('low', on);
  }

  const S = {
    hpFill: setter(els.hpFill, 'style'), hpNum: setter(els.hpNum, 'textContent'),
    hpGhost: setter(ghost, 'style'),
    resFill: setter(els.resFill, 'style'), resNum: setter(els.resNum, 'textContent'),
    expFill: setter(els.expFill, 'style'), lvTag: setter(els.lvTag, 'textContent'),
    progress: setter(els.progress, 'textContent'),
    potionCount: setter(els.potionCount, 'textContent'),
    staminaTag: setter(els.staminaTag, 'textContent'),
    bannerText: setter(els.bannerText, 'textContent'),
    bannerFill: setter(els.bannerFill, 'style'),
    classIcon: setter(els.classIcon.firstChild || els.classIcon, 'innerHTML'),
    bannerDisplay: setter(els.banner, 'hidden'),
  };
  for (const st of ['stBurn', 'stStun', 'stSlow', 'stShield']) {
    S[st] = setter(els[st], 'className');
  }
  for (let i = 0; i < 3; i++) {
    S['ico' + i] = setter(els.keys[i].icon, 'innerHTML');
    S['lv' + i] = setter(els.keys[i].lv, 'textContent');
    S['cd' + i] = setter(els.keys[i].cd, 'style');
    S['cdn' + i] = setter(els.keys[i].cdn, 'textContent');
    S['cdnDisplay' + i] = setter(els.keys[i].cdn, 'style');
    S['btnClass' + i] = setter(els.keys[i].btn, 'className');
  }
  S['cdPotion'] = setter(els.cdPotion, 'style');
  S['cdnPotion'] = setter(els.cdnPotion, 'style');
  S['cdnPotionText'] = setter(els.cdnPotion, 'textContent');
  S['btnPotionClass'] = setter(els.btnPotion, 'className');
  S['cdDodge'] = setter(els.cdDodge, 'style');
  S['cdnDodge'] = setter(els.cdnDodge, 'textContent');
  S['cdnDodgeDisplay'] = setter(els.cdnDodge, 'style');
  S['btnDodgeClass'] = setter(els.btnDodge, 'className');

  // CD 遮罩：conic-gradient 扇形 + 40° 渐变尾（art §4.1 #4，纯 CSS 模板）
  function maskStyle(el, pct) {
    const n = Math.min(359.9, pct * 360);
    el.background = `conic-gradient(rgba(11,14,20,.85) ${n.toFixed(1)}deg, rgba(11,14,20,.45) ${(n + 40).toFixed(1)}deg, transparent ${(n + 40).toFixed(1)}deg)`;
  }

  function cdNum(el, disp, text, cd, cdMax) {
    if (cd > 0) {
      maskStyle(el.style, Math.min(1, cd / Math.max(1, cdMax)));
      // 数字仅剩余 ≥ 45 tick 时显示（§3.4）
      if (cd >= COMBAT.cdNumberShowTicks) {
        disp.display = '';
        text((cd / balance.tickHz).toFixed(1) + 's');
      } else {
        disp.display = 'none';
      }
    } else {
      el.style.background = 'none';
      disp.display = 'none';
    }
  }

  function update(state) {
    const p = state.player;
    if (!p) {
      S.progress(`${balance.chapterNames[state.chapter - 1] || '一'} · 空闲`);
      return;
    }

    // 顶栏（ghost 同吃 scaleX，CSS transition 延迟 0.35s 慢追 → 白影追赶）
    const hpPct = Math.max(0, p.hp / p.maxHp).toFixed(4);
    S.hpFill(`transform:scaleX(${hpPct})`);
    S.hpGhost(`transform:scaleX(${hpPct})`);
    setLowHp(p.hp / p.maxHp < 0.3);
    S.hpNum(`${Math.ceil(Math.max(0, p.hp))}/${Math.round(p.maxHp)}`);
    const resColor = p.resourceId === 'rage' ? '#E8734A' : p.resourceId === 'mana' ? '#4FA8D8' : '#6FBF73';
    S.resFill(`transform:scaleX(${Math.max(0, p.resource / Math.max(1, p.resourceMax)).toFixed(4)});background:${RES_GRAD[p.resourceId] || resColor}`);
    S.resNum(`${Math.floor(p.resource)}/${Math.round(p.resourceMax)}`);
    const expNeed = balance.exp.perLevel[Math.min(balance.exp.levelMax - 1, p.level - 1)];
    S.expFill(`transform:scaleX(${Math.min(1, p.exp / expNeed).toFixed(4)})`);
    S.lvTag('Lv' + p.level);
    S.progress(`${balance.chapterNames[state.chapter - 1]} · ${state.node}/${balance.nodesPerChapter}`);
    S.classIcon(iconSvg('cls-' + p.classId));

    // 异常图标
    S.stBurn(p.burn ? 'st on' : 'st');
    S.stStun(p.stunTicks > 0 ? 'st on' : 'st');
    S.stSlow(p.slow ? 'st on' : 'st');
    S.stShield(p.shield > 0 ? 'st on' : 'st');

    // 底部按键
    for (let i = 0; i < 3; i++) {
      const s = p.skills[i];
      const k = els.keys[i];
      const sk = s ? getSkill(s.id) : null;
      S['ico' + i](sk ? iconSvg(sk.icon) : '—');
      S['lv' + i](s ? 'Lv' + s.level : '');
      cdNum(k.cd, k.cdn.style, S['cdn' + i], p.skillCd[i], sk ? Math.max(1, Math.round(sk.cdTicks * (1 - p.cdReducePct))) : 1);
      const cls = 'key' + (s ? '' : ' empty') + (s && p.resource >= sk.cost && p.skillCd[i] <= 0 ? ' ready' : '') + (s && p.resource < sk.cost ? ' noRes' : '');
      S['btnClass' + i](cls);
    }

    // 药瓶
    S.potionCount(String(p.potions));
    cdNum(els.cdPotion, els.cdnPotion.style, S['cdnPotionText'], p.potionCd, COMBAT.potionCdTicks);
    S['btnPotionClass']('key' + (p.potions > 0 && p.potionCd <= 0 ? ' ready' : ''));

    // 闪避
    S.staminaTag(String(Math.floor(p.stamina)));
    cdNum(els.cdDodge, els.cdnDodge.style, S['cdnDodge'], p.dodgeCd, p.dodgeCdBase);
    S['btnDodgeClass']('key big' + (p.stamina >= balance.dodge.staminaCost && p.dodgeCd <= 0 ? ' ready' : ''));

    // Boss 横幅（前缀 emoji 已退役：CSS ::before 三角警示标）
    const b = state.bossBanner;
    S.bannerDisplay(b ? false : true);
    if (b) {
      S.bannerText(b.name);
      S.bannerFill(`transform:scaleX(${Math.max(0, b.remaining / Math.max(1, b.total)).toFixed(3)})`);
      els.banner.className = b.color === 'red' ? '' : ' teach';
    }
  }

  return { update };
}
