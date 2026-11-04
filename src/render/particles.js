// src/render/particles.js —— [R] 预分配对象池粒子（tech §3.4 GC 预算：steady state 零 new）
// 命中火花 / 暴击火花 / 击杀碎裂+尘环 / 升级扩散环 / 闪避残影。上限由 perf 档位控制。
const MAX = 160;

export function createParticles(perf) {
  const pool = [];
  for (let i = 0; i < MAX; i++) {
    pool.push({ active: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, total: 0, size: 0, color: '' });
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

  function burst(x, y, n, color) {   // 击杀碎裂：向四周
    for (let i = 0; i < n; i++) {
      const p = acquire();
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 110;
      p.kind = 0; p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.life = p.total = 12;
      p.size = 3 + Math.random() * 3;
      p.color = color;
    }
  }

  function ring(x, y, color) {       // 升级 / 拾取：扩散环
    const p = acquire();
    if (!p) return;
    p.kind = 1; p.x = x; p.y = y;
    p.vx = 0; p.vy = 0;
    p.life = p.total = 18;
    p.size = 0;
    p.color = color;
  }

  function ghost(x, y, r, color) {   // 闪避残影
    const p = acquire();
    if (!p) return;
    p.kind = 2; p.x = x; p.y = y;
    p.vx = 0; p.vy = 0;
    p.life = p.total = 12;
    p.size = r;
    p.color = color;
  }

  // dt 单位 = 秒（渲染帧实际时长）
  function update(dt) {
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) continue;
      p.life -= dt * 30;             // 与 tick 同尺度（30/s）
      if (p.life <= 0) { p.active = false; continue; }
      if (p.kind === 0) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 260 * dt;            // 轻重力
      }
    }
  }

  function draw(ctx, toY) {
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) continue;
      const t = p.life / p.total;
      const y = toY(p.y);
      ctx.globalAlpha = t;
      if (p.kind === 0) {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, y - p.size / 2, p.size, p.size);
      } else if (p.kind === 1) {
        const r = (1 - t) * 60 + 6;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 + t * 2;
        ctx.beginPath();
        ctx.arc(p.x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 2) {
        ctx.globalAlpha = t * 0.45;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function clear() {
    for (let i = 0; i < pool.length; i++) pool[i].active = false;
  }

  return { spark, burst, ring, ghost, update, draw, clear };
}
