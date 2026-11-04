// src/render/worldRenderer.js —— [R] 实体/背景/预警/弹道/飘字，签名 draw(state, alpha, dtSec)
// 只读 state + 消费事件；可移动实体用 lerp(prevX, x, alpha) 插值（tech §3.2）。
// 美术 v2（art_spec_v2.md）：MONSTER_ART 造型表（本文件顶部，core 零感知）、
// 三职业正式剪影、三层视差 + 雾/尘埃/光斑（全部离屏预渲染，每帧仅 drawImage + 平移/alpha，
// 禁止逐帧 createGradient）、伤害数字曲线升级、vfx_spec_v1 特效全套。
import { balance, theme, getSkill } from '../core/tables.js';

const F = balance.field;
const D = balance.dodge;
const AUX = balance.aux;

const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

// ─────────── 造型表（art_spec_v2 §2：6 模板 ×参数 + 3 Boss，按 e.id 取用） ───────────
// tpl: M1 纸身人形 / M2 悬浮灵体 / M3 低伏兽形 / M4 枝条蔓生 / M5 翼形飞禽 / M6 墩甲重装
const MONSTER_ART = {
  // M1 纸身人形：纸人 / 无面僧 / 咒偶
  zhiren:     { tpl: 1, notches: 2, arms: false, beads: false, cross: false, eyeGap: 1 },
  wumianseng: { tpl: 1, notches: 3, arms: true,  beads: true,  blank: true },
  zhouou:     { tpl: 1, notches: 2, cross: true, eyeGap: 1.7 },
  // M2 悬浮灵体：灯笼鬼 / 狐火 / 血蝠
  denglonggui:{ tpl: 2, core: '#E8734A', whiskers: 4, bands: true },
  huhuo:      { tpl: 2, core: '#4FA8D8', whiskers: 3, longTail: true },
  xuefu:      { tpl: 2, core: '#C8362B', wings: true },
  // M3 低伏兽形：水猴 / 鬼面蛛 / 蚀骨蜈
  shuihou:    { tpl: 3, legs: 2, tail: 14, drop: true },
  guimianzhu: { tpl: 3, legs: 8, mask: true },
  shiguwu:    { tpl: 3, segments: 3, legs: 12 },
  // M4 枝条蔓生：竹影 / 藤妖
  zhuying:    { tpl: 4, segs: 3, leaves: 5 },
  tengyao:    { tpl: 4, segs: 2, tendril: true, leaves: 3 },
  // M5 翼形飞禽：骨雀 / 夜枭 / 檐鬼(精英)
  guque:      { tpl: 5, wing: 12, bobP: 24 },
  yexiao:     { tpl: 5, wing: 20, ears: true },
  yangui:     { tpl: 5, folded: true, claws: true, hat: true },
  // M6 墩甲重装：泥童 / 锈甲兵 / 石卫 / 铜甲尸(精英)
  nitong:     { tpl: 6, wavy: true, drips: true },
  xiujiabing: { tpl: 6, rust: true },
  shiwei:     { tpl: 6, shield: true },
  tongjiashi: { tpl: 6, verdigris: true, ringEyes: true },
  // Boss 独立造型
  tidenglaolao: { tpl: 'B1' },
  qiaoji:       { tpl: 'B2' },
  huangquan:    { tpl: 'B3' },
};

// 三章色调（art_spec_v2 §3.2）
const CHAPTER = {
  1: {
    sky: ['#0B0E14', '#10141D', '#12161F'],
    fog: ['rgba(42,49,64,', 0.08],
    spots: 'moon',
    ridge: null,
  },
  2: {
    sky: ['#0B0E14', '#0F151A', '#121A20'],
    fog: ['rgba(42,64,72,', 0.12],
    spots: 'moon',
    ridge: '#16222A',
  },
  3: {
    sky: ['#12161F', '#1A1420', '#201420'],
    fog: ['rgba(58,42,40,', 0.06],
    spots: 'lantern',
    ridge: '#241A26',
  },
};

// 确定性折线（初始化生成一次，不逐帧随机）
function makeRidge(seed, baseY, amp, step, w) {
  const pts = [];
  let x = -20;
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  while (x < w + 40) {
    pts.push([x, baseY - amp * (0.35 + rnd() * 0.65)]);
    x += step;
  }
  return pts;
}

// 极简确定性折线绘制器（记忆物 / 造型共用）
function poly(c, pts, close) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  if (close) c.closePath();
}

