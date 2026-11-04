// src/audio.js —— [B] WebAudio 本地合成音（零外链、零音频文件）
// 短促合成音：命中/暴击/闪避/技能/击杀/升级/Boss 预警/受击/拾取。
// 移动端 autoplay 策略：首次用户手势时惰性创建 AudioContext；hidden 时 suspend。
export function createAudio(muted) {
  let ctx = null;
  let master = null;
  let isMuted = !!muted;
  let lastAt = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = isMuted ? 0 : 0.32;
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  }

  // 单音：type 波形 / f0→f1 频率滑动 / dur 时长 / vol 音量
  function tone(type, f0, f1, dur, vol, delay) {
    if (isMuted || !ensure()) return;
    const t = ctx.currentTime + (delay || 0);
    if (t - lastAt < 0.012) return;          // 极端同帧多事件节流防爆音
    lastAt = t;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol) {
    if (isMuted || !ensure()) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(g).connect(master);
    src.start(t);
  }

  const SFX = {
    hit: () => tone('square', 220, 140, 0.05, 0.16),
    crit: () => { tone('square', 880, 660, 0.09, 0.22); tone('sine', 1320, 990, 0.06, 0.1, 0.01); },
    hurt: () => tone('sawtooth', 140, 70, 0.12, 0.2),
    dodge: () => { noise(0.09, 0.12); tone('sine', 660, 1200, 0.08, 0.1); },
    dodgeSuccess: () => tone('sine', 990, 1580, 0.1, 0.16),
    skill: () => tone('triangle', 330, 520, 0.1, 0.2),
    kill: () => { noise(0.12, 0.18); tone('triangle', 200, 60, 0.14, 0.16); },
    levelUp: () => {   // 宫商角徵羽上行琶音（§9）
      [523, 587, 659, 784, 880].forEach((f, i) => tone('sine', f, f, 0.12, 0.14, i * 0.055));
    },
    bossWarn: () => tone('sawtooth', 90, 70, 0.22, 0.26),
    mechHit: () => { tone('sawtooth', 120, 50, 0.18, 0.3); noise(0.15, 0.2); },
    potion: () => tone('sine', 520, 880, 0.12, 0.14),
    loot: () => tone('sine', 740, 1180, 0.09, 0.14),
    notReady: () => tone('square', 110, 90, 0.05, 0.1),
    shield: () => tone('triangle', 440, 300, 0.15, 0.16),
    win: () => { [392, 523, 659, 784].forEach((f, i) => tone('triangle', f, f, 0.22, 0.16, i * 0.12)); },
    lose: () => { tone('sawtooth', 220, 55, 0.7, 0.2); },
    nodeClear: () => tone('sine', 660, 990, 0.14, 0.14),
  };

  return {
    play(name) { const fn = SFX[name]; if (fn) try { fn(); } catch { /* 音频失败不崩游戏 */ } },
    setMuted(m) {
      isMuted = !!m;
      if (master) master.gain.value = isMuted ? 0 : 0.32;
    },
    get muted() { return isMuted; },
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
  };
}
