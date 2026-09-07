/* 喵都幸存者 - 音频系统（BGM/音效全合成 + 主角喵叫采用真实采样，见 assets/meow/CREDITS.md） */
'use strict';
const Sfx = (() => {
  let ctx = null, master = null, delaySend = null, muted = false;
  let noiseBuf = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 6;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(comp); comp.connect(ctx.destination);
      // 一点点回声空间，让音色更软萌
      const delay = ctx.createDelay(0.6); delay.delayTime.value = 0.26;
      const fb = ctx.createGain(); fb.gain.value = 0.22;
      const wet = ctx.createGain(); wet.gain.value = 0.14;
      delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);
      delaySend = delay;
      // 噪声缓冲
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = muted ? 0 : 0.55;
  }

  const midi = m => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- 基础发声 ----------
  function tone(o) {
    if (!ensure()) return;
    const t = ctx.currentTime + (o.at || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'square';
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    const v = o.vol || 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + (o.atk || 0.008));
    g.gain.setValueAtTime(v, t + Math.max(o.atk || 0.008, o.dur * (o.sus ?? 0.7)));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let node = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
    node.connect(g); g.connect(master);
    if (o.echo && delaySend) { const e = ctx.createGain(); e.gain.value = o.echo; g.connect(e); e.connect(delaySend); }
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }
  function noise(o) {
    if (!ensure()) return;
    const t = ctx.currentTime + (o.at || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.ftype || 'lowpass';
    f.frequency.setValueAtTime(o.f0 || 1000, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1), t + o.dur);
    f.Q.value = o.q || 0.8;
    const g = ctx.createGain();
    const v = o.vol || 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + (o.atk || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + o.dur + 0.05);
  }

  // ---------- 喵叫合成 ----------
  // 一声"喵"：锯齿波 + 共振峰带通滑音 + 颤音 + 起始气声
  function meowOne(at, p) {
    if (!ensure()) return;
    const t = ctx.currentTime + at;
    const dur = p.dur;
    const jit = U.rand(0.93, 1.07); // 每次略不同，避免重复感
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const f0 = p.f0 * jit, f1 = p.f1 * jit, f2 = p.f2 * jit;
    // 音高轮廓：起音略低 → 抬升到峰值 → 下滑（"喵~呜"）
    osc.frequency.setValueAtTime(f0 * 0.85, t);
    osc.frequency.linearRampToValueAtTime(f1, t + dur * 0.32);
    osc.frequency.exponentialRampToValueAtTime(Math.max(60, f2), t + dur);
    // 颤音
    const lfo = ctx.createOscillator(); lfo.frequency.value = p.vib || 6.5;
    const lfoG = ctx.createGain(); lfoG.gain.setValueAtTime(0, t);
    lfoG.gain.linearRampToValueAtTime(f1 * (p.vibAmt || 0.025), t + dur * 0.45);
    lfo.connect(lfoG); lfoG.connect(osc.frequency);
    // 共振峰（口腔形状）：从亮到暗
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.Q.value = p.q || 2.2;
    bp.frequency.setValueAtTime(1400 * (p.bright || 1), t);
    bp.frequency.exponentialRampToValueAtTime(650 * (p.bright || 1), t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    const g = ctx.createGain();
    const v = p.vol || 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.035);
    g.gain.setValueAtTime(v * 0.85, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(bp); bp.connect(lp); lp.connect(g); g.connect(master);
    if (delaySend) { const e = ctx.createGain(); e.gain.value = 0.08; g.connect(e); e.connect(delaySend); }
    // 起始气声"咪"的磨砂感
    noise({ at, dur: Math.min(0.07, dur * 0.25), ftype: 'highpass', f0: 2000, vol: v * 0.25 });
    osc.start(t); lfo.start(t);
    osc.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
  const MEOWS = {
    idle:   [{ f0: 520, f1: 760, f2: 430, dur: 0.38, vol: 0.16, bright: 1.1, vib: 7 }],
    happy:  [{ f0: 560, f1: 900, f2: 520, dur: 0.22, vol: 0.26, bright: 1.25 },
             { f0: 600, f1: 980, f2: 620, dur: 0.3, vol: 0.28, bright: 1.3, at: 0.2 }],
    hurt:   [{ f0: 820, f1: 700, f2: 320, dur: 0.26, vol: 0.34, bright: 1.35, vib: 9, vibAmt: 0.05 }],
    chest:  [{ f0: 620, f1: 950, f2: 560, dur: 0.16, vol: 0.26, bright: 1.3 },
             { f0: 660, f1: 1000, f2: 600, dur: 0.16, vol: 0.28, bright: 1.3, at: 0.14 },
             { f0: 700, f1: 1080, f2: 680, dur: 0.24, vol: 0.3, bright: 1.35, at: 0.28 }],
    death:  [{ f0: 540, f1: 480, f2: 190, dur: 1.1, vol: 0.3, bright: 0.85, vib: 5, vibAmt: 0.04 }],
    victory:[{ f0: 600, f1: 1000, f2: 560, dur: 0.18, vol: 0.3, bright: 1.3 },
             { f0: 660, f1: 1050, f2: 620, dur: 0.18, vol: 0.3, bright: 1.32, at: 0.16 },
             { f0: 700, f1: 1150, f2: 760, dur: 0.42, vol: 0.32, bright: 1.4, at: 0.32, vib: 8, vibAmt: 0.035 }]
  };
  function synthMeow(name) {
    const preset = MEOWS[name] || MEOWS.idle;
    for (const p of preset) meowOne(p.at || 0, p);
  }

  // ---------- 主角真实喵叫采样（assets/meow/） ----------
  // group = 适合的情境；null = 通用（闲置随机 + 兜底池）。采样清单与授权见 assets/meow/CREDITS.md
  const MEOW_SAMPLES = [
    { f: 'm_kerz_softmew.mp3',     group: ['death'] },
    { f: 'm_kerz_mewpurr.mp3',     group: ['death'] },
    { f: 'm_kerz_mewpurr2.mp3',    group: ['death'] },
    { f: 'm_kerz_mewfood.mp3',     group: ['happy', 'chest', 'victory'] },
    { f: 'm_antum_kitten.mp3',     group: ['happy', 'victory'] },
    { f: 'm_ignas_meow.mp3',       group: null },
    { f: 'm_mixkit_sweet.mp3',     group: ['happy', 'victory'] },
    { f: 'm_mixkit_little.mp3',    group: ['happy', 'victory'] },
    { f: 'm_mixkit_attention.mp3', group: ['chest', 'happy'] },
    { f: 'm_mixkit_hungry.mp3',    group: ['chest'] },
    { f: 'm_mixkit_begging.mp3',   group: ['chest'] },
    { f: 'm_mixkit_pain.mp3',      group: ['hurt'] },
    { f: 'm_mixkit_angry.mp3',     group: ['hurt'] },
    { f: 'm_macro_cat1.mp3', group: null },
    { f: 'm_macro_cat2.mp3', group: null },
    { f: 'm_macro_cat3.mp3', group: null },
    { f: 'm_macro_cat4.mp3', group: null },
    { f: 'm_macro_cat5.mp3', group: null },
    { f: 'm_macro_cat6.mp3', group: null },
    { f: 'm_macro_cat7.mp3', group: null },
    { f: 'm_macro_cat8.mp3', group: null }
  ];
  // 页面加载即开始预取（fetch 不需要用户手势），首次解锁音频后再解码；
  // 无 fetch 的环境（file:// 受限 / 无头测试桩）自动降级为合成喵叫
  const sampleFetches = (typeof fetch === 'function')
    ? MEOW_SAMPLES.map(s =>
        fetch('assets/meow/' + s.f)
          .then(r => r.ok ? r.arrayBuffer() : null)
          .then(ab => ({ s, ab }))
          .catch(() => ({ s, ab: null })))
    : [];
  const sampleBufs = new Map();
  let samplesDecoding = false;
  function decodeSamples() {
    if (samplesDecoding || !ensure()) return;
    samplesDecoding = true;
    for (const p of sampleFetches) p.then(({ s, ab }) => {
      if (!ab) return;
      ctx.decodeAudioData(ab).then(b => sampleBufs.set(s.f, b)).catch(() => {});
    });
  }

  // ---------- 喵叫规则（防密集） ----------
  // 任意两声喵（事件 + 闲置共用一条冷却线）之间至少隔 minGap 秒；
  // 死亡等一次性大事件可用 force 跳过冷却。采样统一响度已归一，音量微调见 vol。
  const MEOW_RULE = {
    minGap: 2.5,         // 两声喵之间的最小间隔（秒）
    pitch: [0.92, 1.1],  // 随机音高倍率范围，避免同一采样连播的重复感
    vol: 0.8             // 采样整体音量
  };
  let lastMeowAt = -1e9, lastSampleF = '';
  function playSample(pool) {
    if (!ensure() || !pool.length) return false;
    let cand = pool.filter(s => s.f !== lastSampleF && sampleBufs.has(s.f));
    if (!cand.length) cand = pool.filter(s => sampleBufs.has(s.f));
    if (!cand.length) return false;
    const s = cand[(Math.random() * cand.length) | 0];
    lastSampleF = s.f;
    const src = ctx.createBufferSource();
    src.buffer = sampleBufs.get(s.f);
    src.playbackRate.value = U.rand(MEOW_RULE.pitch[0], MEOW_RULE.pitch[1]);
    const g = ctx.createGain();
    g.gain.value = MEOW_RULE.vol;
    src.connect(g); g.connect(master);
    src.start(ctx.currentTime);
    return true;
  }
  function meow(name, opts) {
    decodeSamples();
    if (!(opts && opts.force) && performance.now() - lastMeowAt < MEOW_RULE.minGap * 1000) return;
    lastMeowAt = performance.now();
    // 优先用标注了该情境的采样，没有就用全部采样
    let pool = MEOW_SAMPLES.filter(s => s.group && s.group.includes(name));
    if (name === 'idle' || !pool.length) pool = MEOW_SAMPLES;
    if (playSample(pool)) return;
    synthMeow(name); // 采样未加载好（如 file:// 打开）时兜底
  }

  // ---------- BGM：126 BPM 芯片音乐循环 ----------
  // C 大调五声，A 段旋律 + B 段琶音，I-vi-IV-V 和弦进行
  let bgmOn = false, bgmTimer = null, nextT = 0, step = 0;
  const BPM = 126, STEP = 60 / BPM / 4; // 16 分音符
  const N = { C3: 48, D3: 50, E3: 52, F3: 53, G3: 55, A3: 57, B3: 59,
              C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71,
              C5: 72, D5: 74, E5: 76, G5: 79, A5: 81, C6: 84, D6: 86, E6: 88, G6: 91 };
  // 旋律：0=休止，否则 MIDI 音高；每小节 16 步
  const MEL_A = [
    // | C |
    N.E5,0,N.G5,0, N.A5,0,N.G5,0, N.E5,0,N.D5,N.E5, 0,0,N.C5,0,
    // | Am |
    N.D5,0,N.E5,0, N.D5,0,N.C5,0, N.A4,0,N.C5,N.D5, 0,0,0,0,
    // | F |
    N.A4,0,N.C5,0, N.D5,0,N.C5,0, N.E5,0,N.D5,N.E5, N.G5,0,N.E5,0,
    // | G |
    N.D5,N.E5,N.D5,0, N.C5,0,N.A4,0, N.G4,0,N.A4,N.C5, N.D5,0,0,0
  ];
  const MEL_B = [
    // 琶音段落
    N.C5,N.E5,N.G5,N.A5, N.G5,N.E5,N.C5,N.E5, N.A4,N.C5,N.E5,N.A5, N.G5,N.E5,N.C5,0,
    N.A4,N.C5,N.E5,N.A5, N.C6,0,N.A5,N.G5, N.E5,N.G5,N.A5,N.C6, 0,0,N.G5,0,
    N.F4,N.A4,N.C5,N.A5, N.C6,0,N.A5,N.G5, N.A4,N.C5,0,N.A5, N.G5,0,N.E5,0,
    N.G4,N.B4,N.D5,N.G5, N.A5,N.G5,N.E5,N.D5, N.C5,0,N.D5,N.E5, N.D5,0,N.B4,0
  ];
  const BASS_A = [N.C3, N.A3 - 12, N.F3, N.G3]; // 每小节根音（低八度）
  const CHORD_B = [[N.C3, N.E3, N.G3], [N.A3 - 12, N.C4, N.E3], [N.F3, N.A3, N.C4], [N.G3, N.B3, N.D4]];
  const TOTAL = 128;

  function scheduleStep(t, s) {
    const bar = (s >> 4) % 8, pos = s & 15;
    const isB = bar >= 4;
    const chordIdx = bar % 4;
    // 鼓：底鼓在 0/8，镲在偶数步
    if (pos === 0 || pos === 8) tone({ type: 'sine', f0: 150, f1: 42, dur: 0.13, vol: 0.34, at: t - ctx.currentTime, atk: 0.004 });
    if (pos % 2 === 0) noise({ at: t - ctx.currentTime, dur: 0.03, ftype: 'highpass', f0: 6000, vol: pos % 4 === 2 ? 0.05 : 0.028 });
    if (isB && pos === 4 || isB && pos === 12) noise({ at: t - ctx.currentTime, dur: 0.09, ftype: 'bandpass', f0: 1800, q: 1.2, vol: 0.09 }); // B 段加军鼓感
    // 贝斯
    const root = isB ? CHORD_B[chordIdx][0] : BASS_A[chordIdx];
    if (pos % 2 === 0) tone({ type: 'triangle', f0: midi(root - 12), dur: 0.16, vol: 0.2, lp: 700, at: t - ctx.currentTime });
    // 旋律
    const mel = isB ? MEL_B : MEL_A;
    const note = mel[(bar % 4) * 16 + pos];
    if (note) {
      tone({ type: 'square', f0: midi(note), dur: STEP * 1.8, vol: 0.085, lp: 2600, at: t - ctx.currentTime, echo: 0.35 });
      tone({ type: 'square', f0: midi(note) * 2.003, dur: STEP * 1.2, vol: 0.03, lp: 3000, at: t - ctx.currentTime });
    }
    // B 段铺底和弦琶音
    if (isB && pos % 4 === 2) {
      const c = CHORD_B[chordIdx];
      tone({ type: 'triangle', f0: midi(c[(pos >> 2) % 3] + 12), dur: STEP * 1.4, vol: 0.055, lp: 2200, at: t - ctx.currentTime });
    }
  }
  function bgmStart() {
    if (!ensure() || bgmOn) return;
    decodeSamples(); // 开局就解码采样，别等第一声喵才现解码
    bgmOn = true; step = 0; nextT = ctx.currentTime + 0.1;
    bgmTimer = setInterval(() => {
      if (!bgmOn) return;
      while (nextT < ctx.currentTime + 0.18) {
        scheduleStep(nextT, step);
        step = (step + 1) % TOTAL;
        nextT += STEP;
      }
    }, 40);
  }
  function bgmStop() {
    bgmOn = false;
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
  }

  // ---------- 具名音效（原始表；实际播发走下方防过载包装） ----------
  const sfxRaw = {
    gem(combo) { const p = 1 + Math.min(12, combo) * 0.045; tone({ type: 'square', f0: 740 * p, f1: 990 * p, dur: 0.06, vol: 0.1, lp: 4000 }); },
    coin() { tone({ type: 'square', f0: midi(88), dur: 0.05, vol: 0.12 }); tone({ type: 'square', f0: midi(93), dur: 0.12, vol: 0.12, at: 0.05 }); },
    milk() { tone({ type: 'sine', f0: 500, f1: 300, dur: 0.12, vol: 0.2 }); tone({ type: 'sine', f0: 400, f1: 250, dur: 0.14, vol: 0.2, at: 0.1 }); },
    hit() { noise({ dur: 0.05, f0: 900, f1: 300, vol: 0.1 }); tone({ type: 'triangle', f0: 210, f1: 140, dur: 0.06, vol: 0.12 }); },
    pop() { tone({ type: 'sine', f0: 480, f1: 90, dur: 0.16, vol: 0.16 }); noise({ dur: 0.08, f0: 1500, f1: 400, vol: 0.1 }); },
    bigPop() { tone({ type: 'sine', f0: 300, f1: 60, dur: 0.3, vol: 0.3 }); noise({ dur: 0.2, f0: 900, f1: 200, vol: 0.22 }); },
    lvl() { [84, 88, 91, 96].forEach((n, i) => tone({ type: 'triangle', f0: midi(n), dur: 0.14, vol: 0.16, at: i * 0.07, echo: 0.3 })); },
    chest() {
      [79, 84].forEach((n, i) => tone({ type: 'square', f0: midi(n), dur: 0.12, vol: 0.14, at: i * 0.11 }));
      [88, 91, 96].forEach((n, i) => tone({ type: 'square', f0: midi(n), dur: 0.22, vol: 0.15, at: 0.24 + i * 0.1, echo: 0.35 }));
      noise({ at: 0.3, dur: 0.5, ftype: 'highpass', f0: 5000, vol: 0.05 });
    },
    evolve() {
      [72, 76, 79, 84, 88, 91, 96].forEach((n, i) => tone({ type: 'square', f0: midi(n), dur: 0.16, vol: 0.14, at: i * 0.07, echo: 0.4 }));
      noise({ at: 0.45, dur: 0.7, ftype: 'highpass', f0: 4500, vol: 0.06 });
    },
    firework() { noise({ dur: 0.55, f0: 700, f1: 80, vol: 0.4 }); tone({ type: 'sine', f0: 130, f1: 40, dur: 0.5, vol: 0.4 }); },
    vacuum() { tone({ type: 'triangle', f0: 280, f1: 1400, dur: 0.45, vol: 0.2 }); },
    thunder() { noise({ dur: 0.3, ftype: 'bandpass', f0: 2500, f1: 300, q: 1, vol: 0.22 }); tone({ type: 'sawtooth', f0: 1600, f1: 180, dur: 0.14, vol: 0.1, lp: 2500 }); },
    click() { tone({ type: 'triangle', f0: 850, dur: 0.045, vol: 0.14 }); },
    boss() {
      tone({ type: 'sawtooth', f0: 110, f1: 55, dur: 0.9, vol: 0.32, lp: 500 });
      noise({ dur: 0.9, f0: 400, f1: 120, vol: 0.25 });
      meowOne(0.1, { f0: 300, f1: 260, f2: 120, dur: 0.7, vol: 0.22, bright: 0.6, vib: 4, vibAmt: 0.06 });
    },
    playerHurt() { tone({ type: 'sawtooth', f0: 300, f1: 110, dur: 0.18, vol: 0.22, lp: 900 }); noise({ dur: 0.1, f0: 800, f1: 200, vol: 0.18 }); },
    motherWarn() { // 老鼠妈妈全屏斩预警：两声上升警报
      tone({ type: 'sawtooth', f0: 240, f1: 480, dur: 0.24, vol: 0.2, lp: 1400 });
      tone({ type: 'sawtooth', f0: 240, f1: 520, dur: 0.24, vol: 0.16, lp: 1400, at: 0.28 });
    },
    motherSkill() { // 老鼠妈妈全屏斩命中：低频轰鸣 + 噪声冲击 + 母亲啸叫
      tone({ type: 'sine', f0: 95, f1: 34, dur: 0.5, vol: 0.42, atk: 0.004 });
      noise({ dur: 0.32, ftype: 'bandpass', f0: 1900, f1: 220, q: 0.8, vol: 0.24 });
      meowOne(0.02, { f0: 340, f1: 300, f2: 130, dur: 0.5, vol: 0.2, bright: 0.6, vib: 5, vibAmt: 0.06 });
    },
    heartbeat() { // 低血量心跳：闷响两连
      tone({ type: 'sine', f0: 82, f1: 46, dur: 0.12, vol: 0.24, atk: 0.004 });
      tone({ type: 'sine', f0: 74, f1: 42, dur: 0.1, vol: 0.18, at: 0.16, atk: 0.004 });
    },
    gameOver() {
      [76, 72, 69, 64].forEach((n, i) => tone({ type: 'triangle', f0: midi(n), dur: 0.4, vol: 0.18, at: i * 0.26, lp: 1500, echo: 0.3 }));
    },
    victory() {
      [72, 76, 79, 84, 88, 91].forEach((n, i) => tone({ type: 'square', f0: midi(n), dur: 0.2, vol: 0.15, at: i * 0.12, echo: 0.4 }));
      [96].forEach(n => tone({ type: 'square', f0: midi(n), dur: 0.7, vol: 0.17, at: 0.75, echo: 0.4 }));
    }
  };

  // ---------- 音效防过载包装（中后期防噪声墙） ----------
  // 高频武器音效按名字限最小间隔；0.12 秒窗口内非优先音效超过并发预算直接让路；
  // 白名单（升级/宝箱/进化/boss/受伤/结算等一次性大事件）永不节流。BGM 走 tone/noise 不经过这里。
  const SFX_GAPS = { hit: 70, pop: 80, thunder: 130, bigPop: 150, coin: 50, milk: 90, vacuum: 220, firework: 220, gem: 40 };
  const SFX_PRIORITY = new Set(['lvl', 'chest', 'evolve', 'boss', 'playerHurt', 'heartbeat', 'gameOver', 'victory', 'click', 'motherWarn', 'motherSkill']);
  const gateLast = {}, voiceWin = [];
  let sfxCnt = 0, sfxWinT = 0, sfxRateV = 0;
  function allowSfx(name) {
    const now = performance.now();
    if (!SFX_PRIORITY.has(name)) {
      const gap = SFX_GAPS[name] || 0;
      if (gap && now - (gateLast[name] || -1e9) < gap) return false;
      while (voiceWin.length && now - voiceWin[0] > 120) voiceWin.shift();
      if (voiceWin.length >= 26) return false; // 并发声部预算（性能保护 + 防持续噪声）
      gateLast[name] = now;
      voiceWin.push(now);
    }
    sfxCnt++; // 只统计实际播发（被节流跳过的不计）
    if (now - sfxWinT >= 1000) { sfxRateV = sfxCnt; sfxCnt = 0; sfxWinT = now; }
    return true;
  }
  const sfx = {};
  for (const k in sfxRaw) sfx[k] = function () { if (allowSfx(k)) sfxRaw[k](); };

  return { ensure, setMuted, isMuted: () => muted, meow, bgmStart, bgmStop, sfx, sfxRate: () => sfxRateV, sampleCount: () => sampleBufs.size };
})();
