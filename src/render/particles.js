// src/render/particles.js —— [R] 预分配对象池粒子（tech §3.4 GC 预算：steady state 零 new）
// 命中火花 / 暴击火花+扩散环 / 击杀碎裂+尘环 / 升级环 / 闪避残影 / 刀光线段 / 菱形光点。
// 上限由 perf 档位控制（120/40），超预算丢弃新粒子、保存量。氛围尘埃池独立于本池（worldRenderer）。
const MAX = 160;

export function createParticles(perf) {
  const pool = [];
  for (let i = 0; i < MAX; i++) {
    pool.push({
      active: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, total: 0,
      size: 0, color: '', g: 260, ang: 0, len: 0, maxR: 60,
    });
  }

  function acquire() {
    const cap = perf ? perf.particleMax : 120;
    let free = null;
    let used = 0;
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].active) { if (free === null) free = pool[i]; }
      else used += 1;
    }
    if (!free || used >= cap) return null;   // 超预算丢弃（新粒子优先级低于存量）
    free.active = true;
    free.g = 260;
    return free;
  }

  function spark(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const p = acquire();
      if (!p) return;
      const a = -Math.PI / 4 + (Math.random() - 0.5) * 1.6;   // 右上溅射
      const sp = 60 + Math.random() * 90;
      p.kind = 0; p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.life = p.total = 9 + Math.random() * 4;
      p.size = 2 + Math.random() * 2;
      p.color = color;
    }
  }

  function burst(x, y, n, color, sizeMul) {   // 击杀碎裂：向四周
    const sm = sizeMul || 1;
    for (let i = 0; i < n; i++) {
      const p = acquire();
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 110;
      p.kind = 0; p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.life = p.total = 12;
      p.size = (3 + Math.random() * 3) * sm;
      p.color = color;
    }
  }

  function ring(x, y, color, maxR, life) {    // 扩散环（半径/寿命可调）
    const p = acquire();
    if (!p) return;
    p.kind = 1; p.x = x; p.y = y;
    p.vx = 0; p.vy = 0;
    p.life = p.total = life || 18;
    p.size = 0;
    p.maxR = maxR || 60;
    p.color = color;
  }

  function ghost(x, y, r, color) {            // 闪避 / 影袭残影
    const p = acquire();
    if (!p) return;
    p.kind = 2; p.x = x; p.y = y;
    p.vx = 0; p.vy = 0;
    p.life = p.total = 12;
    p.size = r;
    p.color = color;
  }

  // 刀光线段（T-游侠「影刃」）：沿 ang 的细长快闪
  function slash(x, y, ang, color) {
    const p = acquire();
    if (!p) return;
    p.kind = 3; p.x = x; p.y = y;
    p.vx = 0; p.vy = 0;
    p.ang = ang;
    p.len = 8 + Math.random() * 5;
    p.life = p.total = 6;
    p.size = 2;
    p.color = color;
  }

  // 菱形光点（T-术士「符光」）：无重力匀速散开
  function glyph(x, y, color) {
    const p = acquire();
    if (!p) return;
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 70;
    p.kind = 4; p.x = x; p.y = y;
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
    p.life = p.total = 8 + Math.random() * 4;
    p.size = 2.5 + Math.random() * 1.5;
    p.g = 0;
    p.color = color;
  }

  // dt 单位 = 秒（渲染帧实际时长）；hit-stop 期间调用方暂停本函数
  function update(dt) {
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) continue;
      p.life -= dt * 30;             // 与 tick 同尺度（30/s）
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.g) p.vy += p.g * dt;     // 轻重力（光点/刀光 g=0）
    }
  }

  function draw(ctx, toY) {
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) continue;
      const t = p.life / p.total;
      const y = toY(p.y);
      if (p.kind === 0) {            // 碎屑方块
        ctx.globalAlpha = t;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, y - p.size / 2, p.size, p.size);
      } else if (p.kind === 1) {     // 扩散环
        const r = (1 - t) * p.maxR + 6;
        ctx.globalAlpha = t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 + t * 2;
        ctx.beginPath();
        ctx.arc(p.x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 2) {     // 残影
        ctx.globalAlpha = t * 0.45;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 3) {     // 刀光线段
        const l = p.len * t;
        ctx.globalAlpha = Math.min(1, t * 1.6);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x - Math.cos(p.ang) * l, y - Math.sin(p.ang) * l);
        ctx.lineTo(p.x + Math.cos(p.ang) * l, y + Math.sin(p.ang) * l);
        ctx.stroke();
      } else {                       // 菱形光点
        ctx.globalAlpha = Math.min(1, t * 1.4);
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, y);
        ctx.rotate(Math.PI / 4);
        const s = p.size * (0.6 + t * 0.4);
        ctx.fillRect(-s, -s, s * 2, s * 2);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function activeCount() {
    let n = 0;
    for (let i = 0; i < pool.length; i++) if (pool[i].active) n++;
    return n;
  }

  function clear() {
    for (let i = 0; i < pool.length; i++) pool[i].active = false;
  }

  return { spark, burst, ring, ghost, slash, glyph, update, draw, clear, activeCount };
}
