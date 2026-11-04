// src/render/worldRenderer.js —— [R] 实体/背景/预警/弹道/飘字，签名 draw(state, alpha)
// 只读 state；可移动实体用 lerp(prevX, x, alpha) 插值；新生成/已销毁实体不插值（tech §3.2）。
// 占位美术按 art_direction_v1.md §2：几何剪影 + 三层视差折线 + 描边飘字。
import { balance, theme, getSkill } from '../core/tables.js';

const F = balance.field;
const D = balance.dodge;
const AUX = balance.aux;

// ───── 确定性折线背景（初始化时生成一次，不逐帧随机） ─────
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

const lerp = (a, b, t) => a + (b - a) * t;

export function createWorldRenderer(renderer, particles, perf, settings) {
  const { ctx } = renderer;
  const W = 390;
  const H = 500;
  const toY = (y) => y - F.canvasY;

  const ridges = [
    makeRidge(7, 210, 90, 70, W),    // 远山（弱）
    makeRidge(31, 268, 60, 52, W),    // 屋檐
    makeRidge(97, 330, 34, 42, W),    // 枯枝
  ];
  const ridgeAlpha = [0.5, 0.7, 1.0];

  // ───── 飘字池（§8.2：同屏上限、上飘 40px、重叠上移 22px） ─────
  const floaters = [];
  for (let i = 0; i < 16; i++) {
    floaters.push({ active: false, x: 0, y: 0, text: '', crit: false, color: '', stroke: '', life: 0, total: 18 });
  }

  let shakeAmt = 0;
  let shakeT = 0;
  let hurtFlash = 0;      // 玩家承伤 vignette 0..1
  let dodgeFlash = 0;     // 闪避成功白 vignette
  let mechFlash = 0;      // 机制命中红 vignette
  let chapter = 1;

  function addFloater(x, y, text, opts) {
    const cap = perf ? perf.floaterMax : 12;
    let used = 0;
    let free = null;
    for (let i = 0; i < floaters.length; i++) {
      if (floaters[i].active) used += 1;
      else if (!free) free = floaters[i];
    }
    if (!free || used >= cap) return;   // 超上限丢弃（新数字优先级低于存量旧数字则挤掉最旧）
    // 重叠检测：x/y 接近则上移 22px（最多 2 次）
    let yy = y;
    let lifts = 0;
    for (let k = 0; k < 2; k++) {
      let overlap = false;
      for (let i = 0; i < floaters.length; i++) {
        const f = floaters[i];
        if (!f.active) continue;
        if (Math.abs(f.x - x) < 44 && Math.abs(f.y - yy) < 18) { overlap = true; break; }
      }
      if (!overlap) break;
      yy -= 22;
      lifts += 1;
    }
    free.active = true;
    free.x = x; free.y = yy;
    free.text = String(text);
    free.crit = !!(opts && opts.crit);
    free.color = (opts && opts.color) || theme.paper;
    free.stroke = (opts && opts.stroke) || theme.ink0;
    free.life = free.total = balance.fx.floaterLifeTicks;
  }

  function shake(px, ticks) {
    if (px > shakeAmt || shakeT <= 0) { shakeAmt = px; shakeT = ticks / 30; }
  }

  // ───── 事件 → 视觉/听觉反馈入口（main.js drain 后调用） ─────
  function handleEvent(state, e) {
    const p = state.player;
    switch (e.type) {
      case 'damage': {
        if (!settings.showDamage && !e.crit) break;
        const isPlayer = e.kind === 'player';
        const isBurn = e.kind === 'burn';
        addFloater(e.x, e.y - AUX.floaterOffsetY, e.value, {
          crit: e.crit,
          color: e.crit ? theme.gold : (isPlayer ? theme.playerHurt : (isBurn ? '#E8734A' : theme.paper)),
          stroke: e.crit ? '#7A2E22' : theme.ink0,
        });
        if (e.crit) { shake(2, 3); particles.spark(e.x, e.y, 6, theme.gold); }
        else if (!isPlayer && !isBurn) particles.spark(e.x, e.y, 3, theme.paperDim);
        break;
      }
      case 'heal':
        addFloater(e.x, e.y - AUX.floaterOffsetY, '+' + e.value, { color: theme.heal });
        break;
      case 'shield':
        addFloater(e.x, e.y - AUX.floaterOffsetY, '盾 ' + e.value, { color: '#4FA8D8' });
        break;
      case 'death':
        particles.burst(e.x, e.y, e.tier === 'boss' ? 22 : 8, theme.ink2);
        particles.ring(e.x, e.y, theme.ink3);
        if (e.tier === 'elite' || e.tier === 'boss') shake(6, 6);
        break;
      case 'skill':
        if (p) particles.ring(e.x, e.y, theme.classColor[p.classId] || theme.gold);
        break;
      case 'dodge':
        break;
      case 'dodgeSuccess':
        dodgeFlash = 6 / 30;
        if (p) {
          addFloater(p.x, p.y - 40, '闪！', { color: theme.gold });
          particles.ghost(p.x, p.y, 14, theme.paper);
        }
        break;
      case 'mechHit':
        mechFlash = 10 / 30;
        shake(8, 8);
        break;
      case 'bossWarn':
        shake(3, 2);
        break;
      case 'levelUp':
        if (p) particles.ring(p.x, p.y, theme.gold);
        shake(5, 6);
        addFloater(p ? p.x : 195, p ? p.y - 60 : 300, 'Lv' + e.level, { color: theme.gold });
        break;
      case 'potion':
        break;
      case 'nodeClear':
        break;
      case 'battleWin':
      case 'battleLose':
        break;
      default:
        break;
    }
  }

  // ───── 背景层 ─────
  function drawBackground(px) {
    // 垂直渐变 #0B0E14 → #12161F
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, theme.ink0);
    g.addColorStop(1, theme.ink1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 残月（32px，#E8E3D7 alpha 0.35）
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = theme.paperDim;
    ctx.beginPath();
    ctx.arc(318, 52, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.ink0;
    ctx.beginPath();
    ctx.arc(311, 47, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 视差折线（3 层，越近偏移越大）
    const layers = perf ? perf.parallaxLayers : 3;
    for (let i = 0; i < layers; i++) {
      const par = (i + 1) * 0.02;
      const off = (px - F.playerX) * par;
      ctx.globalAlpha = ridgeAlpha[i];
      ctx.fillStyle = theme.ink2;
      ctx.beginPath();
      ctx.moveTo(-30, H);
      const pts = ridges[i];
      for (let k = 0; k < pts.length; k++) {
        ctx.lineTo(pts[k][0] - off, toY(pts[k][1]));
      }
      ctx.lineTo(W + 30, H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 地平线 + 生成线
    ctx.strokeStyle = theme.ink3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, toY(F.activeBottom) + 0.5);
    ctx.lineTo(W, toY(F.activeBottom) + 0.5);
    ctx.stroke();
    ctx.globalAlpha = 0.25;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(0, toY(F.spawnY) + 0.5);
    ctx.lineTo(W, toY(F.spawnY) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // ───── 预警 / 区域层（角色之下） ─────
  function drawHazards(state) {
    for (let i = 0; i < state.hazards.length; i++) {
      const h = state.hazards[i];
      if (!h.active) continue;
      const cy = toY(h.cy);
      if (h.kind === 'zone') {
        // 持续区域：橙色 alpha 0.18 填充 + 虚线边
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = h.fromPlayer ? theme.gold : theme.warnOrange;
        ctx.beginPath();
        ctx.arc(h.cx, cy, h.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = h.fromPlayer ? theme.gold : theme.warnOrange;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(h.cx, cy, h.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        continue;
      }
      if (h.kind === 'delayed_damage') {
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = h.color || theme.gold;
        ctx.beginPath();
        ctx.arc(h.cx, cy, h.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      // telegraph：填充 alpha 0.30 + 3px 描边，描边随剩余时间收缩（§8.2 / §6.3）
      const isRed = h.color === 'red';
      const color = isRed ? theme.warnRed : theme.warnOrange;
      const t = Math.max(0, h.remaining) / Math.max(1, h.total);
      // 红色最后 12 tick 闪烁（频率 6 tick/次）
      let visible = true;
      if (isRed && h.remaining <= 12) visible = Math.floor(h.remaining / 6) % 2 === 0;

      ctx.globalAlpha = 0.30;
      ctx.fillStyle = color;
      drawShapePath(h, cy);
      ctx.fill();
      ctx.globalAlpha = visible ? 0.9 : 0.3;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      const shrink = (1 - t) * 6;
      drawShapePath(h, cy, shrink);
      ctx.stroke();
      ctx.globalAlpha = 1;
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
      const l = h.length;
      ctx.rect(0, -w / 2, l, w);
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
      ctx.arc(h.cx, cy, r, 0, Math.PI * 2);
    }
  }

  // ───── 敌人（几何剪影 + 红眼；受击闪白） ─────
  // 占位期可见性（P0 亲检）：#1A1F2B 剪影在 #0B0E14/#12161F 战场底上明度比 <1.4:1，
  // 肉眼不可辨（HP 在掉但看不到敌人在哪）。占位期升对比：填充 #2A3140（Boss #3A465C）、
  // 描边纸白（Boss 朱红 3px）、红眼 5px（Boss 8px）、全员头顶小血条。
  // 阶段3 正式美术落地后按 art_direction_v1.md §2 回归原配色（届时再评估杂兵血条去留）。
  function drawEnemy(e, alpha) {
    const x = e.active && e.prevX !== undefined ? lerp(e.prevX, e.x, alpha) : e.x;
    const y = e.active && e.prevY !== undefined ? lerp(e.prevY, e.y, alpha) : e.y;
    const cy = toY(y);
    const isBoss = e.tier === 'boss';
    const scale = isBoss ? 2.2 : 1;
    const flash = e.flashTicks > 0;
    const fill = flash ? '#8B95A8' : (isBoss ? '#3A465C' : '#2A3140');
    const stroke = flash ? theme.paper : (isBoss ? theme.vermilion : theme.paper);

    ctx.save();
    ctx.translate(x, cy);
    if (isBoss) {
      // Boss 光晕（6px #C8362B alpha 0.30）
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = theme.vermilion;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, 52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = isBoss ? 3 : 1.5;
    const s = e.size;
    if (s === 'small') {
      ctx.beginPath();
      ctx.arc(0, 0, 16 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (s === 'medium') {
      // 胶囊 28×40
      const w = 28 * scale / 2, h = 40 * scale / 2;
      ctx.beginPath();
      ctx.moveTo(-w, -h + w);
      ctx.arc(-w + w, -h + w, w, Math.PI, Math.PI * 1.5);
      ctx.lineTo(w, h - w);
      ctx.arc(w - w + w, h - w, w, 0, Math.PI * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // 梯形 40×52（上窄下宽）+ Boss 更大
      const w1 = 20 * scale, w2 = 26 * scale, h = 52 * scale / 2;
      ctx.beginPath();
      ctx.moveTo(-w1, -h);
      ctx.lineTo(w1, -h);
      ctx.lineTo(w2, h);
      ctx.lineTo(-w2, h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // 眼睛：朱红方块（Boss 8px / 杂兵 5px），夜色中的唯一定位信号
    ctx.fillStyle = theme.vermilion;
    const ey = -8 * scale;
    const ex = 7 * scale;
    const es = isBoss ? 8 : 5;
    ctx.fillRect(-ex - es / 2, ey - es / 2, es, es);
    ctx.fillRect(ex - es / 2, ey - es / 2, es, es);
    ctx.restore();

    // 头顶血条：占位期全员显示（实时战斗的基本信息；art §4 原定杂兵不画，
    // 因占位剪影难辨伤势，先全员显示，阶段3 换正式美术后再评估回归）
    const bw = isBoss ? 64 : (e.size === 'small' ? 28 : (e.size === 'medium' ? 36 : 44));
    const bh = isBoss ? 6 : 4;
    const bx = x - bw / 2;
    const by = cy - (isBoss ? 74 : 40);
    ctx.fillStyle = 'rgba(11,14,20,.85)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = theme.vermilion;
    ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), bh);
    ctx.strokeStyle = theme.paperDim;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  }

  // ───── 玩家（职业剪影 44×72，3px #0B0E14 压边） ─────
  function drawPlayer(p, alpha) {
    const x = lerp(p.prevX, p.x, alpha);
    const y = lerp(p.prevY, p.y, alpha);
    const cy = toY(y);
    const color = theme.classColor[p.classId] || theme.paper;
    const hurt = p.state === 'hurt';
    const flash = p.flashTicks > 0;

    ctx.save();
    ctx.translate(x, cy);
    if (p.facing < 0) ctx.scale(-1, 1);
    if (hurt || flash) ctx.translate((Math.random() - 0.5) * 2, 0);   // 受击微抖（纯视觉）

    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.ink0;
    ctx.fillStyle = hurt ? theme.playerHurt : (flash ? '#FFFFFF' : color);

    if (p.classId === 'lishi') {
      // 宽梯形躯干 + 竖矩形武器
      ctx.beginPath();
      ctx.moveTo(-14, -30);
      ctx.lineTo(14, -30);
      ctx.lineTo(18, 26);
      ctx.lineTo(-18, 26);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // 头
      ctx.beginPath();
      ctx.arc(0, -34, 9, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // 武器（竖矩形）
      ctx.fillStyle = theme.paperDim;
      ctx.fillRect(20, -44, 6, 52);
      ctx.strokeRect(20, -44, 6, 52);
    } else if (p.classId === 'shushi') {
      // 细长胶囊 + 头顶 8px 光点
      ctx.beginPath();
      const w = 10, h = 30;
      ctx.moveTo(-w, -h + w);
      ctx.arc(0, -h + w, w, Math.PI, Math.PI * 1.5);
      ctx.lineTo(w, h - w);
      ctx.arc(0, h - w, w, 0, Math.PI * 0.5);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -38, 7, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // 头顶光点
      ctx.fillStyle = '#4FA8D8';
      ctx.beginPath();
      ctx.arc(0, -52, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 游侠：倒三角 + 斜线弓
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(16, 22);
      ctx.lineTo(-16, 22);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -34, 8, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // 弓（斜线）
      ctx.strokeStyle = theme.paperDim;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(22, -38);
      ctx.quadraticCurveTo(34, -6, 22, 26);
      ctx.stroke();
    }
    ctx.restore();

    // 施法进度弧（cast 前摇可视化）
    if (p.state === 'cast' && p.castTicks > 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, cy, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.stateTicks / p.castTicks));
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
    // 护盾光环
    if (p.shield > 0) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#4FA8D8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, cy, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
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
      ctx.arc(x, y, pr.fromPlayer ? 4 : 5, 0, Math.PI * 2);
      ctx.fill();
      // 拖尾
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(x - (pr.x - pr.prevX) * 2, y - (pr.y - pr.prevY) * 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ───── 飘字（§8.2 / art §2：bold 20px 等宽 + 3px 描边；暴击 28） ─────
  function drawFloaters(dt) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < floaters.length; i++) {
      const f = floaters[i];
      if (!f.active) continue;
      f.life -= dt * 30;
      if (f.life <= 0) { f.active = false; continue; }
      const t = f.life / f.total;
      const rise = (1 - t) * balance.fx.floaterRisePx;
      const y = toY(f.y) - rise;
      if (toY(f.y) < 10) continue;                 // 不越过 y=96（canvas 顶）
      const fontPx = f.crit ? balance.fx.floaterCritFontPx : balance.fx.floaterFontPx;
      // 暴击缩放脉冲 1.0→1.25→1.0
      const scalePulse = f.crit ? 1 + 0.25 * Math.sin(Math.min(1, (1 - t) * 3) * Math.PI) : 1;
      ctx.save();
      ctx.translate(f.x, y);
      ctx.scale(scalePulse, scalePulse);
      ctx.font = `bold ${fontPx}px ${theme.fontNum}`;
      ctx.globalAlpha = Math.min(1, t * 2.2);
      ctx.lineWidth = balance.fx.floaterStrokePx;
      ctx.strokeStyle = f.stroke;
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ───── 全屏 vignette ─────
  function drawVignettes() {
    if (hurtFlash > 0 || mechFlash > 0) {
      const a = mechFlash > 0 ? Math.min(0.55, mechFlash * 3) : Math.min(0.6, Math.max(0.15, hurtFlash));
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, 'rgba(200,54,43,0)');
      g.addColorStop(1, `rgba(200,54,43,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (dodgeFlash > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, 'rgba(245,240,228,0)');
      g.addColorStop(1, `rgba(245,240,228,${Math.min(0.5, dodgeFlash * 2)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ───── 主入口 ─────
  function draw(state, alpha, dtSec) {
    renderer.begin();
    const p = state.player;
    ctx.save();
    // 震屏
    if (shakeT > 0) {
      shakeT -= dtSec;
      if (shakeT <= 0) shakeAmt = 0;
      ctx.translate((Math.random() - 0.5) * 2 * shakeAmt, (Math.random() - 0.5) * 2 * shakeAmt);
    }

    drawBackground(p ? p.x : F.playerX);
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
    drawVignettes();

    // 衰减 flashes
    if (hurtFlash > 0) hurtFlash = Math.max(0, hurtFlash - dtSec * 2.5);
    if (dodgeFlash > 0) dodgeFlash = Math.max(0, dodgeFlash - dtSec * 5);
    if (mechFlash > 0) mechFlash = Math.max(0, mechFlash - dtSec * 3);
  }

  function update(dtSec) {
    particles.update(dtSec);
  }

  function clearFx() {
    particles.clear();
    for (let i = 0; i < floaters.length; i++) floaters[i].active = false;
    hurtFlash = dodgeFlash = mechFlash = 0;
    shakeAmt = 0; shakeT = 0;
  }

  return { draw, update, handleEvent, clearFx, shake };
}