export function createWorldRenderer(renderer, particles, perf, settings) {
  const { ctx } = renderer;
  const W = 390;
  const H = 500;
  const toY = (y) => y - F.canvasY;
  const LW = 430;                       // 离屏层宽（390 + 视差余量 ±20）

  // ───── 飘字池（§8.2：同屏上限、上飘 40px、重叠上移 22px） ─────
  const floaters = [];
  for (let i = 0; i < 16; i++) {
    floaters.push({ active: false, x: 0, y: 0, text: '', crit: false, color: '', stroke: '', drift: 1, life: 0, total: 18 });
  }

  let shakeAmt = 0;
  let shakeT = 0;
  let hurtFlash = 0;      // 玩家承伤红 vignette（强度按伤害比）
  let dodgeFlash = 0;     // 闪避成功白 vignette
  let mechFlash = 0;      // 机制命中红 vignette
  let whiteFlash = 0;     // Boss 死亡全屏渐亮（12 tick）
  let hitStop = 0;        // 暴击顿帧（渲染帧计）
  let animClock = 0;      // 渲染层时钟（秒），呼吸/悬浮/呼吸灯共用，不读墙钟
  let frameNo = 0;
  let builtKey = '';      // 离屏场景缓存键 `${chapter}:${canvas.width}`
  let scene = null;
  let fogOff1 = 0;
  let fogOff2 = 0;
  let comboRing = 0;      // 连斩尘环加成（+10%/连击，封顶 +50%）
  let lastRedMissAt = -10;  // A2：同批 red mechMiss 配对判定（渲染时钟）
  let trailDrop = -1;       // 闪避残影分段投递
  let hitCount = {};        // 多段技能「每 3 段合并反馈」计数
  let crumble = null;       // Boss 三波次崩解
  let dashFrom = null;      // 追影突进起点
  let lastState = null;     // update() 读取玩家姿态用（draw 时刷新）

  // 氛围尘埃：独立 24 粒背景池（与战斗粒子池互不挤占，vfx §5）
  const dust = [];
  for (let i = 0; i < 24; i++) {
    dust.push({
      bx: (i * 97) % 390, y: (i * 173) % 500, s: 1 + (i % 2),
      vy: 4 + (i * 37 % 7), amp: 6, ph: (i * 0.618) % TAU, per: 4 + (i % 4),
      a: 0.25 + ((i * 53) % 26) / 100,
    });
  }

  function shake(px, ticks) {
    if (!perf || !perf.shakeOn) return;
    if (settings && settings.reduceShake) return;   // 晕动症友好：幅度 ×0，vignette/粒子保留
    if (px > shakeAmt || shakeT <= 0) { shakeAmt = px; shakeT = ticks / 30; }
  }

  function addFloater(x, y, text, opts) {
    const cap = perf ? perf.floaterMax : 12;
    let used = 0;
    let free = null;
    for (let i = 0; i < floaters.length; i++) {
      if (floaters[i].active) used += 1;
      else if (!free) free = floaters[i];
    }
    if (!free || used >= cap) return;
    let yy = y;
    for (let k = 0; k < 2; k++) {
      let overlap = false;
      for (let i = 0; i < floaters.length; i++) {
        const f = floaters[i];
        if (!f.active) continue;
        if (Math.abs(f.x - x) < 44 && Math.abs(f.y - yy) < 18) { overlap = true; break; }
      }
      if (!overlap) break;
      yy -= 22;
    }
    free.active = true;
    free.x = x; free.y = yy;
    free.text = String(text);
    free.crit = !!(opts && opts.crit);
    free.color = (opts && opts.color) || theme.paper;
    free.stroke = (opts && opts.stroke) || theme.ink0;
    free.drift = (x % 2 === 0) ? 1 : -1;             // 伪随机横漂（e.x 奇偶，免费）
    free.total = free.crit ? Math.round(balance.fx.floaterLifeTicks * 1.25) : balance.fx.floaterLifeTicks;
    free.life = free.total;
  }

  // ───── 离屏场景预渲染（resize / 换章重建） ─────
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function buildScene(chapter) {
    const S = Math.min(2, Math.max(1, (renderer.ctx.canvas.width / 390) || 1));
    const cw = (w, h) => { const c = makeCanvas(Math.ceil(w * S), Math.ceil(h * S)); const cc = c.getContext('2d'); cc.scale(S, S); return { c, g: cc }; };
    const cfg = CHAPTER[chapter] || CHAPTER[1];

    // L0 天空（视差 0）
    const sky = cw(W, H);
    const sg = sky.g.createLinearGradient(0, 0, 0, H);
    sg.addColorStop(0, cfg.sky[0]);
    sg.addColorStop(0.55, cfg.sky[1]);
    sg.addColorStop(1, cfg.sky[2]);
    sky.g.fillStyle = sg;
    sky.g.fillRect(0, 0, W, H);

    // 光斑（预渲染径向渐变图，运行时只改 globalAlpha）
    const glow = cw(96, 96);
    const mg = glow.g.createRadialGradient(48, 48, 4, 48, 48, 48);
    mg.addColorStop(0, theme.moon + '0.12)');
    mg.addColorStop(1, theme.moon + '0)');
    glow.g.fillStyle = mg;
    glow.g.fillRect(0, 0, 96, 96);
    const lglow = cw(80, 80);
    const lg = lglow.g.createRadialGradient(40, 40, 3, 40, 40, 40);
    lg.addColorStop(0, 'rgba(232,115,74,.16)');
    lg.addColorStop(1, 'rgba(232,115,74,0)');
    lglow.g.fillStyle = lg;
    lglow.g.fillRect(0, 0, 80, 80);

    // 残月本体（32px @318,52）
    sky.g.globalAlpha = 0.35;
    sky.g.fillStyle = theme.paperDim;
    sky.g.beginPath(); sky.g.arc(318, 52, 16, 0, TAU); sky.g.fill();
    sky.g.fillStyle = cfg.sky[0];
    sky.g.beginPath(); sky.g.arc(311, 47, 14, 0, TAU); sky.g.fill();
    sky.g.globalAlpha = 1;

    // L1 远山 + 记忆物剪影
    const ridgeCol = cfg.ridge || theme.ink2;
    const l1 = cw(LW, H);
    l1.g.globalAlpha = 0.5;
    l1.g.fillStyle = ridgeCol;
    fillRidge(l1.g, makeRidge(7, 210, 90, 70, LW));
    l1.g.globalAlpha = 1;
    drawMemory(l1.g, chapter, ridgeCol);

    // L2 中景（屋檐/树影）+ 灯市挂灯
    const l2 = cw(LW, H);
    l2.g.globalAlpha = 0.7;
    l2.g.fillStyle = theme.ink2;
    fillRidge(l2.g, makeRidge(31, 268, 60, 52, LW));
    l2.g.globalAlpha = 1;
    if (chapter === 3) {
      // 檐口挂灯 4 盏：8×10 纸白小灯 + 2px 橙箍
      l2.g.fillStyle = theme.paperDim;
      for (let i = 0; i < 4; i++) {
        const lx = 60 + i * 90;
        l2.g.fillRect(lx - 4, 258, 8, 10);
        l2.g.fillStyle = theme.lantern;
        l2.g.fillRect(lx - 4, 261, 8, 2);
        l2.g.fillStyle = theme.paperDim;
      }
    }

    // L3 近景剪影带
    const l3 = cw(LW, H);
    l3.g.fillStyle = theme.ink2;
    fillRidge(l3.g, makeRidge(97, 330, 34, 42, LW));

    // 地面纹理（activeBottom 以下，静态离屏）
    const ground = cw(LW, 44);
    ground.g.strokeStyle = theme.ink3;
    ground.g.lineWidth = 1;
    ground.g.beginPath();
    ground.g.moveTo(0, 4.5); ground.g.lineTo(LW, 4.5); ground.g.stroke();
    ground.g.globalAlpha = 0.3;
    let gs = 1234;
    const grnd = () => { gs = (gs * 1103515245 + 12345) & 0x7fffffff; return gs / 0x7fffffff; };
    ground.g.beginPath();
    for (let i = 0; i < 12; i++) {
      const gx = grnd() * (LW - 30);
      const gl = 8 + grnd() * 16;
      ground.g.moveTo(gx, 12 + grnd() * 26);
      ground.g.lineTo(gx + gl, 12 + grnd() * 26);
    }
    ground.g.stroke();
    ground.g.fillStyle = theme.ink3;
    for (let i = 0; i < 4; i++) ground.g.fillRect(grnd() * LW, 14 + grnd() * 22, 3, 3);

    // A1 雾带 ×2（390×36 圆角模糊条，运行时 drawImage 平移）
    const mkFog = () => {
      const f = cw(LW, 36);
      const fg = f.g.createLinearGradient(0, 0, 0, 36);
      fg.addColorStop(0, cfg.fog[0] + '0)');
      fg.addColorStop(0.5, cfg.fog[0] + cfg.fog[1].toFixed(2) + ')');
      fg.addColorStop(1, cfg.fog[0] + '0)');
      f.g.fillStyle = fg;
      f.g.fillRect(0, 0, LW, 36);
      return f.c;
    };

    scene = {
      key: '', sky: sky.c, glow: glow.c, lglow: lglow.c,
      l1: l1.c, l2: l2.c, l3: l3.c, ground: ground.c,
      fog1: mkFog(), fog2: mkFog(), scale: S, chapter,
    };
  }

  function fillRidge(g, pts) {
    g.beginPath();
    g.moveTo(-30, H);
    for (let k = 0; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
    g.lineTo(LW + 30, H);
    g.closePath();
    g.fill();
  }

  // 每章记忆物剪影（L1 叠加，预生成折线）
  function drawMemory(g, chapter, col) {
    g.fillStyle = col;
    g.strokeStyle = col;
    g.lineWidth = 3;
    if (chapter === 1) {
      // 断墙 2 段（L 形）+ 枯树 1 棵（3 分叉）
      poly(g, [[70, 218], [70, 160], [110, 160], [110, 218]]); g.fill();
      poly(g, [[150, 220], [150, 176], [176, 176]]); g.stroke();
      g.beginPath(); g.moveTo(300, 220); g.lineTo(300, 140);
      g.moveTo(300, 168); g.lineTo(282, 146);
      g.moveTo(300, 152); g.lineTo(320, 130);
      g.moveTo(300, 140); g.lineTo(310, 118); g.stroke();
    } else if (chapter === 2) {
      // 塔尖 1 座（3 段收分）+ 断柱 2 根（L 形）
      poly(g, [[110, 218], [118, 170], [112, 130], [116, 92], [124, 92], [122, 132], [130, 172], [138, 218]]); g.fill();
      g.beginPath(); g.moveTo(260, 218); g.lineTo(260, 150); g.lineTo(272, 150); g.moveTo(266, 218); g.lineTo(266, 158); g.stroke();
      g.beginPath(); g.moveTo(320, 218); g.lineTo(320, 170); g.stroke();
    } else {
      // 连绵瓦檐（锯齿密折）+ 灯杆 2 根
      g.beginPath();
      g.moveTo(40, 200);
      for (let x = 40; x < 400; x += 22) { g.lineTo(x + 11, 178); g.lineTo(x + 22, 200); }
      g.lineTo(400, 240); g.lineTo(40, 240);
      g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(180, 240); g.lineTo(180, 150); g.moveTo(174, 240); g.lineTo(174, 156);
      g.moveTo(330, 240); g.lineTo(330, 160); g.moveTo(324, 240); g.lineTo(324, 166);
      g.stroke();
    }
  }

  // ───── 事件 → 视觉反馈（vfx_spec_v1 §0 触发点总表） ─────
  function handleEvent(state, e) {
    const p = state.player;
    switch (e.type) {
      case 'damage': {
        const isPlayer = e.kind === 'player';
        const isBurn = e.kind === 'burn';
        // 玩家受击：红晕强度按伤害比（vfx §3.1）+ 阈值分档震屏
        if (isPlayer && p) {
          hurtFlash = Math.min(0.6, Math.max(0.15, e.value / p.maxHp));
          hurtFlash = Math.max(hurtFlash, 0.15);
          if (e.value >= p.maxHp * 0.12) shake(4, 5);
          else if (e.value >= p.maxHp * 0.08) shake(3, 3);
        }
        if (settings.showDamage || e.crit) {
          addFloater(e.x, e.y - AUX.floaterOffsetY, e.value, {
            crit: e.crit,
            color: e.crit ? theme.gold : (isPlayer ? theme.playerHurt : (isBurn ? '#E8734A' : theme.paper)),
            stroke: e.crit ? '#7A2E22' : theme.ink0,
          });
        }
        if (e.crit) {
          // 暴击三件套：数字脉冲（上）+ 顿帧 + 6 火花 + 金环 + L1 震屏
          particles.spark(e.x, e.y, perf.low ? 4 : 6, theme.gold);
          particles.ring(e.x, e.y, theme.gold, 34, 12);
          if (perf.hitStop) hitStop = 2;
          shake(2, 3);
        } else if (!isPlayer && !isBurn) {
          particles.spark(e.x, e.y, perf.low ? 2 : 3, theme.paperDim);
        }
        // 技能命中（A1 补的 slot 字段；-1 = 普攻/灼烧）
        if (!isPlayer && !isBurn && e.slot >= 0 && e.slot <= 2) dispatchSkillHit(state, e);
        break;
      }
      case 'heal':
        addFloater(e.x, e.y - AUX.floaterOffsetY, '+' + e.value, { color: theme.heal });
        break;
      case 'shield':
        addFloater(e.x, e.y - AUX.floaterOffsetY, '盾 ' + e.value, { color: '#4FA8D8' });
        break;
      case 'death': {
        if (e.tier === 'boss') {
          // Boss：三波次崩解（0/6/12 tick）×1.5 尺寸 + 全屏渐亮 12t + L4
          crumble = { t: 0, x: e.x, y: e.y, done: [false, false, false] };
          whiteFlash = 12;
          shake(10, 12);
        } else {
          const n = e.tier === 'elite' ? 14 : 8;
          particles.burst(e.x, e.y, n, theme.ink2);
          const boost = Math.min(1.5, 1 + comboRing * 0.1);
          particles.ring(e.x, e.y, theme.ink3, 60 * boost, 12);
          if (e.tier === 'elite') shake(6, 6);
        }
        break;
      }
      case 'killCombo':
        comboRing = Math.min(5, Math.max(0, (e.value || 0) - 2));
        break;
      case 'skill':
        if (p) {
          particles.ring(e.x, e.y, theme.classColor[p.classId] || theme.gold);
          dashFrom = { x: e.x, y: e.y, name: e.name };
        }
        break;
      case 'dodge':
        trailDrop = -1;   // 重新计残影分段
        break;
      case 'dodgeSuccess': {
        dodgeFlash = 6 / 30;
        // 金白双色（无敌帧穿过红机制，A2 配对：同批 mechMiss red + dodgeSuccess）
        const paired = animClock - lastRedMissAt < 0.06;
        if (paired && p) {
          particles.ring(p.x, p.y, theme.gold, 40, 10);
          addFloater(p.x, p.y - 44, '闪！', { color: theme.gold });
        } else if (p) {
          addFloater(p.x, p.y - 40, '闪！', { color: theme.gold });
        }
        if (p) particles.ghost(p.x, p.y, 14, theme.paper);
        break;
      }
      case 'mechHit':
        mechFlash = 10 / 30;
        shake(8, 8);
        if (p) particles.ring(p.x, p.y, theme.warnRed, 30, 8);
        break;
      case 'mechMiss':
        if (e.color === 'red') lastRedMissAt = animClock;
        // 走出/躲过机制：6 粒灰白消散（落地扑空感）
        for (let i = 0; i < 6; i++) particles.glyph(p ? p.x : e.x, p ? p.y : e.y, '#8B95A8');
        break;
      case 'bossWarn':
        shake(3, 2);
        break;
      case 'levelUp':
        if (p) particles.ring(p.x, p.y, theme.gold);
        shake(5, 6);
        addFloater(p ? p.x : 195, p ? p.y - 60 : 300, 'Lv' + e.level, { color: theme.gold });
        break;
      default:
        break;
    }
  }

  // 技能命中表现（vfx §1.3：3 职业组模板 + 关键差异化参数）
  function dispatchSkillHit(state, e) {
    const p = state.player;
    const s = p && p.skills[e.slot];
    if (!s) return;
    const sk = getSkill(s.id);
    if (!sk) return;
    const key = e.slot * 1000 + (e.targetId || 0);
    hitCount[key] = (hitCount[key] || 0) + 1;
    const seg = hitCount[key];
    if (sk.classId === 'lishi') {
      // T-裂石：碎屑方块 + 地面裂纹环（橙红）
      particles.burst(e.x, e.y, perf.low ? 5 : 8, theme.accentLishi);
      particles.ring(e.x, e.y, theme.accentLishi, 40, 8);
    } else if (sk.classId === 'shushi') {
      // T-符光：菱形光点匀速散开（青蓝）
      const n = perf.low ? 4 : 6;
      for (let i = 0; i < n; i++) particles.glyph(e.x, e.y, theme.accentShushi);
    } else {
      // T-影刃：细长刀光线段快闪（翠绿），每 3 段一次震屏
      const base = Math.random() * Math.PI;
      for (let i = 0; i < 3; i++) particles.slash(e.x, e.y, base + (Math.random() - 0.5) * 1.2, theme.accentYouxia);
      if (seg % 3 === 0) shake(2, 2);
    }
    switch (s.id) {
      case 'handi':
        particles.ring(p.x, p.y, theme.gold, 120, 12);
        particles.ring(p.x, p.y, theme.gold, 90, 10);
        shake(4, 5);
        break;
      case 'suiyue':
        particles.burst(e.x, e.y, 4, theme.accentLishi, 1.2);
        shake(4, 5);
        break;
      case 'yingxi':
        particles.ghost(p.x - 12 * (p.facing || 1), p.y, 12, theme.paper);
        break;
      case 'zhuiying':
        if (dashFrom && seg === 1) {
          for (let i = 1; i <= 3; i++) {
            particles.ghost(dashFrom.x + (p.x - dashFrom.x) * i / 3, dashFrom.y + (p.y - dashFrom.y) * i / 3, 10, theme.paper);
          }
        }
        break;
      case 'wanling':
        particles.glyph(e.x, e.y - 34, theme.accentShushi);
        particles.glyph(e.x, e.y - 26, theme.paper);
        break;
      case 'bingfeng':
        for (let i = 0; i < 3; i++) particles.glyph(e.x, e.y - 10, '#BFE3F2');
        break;
      default:
        break;
    }
  }

  // ───── 背景层（离屏 drawImage + 平移/alpha，零逐帧渐变） ─────
  function drawScene(state, px, dtSec) {
    const key = state.chapter + ':' + renderer.ctx.canvas.width;
    if (!scene || scene.key !== key) {
      buildScene(state.chapter);
      scene.key = key;
    }
    // L0 天空
    ctx.drawImage(scene.sky, 0, 0, W, H);
    // L0.5 光斑（alpha 呼吸 ±0.04，周期 120 tick；降档停帧）
    const breathe = perf.breathing ? 0.04 * Math.sin(animClock * TAU * 30 / 120) : 0;
    if (scene.chapter === 3) {
      const lx = [60, 200, 330], ly = [110, 88, 126];
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 1 + breathe;
        ctx.drawImage(scene.lglow, lx[i] - 40, ly[i] - 40, 80, 80);
      }
    } else {
      ctx.globalAlpha = 1 + breathe;
      ctx.drawImage(scene.glow, 318 - 48, 52 - 48, 96, 96);
    }
    ctx.globalAlpha = 1;
    // L1–L3 视差
    const layers = perf ? perf.parallaxLayers : 3;
    const off = (x, par) => Math.max(-19, Math.min(19, (px - F.playerX) * par));
    ctx.drawImage(scene.l1, -20 - off(px, 0.02), 0, LW, H);
    ctx.drawImage(scene.l2, -20 - off(px, 0.05), 0, LW, H);
    if (layers >= 3) ctx.drawImage(scene.l3, -20 - off(px, 0.09), 0, LW, H);
    // 地面纹理
    ctx.drawImage(scene.ground, -20, H - 44, LW, 44);
    // A1 雾带 ×2（8 / 13 px/s 反向漂移，出屏回绕）
    if (perf.fogOn) {
      fogOff1 = (fogOff1 + 8 * dtSec) % LW;
      fogOff2 = (fogOff2 - 13 * dtSec + LW * 2) % LW;
      drawWrapped(scene.fog1, fogOff1, 180 - 18);
      drawWrapped(scene.fog2, fogOff2, 420 - 18);
    }
    // A2 尘埃（独立背景池；运动计算每 2 渲染帧一次）
    const dmax = perf.dustMax;
    const update = frameNo % 2 === 0;
    ctx.fillStyle = theme.dust;
    for (let i = 0; i < dmax; i++) {
      const d = dust[i];
      if (update) {
        d.y -= d.vy * dtSec * 2;
        if (d.y < -4) { d.y = 504; d.bx = Math.random() * 390; }
      }
      const dx = d.bx + Math.sin(animClock * TAU / d.per + d.ph) * d.amp;
      ctx.globalAlpha = d.a;
      ctx.fillRect(dx, d.y, d.s, d.s);
    }
    ctx.globalAlpha = 1;
    // A3 生成线
    ctx.strokeStyle = theme.ink3;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.25;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(0, toY(F.spawnY) + 0.5);
    ctx.lineTo(W, toY(F.spawnY) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function drawWrapped(img, xOffset, y) {
    let x = -xOffset;
    ctx.drawImage(img, x, y, LW, 36);
    if (x > 0) ctx.drawImage(img, x - LW, y, LW, 36);
    else if (x + LW < W) ctx.drawImage(img, x + LW, y, LW, 36);
  }

  // ───── 预警 / 区域层（vfx §4：红橙两档） ─────
  function drawHazards(state) {
    const p = state.player;
    for (let i = 0; i < state.hazards.length; i++) {
      const h = state.hazards[i];
      if (!h.active) continue;
      const cy = toY(h.cy);
      if (h.kind === 'zone') {
        // 危险区/安全区靠色相区分（红系=持续伤害，橙系=仅缓滞）
        const zc = h.fromPlayer ? theme.gold : (h.dps > 0 ? theme.warnRed : theme.warnOrange);
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = zc;
        ctx.beginPath(); ctx.arc(h.cx, cy, h.radius, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = zc;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.arc(h.cx, cy, h.radius, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        continue;
      }
      if (h.kind === 'delayed_damage') {
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = h.color || theme.gold;
        ctx.beginPath(); ctx.arc(h.cx, cy, h.radius, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      const isRed = h.color === 'red';
      const color = isRed ? theme.warnRed : theme.warnOrange;
      const t = Math.max(0, h.remaining) / Math.max(1, h.total);
      const elapsed = 1 - t;
      // 红色最后 12 tick 描边闪烁（6 tick/次）；橙不闪，最后 12 tick 描边压暗
      let strokeA;
      if (isRed) strokeA = (h.remaining <= 12) ? (Math.floor(h.remaining / 6) % 2 === 0 ? 0.9 : 0.3) : 0.9;
      else strokeA = h.remaining <= 12 ? 0.9 - (elapsed - (1 - 12 / Math.max(1, h.total))) * 0 : lerp(0.4, 0.9, t);

      // 填充：红恒 0.30；橙 0.22→0.30 呼吸脉冲（18 tick）
      ctx.globalAlpha = isRed ? 0.30 : 0.22 + 0.08 * (0.5 + 0.5 * Math.sin(animClock * TAU * 30 / 18));
      ctx.fillStyle = color;
      drawShapePath(h, cy);
      ctx.fill();
      // 判定帧爆闪（remaining ≤ 2）
      if (h.remaining <= 2) {
        ctx.globalAlpha = 0.55 * Math.max(0.2, h.remaining / 2);
        ctx.fillStyle = color;
        drawShapePath(h, cy);
        ctx.fill();
      }
      // 描边收缩：红 p^1.5 加速收缩；橙线性
      ctx.globalAlpha = strokeA;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      const shrink = isRed ? 6 * Math.pow(elapsed, 1.5) : 6 * elapsed;
      drawShapePath(h, cy, shrink);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // 橙机制：110px 推荐闪避方向箭头（alpha 0.8→0.3 随 remaining 递减）
      if (!isRed && p && h.remaining > 0) {
        const dxv = p.x - h.cx, dyv = p.y - h.cy;
        const dl = Math.hypot(dxv, dyv) || 1;
        const ux = dxv / dl, uy = dyv / dl;
        const ax = p.x + ux * 26, ay = toY(p.y + uy * 26);
        const ang = Math.atan2(uy, ux);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ang);
        ctx.globalAlpha = lerp(0.3, 0.8, t);
        ctx.fillStyle = theme.warnOrange;
        ctx.beginPath();
        ctx.moveTo(8, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawShapePath(h, cy, inset) {
    const ins = inset || 0;
    ctx.beginPath();
    if (h.shape === 'line') {
      const ang = Math.atan2(h.dirY, h.dirX);
      ctx.save();
      ctx.translate(h.originX, toY(h.originY));
      ctx.rotate(ang);
      const w = Math.max(4, h.width - ins * 2);
      ctx.rect(0, -w / 2, h.length, w);
      ctx.restore();
    } else if (h.shape === 'cone') {
      const ang = Math.atan2(h.dirY, h.dirX);
      ctx.save();
      ctx.translate(h.originX, toY(h.originY));
      ctx.rotate(ang);
      const r = Math.max(4, h.radius - ins);
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, -Math.PI / 3, Math.PI / 3);
      ctx.closePath();
      ctx.restore();
    } else {
      const r = Math.max(4, h.radius - ins);
      ctx.arc(h.cx, cy, r, 0, TAU);
    }
  }

  // ───── 敌人（art v2 正式造型：MONSTER_ART 模板 + 参数） ─────
  function drawEnemy(e, alpha) {
    const art = MONSTER_ART[e.defId] || { tpl: 0 };
    const x = e.active && e.prevX !== undefined ? lerp(e.prevX, e.x, alpha) : e.x;
    const y = e.active && e.prevY !== undefined ? lerp(e.prevY, e.y, alpha) : e.y;
    const cy = toY(y);
    const isBoss = e.tier === 'boss';
    const isElite = e.tier === 'elite';
    const flash = e.flashTicks > 0;
    // 暴击放大：跟随 flashTicks=5（1 + 0.06 × min(1, (flash-3)/2)）
    const critScale = 1 + 0.06 * Math.max(0, Math.min(1, (e.flashTicks - 3) / 2));
    const fill = flash ? '#8B95A8' : '#1A1F2B';
    const stroke = flash ? theme.paper : (art.tpl === 1 ? 'rgba(232,227,215,.35)' : '#0B0E14');
    const lw = isBoss ? 3 : (isElite ? 2 : 1.5);

    ctx.save();
    ctx.translate(x, cy);
    if (critScale !== 1) ctx.scale(critScale, critScale);

    if (isBoss) {
      // Boss 光晕（朱红环；降档线宽减半）
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = theme.vermilion;
      ctx.lineWidth = perf.glowLineWidth;
      ctx.beginPath(); ctx.arc(0, 0, 52, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
      drawBoss(art.tpl, fill, stroke, lw, flash);
    } else {
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      const T = art.tpl;
      if (T === 1) drawM1(art, fill, stroke, lw);
      else if (T === 2) drawM2(art, e, fill, stroke, lw);
      else if (T === 3) drawM3(art, fill, stroke, lw);
      else if (T === 4) drawM4(art, fill, stroke, lw);
      else if (T === 5) drawM5(art, fill, stroke, lw);
      else if (T === 6) drawM6(art, fill, stroke, lw);
      else drawBase(e.size, fill, stroke, lw);
      // 红眼：唯一危险信号（杂兵 5 / 精英 6）
      if (!art.ringEyes) {
        const es = isElite ? 6 : 5;
        const gap = 5 * (art.eyeGap || 1);
        ctx.fillStyle = theme.vermilion;
        ctx.fillRect(-gap - es / 2, -12 - es / 2, es, es);
        ctx.fillRect(gap - es / 2, -12 - es / 2, es, es);
      }
    }
    ctx.restore();

    // 头顶血条：仅精英 / Boss（art v2 §2：杂兵回归不画）
    if (isBoss || isElite) {
      const bw = isBoss ? 64 : 44;
      const bh = isBoss ? 6 : 4;
      const bx = x - bw / 2;
      const by = cy - (isBoss ? 74 : 46);
      ctx.fillStyle = 'rgba(11,14,20,.85)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = theme.vermilion;
      ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), bh);
      ctx.strokeStyle = theme.paperDim;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    }
  }

  // 通用几何基座（兜底）
  function drawBase(size, fill, stroke, lw) {
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = lw;
    if (size === 'small') {
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill(); ctx.stroke();
    } else if (size === 'medium') {
      roundRect(14, 20);
    } else {
      ctx.beginPath();
      ctx.moveTo(-20, -26); ctx.lineTo(20, -26); ctx.lineTo(26, 26); ctx.lineTo(-26, 26);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  function roundRect(w, h) {
    ctx.beginPath();
    ctx.moveTo(-w, -h + w);
    ctx.arc(0, -h + w, w, Math.PI, Math.PI * 1.5);
    ctx.lineTo(w, h - w);
    ctx.arc(0, h - w, w, 0, Math.PI * 0.5);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  // 1 笔纸白高光
  function hl(x1, y1, x2, y2) {
    ctx.save();
    ctx.strokeStyle = theme.highlight;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  // M1 纸身人形（medium 基座上竖纸片 18×34 + 符纸头）
  function drawM1(a, fill, stroke, lw) {
    const n = a.notches || 2;
    ctx.beginPath();
    ctx.moveTo(-9, -13);
    ctx.lineTo(9, -13);
    ctx.lineTo(9, 19);
    for (let i = 0; i < n; i++) {
      const x1 = 9 - (18 / n) * (i + 0.5);
      const x2 = 9 - (18 / n) * (i + 1);
      ctx.lineTo(x1, 13);
      ctx.lineTo(x2, 19);
    }
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 竖向折痕 1 条
    ctx.save();
    ctx.strokeStyle = theme.ink3; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 12); ctx.stroke();
    ctx.restore();
    if (a.cross) {
      ctx.strokeStyle = theme.paperDim; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-5, 2); ctx.lineTo(5, 8); ctx.moveTo(5, 2); ctx.lineTo(-5, 8); ctx.stroke();
    }
    if (a.arms) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-9, -6); ctx.lineTo(-13, 8);
      ctx.moveTo(9, -6); ctx.lineTo(13, 8);
      ctx.stroke();
    }
    if (a.beads) {
      ctx.strokeStyle = theme.ink3; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 6, 6, 0.3, Math.PI - 0.3); ctx.stroke();
      ctx.fillStyle = theme.ink3;
      for (let i = 0; i < 3; i++) ctx.fillRect(-4 + i * 4, 10 + Math.sin(i) * 2, 2, 2);
    }
    // 头：r7 圆 + 符纸 8×10
    ctx.beginPath(); ctx.arc(0, -17, 7, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = theme.highlight;
    ctx.fillRect(-4, -22, 8, 10);
    if (!a.blank) {
      ctx.strokeStyle = theme.vermilion; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -21); ctx.lineTo(-2, -18); ctx.lineTo(1, -15); ctx.lineTo(-1, -13);
      ctx.stroke();
    }
    hl(-7, -20, -5, -14);
  }

  // M2 悬浮灵体（small 基座 r14 球 + 火须 + 悬浮 bob）
  function drawM2(a, e, fill, stroke, lw) {
    const phase = (e.uid || 0) * 0.618;
    const bob = Math.sin((animClock * 30 + phase) * TAU / 40) * 3;
    ctx.translate(0, bob - 4);
    if (a.wings) {
      // 血蝠：两侧收拢翼膜，随 bob 开合 ±4
      const op = 4 + bob;
      ctx.beginPath();
      ctx.moveTo(-12, -4); ctx.lineTo(-24, -10 - op); ctx.lineTo(-20, 2); ctx.closePath();
      ctx.moveTo(12, -4); ctx.lineTo(24, -10 - op); ctx.lineTo(20, 2); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.fill(); ctx.stroke();
    if (a.bands) {
      ctx.strokeStyle = stroke; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-13, -6); ctx.lineTo(13, -6);
      ctx.moveTo(-13, 6); ctx.lineTo(13, 6);
      ctx.stroke();
    }
    // 内芯灯芯
    ctx.fillStyle = a.core || theme.paperDim;
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
    // 下摆火须
    const n = a.whiskers || 3;
    const len = a.longTail ? 16 : 9;
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke; ctx.lineWidth = 1.2;
    for (let i = 0; i < n; i++) {
      const fx = (i - (n - 1) / 2) * 7;
      ctx.beginPath();
      ctx.moveTo(fx - 3, 11);
      ctx.lineTo(fx, 11 + len + (i % 2) * 3);
      ctx.lineTo(fx + 3, 11);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    hl(-9, -8, -4, -11);
  }

  // M3 低伏兽形（横压扁胶囊 34×18 贴地 + 前伸头）
  function drawM3(a, fill, stroke, lw) {
    const segs = a.segments || 1;
    ctx.save();
    ctx.translate(0, 8);
    for (let i = 0; i < segs; i++) {
      const sx = (i - (segs - 1) / 2) * 13;
      ctx.beginPath();
      ctx.ellipse(sx, 0, 11, 9, 0, 0, TAU);
      ctx.fill(); ctx.stroke();
      if (i > 0) {
        ctx.save(); ctx.strokeStyle = theme.ink3; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx - 6, -8); ctx.lineTo(sx - 6, 8); ctx.stroke(); ctx.restore();
      }
    }
    // 背脊条带
    ctx.save();
    ctx.strokeStyle = theme.ink3; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(10, -8); ctx.stroke();
    ctx.restore();
    // 头 + 吻部尖角
    const hd = 17 + (segs - 1) * 6;
    ctx.beginPath(); ctx.arc(hd, -2, 7, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hd + 5, -4); ctx.lineTo(hd + 12, 0); ctx.lineTo(hd + 5, 2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (a.mask) {
      ctx.fillStyle = theme.highlight;
      ctx.fillRect(hd - 4, -6, 8, 8);
      ctx.strokeStyle = theme.vermilion; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hd - 2, -2); ctx.lineTo(hd + 2, 0); ctx.stroke();
    }
    // 腿
    ctx.strokeStyle = fill; ctx.lineWidth = 2;
    const legN = a.legs || 2;
    ctx.beginPath();
    for (let i = 0; i < legN; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const lx = (Math.floor(i / 2) - (Math.floor(legN / 2) - 0.5)) * 8 * -side;
      if (legN <= 2) {
        ctx.moveTo(side * 8, 7); ctx.lineTo(side * 8, 14);
      } else {
        ctx.moveTo(lx, 6); ctx.lineTo(lx - 2, 8); ctx.lineTo(lx, 14);
      }
    }
    ctx.stroke();
    // 尾
    if (a.tail) {
      ctx.strokeStyle = fill;
      ctx.beginPath();
      ctx.moveTo(-16, -2); ctx.lineTo(-16 - a.tail * 0.5, -6); ctx.lineTo(-16 - a.tail, -10);
      ctx.stroke();
      if (a.drop) {
        ctx.fillStyle = theme.accentShushi;
        ctx.fillRect(-16 - a.tail - 1, -12, 2, 2);
      }
    }
    ctx.restore();
    hl(-8, -12, -2, -14);
  }

  // M4 枝条蔓生（2–3 段竹节 + 叶 + 根须）
  function drawM4(a, fill, stroke, lw) {
    const segs = a.segs || 3;
    const bend = a.tendril ? 8 : 0;
    ctx.strokeStyle = fill;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 20);
    let px = 0, py = 20;
    for (let i = 0; i < segs; i++) {
      const nx = (i === segs - 1 ? bend : (i % 2 ? -3 : 3));
      const ny = py - 14;
      ctx.lineTo(nx, ny);
      // 节间横缝
      ctx.save();
      ctx.strokeStyle = theme.ink3; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(nx - 2, ny + 3); ctx.lineTo(nx + 2, ny + 3); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = fill; ctx.lineWidth = 4;
      px = nx; py = ny;
    }
    ctx.stroke();
    // 叶
    const leafN = a.leaves || 5;
    for (let i = 0; i < leafN; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const ly = 12 - (i % 3) * 12;
      const lx = px * (i / leafN) + side * 4;
      ctx.fillStyle = i < 2 ? theme.accentYouxia : fill;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + side * 10, ly - 4);
      ctx.lineTo(lx + side * 3, ly + 3);
      ctx.closePath();
      ctx.fill();
    }
    // 根须
    ctx.strokeStyle = fill; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-3, 20); ctx.lineTo(-6, 25);
    ctx.moveTo(0, 20); ctx.lineTo(0, 26);
    ctx.moveTo(3, 20); ctx.lineTo(6, 25);
    ctx.stroke();
    // 藤妖卷须（1px 二段折线近似螺旋）
    if (a.tendril) {
      ctx.strokeStyle = fill; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py); ctx.lineTo(px + 4, py - 6); ctx.lineTo(px, py - 10); ctx.lineTo(px + 3, py - 13);
      ctx.stroke();
    }
    hl(-2, 16, -2, 6);
  }

  // M5 翼形飞禽（水滴形 + V 形折线翼）
  function drawM5(a, fill, stroke, lw) {
    if (a.folded || a.hat) {
      // 檐鬼：升 large 基座（40×52 梯形）
      ctx.beginPath();
      ctx.moveTo(-16, -24); ctx.lineTo(16, -24); ctx.lineTo(22, 26); ctx.lineTo(-22, 26);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 收拢贴背双折线
      ctx.save(); ctx.strokeStyle = theme.ink3; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -18); ctx.lineTo(-4, 4); ctx.lineTo(-9, 16);
      ctx.moveTo(10, -18); ctx.lineTo(4, 4); ctx.lineTo(9, 16);
      ctx.stroke(); ctx.restore();
      // 前伸钩爪
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14, 10); ctx.lineTo(24, 12); ctx.lineTo(26, 20);
      ctx.moveTo(10, 16); ctx.lineTo(20, 20); ctx.lineTo(21, 26);
      ctx.stroke();
      // 斗笠
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(-9, -28); ctx.lineTo(9, -28); ctx.lineTo(0, -36);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      hl(-12, -20, -8, -12);
      return;
    }
    // 水滴身体
    ctx.beginPath();
    ctx.arc(0, -4, 10, Math.PI * 0.6, Math.PI * 2.4);
    ctx.lineTo(0, 16);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 双翼（两段折，翅尖上挑）
    const wp = a.wing || 12;
    ctx.save();
    ctx.strokeStyle = a.wing > 16 ? theme.ink3 : stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -6); ctx.lineTo(-6 - wp * 0.6, -12 - wp * 0.4); ctx.lineTo(-6 - wp, -6 - wp * 0.2);
    ctx.moveTo(6, -6); ctx.lineTo(6 + wp * 0.6, -12 - wp * 0.4); ctx.lineTo(6 + wp, -6 - wp * 0.2);
    ctx.stroke();
    ctx.restore();
    if (a.ears) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(-7, -12); ctx.lineTo(-4, -19); ctx.lineTo(-2, -12);
      ctx.moveTo(7, -12); ctx.lineTo(4, -19); ctx.lineTo(2, -12);
      ctx.closePath(); ctx.fill();
    }
    hl(-6, -10, -2, -12);
  }

  // M6 墩甲重装（large 梯形墩 + 半埋头 + 甲缝）
  function drawM6(a, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(-13, -20); ctx.lineTo(13, -20); ctx.lineTo(17, 24); ctx.lineTo(-17, 24);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // 肩线
    ctx.save(); ctx.strokeStyle = theme.ink3; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-13, -14); ctx.lineTo(13, -14); ctx.stroke();
    ctx.restore();
    // 甲缝 2–3 条
    ctx.save();
    ctx.strokeStyle = a.verdigris ? '#4E6E5A' : theme.ink3;
    ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      const sy = -6 + i * 12;
      ctx.beginPath();
      if (a.wavy) {
        for (let x = -14; x <= 14; x += 4) {
          if (x === -14) ctx.moveTo(x, sy + (x % 8 === 0 ? 1.5 : -1.5));
          else ctx.lineTo(x, sy + (x % 8 === 0 ? 1.5 : -1.5));
        }
      } else {
        ctx.moveTo(-14, sy); ctx.lineTo(14, sy);
      }
      ctx.stroke();
    }
    ctx.restore();
    if (a.rust) {
      ctx.fillStyle = '#5A4436';
      ctx.fillRect(5, -16, 8, 8);
    }
    if (a.drips) {
      ctx.fillStyle = theme.ink3;
      ctx.fillRect(-10, 18, 3, 5);
      ctx.fillRect(6, 20, 3, 4);
    }
    if (a.shield) {
      // 石卫巨盾：6×28 竖矩形 + 纸白盾缘
      ctx.fillStyle = fill;
      ctx.fillRect(20, -12, 6, 28);
      ctx.strokeRect(20, -12, 6, 28);
      ctx.save();
      ctx.strokeStyle = theme.highlight; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(20, -12); ctx.lineTo(20, 16); ctx.stroke();
      ctx.restore();
    }
    // 短臂
    ctx.strokeStyle = fill; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-16, -8); ctx.lineTo(-19, 6);
    ctx.moveTo(16, -8); ctx.lineTo(19, 6);
    ctx.stroke();
    // 半埋头 r8
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(0, -22, 8, Math.PI, TAU); ctx.fill(); ctx.stroke();
    if (a.ringEyes) {
      // 铜甲尸：6px 铜环眼（危险信号改由精英描边+血条承担）
      ctx.strokeStyle = '#4E6E5A'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-3, -24, 3, 0, TAU);
      ctx.moveTo(6, -24); ctx.arc(3, -24, 3, 0, TAU);
      ctx.stroke();
    }
    hl(-10, -16, -6, -10);
  }

  // Boss 独立造型（local 坐标 ×2.2 → 高 96–120）
  function drawBoss(tpl, fill, stroke, lw, flash) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    if (tpl === 'B1') {
      // 提灯姥姥：佝偻弧背 + 提灯 + 拖地长发 + 拐杖
      ctx.beginPath();
      ctx.moveTo(-14, 22);
      ctx.bezierCurveTo(-24, -4, -10, -30, 4, -24);
      ctx.lineTo(8, 4);
      ctx.lineTo(10, 22);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(7, -25, 7, 0, TAU); ctx.fill(); ctx.stroke();
      // 拖地长发 3 条
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(2, -20); ctx.lineTo(-4, 8); ctx.lineTo(-2, 22);
      ctx.moveTo(0, -22); ctx.lineTo(-8, 2); ctx.lineTo(-7, 22);
      ctx.moveTo(-2, -24); ctx.lineTo(-12, -2); ctx.lineTo(-11, 20);
      ctx.stroke();
      // 拐杖
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(14, 22); ctx.lineTo(12, -10); ctx.stroke();
      // 提灯臂 + 吊灯（灯芯呼吸 0.6–1.0，周期 50 tick，与「灯灭爆燃」同源）
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(6, -18); ctx.lineTo(24, -22); ctx.stroke();
      ctx.strokeStyle = theme.paperDim; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(24, -22); ctx.lineTo(24, -18); ctx.stroke();
      ctx.fillStyle = theme.highlight;
      ctx.fillRect(18, -18, 12, 16);
      ctx.strokeRect(18, -18, 12, 16);
      const la = 0.8 + 0.2 * Math.sin(animClock * TAU * 30 / 50);
      ctx.globalAlpha = la;
      ctx.fillStyle = theme.lantern;
      ctx.beginPath(); ctx.arc(24, -10, 3, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke; ctx.lineWidth = lw;
      // 发梢朱绳
      ctx.strokeStyle = theme.vermilion; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-11, 18); ctx.lineTo(-11, 22); ctx.stroke();
      hl(-12, -12, -6, -18);
    } else if (tpl === 'B2') {
      // 桥姬：纤细直影 + 桥形头冠 + 双水袖 + 下半身雾化渐隐
      ctx.beginPath();
      ctx.moveTo(-5, -24);
      ctx.quadraticCurveTo(-8, 0, -6, 2);
      ctx.lineTo(6, 2);
      ctx.quadraticCurveTo(8, 0, 5, -24);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -30, 7, 0, TAU); ctx.fill(); ctx.stroke();
      // 头冠：3 段折线拱「桥」
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-12, -34); ctx.lineTo(-6, -42); ctx.lineTo(0, -36); ctx.lineTo(6, -42); ctx.lineTo(12, -34);
      ctx.stroke();
      // 双水袖（±4 摆，周期 70 tick）
      const sw = Math.sin(animClock * TAU * 30 / 70) * 4;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-5, -16);
      ctx.bezierCurveTo(-16, -8 + sw, -20, 8, -18 + sw, 20);
      ctx.moveTo(5, -16);
      ctx.bezierCurveTo(16, -8 - sw, 20, 8, 18 - sw, 20);
      ctx.stroke();
      // 水袖内缘青 2px
      ctx.strokeStyle = theme.accentShushi; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-6, -14);
      ctx.bezierCurveTo(-15, -7 + sw, -18, 8, -16 + sw, 19);
      ctx.stroke();
      // 下半身雾化渐隐（alpha 1→0 分 4 段截断，不画脚）
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = 1 - (i + 1) / 4.5;
        const t0 = 2 + i * 5;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(-6, t0); ctx.lineTo(6, t0);
        ctx.lineTo(5 - i, t0 + 5); ctx.lineTo(-5 + i, t0 + 5);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
      hl(-3, -26, -1, -18);
    } else {
      // 黄泉戏班主：宽袖戏服大梯形 + 阴阳半脸面具 + 折扇 + 双肩翎子
      ctx.beginPath();
      ctx.moveTo(-18, -26); ctx.lineTo(18, -26); ctx.lineTo(26, 30); ctx.lineTo(-26, 30);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -32, 8, 0, TAU); ctx.fill(); ctx.stroke();
      // 袖缘朱红 2px
      ctx.strokeStyle = theme.vermilion; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-22, 26); ctx.lineTo(-26, 30);
      ctx.moveTo(22, 26); ctx.lineTo(26, 30);
      ctx.stroke();
      ctx.strokeStyle = stroke; ctx.lineWidth = lw;
      // 面具：14×18 纸白半脸 + 右半 7×18 朱红
      ctx.fillStyle = theme.highlight;
      ctx.fillRect(-7, -40, 14, 16);
      ctx.fillStyle = theme.vermilion;
      ctx.fillRect(0, -40, 7, 16);
      // 折扇（30° r=12 纸白扇面 + 朱骨线）
      ctx.save();
      ctx.translate(22, -14);
      ctx.rotate(-0.5);
      ctx.fillStyle = theme.highlight;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 12, -Math.PI / 2 - 0.26, -Math.PI / 2 + 0.26); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = theme.vermilion; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -12); ctx.stroke();
      ctx.restore();
      // 双肩翎子
      ctx.strokeStyle = fill; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -26); ctx.lineTo(-16, -44); ctx.lineTo(-13, -50);
      ctx.moveTo(10, -26); ctx.lineTo(16, -44); ctx.lineTo(13, -50);
      ctx.stroke();
      hl(-14, -20, -10, -12);
    }
  }

  // ───── 玩家（art v2 §1 三职业正式剪影，44×72，锚点=中心） ─────
  function drawPlayer(p, alpha) {
    const x = lerp(p.prevX, p.x, alpha);
    const y = lerp(p.prevY, p.y, alpha);
    const cy = toY(y);
    const accent = theme.classColor[p.classId] || theme.paper;
    const hurt = p.state === 'hurt';
    const flash = p.flashTicks > 0;
    const breath = Math.sin(animClock * Math.PI / 30) * 1.5;   // 60 tick 呼吸

    ctx.save();
    ctx.translate(x, cy + breath);
    if (p.facing < 0) ctx.scale(-1, 1);
    if (hurt || flash) ctx.translate((Math.random() - 0.5) * 2, 0);

    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.ink0;
    const bodyFill = hurt ? theme.playerHurt : (flash ? '#FFFFFF' : '#1A1F2B');
    ctx.fillStyle = bodyFill;

    if (p.classId === 'lishi') {
      // 披风（左肩到左膝单侧三角，随呼吸 ±3）
      ctx.save();
      ctx.fillStyle = '#161B25';
      ctx.beginPath();
      ctx.moveTo(-10, -30);
      ctx.lineTo(-16 - breath, 26);
      ctx.lineTo(-4, 24);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = theme.accentLishi; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-15 - breath, 24); ctx.lineTo(-9, -26); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = theme.ink0; ctx.lineWidth = 3; ctx.fillStyle = bodyFill;
      // 躯干宽梯形（肩 30 → 下摆 22）
      ctx.beginPath();
      ctx.moveTo(-15, -22); ctx.lineTo(15, -22); ctx.lineTo(11, 30); ctx.lineTo(-11, 30);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 衣纹 2 条斜线（腰际交叉）
      ctx.save();
      ctx.strokeStyle = theme.ink3; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-8, 4); ctx.lineTo(8, 12);
      ctx.moveTo(8, 4); ctx.lineTo(-8, 12);
      ctx.stroke(); ctx.restore();
      // 头 + 发髻
      ctx.beginPath(); ctx.arc(0, -26, 9, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3, -34); ctx.lineTo(3, -34); ctx.lineTo(0, -40); ctx.closePath();
      ctx.fill(); ctx.stroke();
      // 厚背刀（8×54 @x=20）：刃口纸白高光 + 刀背橙
      ctx.fillStyle = bodyFill;
      ctx.fillRect(20, -38, 8, 54);
      ctx.strokeRect(20, -38, 8, 54);
      ctx.strokeStyle = theme.highlight; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(20.5, -36); ctx.lineTo(20.5, 14); ctx.stroke();
      ctx.strokeStyle = theme.accentLishi;
      ctx.beginPath(); ctx.moveTo(26.5, -36); ctx.lineTo(26.5, 14); ctx.stroke();
      // 左肩头弧 1 笔
      hl(-12, -20, -6, -17);
    } else if (p.classId === 'shushi') {
      // A 形道袍（上段胶囊 → 底摆 34）
      ctx.beginPath();
      ctx.moveTo(-10, -26);
      ctx.arc(0, -26, 10, Math.PI, TAU);
      ctx.lineTo(17, 32);
      ctx.lineTo(-17, 32);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 道袍左摆竖高光
      hl(-14, 26, -13, 4);
      // 腰带青 2px
      ctx.strokeStyle = theme.accentShushi; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(9, -2); ctx.stroke();
      ctx.strokeStyle = theme.ink0; ctx.lineWidth = 3; ctx.fillStyle = bodyFill;
      // 头 + 高冠
      ctx.beginPath(); ctx.arc(0, -32, 8, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3, -39); ctx.lineTo(3, -39); ctx.lineTo(0, -49); ctx.closePath();
      ctx.fill(); ctx.stroke();
      // 持符手 + 符纸（纸白 + 青焰符纹）
      ctx.strokeStyle = theme.ink0; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(8, -18); ctx.lineTo(15, -22); ctx.stroke();
      ctx.fillStyle = theme.highlight;
      ctx.fillRect(13, -30, 6, 10);
      ctx.strokeStyle = theme.accentShushi; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(16, -28); ctx.lineTo(15, -25); ctx.lineTo(17, -22); ctx.stroke();
      // 头顶青焰光点（alpha 0.5–0.9，周期 45 tick）
      const fa = 0.7 + 0.2 * Math.sin(animClock * TAU * 30 / 45);
      ctx.globalAlpha = fa;
      ctx.fillStyle = theme.accentShushi;
      ctx.beginPath(); ctx.arc(0, -53, 4, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      // 游侠：倒三角躯干 + 短披风
      ctx.save();
      ctx.fillStyle = '#161B25';
      ctx.beginPath();
      ctx.moveTo(8, -22);
      ctx.lineTo(15 + breath, 6);
      ctx.lineTo(3, 8);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = theme.accentYouxia; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(14 + breath, 5); ctx.lineTo(8, -20); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = theme.ink0; ctx.lineWidth = 3; ctx.fillStyle = bodyFill;
      ctx.beginPath();
      ctx.moveTo(-12, -20); ctx.lineTo(12, -20); ctx.lineTo(6, 8); ctx.lineTo(-6, 8);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-6, 8); ctx.lineTo(6, 8); ctx.lineTo(5, 26); ctx.lineTo(-5, 26);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 腰带翠 2px
      ctx.strokeStyle = theme.accentYouxia; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-6, 8); ctx.lineTo(6, 8); ctx.stroke();
      ctx.strokeStyle = theme.ink0; ctx.lineWidth = 3; ctx.fillStyle = bodyFill;
      // 头 + 兜帽（240° 弧，露脸缺口朝行进方向）
      ctx.beginPath(); ctx.arc(0, -26, 8, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -26, 10, -Math.PI * 0.67, Math.PI * 0.33); ctx.stroke();
      // 箭袋（3 羽尾 + 袋）
      ctx.strokeStyle = theme.ink3; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -18); ctx.lineTo(-13, -26);
      ctx.moveTo(-7, -17); ctx.lineTo(-10, -25);
      ctx.moveTo(-4, -16); ctx.lineTo(-7, -24);
      ctx.stroke();
      // 弓（拉满态）+ 纸白弦
      ctx.strokeStyle = theme.ink0; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(18, -34); ctx.quadraticCurveTo(32, -12, 18, 10); ctx.stroke();
      ctx.strokeStyle = theme.highlight; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(18, -34); ctx.lineTo(18, 10); ctx.stroke();
      // 左肩 1 笔
      hl(-10, -18, -5, -16);
    }
    ctx.restore();

    // 闪避状态：本体描边加 1px 白高亮（无敌帧可读信号）
    if (p.state === 'dodge' && p.dodgeTicks < D.invulnTicks) {
      ctx.strokeStyle = 'rgba(245,240,228,.9)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, cy, 30, 0, TAU); ctx.stroke();
    }
    // 护盾光环（铁壁金 / 灵盾青，降档线宽减半）
    if (p.shield > 0) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = p.shieldBurst ? theme.gold : '#4FA8D8';
      ctx.lineWidth = perf.low ? 1 : 2;
      ctx.beginPath(); ctx.arc(x, cy, 34, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 施法进度弧（cast 前摇可视化）
    if (p.state === 'cast' && p.castTicks > 0) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, cy, 40, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p.stateTicks / p.castTicks));
      ctx.stroke();
    }

    // 头顶耐力条（宽 44，仅 < 100 时显示，§8.2）
    if (p.stamina < D.staminaMax - 0.5) {
      const sw = balance.fx.playerStaminaBarW;
      ctx.fillStyle = 'rgba(11,14,20,.7)';
      ctx.fillRect(x - sw / 2, cy - 56, sw, 4);
      ctx.fillStyle = theme.gold;
      ctx.fillRect(x - sw / 2, cy - 56, sw * Math.max(0, p.stamina / D.staminaMax), 4);
    }
  }

  // ───── 弹道 ─────
  function drawProjectiles(state, alpha) {
    for (let i = 0; i < state.projectiles.length; i++) {
      const pr = state.projectiles[i];
      if (!pr.active || pr.delayTicks > 0) continue;
      const x = lerp(pr.prevX, pr.x, alpha);
      const y = toY(lerp(pr.prevY, pr.y, alpha));
      ctx.fillStyle = pr.fromPlayer ? (state.player ? theme.classColor[state.player.classId] : theme.gold) : theme.warnOrange;
      ctx.beginPath();
      ctx.arc(x, y, pr.fromPlayer ? 4 : 5, 0, TAU);
      ctx.fill();
      if (perf.trails) {
        // 拖尾（降档关闭：只画本体圆）
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(x - (pr.x - pr.prevX) * 2, y - (pr.y - pr.prevY) * 2, 3, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  // ───── 飘字（§8.2 + art §4.4：easeOutQuad 上飘 + 横漂 + 暴击朱砂印） ─────
  function drawFloaters(dt) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < floaters.length; i++) {
      const f = floaters[i];
      if (!f.active) continue;
      f.life -= dt * 30;
      if (f.life <= 0) { f.active = false; continue; }
      const t = f.life / f.total;                    // 1 → 0
      const ease = 1 - (1 - (1 - t)) * (1 - (1 - t)); // easeOutQuad(u), u = 1-t
      const rise = ease * balance.fx.floaterRisePx;
      const drift = Math.sin((1 - t) * Math.PI) * 6 * f.drift;
      const y0 = toY(f.y);
      if (y0 < 10) continue;                         // 不越过 y=96（canvas 顶）
      const fontPx = f.crit ? balance.fx.floaterCritFontPx : balance.fx.floaterFontPx;
      const scalePulse = f.crit ? 1 + 0.25 * Math.sin(Math.min(1, (1 - t) * 3) * Math.PI) : 1;
      ctx.save();
      ctx.translate(f.x + drift, y0 - rise);
      ctx.scale(scalePulse, scalePulse);
      ctx.font = `bold ${fontPx}px ${theme.fontNum}`;
      ctx.globalAlpha = Math.min(1, t * 2.2);
      ctx.lineWidth = balance.fx.floaterStrokePx;
      ctx.strokeStyle = f.stroke;
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      // 暴击朱砂印：右上角 4×4 方块旋转 12°
      if (f.crit && perf.critSeal) {
        ctx.save();
        ctx.translate(fontPx * 0.42, -fontPx * 0.34);
        ctx.rotate(12 * Math.PI / 180);
        ctx.fillStyle = theme.vermilion;
        ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ───── vignette（渐变缓存复用，alpha 用 globalAlpha 调制；降档改四边色带） ─────
  let vigRed = null, vigWhite = null;
  function drawVignettes() {
    const redA = mechFlash > 0 ? Math.min(0.55, mechFlash * 3) : (hurtFlash > 0 ? Math.min(0.6, hurtFlash) : 0);
    if (redA > 0) {
      if (!vigRed) {
        vigRed = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
        vigRed.addColorStop(0, 'rgba(200,54,43,0)');
        vigRed.addColorStop(1, 'rgba(200,54,43,1)');
      }
      ctx.globalAlpha = redA;
      ctx.fillStyle = perf.low ? 'rgba(200,54,43,1)' : vigRed;
      if (perf.low) {
        // 四边静态色带（去径向渐变）
        ctx.globalAlpha = redA * 0.5;
        ctx.fillRect(0, 0, W, 26); ctx.fillRect(0, H - 26, W, 26);
        ctx.fillRect(0, 0, 18, H); ctx.fillRect(W - 18, 0, 18, H);
      } else {
        ctx.fillRect(0, 0, W, H);
      }
    }
    if (dodgeFlash > 0) {
      if (!vigWhite) {
        vigWhite = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
        vigWhite.addColorStop(0, 'rgba(245,240,228,0)');
        vigWhite.addColorStop(1, 'rgba(245,240,228,1)');
      }
      ctx.globalAlpha = Math.min(0.5, dodgeFlash * 2);
      ctx.fillStyle = perf.low ? 'rgba(245,240,228,1)' : vigWhite;
      if (perf.low) {
        ctx.globalAlpha = Math.min(0.25, dodgeFlash);
        ctx.fillRect(0, 0, W, 20); ctx.fillRect(0, H - 20, W, 20);
      } else {
        ctx.fillRect(0, 0, W, H);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ───── 主入口 ─────
  function draw(state, alpha, dtSec) {
    renderer.begin();
    frameNo += 1;
    animClock += dtSec;
    lastState = state;
    const p = state.player;
    ctx.save();
    // 震屏（顿帧期间冻结衰减）
    if (hitStop <= 0 && shakeT > 0) {
      shakeT -= dtSec;
      if (shakeT <= 0) shakeAmt = 0;
      ctx.translate((Math.random() - 0.5) * 2 * shakeAmt, (Math.random() - 0.5) * 2 * shakeAmt);
    }

    drawScene(state, p ? p.x : F.playerX, dtSec);
    if (!p) { ctx.restore(); drawVignettes(); return; }

    drawHazards(state);

    // 敌人
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.active && e.hp > 0) drawEnemy(e, alpha);
    }
    // 玩家
    if (p.alive || p.state === 'dead') drawPlayer(p, alpha);

    drawProjectiles(state, alpha);
    particles.draw(ctx, toY);
    drawFloaters(dtSec);
    ctx.restore();

    // Boss 死亡全屏渐亮（12 tick：0→0.6→0）
    if (whiteFlash > 0) {
      whiteFlash -= dtSec * 30;
      ctx.globalAlpha = 0.6 * Math.sin(Math.PI * Math.max(0, whiteFlash) / 12);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    drawVignettes();

    // 衰减 flashes（顿帧期间冻结）
    if (hitStop > 0) { hitStop -= 1; return; }
    if (hurtFlash > 0) hurtFlash = Math.max(0, hurtFlash - dtSec * 2.5);
    if (dodgeFlash > 0) dodgeFlash = Math.max(0, dodgeFlash - dtSec * 5);
    if (mechFlash > 0) mechFlash = Math.max(0, mechFlash - dtSec * 3);
  }

  function update(dtSec) {
    // 顿帧：粒子更新暂停（≈2 渲染帧），逻辑 tick 不受影响
    if (hitStop > 0) return;
    particles.update(dtSec);
    // Boss 三波次崩解（0/6/12 tick）
    if (crumble) {
      crumble.t += dtSec * 30;
      const waves = [[0, 8], [6, 8], [12, 6]];
      for (let i = 0; i < 3; i++) {
        if (!crumble.done[i] && crumble.t >= waves[i][0]) {
          crumble.done[i] = true;
          particles.burst(crumble.x, crumble.y, waves[i][1], theme.ink2, 1.5);
        }
        if (crumble.t > 24) break;
      }
      if (crumble.t > 24) crumble = null;
    }
    // 闪避残影拖尾：位移期（0–9t）每 3 tick 1 个 ghost，共 3 个
    const p = lastState && lastState.player;
    if (p && p.state === 'dodge' && p.dodgeTicks < D.moveTicks) {
      const seg = Math.floor(p.dodgeTicks / 3);
      if (seg !== trailDrop && p.dodgeTicks < 9) {
        trailDrop = seg;
        particles.ghost(p.x, p.y, 14, theme.paper);
      }
    }
    // 狂血蒸汽（受伤加深 buff 期间，2 粒/tick 近似 → 每 3 渲染帧 1 粒）
    if (p && p.alive && p.takenDamageAmp > 0 && frameNo % 2 === 0) {
      particles.glyph(p.x + (Math.random() - 0.5) * 16, p.y - 20, theme.warnRed);
    }
    // 疾风残影拖尾（攻速 buff 且非狂血：普攻期间留 ghost）
    if (p && p.alive && p.hasteBuffTicks > 0 && !(p.takenDamageAmp > 0) && p.state === 'attack' && frameNo % 6 === 0) {
      particles.ghost(p.x, p.y, 12, theme.paper);
    }
  }

  function clearFx() {
    particles.clear();
    for (let i = 0; i < floaters.length; i++) floaters[i].active = false;
    hurtFlash = dodgeFlash = mechFlash = whiteFlash = 0;
    shakeAmt = 0; shakeT = 0; hitStop = 0;
    hitCount = {};
    crumble = null;
    dashFrom = null;
    comboRing = 0;
    lastRedMissAt = -10;
  }

  return { draw, update, handleEvent, clearFx, shake };
}
