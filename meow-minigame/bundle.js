/* 喵都幸存者 · 平台适配层（微信小游戏 → 浏览器 DOM/BOM 语义）
   ─────────────────────────────────────────────────────────
   H5 本体只依赖这些浏览器能力，逐项桥接：
   · document.createElement('canvas') → wx.createCanvas()（首次即屏幕画布）
   · window / innerWidth / devicePixelRatio / location / navigator → wx.getSystemInfoSync
   · AudioContext → wx.createWebAudioContext（缺声道的旧基础库自动静音兜底）
   · localStorage → wx.setStorageSync / getStorageSync
   · fetch（猫叫采样读取）→ FileSystemManager.readFile（读代码包内 assets/meow）
   · canvas.addEventListener('touch*') → wx.onTouchStart/Move/End/Cancel
   · requestAnimationFrame / performance → 原生自带，缺失时兜底
   在浏览器里跑测试时：真实 DOM 都在，本文件只补一层 wx→canvas 的触摸桥，
   所有 wx.* 调用由 test/wx-stub.js 提供。 */
'use strict';
(() => {
  const IN_WX = typeof wx !== 'undefined' && typeof wx.createCanvas === 'function';
  const g = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;

  /* ---------- 画布：注册表式 addEventListener + 统一分发 ---------- */
  function patchCanvas(c) {
    if (!c || c.__patched) return c;
    const ls = {};
    c.__patched = true;
    c._dispatch = (t, e) => { for (const f of ls[t] || []) f(e); };
    c.addEventListener = (t, f) => { (ls[t] = ls[t] || []).push(f); };
    c.removeEventListener = (t, f) => { ls[t] = (ls[t] || []).filter(x => x !== f); };
    if (!c.style) c.style = {};
    return c;
  }

  let screenCanvas = null;
  function getScreenCanvas() {
    if (screenCanvas) return screenCanvas;
    screenCanvas = patchCanvas(IN_WX ? wx.createCanvas() : document.getElementById('game'));
    return screenCanvas;
  }

  /* ---------- 系统信息 ---------- */
  let sys = { windowWidth: 1280, windowHeight: 720, pixelRatio: 2 };
  if (IN_WX && wx.getSystemInfoSync) {
    try { sys = wx.getSystemInfoSync(); } catch (e) { /* 保底默认值 */ }
  } else if (typeof window !== 'undefined') {
    sys = { windowWidth: window.innerWidth, windowHeight: window.innerHeight, pixelRatio: window.devicePixelRatio || 1 };
  }

  /* ---------- 小游戏环境：补齐 window / document ---------- */
  if (IN_WX) {
    const storageShim = {
      getItem(k) { try { const v = wx.getStorageSync(k); return v === '' || v == null ? null : String(v); } catch (e) { return null; } },
      setItem(k, v) { try { wx.setStorageSync(k, String(v)); } catch (e) { /* 容量满等 */ } },
      removeItem(k) { try { wx.removeStorageSync(k); } catch (e) {} }
    };
    const dummy = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      appendChild() {}, addEventListener() {}, setAttribute() {} });
    g.document = {
      createElement(tag) { return tag === 'canvas' ? patchCanvas(wx.createCanvas()) : dummy(); },
      getElementById() { return null; },
      addEventListener() {},
      body: Object.assign(dummy(), { classList: { add() {}, remove() {} } }),
      hidden: false,
      fonts: null
    };
    const win = {
      innerWidth: sys.windowWidth,
      innerHeight: sys.windowHeight,
      devicePixelRatio: sys.pixelRatio || 2,
      navigator: { userAgent: 'wechat-minigame' },
      location: { search: '', href: 'game://minigame' },
      ontouchstart: null, // 让 H5 的 'ontouchstart' in window 判定为触屏
      addEventListener() {}, removeEventListener() {},
      setTimeout, clearTimeout, setInterval, clearInterval
    };
    if (wx.createWebAudioContext) {
      // audio.js 里 `new AC()`：构造器形式直接返回上下文实例
      win.AudioContext = function () { return wx.createWebAudioContext(); };
    }
    // 本体全部走 window.* / 裸全局，统一挂到 GameGlobal
    g.localStorage = storageShim;
    g.window = win;
    g.navigator = win.navigator;
    g.location = win.location;
    if (typeof performance === 'undefined' || !performance.now) {
      g.performance = { now: () => Date.now() };
    }
    if (typeof requestAnimationFrame === 'undefined') {
      g.requestAnimationFrame = f => setTimeout(() => f(performance.now()), 16);
    }
    // 猫叫采样：fetch 语义 → 读代码包内文件（读不到时 audio.js 自动回退合成喵叫）
    if (typeof fetch !== 'function' && wx.getFileSystemManager) {
      g.fetch = url => new Promise(resolve => {
        const p = String(url).replace(/^https?:\/\/[^/]+\//, '');
        const fsm = wx.getFileSystemManager();
        const tryRead = paths => {
          if (!paths.length) { resolve({ ok: false, arrayBuffer: () => Promise.resolve(null) }); return; }
          fsm.readFile({
            path: paths[0],
            success: r => resolve({ ok: true, arrayBuffer: () => Promise.resolve(r.data) }),
            fail: () => tryRead(paths.slice(1))
          });
        };
        tryRead([p, '/' + p]);
      });
    }
  }

  /* ---------- 触摸桥：wx.onTouch* → 画布 touch 事件（两种环境都走这里） ---------- */
  const sc = getScreenCanvas();
  if (typeof wx !== 'undefined' && wx.onTouchStart) {
    const wrap = res => ({
      changedTouches: res.changedTouches || [],
      touches: res.touches || [],
      preventDefault() {}
    });
    wx.onTouchStart(res => sc._dispatch('touchstart', wrap(res)));
    wx.onTouchMove(res => sc._dispatch('touchmove', wrap(res)));
    wx.onTouchEnd(res => sc._dispatch('touchend', wrap(res)));
    if (wx.onTouchCancel) wx.onTouchCancel(res => sc._dispatch('touchcancel', wrap(res)));
  }

  /* ---------- 供入口/测试使用 ---------- */
  g.__platform = { IN_WX, screenCanvas: () => getScreenCanvas(), sys };
})();

;
/* 喵都幸存者 - 工具函数 */
'use strict';
const U = {
  TAU: Math.PI * 2,
  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp(a, b, t) { return a + (b - a) * t; },
  rand(a, b) { return a + Math.random() * (b - a); },
  randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
  pick(arr) { return arr[(Math.random() * arr.length) | 0]; },
  chance(p) { return Math.random() < p; },
  dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; },
  // 从数组中不重复地取 n 个（返回索引数组）
  pickIndices(len, n) {
    const idx = [];
    for (let i = 0; i < len; i++) idx.push(i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    return idx.slice(0, n);
  },
  swapRemove(arr, i) { arr[i] = arr[arr.length - 1]; arr.pop(); },
  fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  },
  // 大数字中文化：1.23万 / 2.05亿（结算伤害、DPS 用）
  fmtNum(v) {
    v = Math.round(v || 0);
    if (v >= 1e8) return (Math.round(v / 1e6) / 100) + '亿';
    if (v >= 1e4) return (Math.round(v / 100) / 100) + '万';
    return '' + v;
  },
  // 确定性哈希（地图 chunk 用），返回 0..1
  hash2(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 1442695040888963) | 0;
    h = (h ^ (h >> 13)) * 1274126177 | 0;
    h = h ^ (h >> 16);
    return (h >>> 0) / 4294967295;
  },
  storage: {
    get(key, def) {
      try { const v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); }
      catch (e) { return def; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 无痕模式等 */ }
    }
  },
  // 把 angle 规范到 [-PI, PI]
  angNorm(a) { while (a > Math.PI) a -= U.TAU; while (a < -Math.PI) a += U.TAU; return a; }
};

;
/* 喵都幸存者 - 音频系统（BGM/音效全合成 + 主角喵叫采用真实采样，见 assets/meow/CREDITS.md） */
'use strict';
const Sfx = (() => {
  let ctx = null, master = null, delaySend = null, muted = false;
  let noiseBuf = null;

  function ensure() {
    if (!ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
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

  // ---------- BGM：分地图专属芯片音乐循环 ----------
  // TRACKS 按地图 id 查曲；bgmStart(mapId) 未传/未知 id 回落 oldtown（兼容旧的无参调用）。
  // 曲目字段：bpm；melA/melB 各 64 步（0=休止，每小节 16 步：前 4 小节 A 段主旋律、后 4 小节 B 段琶音）；
  // bass 4 小节根音；chords 4 组三和弦（B 段低音与铺底琶音用）；lead 主音波形；leadVol 主音音量；
  // drums 鼓组参数。可选微调：bass8 贝斯八度跳动 / hatHalf 镲片减半 / kickHalf 底鼓每小节一记 /
  // snareAll 军鼓全段 / snareF·snareQ·snareVol·snareDur 军鼓整形 / lp 主音低通 / echo 回声量 /
  // melDur 主音时值倍率 / bassVol / arpVol / arpType。统一 128 步（8 小节）无缝循环。
  let bgmOn = false, bgmTimer = null, nextT = 0, step = 0, TR = null;
  const TOTAL = 128; // 8 小节 × 16 步
  const N = { Bb2: 46, B2: 47, C3: 48, D3: 50, E3: 52, F3: 53, 'F#3': 54, G3: 55, 'G#3': 56, A3: 57, Bb3: 58, B3: 59,
              C4: 60, D4: 62, E4: 64, F4: 65, 'F#4': 66, G4: 67, 'G#4': 68, A4: 69, B4: 71,
              C5: 72, D5: 74, E5: 76, F5: 77, 'F#5': 78, G5: 79, 'G#5': 80, A5: 81, B5: 83,
              C6: 84, D6: 86, E6: 88, G6: 91 };

  // —— 老城夜市：126BPM C 大调五声芯片乐（初代曲，音符原样保留）——
  const oldtown = {
    bpm: 126, lead: 'square', leadVol: 0.085,
    drums: { kickVol: 0.34, hat: true, snare: true },
    bass: [N.C3, N.A3 - 12, N.F3, N.G3], // 每小节根音（低八度），I-vi-IV-V
    chords: [[N.C3, N.E3, N.G3], [N.A3 - 12, N.C4, N.E3], [N.F3, N.A3, N.C4], [N.G3, N.B3, N.D4]],
    melA: [
      // | C |
      N.E5,0,N.G5,0, N.A5,0,N.G5,0, N.E5,0,N.D5,N.E5, 0,0,N.C5,0,
      // | Am |
      N.D5,0,N.E5,0, N.D5,0,N.C5,0, N.A4,0,N.C5,N.D5, 0,0,0,0,
      // | F |
      N.A4,0,N.C5,0, N.D5,0,N.C5,0, N.E5,0,N.D5,N.E5, N.G5,0,N.E5,0,
      // | G |
      N.D5,N.E5,N.D5,0, N.C5,0,N.A4,0, N.G4,0,N.A4,N.C5, N.D5,0,0,0
    ],
    melB: [
      // 琶音段落
      N.C5,N.E5,N.G5,N.A5, N.G5,N.E5,N.C5,N.E5, N.A4,N.C5,N.E5,N.A5, N.G5,N.E5,N.C5,0,
      N.A4,N.C5,N.E5,N.A5, N.C6,0,N.A5,N.G5, N.E5,N.G5,N.A5,N.C6, 0,0,N.G5,0,
      N.F4,N.A4,N.C5,N.A5, N.C6,0,N.A5,N.G5, N.A4,N.C5,0,N.A5, N.G5,0,N.E5,0,
      N.G4,N.B4,N.D5,N.G5, N.A5,N.G5,N.E5,N.D5, N.C5,0,N.D5,N.E5, N.D5,0,N.B4,0
    ]
  };

  const TRACKS = {
    oldtown,
    // —— 无尽街区：140BPM 急促变奏，贝斯八度跳动 + 16 分密铺，无尽模式的压迫感 ——
    endless: {
      bpm: 140, lead: 'square', leadVol: 0.08, bass8: true,
      drums: { kickVol: 0.36, hat: true, snare: true },
      bass: [N.C3, N.A3 - 12, N.F3, N.G3],
      chords: [[N.C3, N.E3, N.G3], [N.A3 - 12, N.C4, N.E3], [N.F3, N.A3, N.C4], [N.G3, N.B3, N.D4]],
      melA: [
        // | C | 老城动机密集化
        N.E5,0,N.E5,N.G5, N.A5,0,N.G5,N.E5, N.D5,N.E5,N.D5,N.C5, N.D5,N.E5,N.G5,0,
        // | Am |
        N.A4,0,N.C5,N.D5, N.E5,0,N.D5,N.C5, N.A4,N.C5,N.D5,N.E5, N.G5,N.E5,N.D5,0,
        // | F | 连续 16 分推升
        N.A4,N.C5,N.D5,N.F5, N.E5,N.C5,N.D5,N.E5, N.F5,N.E5,N.D5,N.C5, N.D5,N.E5,N.F5,N.G5,
        // | G | 下行收束接 B 段
        N.D5,N.E5,N.D5,N.C5, N.A4,N.G4,N.A4,N.C5, N.D5,N.E5,N.G5,N.E5, N.D5,N.C5,N.D5,0
      ],
      melB: [
        N.C5,N.E5,N.G5,N.A5, N.C6,N.A5,N.G5,N.E5, N.G5,N.A5,N.C6,N.A5, N.E6,N.D6,N.C6,N.G5,
        N.A4,N.C5,N.E5,N.A5, N.C6,N.A5,N.E5,N.C5, N.E5,N.A5,N.C6,N.A5, N.G5,N.E5,N.D5,N.C5,
        N.F4,N.A4,N.C5,N.F5, N.A5,N.F5,N.C5,N.A4, N.C5,N.F5,N.A5,N.C6, N.D6,N.C6,N.A5,N.F5,
        N.G4,N.B4,N.D5,N.G5, N.A5,N.G5,N.D5,N.B4, N.D5,N.G5,N.B5,N.A5, N.G5,N.F5,N.D5,N.B4
      ]
    },
    // —— 樱花公园：D 宫调式（D E F# A B yo 音阶），96BPM triangle 柔主音，无军鼓、镲减半、音量略低 ——
    sakura: {
      bpm: 96, lead: 'triangle', leadVol: 0.075, echo: 0.4, melDur: 2.4, bassVol: 0.17, arpVol: 0.045,
      drums: { kickVol: 0.22, hat: true, hatHalf: true, snare: false },
      bass: [N.D3, N.B2, N.A3 - 12, N.B2], // D–Bm–Asus2–Bm 根音
      chords: [[N.D3, N['F#3'], N.A3], [N.B2, N.D3, N['F#3']], [N.A3 - 12, N.D3, N.E3], [N.B2, N.D3, N['F#3']]],
      melA: [
        // | D | 起：D-E-F# 上行后落回
        N.D5,0,N.E5,0, N['F#5'],0,0,0, N.A5,0,N['F#5'],N.E5, N.D5,0,0,0,
        // | Bm | 下三度模进
        N.B4,0,N.D5,0, N['F#5'],0,N.E5,0, N.D5,0,N.B4,0, 0,0,0,0,
        // | Asus2 | 再模进
        N.A4,0,N.B4,N.D5, N.E5,0,0,0, N['F#5'],0,N.E5,N.D5, N.B4,0,0,0,
        // | Bm | 合：小高潮后收
        N.D5,0,N.E5,N['F#5'], N.A5,0,N['F#5'],N.E5, N.D5,0,N.B4,N.D5, 0,0,0,0
      ],
      melB: [
        N.D5,N['F#5'],N.A5,N.B5, N.A5,N['F#5'],N.D5,0, N['F#5'],N.A5,N.B5,N.A5, N['F#5'],0,N.E5,0,
        N.B4,N.D5,N['F#5'],N.B5, 0,N.A5,N['F#5'],N.D5, N['F#5'],N.B5,N.A5,N['F#5'], N.D5,0,N.B4,0,
        N.A4,N.D5,N.E5,N.A5, N.B5,0,N.A5,N.E5, N['F#5'],N.E5,N.D5,N.E5, N['F#5'],0,0,0,
        N.B4,N.D5,N['F#5'],N.A5, N.B5,N.A5,N['F#5'],N.D5, N.E5,0,N.D5,0, N.B4,0,N.D5,0
      ]
    },
    // —— 雪山温泉：F 大调五声（F G A C D），84BPM sine 长音 + 大回声，鼓只留很轻的底鼓 ——
    onsen: {
      bpm: 84, lead: 'sine', leadVol: 0.09, echo: 0.55, melDur: 3.2, bassVol: 0.15, arpVol: 0.04,
      drums: { kickVol: 0.13, kickHalf: true },
      bass: [N.F3, N.D3, N.Bb2, N.C3], // F–Dm–Bb–C 根音
      chords: [[N.F3, N.A3, N.C4], [N.D3, N.F3, N.A3], [N.Bb2, N.D3, N.F3], [N.C3, N.E3, N.G3]],
      melA: [
        // | F | 稀疏留白，蒸汽般的长音
        N.F5,0,0,0, 0,0,N.D5,N.C5, N.D5,0,0,0, 0,0,0,0,
        // | Dm |
        N.A4,0,N.C5,0, N.D5,0,0,0, 0,0,N.F5,0, 0,0,0,0,
        // | Bb |
        N.D5,0,0,0, N.C5,0,N.D5,0, N.F5,0,0,0, N.D5,0,N.C5,0,
        // | C |
        N.A4,0,0,0, N.G4,0,N.A4,0, N.C5,0,0,0, 0,0,0,0
      ],
      melB: [
        N.F4,N.A4,N.C5,N.F5, 0,0,N.C5,0, N.D5,0,0,0, N.C5,0,N.A4,0,
        N.A4,N.D5,0,0, N.F5,0,N.D5,0, N.C5,0,0,0, N.A4,0,0,0,
        N.D5,N.F5,0,0, N.G5,0,N.F5,0, N.D5,0,N.C5,0, N.D5,0,0,0,
        N.C5,0,N.D5,0, N.C5,0,N.A4,0, N.G4,0,0,0, N.F4,0,0,0
      ]
    },
    // —— 港湾码头：G 大调 132BPM square 明快，A 段前 2 小节问、后 2 小节答；鼓组全开 ——
    harbor: {
      bpm: 132, lead: 'square', leadVol: 0.085, echo: 0.3, arpVol: 0.05,
      drums: { kickVol: 0.34, hat: true, snare: true, snareAll: true },
      bass: [N.G3, N.E3, N.C3, N.D3], // G–Em–C–D 根音
      chords: [[N.G3, N.B3, N.D4], [N.E3, N.G3, N.B3], [N.C3, N.E3, N.G3], [N.D3, N['F#3'], N.A3]],
      melA: [
        // | G | 问：盘旋上行后悬停
        N.G4,0,N.B4,N.D5, N.G5,0,0,N.D5, N.E5,0,N.G5,0, N.A5,0,0,0,
        // | Em | 问：停在导音 F# 上悬而未决
        N.B4,0,N.E5,N.G5, N.B5,0,N.A5,N.G5, N['F#5'],0,N.E5,0, N['F#5'],0,0,0,
        // | C | 答：阶梯下行落回
        N.E5,0,N.D5,N.C5, N.B4,0,N.C5,N.D5, N.E5,0,N.D5,0, N.C5,0,0,0,
        // | D | 答：解决到主音 G
        N.D5,0,N.B4,0, N.D5,0,N.E5,N['F#5'], N.G5,0,N['F#5'],N.E5, N.D5,0,0,0
      ],
      melB: [
        // 问：两层上行琶音
        N.G5,0,N.D5,0, N.B4,0,N.D5,0, N.G5,N.A5,N.B5,0, N.D6,0,N.B5,0,
        N.E5,0,N.B4,0, N.G4,0,N.B4,0, N.E5,N['F#5'],N.G5,0, N.B5,0,N.A5,0,
        // 答：两层下行琶音收拢
        N.C6,0,N.G5,0, N.E5,0,N.G5,0, N.C6,N.B5,N.A5,0, N.G5,0,N.E5,0,
        N['F#5'],0,N.D5,0, N.A4,0,N.D5,0, N.E5,0,N['F#5'],0, N.G5,0,0,0
      ]
    },
    // —— 幽灵游乐园：A 小调掺和声小调 G#，116BPM sawtooth 压暗主音（音量压低），怪异中频军鼓点缀 ——
    carnival: {
      bpm: 116, lead: 'sawtooth', leadVol: 0.06, lp: 1700, echo: 0.4, arpType: 'sawtooth',
      drums: { kickVol: 0.3, hat: true, snare: true, snareAll: true, snareF: 1000, snareQ: 6, snareDur: 0.14, snareVol: 0.075 },
      bass: [N.A3 - 12, N.D3, N.E3, N.A3 - 12], // Am–Dm–E–Am 根音
      chords: [[N.A3 - 12, N.C3, N.E3], [N.D3, N.F3, N.A3], [N.E3, N['G#3'], N.B3], [N.A3 - 12, N.C3, N.E3]],
      melA: [
        // | Am | 旋转木马式分解上行
        N.A4,0,N.C5,N.E5, N.A5,0,N.E5,0, N.D5,0,N.C5,0, N.B4,0,0,0,
        // | Dm |
        N.D5,0,N.F5,N.A5, 0,N.G5,N.F5,N.E5, N.F5,0,N.E5,0, N.D5,0,0,0,
        // | E | G# 与 F（b9）制造诡异摩擦
        N.E5,0,N['G#5'],N.B5, 0,N.B5,N['G#5'],N.F5, N.E5,0,N.D5,0, N.B4,0,N['G#4'],0,
        // | Am |
        N.A4,0,N.C5,N.E5, N.A5,0,N.C6,0, N.B5,0,N.A5,0, N.E5,0,N.C5,0
      ],
      melB: [
        N.A4,N.C5,N.E5,N.A5, N['G#5'],0,N.E5,N.C5, N.E5,N.A5,N.C6,0, N.B5,N.A5,N['G#5'],N.E5,
        N.D5,N.F5,N.A5,N.D6, N.C6,0,N.A5,N.F5, N.E5,N.F5,N.G5,N.E5, N.D5,0,N.C5,0,
        N.E5,N['G#5'],N.B5,N.E6, 0,N.D6,N.B5,N['G#5'], N.B4,N.E5,N['G#5'],N.B5, N.D6,0,N.B5,0,
        N.A4,N.C5,N.E5,N.A5, N.C6,N.B5,N.A5,N['G#5'], N.A5,0,N.E5,0, N.C5,0,N.B4,0
      ]
    }
  };

  function scheduleStep(t, s) {
    const bar = (s >> 4) % 8, pos = s & 15, isB = bar >= 4, ci = bar % 4, at = t - ctx.currentTime;
    const L = 60 / TR.bpm / 4, dr = TR.drums; // 本曲 16 分音符时值 + 鼓组参数
    // 鼓：底鼓在 0/8（kickHalf 只打小节头），镲在偶数步（hatHalf 减半），军鼓 B 段 4/12（snareAll 全段）
    if (pos === 0 || (!dr.kickHalf && pos === 8)) tone({ type: 'sine', f0: 150, f1: 42, dur: 0.13, vol: dr.kickVol, at, atk: 0.004 });
    if (dr.hat && pos % (dr.hatHalf ? 4 : 2) === 0) noise({ at, dur: 0.03, ftype: 'highpass', f0: 6000, vol: pos % 4 === 2 ? 0.05 : 0.028 });
    if ((isB || dr.snareAll) && (pos === 4 || pos === 12))
      noise({ at, dur: dr.snareDur || 0.09, ftype: 'bandpass', f0: dr.snareF || 1800, q: dr.snareQ || 1.2, vol: dr.snareVol || 0.09 });
    // 贝斯：A 段走根音表、B 段走和弦低音；bass8 时八度跳动
    const root = (isB ? TR.chords[ci][0] : TR.bass[ci]) + (TR.bass8 && pos % 4 === 2 ? 12 : 0);
    if (pos % 2 === 0) tone({ type: 'triangle', f0: midi(root - 12), dur: 0.16, vol: TR.bassVol || 0.2, lp: 700, at });
    // 主旋律（双层：主音 + 高八度微失谐点缀）
    const note = (isB ? TR.melB : TR.melA)[ci * 16 + pos];
    if (note) {
      tone({ type: TR.lead, f0: midi(note), dur: L * (TR.melDur || 1.8), vol: TR.leadVol, lp: TR.lp || 2600, at, echo: TR.echo || 0.35 });
      tone({ type: TR.lead, f0: midi(note) * 2.003, dur: L * 1.2, vol: TR.leadVol * 0.35, lp: (TR.lp || 2600) + 400, at });
    }
    // B 段铺底和弦琶音
    if (isB && pos % 4 === 2) {
      const c = TR.chords[ci];
      tone({ type: TR.arpType || 'triangle', f0: midi(c[(pos >> 2) % 3] + 12), dur: L * 1.4, vol: TR.arpVol || 0.055, lp: 2200, at });
    }
  }
  function bgmStart(mapId) {
    const t = TRACKS[mapId] || TRACKS.oldtown; // 未传/未知地图 id 回落老城曲
    if (!ensure()) return;
    if (bgmOn && TR === t) return; // 同曲已在播：无缝 no-op，不重启
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; } // 换曲：清掉旧定时器再起新的
    decodeSamples(); // 开局就解码采样，别等第一声喵才现解码
    TR = t; bgmOn = true; step = 0; nextT = ctx.currentTime + 0.1;
    const L = 60 / t.bpm / 4;
    bgmTimer = setInterval(() => {
      if (!bgmOn) return;
      while (nextT < ctx.currentTime + 0.18) {
        scheduleStep(nextT, step);
        step = (step + 1) % TOTAL;
        nextT += L;
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
  for (const k in sfxRaw) sfx[k] = function (...a) { if (allowSfx(k)) sfxRaw[k](...a); };

  return { ensure, setMuted, isMuted: () => muted, meow, bgmStart, bgmStop, sfx, sfxRate: () => sfxRateV, sampleCount: () => sampleBufs.size };
})();

;
/* 喵都幸存者 v2 - 程序化美术（手绘绘本/治愈系）
   所有精灵启动时以 2x 分辨率烘焙为离屏画布：多层描边、柔和渐变、高光、腮红、
   眨眼/呼吸/走路/受击/惊讶等多状态帧。 */
'use strict';
const Art = (() => {
  const OUT = '#5d433c';            // 统一暖棕软描边
  const OUTW = 3;

  /* ================= 基础工具 ================= */
  function bake(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.lineJoin = 'round'; x.lineCap = 'round';
    fn(x, w, h);
    return c;
  }
  // 2x 分辨率烘焙：fn 依然在 w×h 的坐标空间里画
  function bake2(w, h, fn) {
    return bake(w * 2, h * 2, x => { x.scale(2, 2); fn(x, w, h); });
  }
  function whiteVersion(c) {
    return bake(c.width, c.height, x => {
      x.drawImage(c, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, c.width, c.height);
    });
  }
  function lg(x, x0, y0, x1, y1, stops) {
    const g = x.createLinearGradient(x0, y0, x1, y1);
    for (const [p, c] of stops) g.addColorStop(p, c);
    return g;
  }
  function rg(x, cx, cy, r0, r1, stops) {
    const g = x.createRadialGradient(cx, cy, r0, cx, cy, r1);
    for (const [p, c] of stops) g.addColorStop(p, c);
    return g;
  }
  function rr(x, px, py, w, h, r) {
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }
  function ell(x, cx, cy, rx, ry, fill, stroke, lw) {
    x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, U.TAU);
    if (fill) { x.fillStyle = fill; x.fill(); }
    if (stroke) { x.lineWidth = lw || OUTW; x.strokeStyle = stroke; x.stroke(); }
  }
  function circ(x, cx, cy, r, fill, stroke, lw) { ell(x, cx, cy, r, r, fill, stroke, lw); }
  // 带双层描边的形状：pathFn 构建 path → 填充 → 深色外描 → 内缘亮描（绘本层叠感）
  function blob(x, pathFn, fill, o) {
    o = o || {};
    x.beginPath(); pathFn(x);
    x.fillStyle = fill; x.fill();
    x.lineWidth = o.ow || 4; x.strokeStyle = o.oc || OUT; x.lineJoin = 'round'; x.stroke();
    x.beginPath(); pathFn(x);
    x.lineWidth = o.rw || 1.6; x.strokeStyle = o.rc || 'rgba(255,255,255,.30)'; x.stroke();
  }
  const ellPath = (cx, cy, rx, ry) => x => { x.ellipse(cx, cy, rx, ry, 0, 0, U.TAU); };
  const circPath = (cx, cy, r) => ellPath(cx, cy, r, r);
  function strokePath(x, fn, color, w) {
    x.beginPath(); fn(x);
    x.lineWidth = w || OUTW; x.strokeStyle = color || OUT; x.lineCap = 'round'; x.stroke();
  }
  /* ---- 水亮大眼睛（绘本核心）：深色眼球渐变 + 底部反光 + 双高光 + 上眼睑 ---- */
  function eyeG(x, cx, cy, r) {
    circ(x, cx, cy, r, rg(x, cx - r * 0.25, cy - r * 0.35, r * 0.1, r * 1.05,
      [[0, '#7c5a45'], [0.45, '#43302a'], [1, '#221613']]));
    x.save(); x.globalAlpha = 0.45;
    ell(x, cx + r * 0.18, cy + r * 0.5, r * 0.55, r * 0.26, '#d09a72');
    x.restore();
    circ(x, cx - r * 0.36, cy - r * 0.4, r * 0.34, '#ffffff');
    circ(x, cx + r * 0.32, cy + r * 0.22, r * 0.15, 'rgba(255,255,255,.9)');
    x.beginPath(); x.arc(cx, cy, r, Math.PI * 1.06, Math.PI * 1.94);
    x.lineWidth = r * 0.3; x.strokeStyle = 'rgba(38,22,20,.5)'; x.stroke();
  }
  // 表情组合：mode open | blink | hurt
  function eyesFor(x, list, mode) {
    for (const [cx, cy, r] of list) {
      if (mode === 'blink') {
        x.beginPath(); x.arc(cx, cy + r * 0.2, r * 0.95, Math.PI * 1.12, Math.PI * 1.88);
        x.lineWidth = r * 0.55; x.strokeStyle = OUT; x.stroke();
      } else if (mode === 'hurt') {
        ell(x, cx, cy, r * 0.62, r * 0.8, '#fff', OUT, 2);
        circ(x, cx, cy + r * 0.05, r * 0.32, '#241a18');
        circ(x, cx - r * 0.12, cy - r * 0.2, r * 0.12, '#fff');
      } else eyeG(x, cx, cy, r);
    }
  }
  function mouthO(x, cx, cy, s) { // 惊讶的小圆嘴
    ell(x, cx, cy, 2.6 * (s || 1), 3.2 * (s || 1), '#6e3f4a', OUT, 1.6);
  }
  function sweat(x, cx, cy, s) { // 汗滴
    x.save(); x.translate(cx, cy); x.scale(s || 1, s || 1);
    x.beginPath(); x.moveTo(0, -5);
    x.quadraticCurveTo(4.4, 1.5, 0, 4.6);
    x.quadraticCurveTo(-4.4, 1.5, 0, -5);
    x.closePath(); x.fillStyle = '#9fd8f2'; x.fill();
    x.lineWidth = 1.4; x.strokeStyle = '#5d90ad'; x.stroke();
    x.restore();
  }
  function blush(x, cx, cy, r) {
    x.save(); x.globalAlpha = 0.6;
    ell(x, cx, cy, r, r * 0.6, rg(x, cx, cy, r * 0.1, r, [[0, '#ff9da4'], [1, 'rgba(255,157,164,0)']]));
    x.restore();
  }
  function shine(x, cx, cy, rx, ry, rot) { // 柔和光泽
    x.save(); x.globalAlpha = 0.5; x.translate(cx, cy); x.rotate(rot || 0);
    ell(x, 0, 0, rx, ry, 'rgba(255,255,255,.85)');
    x.restore();
  }
  // 地面软阴影（烘焙进精灵）
  function groundShadow(x, cx, cy, rx, ry) {
    x.save(); x.globalAlpha = 0.3;
    ell(x, cx, cy, rx, ry || rx * 0.32, rg(x, cx, cy, rx * 0.2, rx, [[0, 'rgba(20,12,30,.9)'], [1, 'rgba(20,12,30,0)']]));
    x.restore();
  }

  /* ============================================================
     玩家：橘猫「大橘」——全作最精细（112×108 单位空间，2x 烘焙）
     ============================================================ */
  const CAT = {
    out: '#6b4436',
    furTop: '#ffd39a', furBot: '#f79a4c',
    headTop: '#ffd6a2', headBot: '#fba35c',
    cream: '#fff3dc', stripe: '#e2853f', earIn: '#ffc9d4',
    nose: '#ff8f9f', collar: '#e05f5f'
  };
  // 猫耳（模块级：本体/死亡立绘共用）
  function catEar(x, bx, by, ax, flip) {
    x.beginPath();
    x.moveTo(bx[0], bx[1]); x.lineTo(ax[0], ax[1]); x.lineTo(bx[2], bx[3]);
    x.closePath();
    x.fillStyle = CAT.headTop; x.fill();
    x.lineWidth = 4; x.strokeStyle = '#6b4436'; x.stroke();
    x.beginPath();
    x.moveTo(bx[0] + (flip ? 1 : 3), by[0] + 2); x.lineTo(ax[0] + (flip ? 1.5 : 1), ax[1] + 7); x.lineTo(bx[2] - 3, by[0] + 3);
    x.closePath(); x.fillStyle = CAT.earIn; x.fill();
  }
  // o: {legF, legB, bob, br(呼吸0/1), tail(0/1), face:'normal'|'blink'|'hurt', dead}
  function drawCat(x, o) {
    const tail = o.tail || 0;
    const bob = o.bob || 0;
    const br = o.br || 0;
    x.save();
    x.translate(0, bob);
    if (o.dead) { drawCatDead(x); x.restore(); return; }
    /* 尾巴（最底层）：双层描边 + 环纹 + 深色尾尖 */
    const tailDraw = (cp, end, tip) => {
      strokePath(x, c => { c.moveTo(26, 64); c.quadraticCurveTo(cp[0], cp[1], end[0], end[1]); }, CAT.out, 13);
      strokePath(x, c => { c.moveTo(26, 64); c.quadraticCurveTo(cp[0], cp[1], end[0], end[1]); }, CAT.furBot, 9);
      // 环纹
      strokePath(x, c => { c.moveTo(cp[0] * 0.55 + 13, cp[1] * 0.55 + 32); c.lineTo(cp[0] * 0.5 + 11, cp[1] * 0.5 + 40); }, CAT.stripe, 8);
      circ(x, tip[0], tip[1], 5.6, CAT.stripe, CAT.out, 2.4);
      shine(x, tip[0] - 1.6, tip[1] - 1.8, 2, 1.3, -0.5);
    };
    if (tail === 0) tailDraw([4, 52], [6, 30], [7, 27]);
    else tailDraw([-2, 62], [-4, 44], [-5, 41]);
    /* 后腿 */
    blob(x, ellPath(34 + (o.legB || 0), 80, 8.5, 7.5), lg(x, 0, 72, 0, 88, [[0, CAT.headBot], [1, CAT.furBot]]), { ow: 3.5 });
    /* 身体：渐变 + 双描边 */
    blob(x, ellPath(47, 62, 26, 21 + br * 0.8),
      lg(x, 0, 40, 0, 84, [[0, CAT.furTop], [0.55, '#ffb970'], [1, CAT.furBot]]), { ow: 4 });
    /* 肚皮（柔边） */
    x.save();
    ell(x, 50, 69, 15, 12.5, rg(x, 50, 66, 3, 17, [[0, CAT.cream], [0.75, '#fff0d6'], [1, 'rgba(255,240,214,0)']]));
    x.restore();
    /* 背部条纹 */
    x.save(); x.globalAlpha = 0.9;
    strokePath(x, c => { c.moveTo(32, 46); c.quadraticCurveTo(36, 52, 32, 58); }, CAT.stripe, 5);
    strokePath(x, c => { c.moveTo(44, 42); c.quadraticCurveTo(48, 49, 44, 56); }, CAT.stripe, 5);
    x.restore();
    /* 前腿（走路抬起时露爪垫） */
    const fLeg = 62 + (o.legF || 0);
    blob(x, ellPath(fLeg, 81, 8, 7.5), lg(x, 0, 73, 0, 89, [[0, CAT.headBot], [1, CAT.furBot]]), { ow: 3.5 });
    if (o.legF < -2) { // 抬起的爪爪
      circ(x, fLeg - 2.4, 84.5, 1.5, CAT.earIn); circ(x, fLeg + 1.6, 85, 1.5, CAT.earIn); circ(x, fLeg, 82.6, 1.8, CAT.earIn);
    }
    /* 项圈 + 铃铛（脖子处） */
    x.save();
    x.beginPath(); x.ellipse(60, 56, 21, 15, 0, Math.PI * 0.18, Math.PI * 0.86);
    x.lineWidth = 7.5; x.strokeStyle = CAT.collar; x.stroke();
    x.beginPath(); x.ellipse(60, 56, 21, 15, 0, Math.PI * 0.18, Math.PI * 0.86);
    x.lineWidth = 2; x.strokeStyle = '#b03f43'; x.stroke();
    x.beginPath(); x.ellipse(60, 56, 21, 15, 0, Math.PI * 0.24, Math.PI * 0.8);
    x.lineWidth = 1.6; x.strokeStyle = 'rgba(255,255,255,.45)'; x.stroke();
    circ(x, 60, 72, 5, lg(x, 0, 67, 0, 77, [[0, '#ffe08a'], [1, '#f0b13c']]), '#b57b1e', 2);
    strokePath(x, c => { c.moveTo(60, 74.5); c.lineTo(60, 77.5); }, '#b57b1e', 1.6);
    shine(x, 58.2, 70, 1.6, 1.1, -0.4);
    x.restore();
    /* ----- 头部 ----- */
    const hy = 38 + (o.br ? -0.8 : 0);
    // 耳朵（先画，被头压住底部）
    if (o.face === 'hurt') { // 受击耳朵压平
      catEar(x, [46, 22, 62, 16], [0], [36, 8], false);
      catEar(x, [78, 20, 92, 15], [0], [96, 10], true);
    } else {
      catEar(x, [45, 22, 61, 15], [0], [40, 2], false);
      catEar(x, [75, 20, 91, 14], [0], [88, 3], true);
    }
    // 头：渐变 + 双描边 + 脸侧绒毛
    blob(x, circPath(64, hy, 26), rg(x, 58, hy - 8, 6, 34, [[0, CAT.headTop], [0.7, CAT.headBot], [1, '#ef8f45']]), { ow: 4 });
    // 脸侧绒毛（小三角）
    x.fillStyle = '#ffe9c9';
    for (const [fx, fy, dir] of [[40, hy + 6, -1], [88, hy + 4, 1]]) {
      x.beginPath();
      x.moveTo(fx, fy - 3); x.lineTo(fx + dir * 6, fy + 1); x.lineTo(fx, fy + 3);
      x.lineTo(fx + dir * 5, fy + 5.5); x.lineTo(fx, fy + 8);
      x.closePath(); x.fill();
    }
    // 额头条纹
    x.save(); x.globalAlpha = 0.92;
    strokePath(x, c => { c.moveTo(58, hy - 24); c.lineTo(58, hy - 17); }, CAT.stripe, 4);
    strokePath(x, c => { c.moveTo(65, hy - 26); c.lineTo(65, hy - 18); }, CAT.stripe, 4);
    strokePath(x, c => { c.moveTo(72, hy - 24); c.lineTo(72, hy - 17); }, CAT.stripe, 4);
    x.restore();
    // 眼睛
    const eyeList = [[52, hy - 2, 7], [77, hy - 4, 8]];
    if (o.face === 'hurt') {
      strokePath(x, c => { c.moveTo(47, hy - 6); c.lineTo(57, hy + 1); c.moveTo(57, hy - 6); c.lineTo(47, hy + 1); }, OUT, 3);
      strokePath(x, c => { c.moveTo(72, hy - 8); c.lineTo(82, hy - 1); c.moveTo(82, hy - 8); c.lineTo(72, hy - 1); }, OUT, 3);
      sweat(x, 90, hy - 18, 1.1);
    } else eyesFor(x, eyeList, o.face === 'blink' ? 'blink' : 'open');
    // 腮红
    blush(x, 44, hy + 9, 6.2); blush(x, 85, hy + 7, 6.6);
    // 鼻子 + 嘴 ω
    x.save(); x.translate(64, hy + 8);
    x.beginPath(); x.moveTo(-3.4, -1.6); x.lineTo(3.4, -1.6); x.lineTo(0, 2.6);
    x.closePath(); x.fillStyle = CAT.nose; x.fill();
    x.lineWidth = 2; x.strokeStyle = CAT.out; x.stroke();
    x.restore();
    if (o.face === 'hurt') {
      strokePath(x, c => { c.moveTo(64, hy + 11); c.quadraticCurveTo(60, hy + 15, 57, hy + 11); c.quadraticCurveTo(64, hy + 17, 71, hy + 11); }, OUT, 2.2);
    } else {
      strokePath(x, c => {
        c.moveTo(64, hy + 11); c.quadraticCurveTo(60, hy + 15, 56.5, hy + 12);
        c.moveTo(64, hy + 11); c.quadraticCurveTo(68, hy + 15, 71.5, hy + 12);
      }, OUT, 2.2);
    }
    // 胡须
    x.save(); x.globalAlpha = 0.85; x.lineWidth = 1.8; x.strokeStyle = '#fff';
    x.beginPath();
    x.moveTo(42, hy + 6); x.lineTo(28, hy + 3);
    x.moveTo(42, hy + 11); x.lineTo(29, hy + 13);
    x.moveTo(86, hy + 4); x.lineTo(100, hy);
    x.moveTo(86, hy + 9); x.lineTo(100, hy + 12);
    x.stroke(); x.restore();
    x.restore();
  }
  // 死亡：侧躺安睡（不血腥，闭眼 + 小气泡）
  function drawCatDead(x) {
    groundShadow(x, 56, 88, 34, 8);
    // 尾巴
    strokePath(x, c => { c.moveTo(80, 78); c.quadraticCurveTo(96, 80, 98, 68); }, CAT.out, 12);
    strokePath(x, c => { c.moveTo(80, 78); c.quadraticCurveTo(96, 80, 98, 68); }, CAT.furBot, 8.4);
    circ(x, 98, 66, 5.2, CAT.stripe, CAT.out, 2.2);
    // 身体（侧躺）
    blob(x, ellPath(58, 78, 30, 14), lg(x, 0, 62, 0, 94, [[0, CAT.furTop], [1, CAT.furBot]]), { ow: 4 });
    x.save();
    ell(x, 60, 84, 17, 8, rg(x, 60, 82, 3, 19, [[0, CAT.cream], [1, 'rgba(255,240,214,0)']]));
    x.restore();
    // 上侧的小腿（翘着）
    blob(x, ellPath(74, 66, 8, 6.5), CAT.headBot, { ow: 3.2 });
    blob(x, ellPath(50, 65, 7.5, 6), CAT.headBot, { ow: 3.2 });
    circ(x, 74, 64.5, 1.6, CAT.earIn); circ(x, 50, 63.6, 1.5, CAT.earIn);
    // 头（歪着贴地）
    blob(x, circPath(26, 70, 22), rg(x, 20, 62, 5, 30, [[0, CAT.headTop], [1, CAT.headBot]]), { ow: 4 });
    catEar(x, [12, 60, 26, 55], [0], [8, 46], false);
    catEar(x, [32, 52, 44, 56], [0], [42, 44], true);
    // 闭眼 + 小舌头
    eyesFor(x, [[18, 70, 5.5], [33, 68, 6]], 'blink');
    blush(x, 12, 76, 5); blush(x, 40, 74, 5);
    ell(x, 25, 78, 2.8, 2, CAT.nose, OUT, 1.8);
    strokePath(x, c => { c.moveTo(25, 80); c.quadraticCurveTo(23, 83, 20.5, 81); c.moveTo(25, 80); c.quadraticCurveTo(27, 83, 29.5, 81); }, OUT, 1.8);
    x.save(); x.translate(30, 84);
    ell(x, 0, 1.5, 2.6, 3.6, '#ff9db0', '#d96a8f', 1.4);
    x.restore();
    // Zzz
    x.fillStyle = 'rgba(255,255,255,.9)';
    x.font = '700 11px "ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
    x.fillText('z', 44, 44); x.font = '700 8px sans-serif'; x.fillText('z', 51, 37); x.font = '700 6px sans-serif'; x.fillText('z', 57, 32);
  }

  const P_WALK = [0, 1, 2, 3].map(i => bake2(112, 112, x => drawCat(x, {
    legF: [4, 0, -4, 0][i], legB: [-4, 0, 4, 0][i], bob: [-1.6, 0, -1.6, 0][i], tail: i % 2
  })));
  const P_IDLE = [0, 1].map(i => bake2(112, 112, x => drawCat(x, { br: i, tail: i })));
  const P_BLINK = bake2(112, 112, x => drawCat(x, { br: 0, tail: 0, face: 'blink' }));
  const P_HURT = bake2(112, 112, x => drawCat(x, { br: 0, tail: 1, face: 'hurt' }));
  const P_DEAD = bake2(112, 112, x => drawCat(x, { dead: true }));
  const playerFrames = { walk: P_WALK, idle: P_IDLE, blink: P_BLINK, hurt: P_HURT, dead: P_DEAD };
  const playerWhite = whiteVersion(P_IDLE[0]);

  /* ----- 菜单大猫：坐姿举爪（两帧尾巴 + 眨眼） ----- */
  function drawMenuCat(x, o) {
    o = o || {};
    // 尾巴两帧
    const tp = o.tail ? [[58, 46], [50, 14]] : [[64, 52], [64, 24]];
    strokePath(x, c => { c.moveTo(34, 66); c.quadraticCurveTo(tp[0][0], tp[0][1], tp[1][0], tp[1][1]); }, '#6b4436', 14);
    strokePath(x, c => { c.moveTo(34, 66); c.quadraticCurveTo(tp[0][0], tp[0][1], tp[1][0], tp[1][1]); }, CAT.furBot, 10);
    strokePath(x, c => { c.moveTo(tp[0][0] * 0.5 + 19, tp[0][1] * 0.5 + 38); c.lineTo(tp[0][0] * 0.45 + 18, tp[0][1] * 0.45 + 46); }, CAT.stripe, 9);
    circ(x, tp[1][0], tp[1][1], 6.2, CAT.stripe, '#6b4436', 2.6);
    shine(x, tp[1][0] - 2, tp[1][1] - 2, 2.2, 1.4, -0.5);
    // 后脚
    blob(x, ellPath(-20, 76, 11, 9), lg(x, 0, 68, 0, 86, [[0, CAT.headBot], [1, CAT.furBot]]), { ow: 4 });
    blob(x, ellPath(20, 76, 11, 9), lg(x, 0, 68, 0, 86, [[0, CAT.headBot], [1, CAT.furBot]]), { ow: 4 });
    // 身体（坐姿）
    blob(x, ellPath(0, 42, 34, 36), lg(x, 0, 6, 0, 80, [[0, CAT.furTop], [0.6, '#ffb970'], [1, CAT.furBot]]), { ow: 5 });
    ell(x, 0, 52, 22, 22, rg(x, 0, 48, 4, 26, [[0, CAT.cream], [0.72, '#fff0d6'], [1, 'rgba(255,240,214,0)']]));
    // 背部条纹
    x.save(); x.globalAlpha = 0.9;
    strokePath(x, c => { c.moveTo(-24, 22); c.quadraticCurveTo(-19, 30, -23, 38); }, CAT.stripe, 6);
    strokePath(x, c => { c.moveTo(26, 24); c.quadraticCurveTo(21, 32, 25, 40); }, CAT.stripe, 6);
    x.restore();
    // 前爪一只撑地
    blob(x, ellPath(-16, 62, 10, 11), CAT.headBot, { ow: 4 });
    circ(x, -18, 64, 1.8, CAT.earIn); circ(x, -13.6, 64, 1.8, CAT.earIn);
    // 举起的爪（挥手）
    x.save(); x.translate(20, 30); x.rotate(o.wave ? -0.65 : -0.5);
    blob(x, ellPath(7, 0, 10, 11), CAT.headBot, { ow: 4 });
    circ(x, 15, -8, 7.5, CAT.headBot, '#6b4436', 4);
    circ(x, 15, -8, 3.6, CAT.earIn);
    shine(x, 12.6, -10.4, 1.6, 1.1, -0.4);
    x.restore();
    // 头
    blob(x, circPath(0, -20, 34), rg(x, -8, -30, 8, 44, [[0, CAT.headTop], [0.7, CAT.headBot], [1, '#ef8f45']]), { ow: 5 });
    // 耳朵
    const ear = (cx, flip) => {
      x.beginPath();
      x.moveTo(cx - 13 * (flip ? -1 : 1), -44); x.lineTo(cx - 19 * (flip ? -1 : 1), -68); x.lineTo(cx + 8 * (flip ? -1 : 1), -50);
      x.closePath(); x.fillStyle = CAT.headTop; x.fill(); x.lineWidth = 4.5; x.strokeStyle = '#6b4436'; x.stroke();
      x.beginPath();
      x.moveTo(cx - 9 * (flip ? -1 : 1), -46); x.lineTo(cx - 13 * (flip ? -1 : 1), -61); x.lineTo(cx + 3 * (flip ? -1 : 1), -50);
      x.closePath(); x.fillStyle = CAT.earIn; x.fill();
    };
    ear(-16, false); ear(18, true);
    // 额头条纹
    x.save(); x.globalAlpha = 0.92;
    strokePath(x, c => { c.moveTo(-5, -54); c.lineTo(-5, -46); }, CAT.stripe, 5);
    strokePath(x, c => { c.moveTo(4, -55); c.lineTo(4, -47); }, CAT.stripe, 5);
    x.restore();
    // 眼睛
    eyesFor(x, [[-13, -22, 8.5], [15, -23, 9.5]], o.blink ? 'blink' : 'open');
    blush(x, -24, -10, 7.5); blush(x, 26, -11, 8);
    // 鼻嘴
    ell(x, 1, -10, 3.8, 2.8, CAT.nose, '#6b4436', 2.2);
    strokePath(x, c => {
      c.moveTo(1, -7); c.quadraticCurveTo(-4, -2, -8.5, -5);
      c.moveTo(1, -7); c.quadraticCurveTo(6, -2, 10.5, -5);
    }, '#6b4436', 2.4);
    // 胡须
    x.save(); x.globalAlpha = 0.85; x.lineWidth = 2; x.strokeStyle = '#fff';
    x.beginPath();
    x.moveTo(-30, -16); x.lineTo(-50, -20); x.moveTo(-30, -10); x.lineTo(-49, -6);
    x.moveTo(32, -17); x.lineTo(52, -21); x.moveTo(32, -11); x.lineTo(51, -7);
    x.stroke(); x.restore();
    // 项圈铃铛
    x.beginPath(); x.ellipse(0, 12, 24, 12, 0, Math.PI * 0.12, Math.PI * 0.88);
    x.lineWidth = 8; x.strokeStyle = CAT.collar; x.stroke();
    x.beginPath(); x.ellipse(0, 12, 24, 12, 0, Math.PI * 0.2, Math.PI * 0.82);
    x.lineWidth = 1.8; x.strokeStyle = 'rgba(255,255,255,.4)'; x.stroke();
    circ(x, 0, 24, 6, lg(x, 0, 18, 0, 30, [[0, '#ffe08a'], [1, '#f0b13c']]), '#b57b1e', 2.2);
    strokePath(x, c => { c.moveTo(0, 27); c.lineTo(0, 30.5); }, '#b57b1e', 1.8);
    shine(x, -2.2, 21.6, 1.9, 1.3, -0.4);
    // 心心
    if (o.heart) {
      x.save(); x.translate(48, -58); x.scale(1.15, 1.15);
      x.fillStyle = '#ff7daa';
      x.beginPath(); x.moveTo(0, 4);
      x.bezierCurveTo(-9, -5, -3.4, -12, 0, -6.5);
      x.bezierCurveTo(3.4, -12, 9, -5, 0, 4);
      x.fill();
      shine(x, -3, -6, 1.6, 1.1, -0.4);
      x.restore();
    }
  }
  const menuCat = [0, 1].map(t => bake2(150, 150, x => { x.translate(58, 66); x.scale(1.02, 1.02); drawMenuCat(x, { tail: t, wave: t === 1, heart: t === 1 }); }));
  const menuCatBlink = bake2(150, 150, x => { x.translate(58, 66); x.scale(1.02, 1.02); drawMenuCat(x, { tail: 0, blink: true }); });

  /* ============================================================
     敌人：绘本风重制（64 单位空间；每只 4 帧：走A/走B/眨眼/惊讶）
     ============================================================ */
  function bakeSet(draw) {
    return {
      walk: [0, 1].map(i => bake2(64, 64, x => draw(x, i, 'open'))),
      blink: [bake2(64, 64, x => draw(x, 0, 'blink'))],
      hurt: [bake2(64, 64, x => draw(x, 0, 'hurt'))]
    };
  }
  const E = {}, EW = {}, EB = {}, EH = {};

  /* 灰灰鼠 */
  E.rat = bakeSet((x, f, mode) => {
    const legA = f ? -3 : 3;
    strokePath(x, c => { c.moveTo(12, 40); c.quadraticCurveTo(-2, 42, -4, 52); }, '#e893a9', 5.5);
    circ(x, -4, 53, 3.6, '#f4a7b9', OUT, 2);
    blob(x, ellPath(26 + legA, 52, 6, 5), '#8d93aa', { ow: 3 });
    blob(x, ellPath(40 - legA, 53, 6, 5), '#8d93aa', { ow: 3 });
    blob(x, ellPath(32, 38, 22, 17), lg(x, 0, 20, 0, 56, [[0, '#b4bacd'], [1, '#969db5']]), { ow: 3.6 });
    x.save();
    ell(x, 32, 44, 13, 8.5, rg(x, 32, 42, 2, 14, [[0, '#e6e9f4'], [1, 'rgba(214,219,236,0)']]));
    x.restore();
    circ(x, 14, 18, 9, '#a6adc4', OUT, 3); circ(x, 40, 15, 9, '#a6adc4', OUT, 3);
    circ(x, 14, 18, 5.2, '#ffc9d4'); circ(x, 40, 15, 5.2, '#ffc9d4');
    blob(x, circPath(29, 28, 14.5), lg(x, 0, 14, 0, 42, [[0, '#b4bacd'], [1, '#9aa1b8']]), { ow: 3.4 });
    eyesFor(x, [[22, 27, 4.6], [35, 26, 5.2]], mode);
    blush(x, 17, 34, 4); blush(x, 39, 33, 4.5);
    if (mode === 'hurt') { mouthO(x, 29, 35, 1); sweat(x, 44, 14, 0.9); }
    else {
      ell(x, 29, 33, 2.6, 2, '#ff8f9f', OUT, 1.6);
      strokePath(x, c => {
        c.moveTo(29, 35); c.quadraticCurveTo(26, 38, 24, 36);
        c.moveTo(29, 35); c.quadraticCurveTo(32, 38, 34, 36);
      }, OUT, 1.8);
    }
    x.save(); x.fillStyle = '#fff'; x.strokeStyle = OUT; x.lineWidth = 1.4;
    if (mode !== 'hurt') {
      rr(x, 26, 36, 3.4, 5, 1.4); x.fill(); x.stroke();
      rr(x, 30, 36, 3.4, 5, 1.4); x.fill(); x.stroke();
    }
    x.restore();
    x.lineWidth = 1.6; x.strokeStyle = 'rgba(255,255,255,.9)';
    x.beginPath();
    x.moveTo(16, 32); x.lineTo(6, 30); x.moveTo(16, 35); x.lineTo(7, 38);
    x.moveTo(42, 31); x.lineTo(52, 28); x.moveTo(42, 34); x.lineTo(52, 36);
    x.stroke();
  });

  /* 小麻雀 */
  E.sparrow = bakeSet((x, f, mode) => {
    const wingY = f ? -6 : 2;
    ell(x, 32, 54, 12, 4, '#e0a35c', OUT, 2.4);
    blob(x, ellPath(17, 34 + wingY, 12, 7.4), lg(x, 0, 26, 0, 42, [[0, '#b98a52'], [1, '#96703e']]), { ow: 3.2 });
    blob(x, ellPath(47, 34 + wingY, 12, 7.4), lg(x, 0, 26, 0, 42, [[0, '#b98a52'], [1, '#96703e']]), { ow: 3.2 });
    blob(x, ellPath(32, 36, 17, 15), lg(x, 0, 20, 0, 52, [[0, '#d29a5c'], [1, '#bd854a']]), { ow: 3.6 });
    x.save();
    ell(x, 32, 42, 11, 8, rg(x, 32, 40, 2, 12, [[0, '#f2d3a6'], [1, 'rgba(232,193,147,0)']]));
    x.restore();
    blob(x, circPath(32, 22, 11.5), lg(x, 0, 10, 0, 34, [[0, '#d8a668'], [1, '#c08748']]), { ow: 3.4 });
    strokePath(x, c => { c.moveTo(32, 11); c.quadraticCurveTo(30, 4, 37, 4); }, '#8a6236', 3);
    eyesFor(x, [[27, 21, 3.9], [37, 21, 3.9]], mode);
    blush(x, 23, 26, 3.4); blush(x, 41, 26, 3.4);
    if (mode === 'hurt') { mouthO(x, 32, 27, 1); sweat(x, 44, 10, 0.8); }
    else {
      x.save(); x.translate(32, 27);
      x.beginPath(); x.moveTo(-4, 0); x.lineTo(4, 0); x.lineTo(0, 5); x.closePath();
      x.fillStyle = '#ffb545'; x.fill(); x.lineWidth = 2; x.strokeStyle = OUT; x.stroke();
      x.restore();
    }
  });

  /* 蜗牛仔 */
  E.snail = bakeSet((x, f, mode) => {
    const wob = f ? 1 : -1;
    blob(x, ellPath(30, 48, 24, 9), lg(x, 0, 38, 0, 58, [[0, '#b2d18f'], [1, '#8cb269']]), { ow: 3.6 });
    strokePath(x, c => { c.moveTo(46, 44); c.quadraticCurveTo(52 + wob, 30, 50 + wob, 22); }, '#9ec27b', 4.5);
    strokePath(x, c => { c.moveTo(38, 44); c.quadraticCurveTo(40 + wob, 32, 38 + wob, 24); }, '#9ec27b', 4.5);
    eyesFor(x, [[50 + wob, 19, 4.6], [38 + wob, 21, 4.2]], mode);
    blush(x, 44 + wob, 40, 3.6);
    if (mode === 'hurt') { mouthO(x, 42, 46, 0.9); sweat(x, 55, 12, 0.8); }
    else strokePath(x, c => { c.moveTo(44, 46); c.quadraticCurveTo(41, 49, 38, 47); }, OUT, 1.6);
    blob(x, circPath(22, 30, 17), lg(x, 0, 12, 0, 48, [[0, '#f0c47e'], [1, '#dfae5f']]), { ow: 3.8 });
    x.save();
    x.strokeStyle = '#c49347'; x.lineWidth = 4;
    x.beginPath(); x.arc(22, 30, 11, 0, U.TAU); x.stroke();
    x.lineWidth = 3.2;
    x.beginPath(); x.arc(22, 30, 5.5, 0, U.TAU); x.stroke();
    x.restore();
    shine(x, 15, 20, 5, 3, -0.4);
    // 壳上的小雏菊
    circ(x, 9, 17, 2.6, '#fff', '#e8d9a0', 1.2); circ(x, 9, 17, 1, '#ffd34d');
  });

  /* 大白鹅 */
  E.goose = bakeSet((x, f, mode) => {
    const legA = f ? -3 : 3;
    const bob = f ? 1.5 : 0;
    ell(x, 24 + legA, 56, 7, 4, '#ff9d3c', OUT, 2.4);
    ell(x, 40 - legA, 56, 7, 4, '#ff9d3c', OUT, 2.4);
    blob(x, ellPath(30, 40, 22, 16), lg(x, 0, 22, 0, 58, [[0, '#ffffff'], [1, '#e8e4d8']]), { ow: 3.6 });
    x.save();
    ell(x, 30, 45, 13, 8, rg(x, 30, 43, 2, 14, [[0, '#fffef8'], [1, 'rgba(255,255,248,0)']]));
    x.restore();
    x.beginPath(); x.moveTo(12, 34); x.quadraticCurveTo(4, 28, 8, 22);
    x.quadraticCurveTo(14, 26, 16, 30); x.closePath();
    x.fillStyle = '#f4f1e8'; x.fill(); x.lineWidth = 3.2; x.strokeStyle = OUT; x.stroke();
    strokePath(x, c => { c.moveTo(44, 36); c.quadraticCurveTo(50, 24, 46, 16 + bob); }, '#f4f1e8', 11);
    blob(x, circPath(45, 12 + bob, 9.5), lg(x, 0, 2, 0, 22, [[0, '#ffffff'], [1, '#eceadf']]), { ow: 3.2 });
    eyesFor(x, [[42, 10 + bob, 3.7], [50, 9 + bob, 4.1]], mode);
    blush(x, 40, 15 + bob, 3.2);
    if (mode === 'hurt') { mouthO(x, 53, 13 + bob, 0.8); sweat(x, 54, 1 + bob, 0.8); }
    else {
      x.save(); x.translate(53, 12 + bob);
      x.beginPath(); x.moveTo(-1, -3); x.quadraticCurveTo(10, -1, 9, 2); x.quadraticCurveTo(4, 4, -1, 3);
      x.closePath(); x.fillStyle = '#ff9d3c'; x.fill(); x.lineWidth = 2; x.strokeStyle = OUT; x.stroke();
      x.restore();
    }
  });

  /* 蝙蝠仔 */
  E.bat = bakeSet((x, f, mode) => {
    const wingY = f ? 4 : -4;
    const wing = sx => {
      x.save(); x.translate(32, 30); x.scale(sx, 1);
      x.beginPath();
      x.moveTo(-6, -2);
      x.quadraticCurveTo(-20, -10 + wingY, -30, -2 + wingY);
      x.quadraticCurveTo(-24, 2 + wingY, -22, 6 + wingY);
      x.quadraticCurveTo(-16, 2 + wingY, -14, 8 + wingY);
      x.quadraticCurveTo(-10, 4 + wingY, -6, 6);
      x.closePath();
      x.fillStyle = '#7a68c9'; x.fill(); x.lineWidth = 3.2; x.strokeStyle = OUT; x.stroke();
      x.restore();
    };
    wing(1); wing(-1);
    blob(x, circPath(32, 30, 13.5), lg(x, 0, 16, 0, 44, [[0, '#b0a2ee'], [1, '#9484d8']]), { ow: 3.6 });
    x.beginPath(); x.moveTo(23, 22); x.lineTo(20, 8); x.lineTo(30, 17); x.closePath();
    x.fillStyle = '#9c8ce0'; x.fill(); x.lineWidth = 3; x.strokeStyle = OUT; x.stroke();
    x.beginPath(); x.moveTo(41, 22); x.lineTo(44, 8); x.lineTo(34, 17); x.closePath();
    x.fillStyle = '#9c8ce0'; x.fill(); x.stroke();
    circ(x, 21, 9, 2, '#9c8ce0', OUT, 2); circ(x, 43, 9, 2, '#9c8ce0', OUT, 2);
    eyesFor(x, [[27, 29, 4.2], [37, 29, 4.2]], mode);
    blush(x, 23, 34, 3.4); blush(x, 41, 34, 3.4);
    if (mode === 'hurt') { mouthO(x, 32, 36, 1); sweat(x, 45, 16, 0.8); }
    else {
      ell(x, 32, 35, 2.2, 1.8, '#ff8f9f');
      x.fillStyle = '#fff';
      x.beginPath(); x.moveTo(28, 38); x.lineTo(30, 43); x.lineTo(32, 38); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(32, 38); x.lineTo(34, 43); x.lineTo(36, 38); x.closePath(); x.fill();
    }
  });

  /* 浣熊团子 */
  E.raccoon = bakeSet((x, f, mode) => {
    const legA = f ? -3 : 3;
    x.save(); x.translate(10, 44); x.rotate(-0.5);
    blob(x, ellPath(0, 0, 14, 7), '#8d93aa', { ow: 3.2 });
    x.save(); x.beginPath(); x.ellipse(0, 0, 14, 7, 0, 0, U.TAU); x.clip();
    x.fillStyle = '#5c6178'; x.fillRect(-8, -8, 5, 16); x.fillRect(1, -8, 5, 16); x.fillRect(10, -8, 5, 16);
    x.restore(); x.restore();
    blob(x, ellPath(26 + legA, 52, 6, 5), '#6f748c', { ow: 3 });
    blob(x, ellPath(40 - legA, 53, 6, 5), '#6f748c', { ow: 3 });
    blob(x, ellPath(33, 38, 21, 16), lg(x, 0, 20, 0, 56, [[0, '#a8aec2'], [1, '#8f96ad']]), { ow: 3.6 });
    x.save();
    ell(x, 33, 43, 12, 8, rg(x, 33, 41, 2, 13, [[0, '#dde1ee'], [1, 'rgba(205,211,230,0)']]));
    x.restore();
    circ(x, 16, 17, 8, '#9aa0b5', OUT, 3); circ(x, 44, 15, 8, '#9aa0b5', OUT, 3);
    circ(x, 16, 17, 4.4, '#ffc9d4'); circ(x, 44, 15, 4.4, '#ffc9d4');
    blob(x, circPath(30, 28, 14.5), lg(x, 0, 14, 0, 43, [[0, '#a8aec2'], [1, '#939ab1']]), { ow: 3.4 });
    x.save(); x.globalAlpha = 0.85;
    ell(x, 23, 26, 7, 5.5, '#4c4f63'); ell(x, 38, 25, 7, 5.5, '#4c4f63');
    x.restore();
    eyesFor(x, [[23, 26, 3.9], [38, 25, 4.3]], mode);
    blush(x, 19, 33, 3.6); blush(x, 43, 32, 3.6);
    if (mode === 'hurt') { mouthO(x, 31, 35, 1); sweat(x, 46, 12, 0.85); }
    else strokePath(x, c => {
      c.moveTo(31, 35); c.quadraticCurveTo(28, 38, 26, 36);
      c.moveTo(31, 35); c.quadraticCurveTo(34, 38, 36, 36);
    }, OUT, 1.8);
    ell(x, 15, 31, 4.5, 3.5, '#e6e9f2'); ell(x, 46, 30, 4.5, 3.5, '#e6e9f2');
  });

  /* 斗牛犬 */
  E.bulldog = bakeSet((x, f, mode) => {
    const legA = f ? -2 : 2;
    blob(x, ellPath(20 + legA, 54, 7, 6), '#c9975f', { ow: 3 });
    blob(x, ellPath(42 - legA, 54, 7, 6), '#c9975f', { ow: 3 });
    blob(x, ellPath(32, 38, 24, 18), lg(x, 0, 18, 0, 58, [[0, '#e2b384'], [1, '#cd9d68']]), { ow: 3.8 });
    strokePath(x, c => { c.moveTo(10, 32); c.quadraticCurveTo(2, 28, 4, 22); }, '#c9975f', 5.5);
    blob(x, circPath(33, 24, 16.5), lg(x, 0, 8, 0, 40, [[0, '#e5b98c'], [1, '#d2a06a']]), { ow: 3.8 });
    ell(x, 18, 16, 6, 9, '#b9834e', OUT, 3);
    ell(x, 48, 15, 6, 9, '#b9834e', OUT, 3);
    // 皱眉（惊讶时挑起）
    if (mode === 'hurt') {
      strokePath(x, c => { c.moveTo(22, 14); c.lineTo(29, 16); c.moveTo(44, 13); c.lineTo(37, 15); }, OUT, 2.4);
    } else {
      strokePath(x, c => { c.moveTo(23, 17); c.lineTo(29, 20); c.moveTo(43, 16); c.lineTo(37, 19); }, OUT, 2.6);
    }
    eyesFor(x, [[27, 24, 3.9], [39, 24, 3.9]], mode);
    blush(x, 21, 30, 3.6); blush(x, 45, 30, 3.6);
    ell(x, 33, 33, 10, 7.5, '#efe0c8', OUT, 2.8);
    if (mode === 'hurt') { mouthO(x, 33, 34, 1.2); sweat(x, 50, 8, 0.9); }
    else {
      ell(x, 33, 31, 2.6, 2, '#3a2f2a');
      x.fillStyle = '#fff'; x.strokeStyle = OUT; x.lineWidth = 1.4;
      rr(x, 27, 35, 4, 4.4, 1.6); x.fill(); x.stroke();
      rr(x, 35, 35, 4, 4.4, 1.6); x.fill(); x.stroke();
    }
  });

  /* 三花姐 */
  E.calico = bakeSet((x, f, mode) => {
    const legA = f ? -3 : 3;
    strokePath(x, c => { c.moveTo(12, 42); c.quadraticCurveTo(-2, 38, 0, 22); }, '#e2e2e8', 6.5);
    circ(x, 1, 20, 4.2, '#e2e2e8', OUT, 2);
    blob(x, ellPath(26 + legA, 52, 6, 5), '#e8e8ee', { ow: 3 });
    blob(x, ellPath(40 - legA, 53, 6, 5), '#e8e8ee', { ow: 3 });
    blob(x, ellPath(32, 38, 21, 16), lg(x, 0, 20, 0, 56, [[0, '#ffffff'], [1, '#e9e9f0']]), { ow: 3.6 });
    x.save();
    x.beginPath(); x.ellipse(32, 38, 21, 16, 0, 0, U.TAU); x.clip();
    ell(x, 22, 32, 10, 7, '#f0a35e'); ell(x, 42, 44, 9, 6, '#4c4f63');
    x.restore();
    circ(x, 16, 17, 8, '#f2f2f6', OUT, 3); circ(x, 44, 15, 8, '#f2f2f6', OUT, 3);
    x.save();
    x.beginPath(); x.arc(16, 17, 8, 0, U.TAU); x.clip();
    ell(x, 14, 20, 6, 5, '#f0a35e'); x.restore();
    x.save();
    x.beginPath(); x.arc(44, 15, 8, 0, U.TAU); x.clip();
    ell(x, 46, 11, 5, 5, '#4c4f63'); x.restore();
    blob(x, circPath(30, 28, 14.5), lg(x, 0, 14, 0, 43, [[0, '#ffffff'], [1, '#ececf2']]), { ow: 3.4 });
    x.save();
    x.beginPath(); x.arc(30, 28, 14.5, 0, U.TAU); x.clip();
    ell(x, 30, 15, 7, 6, '#4c4f63'); ell(x, 19, 22, 6, 5, '#f0a35e');
    x.restore();
    eyesFor(x, [[24, 28, 4.3], [37, 27, 4.7]], mode);
    blush(x, 20, 34, 3.8); blush(x, 41, 33, 4);
    if (mode === 'hurt') { mouthO(x, 31, 35, 1); sweat(x, 46, 12, 0.85); }
    else {
      ell(x, 31, 33, 2.4, 1.9, '#ff8f9f', OUT, 1.6);
      strokePath(x, c => {
        c.moveTo(31, 35); c.quadraticCurveTo(28, 38, 26, 36);
        c.moveTo(31, 35); c.quadraticCurveTo(34, 38, 36, 36);
      }, OUT, 1.8);
    }
  });

  /* 鸽子咕咕 */
  E.pigeon = bakeSet((x, f, mode) => {
    const bob = f ? 1.5 : 0;
    ell(x, 26, 55, 7, 3.6, '#e08a4e', OUT, 2.4); ell(x, 38, 55, 7, 3.6, '#e08a4e', OUT, 2.4);
    blob(x, ellPath(32, 38, 20, 16), lg(x, 0, 20, 0, 56, [[0, '#b6c5d8'], [1, '#97a9c0']]), { ow: 3.6 });
    strokePath(x, c => { c.moveTo(18, 36); c.quadraticCurveTo(24, 42, 32, 42); }, '#7e91aa', 3);
    x.save();
    ell(x, 32, 44, 11, 7, rg(x, 32, 42, 2, 12, [[0, '#d3dce8'], [1, 'rgba(196,207,221,0)']]));
    x.restore();
    blob(x, circPath(40, 22 + bob, 11.5), lg(x, 0, 10, 0, 34, [[0, '#bfcce0'], [1, '#a2b3c9']]), { ow: 3.4 });
    ell(x, 36, 30 + bob, 4, 3, rg(x, 36, 30, 0.5, 4.4, [[0, '#8fd4ab'], [1, 'rgba(127,201,154,0)']]));
    eyesFor(x, [[36, 20 + bob, 3.5], [45, 19 + bob, 3.9]], mode);
    blush(x, 35, 25 + bob, 3);
    if (mode === 'hurt') { mouthO(x, 50, 23 + bob, 0.8); sweat(x, 48, 8 + bob, 0.8); }
    else {
      x.save(); x.translate(49, 22 + bob);
      x.beginPath(); x.moveTo(-1, -2.6); x.lineTo(7, 0.4); x.lineTo(-1, 3); x.closePath();
      x.fillStyle = '#e8b45c'; x.fill(); x.lineWidth = 2; x.strokeStyle = OUT; x.stroke();
      x.restore();
    }
    strokePath(x, c => { c.moveTo(38, 11 + bob); c.quadraticCurveTo(40, 6 + bob, 44, 7 + bob); }, '#7e91aa', 3);
  });

  /* Boss 鼠王·铁须（160 单位空间 + 蓄力帧） */
  function drawBoss(x, f, mode) {
    x.save();
    x.translate(80, 88);
    x.scale(2.4, 2.4);
    const legA = f ? -3 : 3;
    const crouch = mode === 'tele' ? 3 : 0;
    x.translate(0, crouch);
    // 披风
    x.beginPath();
    x.moveTo(-18, -6); x.quadraticCurveTo(-32, 14, -24, 24);
    x.lineTo(26, 24); x.quadraticCurveTo(34, 12, 20, -6);
    x.closePath();
    x.fillStyle = lg(x, 0, -6, 0, 24, [[0, '#d15a74'], [1, '#a83a52']]);
    x.fill(); x.lineWidth = 3.4; x.strokeStyle = OUT; x.stroke();
    x.beginPath();
    x.moveTo(-16, -2); x.quadraticCurveTo(-26, 14, -20, 20);
    x.lineTo(22, 20); x.lineWidth = 1.6; x.strokeStyle = 'rgba(255,255,255,.25)'; x.stroke();
    // 尾巴
    strokePath(x, c => { c.moveTo(-6, 40); c.quadraticCurveTo(-14, 42, -16, 54); }, '#e893a9', 5.5);
    circ(x, -16, 55, 3.6, '#f4a7b9', OUT, 2);
    // 腿
    blob(x, ellPath(-10 + legA, 22, 6.5, 5.5), '#8d93aa', { ow: 3 });
    blob(x, ellPath(10 - legA, 23, 6.5, 5.5), '#8d93aa', { ow: 3 });
    // 身体
    blob(x, ellPath(0, 8, 21, 17), lg(x, 0, -10, 0, 26, [[0, '#b4bacd'], [1, '#939aad']]), { ow: 3.6 });
    x.save();
    ell(x, 0, 13, 13, 9, rg(x, 0, 11, 2, 14, [[0, '#e6e9f4'], [1, 'rgba(205,211,230,0)']]));
    x.restore();
    // 耳朵
    circ(x, -16, -24, 9, '#a6adc4', OUT, 3); circ(x, 14, -26, 9, '#a6adc4', OUT, 3);
    circ(x, -16, -24, 5, '#ffc9d4'); circ(x, 14, -26, 5, '#ffc9d4');
    // 头
    blob(x, circPath(0, -12, 16.5), lg(x, 0, -28, 0, 4, [[0, '#b8bed1'], [1, '#99a0b8']]), { ow: 3.6 });
    // 眉毛
    strokePath(x, c => { c.moveTo(-10, -19); c.lineTo(-4, -16); c.moveTo(10, -20); c.lineTo(4, -17); }, OUT, 2.8);
    eyesFor(x, [[-7, -12, 4.8], [7, -13, 5.2]], mode);
    blush(x, -13, -5, 4); blush(x, 13, -6, 4.2);
    ell(x, 0, -6, 2.8, 2.2, '#ff8f9f', OUT, 1.8);
    if (mode === 'hurt') { mouthO(x, 0, -2, 1.3); sweat(x, 13, -24, 1); }
    else {
      strokePath(x, c => {
        c.moveTo(0, -4); c.quadraticCurveTo(-4, -1, -6, -3);
        c.moveTo(0, -4); c.quadraticCurveTo(4, -1, 6, -3);
      }, OUT, 1.8);
      x.fillStyle = '#fff'; x.strokeStyle = OUT; x.lineWidth = 1.4;
      rr(x, -4, -3, 3.6, 6, 1.4); x.fill(); x.stroke();
      rr(x, 0.5, -3, 3.6, 6, 1.4); x.fill(); x.stroke();
    }
    // 胡须
    x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 1.6;
    x.beginPath();
    x.moveTo(-13, -8); x.lineTo(-24, -11); x.moveTo(-13, -5); x.lineTo(-24, -3);
    x.moveTo(13, -9); x.lineTo(24, -12); x.moveTo(13, -6); x.lineTo(24, -4);
    x.stroke();
    // 王冠
    x.save(); x.translate(0, -38 - crouch * 0.2); x.rotate(0.06);
    x.beginPath();
    x.moveTo(-10, 4); x.lineTo(-10, -4); x.lineTo(-5, 0); x.lineTo(0, -7); x.lineTo(5, 0); x.lineTo(10, -4); x.lineTo(10, 4);
    x.closePath();
    x.fillStyle = lg(x, 0, -7, 0, 4, [[0, '#ffe488'], [1, '#f0b13c']]);
    x.fill(); x.lineWidth = 2.4; x.strokeStyle = '#8a6236'; x.stroke();
    circ(x, 0, -8, 1.6, '#ff7daa'); circ(x, -6.4, -2.4, 1.1, '#7de3e0'); circ(x, 6.4, -2.4, 1.1, '#7de3e0');
    x.restore();
    x.restore();
  }
  E.boss = {
    walk: [0, 1].map(i => bake2(160, 160, x => drawBoss(x, i, 'open'))),
    blink: [bake2(160, 160, x => drawBoss(x, 0, 'blink'))],
    hurt: [bake2(160, 160, x => drawBoss(x, 0, 'hurt'))],
    tele: bake2(160, 160, x => drawBoss(x, 0, 'tele'))
  };

  /* 老鼠妈妈（240 单位空间 + 蓄力帧）：肥硕的暖棕母鼠，围裙 + 发卷，背后还趴着一只宝鼠 */
  function drawMother(x, f, mode) {
    x.save();
    // 平移/缩放让全身（发卷顶到尾巴尖）正好落进 240 画布
    x.translate(120, 96);
    x.scale(2.05, 2.05);
    const legA = f ? -3.2 : 3.2;
    const crouch = mode === 'tele' ? 3.6 : 0;
    x.translate(0, crouch);
    // 尾巴（从身体下缘长出，粉色带尾球）
    strokePath(x, c => { c.moveTo(-13, 20); c.quadraticCurveTo(-25, 28, -27, 44); }, '#e893a9', 6.5);
    circ(x, -27, 46, 4.2, '#f4a7b9', OUT, 2.2);
    // 腿
    blob(x, ellPath(-11 + legA, 27, 7.5, 6), '#9c8f7e', { ow: 3 });
    blob(x, ellPath(11 - legA, 28, 7.5, 6), '#9c8f7e', { ow: 3 });
    // 身体（肥硕，暖棕灰）
    blob(x, ellPath(0, 11, 24, 19), lg(x, 0, -6, 0, 32, [[0, '#c9b49c'], [1, '#ab967e']]), { ow: 3.6 });
    x.save();
    ell(x, 0, 16, 14, 9.5, rg(x, 0, 14, 2, 15, [[0, '#efe3d2'], [1, 'rgba(220,205,182,0)']]));
    x.restore();
    // 背后探头的宝鼠（在耳朵后面露出半张脸）
    blob(x, circPath(27, -32, 8), '#aab1c4', { ow: 2.4 });
    circ(x, 23, -39, 3.4, '#aab1c4', OUT, 2); circ(x, 32, -40, 3.4, '#aab1c4', OUT, 2);
    circ(x, 25.4, -32.4, 1.1, '#3a3350'); circ(x, 29.6, -32.6, 1.1, '#3a3350');
    // 围裙
    x.beginPath();
    x.moveTo(-13, 3); x.quadraticCurveTo(-16, 24, -10, 28);
    x.quadraticCurveTo(0, 31, 10, 28); x.quadraticCurveTo(16, 24, 13, 3);
    x.quadraticCurveTo(0, 8, -13, 3);
    x.closePath();
    x.fillStyle = '#fff4e4'; x.fill(); x.lineWidth = 3; x.strokeStyle = OUT; x.stroke();
    strokePath(x, c => { c.moveTo(-7, 14); c.quadraticCurveTo(0, 17, 7, 14); }, '#e8c9a0', 2);
    // 围裙上的心形口袋
    x.save(); x.translate(0, 21); x.scale(0.9, 0.9);
    x.beginPath();
    x.moveTo(0, 3); x.bezierCurveTo(-6.5, -2, -3, -7.5, 0, -3.5);
    x.bezierCurveTo(3, -7.5, 6.5, -2, 0, 3);
    x.fillStyle = '#ff9db5'; x.fill();
    x.restore();
    // 耳朵（大）
    circ(x, -19, -28, 11, '#bfb29c', OUT, 3); circ(x, 17, -30, 11, '#bfb29c', OUT, 3);
    circ(x, -19, -28, 6, '#ffc9d4'); circ(x, 17, -30, 6, '#ffc9d4');
    // 头（大）
    blob(x, circPath(0, -15, 19.5), lg(x, 0, -34, 0, 4, [[0, '#c9b49c'], [1, '#b09a82']]), { ow: 3.6 });
    // 发卷（三个粉色卷筒）
    for (const [rx, ry, ra] of [[-13, -37, -0.5], [0, -41, 0.15], [13, -38, 0.5]]) {
      x.save(); x.translate(rx, ry); x.rotate(ra);
      rr(x, -4.5, -3, 9, 6, 3);
      x.fillStyle = '#ffb5c8'; x.fill(); x.lineWidth = 2; x.strokeStyle = OUT; x.stroke();
      x.restore();
    }
    // 眉毛（护崽的凶相）
    strokePath(x, c => { c.moveTo(-12, -23); c.lineTo(-5, -20); c.moveTo(12, -24); c.lineTo(5, -21); }, OUT, 3);
    eyesFor(x, [[-8, -16, 5.4], [8, -17, 5.8]], mode);
    blush(x, -15, -8, 4.6); blush(x, 15, -9, 4.8);
    ell(x, 0, -8, 3, 2.4, '#ff8f9f', OUT, 1.8);
    if (mode === 'hurt') { mouthO(x, 0, -3, 1.5); sweat(x, 15, -28, 1); }
    else if (mode === 'tele') mouthO(x, 0, -4, 2.2); // 蓄力大喊
    else {
      strokePath(x, c => {
        c.moveTo(0, -5); c.quadraticCurveTo(-5, -1, -7, -4);
        c.moveTo(0, -5); c.quadraticCurveTo(5, -1, 7, -4);
      }, OUT, 2);
      x.fillStyle = '#fff'; x.strokeStyle = OUT; x.lineWidth = 1.5;
      rr(x, -5, -4, 4, 7, 1.6); x.fill(); x.stroke();
      rr(x, 0.6, -4, 4, 7, 1.6); x.fill(); x.stroke();
    }
    // 胡须
    x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 1.8;
    x.beginPath();
    x.moveTo(-16, -10); x.lineTo(-28, -13); x.moveTo(-16, -6); x.lineTo(-28, -4);
    x.moveTo(16, -11); x.lineTo(28, -14); x.moveTo(16, -7); x.lineTo(28, -5);
    x.stroke();
    x.restore();
  }
  E.mother = {
    walk: [0, 1].map(i => bake2(240, 240, x => drawMother(x, i, 'open'))),
    blink: [bake2(240, 240, x => drawMother(x, 0, 'blink'))],
    hurt: [bake2(240, 240, x => drawMother(x, 0, 'hurt'))],
    tele: bake2(240, 240, x => drawMother(x, 0, 'tele'))
  };

  // 白色受击闪版本 + 眨眼/惊讶帧表（EB/EH 已在上面声明）
  for (const k in E) {
    EW[k] = E[k].walk.map(whiteVersion);
    EB[k] = E[k].blink;
    EH[k] = E[k].hurt;
  }

  /* ============================================================
     掉落物 & 投射物
     ============================================================ */
  function fish(x, bodyC, finC, scale = 1, bellyC) {
    x.save(); x.scale(scale, scale);
    // 尾巴
    x.beginPath(); x.moveTo(-8, 0); x.lineTo(-17, -7); x.lineTo(-17, 7); x.closePath();
    x.fillStyle = finC; x.fill(); x.lineWidth = 2.6; x.strokeStyle = OUT; x.stroke();
    // 身体（渐变）
    blob(x, ellPath(0, 0, 11.5, 6.8), lg(x, 0, -7, 0, 7, [[0, '#ffffff'], [0.28, bodyC], [1, bellyC || bodyC]]), { ow: 3, oc: OUT });
    // 背鳍
    x.beginPath(); x.moveTo(-2, -5.8); x.quadraticCurveTo(1, -10.5, 5.5, -5.2); x.closePath();
    x.fillStyle = finC; x.fill(); x.lineWidth = 2.2; x.strokeStyle = OUT; x.stroke();
    // 高光 + 眼
    shine(x, 3.5, -2.5, 4, 1.8, -0.3);
    circ(x, 6.8, -0.8, 1.8, '#2b2320'); circ(x, 7.4, -1.4, 0.62, '#fff');
    x.restore();
  }
  const items = {
    gem1: bake2(44, 36, x => { x.translate(24, 19); x.rotate(-0.35); fish(x, '#cfe0f2', '#9db8d4', 0.85, '#aebfd6'); }),
    gem2: bake2(48, 40, x => { x.translate(26, 21); x.rotate(-0.35); fish(x, '#6fb7ff', '#3f80dd', 0.98, '#4d90e8'); }),
    gem3: bake2(54, 44, x => {
      x.translate(28, 23); x.rotate(-0.35); fish(x, '#ffd34d', '#ef9c2e', 1.18, '#eda93c');
      // 闪光
      x.save(); x.translate(-12, -10); x.fillStyle = '#fff';
      x.beginPath();
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; x.lineTo(Math.cos(a) * 5, Math.sin(a) * 5); x.lineTo(Math.cos(a + 0.5) * 1.8, Math.sin(a + 0.5) * 1.8); }
      x.closePath(); x.fill(); x.restore();
    }),
    coin: bake2(36, 36, x => {
      circ(x, 18, 18, 13.5, lg(x, 0, 4, 0, 32, [[0, '#ffe488'], [1, '#f0a13c']]), '#c07f1e', 3);
      circ(x, 18, 18, 9.5, '#ffedb0');
      // 猫爪浮雕
      x.fillStyle = '#e8a83c';
      ell(x, 18, 20, 3.6, 3, '#e8a83c');
      circ(x, 13.4, 15.4, 1.6, '#e8a83c'); circ(x, 17.4, 13.8, 1.6, '#e8a83c'); circ(x, 22.6, 15.4, 1.6, '#e8a83c');
      shine(x, 13, 11, 3.4, 2, -0.5);
    }),
    milk: bake2(40, 44, x => {
      x.translate(20, 23);
      x.beginPath(); x.moveTo(-9, -8); x.lineTo(9, -8); x.lineTo(13, -17); x.lineTo(-13, -17); x.closePath();
      x.fillStyle = '#7fc3ea'; x.fill(); x.lineWidth = 2.8; x.strokeStyle = OUT; x.stroke();
      blob(x, x2 => rr(x2, -11, -8, 22, 27, 5), lg(x, 0, -8, 0, 19, [[0, '#ffffff'], [1, '#f0eef8']]), { ow: 2.8 });
      circ(x, 0, 5, 6.4, '#ffeef4', '#f4b8c8', 2);
      eyesFor(x, [[-2.6, 4.2, 1.7], [2.6, 4.2, 1.7]], 'open');
      blush(x, -4.4, 7.4, 1.8); blush(x, 4.4, 7.4, 1.8);
      shine(x, -6, -3, 2.4, 5, 0);
    }),
    firework: bake2(40, 46, x => {
      x.translate(20, 25);
      blob(x, x2 => { x2.moveTo(-6.5, 12); x2.lineTo(0, -13); x2.lineTo(6.5, 12); x2.closePath(); },
        lg(x, 0, -13, 0, 12, [[0, '#ff8ba0'], [1, '#f0506b']]), { ow: 2.8 });
      circ(x, 0, -14, 4.8, lg(x, 0, -19, 0, -9, [[0, '#ffe9a0'], [1, '#f5b83c']]), OUT, 2.2);
      strokePath(x, c => { c.moveTo(-6.5, 12); c.quadraticCurveTo(-9.5, 17, -6.5, 21); }, '#8a6236', 2.4);
      strokePath(x, c => { c.moveTo(6.5, 12); c.quadraticCurveTo(9.5, 17, 6.5, 21); }, '#8a6236', 2.4);
      circ(x, 0, 0, 1.8, '#ffe9a0'); circ(x, -2.4, 6, 1.4, '#ffd9e6');
    }),
    vacuum: bake2(44, 40, x => {
      x.translate(22, 20); x.rotate(0.5);
      x.beginPath();
      x.arc(0, 0, 11, Math.PI, 0, false);
      x.lineTo(11, 8); x.lineTo(5, 8); x.lineTo(5, 0);
      x.arc(0, 0, 5, 0, Math.PI, true);
      x.lineTo(-11, 8); x.lineTo(-5, 8); x.closePath();
      x.fillStyle = lg(x, 0, -11, 0, 8, [[0, '#ff9db0'], [1, '#f0506b']]);
      x.fill(); x.lineWidth = 2.8; x.strokeStyle = OUT; x.stroke();
      x.fillStyle = '#fff';
      x.fillRect(-11, 6, 6, 5); x.fillRect(5, 6, 6, 5);
      shine(x, -4, -7, 3.4, 2, -0.4);
    }),
    chestClosed: bake2(72, 60, x => {
      groundShadow(x, 36, 57, 26, 5);
      // 箱体
      blob(x, x2 => rr(x2, 8, 22, 56, 33, 9), lg(x, 0, 22, 0, 55, [[0, '#d8a468'], [1, '#b5824a']]), { ow: 3.4 });
      // 木纹
      x.strokeStyle = 'rgba(122,84,44,.4)'; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(14, 38); x.lineTo(58, 38); x.moveTo(14, 46); x.lineTo(58, 46); x.stroke();
      // 盖
      x.beginPath(); x.moveTo(8, 30); x.quadraticCurveTo(36, 0, 64, 30); x.lineTo(64, 35); x.lineTo(8, 35); x.closePath();
      x.fillStyle = lg(x, 0, 4, 0, 35, [[0, '#c9955c'], [1, '#a97943']]); x.fill();
      x.lineWidth = 3.2; x.strokeStyle = OUT; x.stroke();
      // 金箍
      blob(x, x2 => rr(x2, 5, 29, 62, 9, 4.5), lg(x, 0, 29, 0, 38, [[0, '#ffe488'], [1, '#eeb43e']]), { ow: 2.6, oc: '#b57b1e' });
      blob(x, x2 => rr(x2, 28, 29, 16, 16, 5), lg(x, 0, 29, 0, 45, [[0, '#ffe488'], [1, '#eeb43e']]), { ow: 2.6, oc: '#b57b1e' });
      circ(x, 36, 37, 3.2, '#a97943', '#8a6236', 1.6);
      // 宝石点缀
      circ(x, 18, 33, 2, '#7de3e0', '#4fb3b0', 1.2); circ(x, 54, 33, 2, '#ff9dc3', '#e0678f', 1.2);
      // 闪光
      x.save(); x.translate(62, 10); x.fillStyle = '#fff7d8';
      x.beginPath();
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; x.lineTo(Math.cos(a) * 7.5, Math.sin(a) * 7.5); x.lineTo(Math.cos(a + 0.5) * 2.6, Math.sin(a + 0.5) * 2.6); }
      x.closePath(); x.fill(); x.restore();
    }),
    chestOpen: bake2(72, 60, x => {
      groundShadow(x, 36, 57, 26, 5);
      blob(x, x2 => rr(x2, 8, 26, 56, 30, 9), lg(x, 0, 26, 0, 56, [[0, '#a97943'], [1, '#8a6236']]), { ow: 3.4 });
      ell(x, 36, 27, 22, 6, '#5f4526', OUT, 2.6);
      x.beginPath(); x.moveTo(10, 24); x.quadraticCurveTo(36, -8, 62, 24); x.lineTo(58, 29); x.quadraticCurveTo(36, 2, 14, 29); x.closePath();
      x.fillStyle = '#c9955c'; x.fill(); x.lineWidth = 3.2; x.strokeStyle = OUT; x.stroke();
      x.save(); x.globalAlpha = 0.95;
      circ(x, 36, 27, 18, rg(x, 36, 27, 2, 18, [[0, '#fff7c8'], [1, 'rgba(255,211,77,0)']]));
      x.restore();
    })
  };

  const projs = {
    note: bake2(36, 40, x => {
      x.translate(15, 28);
      const C = '#7de3e0', D = '#3fa9a6';
      x.strokeStyle = OUT; x.lineWidth = 3.6;
      x.beginPath(); x.moveTo(1.4, 3); x.lineTo(1.4, -12); x.stroke();
      x.strokeStyle = C; x.lineWidth = 2;
      x.beginPath(); x.moveTo(-0.2, 2.4); x.lineTo(-0.2, -13); x.stroke();
      x.beginPath(); x.moveTo(-0.2, -13); x.quadraticCurveTo(8, -12, 10, -6);
      x.quadraticCurveTo(5, -8, -0.2, -7); x.closePath();
      x.fillStyle = C; x.fill(); x.lineWidth = 2.4; x.strokeStyle = OUT; x.stroke();
      // 符头（带小脸）
      ell(x, -4.5, 4, 6.4, 5, lg(x, -10, 0, 2, 9, [[0, '#b8f6f4'], [1, C]]), OUT, 2.6);
      circ(x, -6.4, 2.8, 1.1, '#2b2320'); circ(x, -2.4, 2.8, 1.1, '#2b2320');
      circ(x, -6.7, 2.4, 0.4, '#fff'); circ(x, -2.7, 2.4, 0.4, '#fff');
      blush(x, -7.4, 5.4, 1.4); blush(x, -1.4, 5.4, 1.4);
      shine(x, -6.5, 6.5, 2, 1, -0.3);
    }),
    fishProj: bake2(48, 30, x => { x.translate(28, 16); fish(x, '#8fd3ff', '#4a90e8', 1.05, '#5aa7e8'); }),
    fishProjBig: bake2(64, 40, x => {
      x.translate(36, 21); x.scale(1.6, 1.6);
      // 金枪鱼：纺锤形
      x.beginPath(); x.moveTo(-14, 0); x.lineTo(-22, -8); x.lineTo(-22, 8); x.closePath();
      x.fillStyle = '#f0b13c'; x.fill(); x.lineWidth = 2.8; x.strokeStyle = OUT; x.stroke();
      blob(x, ellPath(0, 0, 16, 8.5), lg(x, 0, -8, 0, 9, [[0, '#7db8e8'], [0.5, '#4a90c8'], [1, '#35689c']]), { ow: 3 });
      x.beginPath(); x.moveTo(-3, -7.5); x.quadraticCurveTo(1, -14, 7, -7.5); x.closePath();
      x.fillStyle = '#f0b13c'; x.fill(); x.lineWidth = 2.4; x.strokeStyle = OUT; x.stroke();
      shine(x, 4, -3.5, 5.5, 2.2, -0.3);
      circ(x, 10, -1.5, 2, '#2b2320'); circ(x, 10.7, -2.2, 0.7, '#fff');
      x.fillStyle = '#c9975f';
      ell(x, -6, 3, 4, 2, '#c9975f');
    }),
    axe: bake2(52, 52, x => {
      x.translate(26, 26);
      // 木柄
      strokePath(x, c => { c.moveTo(-2, -18); c.lineTo(2, 20); }, '#7a5a3c', 7);
      strokePath(x, c => { c.moveTo(-3.4, -14); c.lineTo(-1.4, 16); }, 'rgba(255,235,200,.35)', 2);
      circ(x, 0, 20, 3.4, '#8a6236', OUT, 2);
      // 咸鱼头斧刃
      x.save(); x.translate(0, -14); x.rotate(0.1);
      blob(x, ellPath(0, 0, 14, 9), lg(x, 0, -9, 0, 9, [[0, '#a8d8ff'], [1, '#6aa8e0']]), { ow: 3 });
      x.beginPath(); x.moveTo(10, -2); x.lineTo(20, -9); x.lineTo(20, 7); x.closePath();
      x.fillStyle = '#4a90e8'; x.fill(); x.lineWidth = 2.4; x.strokeStyle = OUT; x.stroke();
      circ(x, -6, -2, 2.1, '#2b2320'); circ(x, -5.5, -2.6, 0.7, '#fff');
      shine(x, -2, -4, 4, 1.8, -0.3);
      x.restore();
    }),
    yarn: bake2(40, 40, x => {
      x.translate(20, 20);
      blob(x, circPath(0, 0, 14), rg(x, -4, -5, 2, 17, [[0, '#ffc3da'], [0.6, '#ff9dc3'], [1, '#ef7dab']]), { ow: 3 });
      x.save();
      x.beginPath(); x.arc(0, 0, 14, 0, U.TAU); x.clip();
      x.strokeStyle = '#f27baa'; x.lineWidth = 2.8;
      x.beginPath(); x.arc(-6, -4, 13, 0, U.TAU); x.stroke();
      x.beginPath(); x.arc(7, 5, 12, 0, U.TAU); x.stroke();
      x.beginPath(); x.arc(0, 0, 18, 0.5, 2.4); x.stroke();
      x.restore();
      shine(x, -5, -6, 4, 2.6, -0.5);
      // 散出的线头
      strokePath(x, c => { c.moveTo(12, 8); c.quadraticCurveTo(18, 10, 17, 15); }, '#f27baa', 2);
    }),
    yarnBig: bake2(56, 56, x => {
      x.translate(28, 28);
      blob(x, circPath(0, 0, 14), rg(x, -4, -5, 2, 17, [[0, '#d8c3ff'], [0.6, '#b394f2'], [1, '#9678dd']]), { ow: 3 });
      x.save();
      x.beginPath(); x.arc(0, 0, 14, 0, U.TAU); x.clip();
      x.strokeStyle = '#9a76e8'; x.lineWidth = 2.8;
      x.beginPath(); x.arc(-6, -4, 13, 0, U.TAU); x.stroke();
      x.beginPath(); x.arc(7, 5, 12, 0, U.TAU); x.stroke();
      x.restore();
      shine(x, -5, -6, 4, 2.6, -0.5);
      // 行星环
      x.save(); x.rotate(-0.35);
      x.beginPath(); x.ellipse(0, 2, 21, 6.5, 0, 0, U.TAU);
      x.lineWidth = 3.4; x.strokeStyle = '#c9b0f5'; x.stroke();
      x.lineWidth = 1.2; x.strokeStyle = 'rgba(255,255,255,.6)'; x.stroke();
      x.restore();
    }),
    litter: bake2(44, 36, x => {
      x.translate(22, 19);
      blob(x, circPath(-6, 3, 8), lg(x, -14, -5, 0, 11, [[0, '#d8c9b2'], [1, '#bfae94']]), { ow: 3 });
      blob(x, circPath(6, 4, 9), lg(x, -3, -5, 15, 13, [[0, '#e4d7c2'], [1, '#c9b8a0']]), { ow: 3 });
      blob(x, circPath(0, -4, 7), lg(x, -7, -11, 7, 3, [[0, '#efe4d0'], [1, '#d8c9b2']]), { ow: 3 });
      circ(x, 2, 2, 2.4, '#a99878'); circ(x, 9, 1, 2, '#a99878'); circ(x, -8, 1, 1.7, '#a99878');
      shine(x, -3, -7, 2.4, 1.5, -0.4);
    })
  };

  // 猫爪挥击月牙（三道细长爪痕 + 高光芯）
  const slash = bake2(150, 110, x => {
    x.translate(66, 55);
    for (let i = 0; i < 3; i++) {
      x.save();
      x.translate(0, (i - 1) * 27);
      x.rotate((i - 1) * 0.1);
      x.beginPath();
      x.moveTo(62, 0);
      x.quadraticCurveTo(0, -16, -56, -5);
      x.quadraticCurveTo(-52, 0, -56, 5);
      x.quadraticCurveTo(0, 16, 62, 0);
      x.closePath();
      const g = x.createLinearGradient(-56, 0, 62, 0);
      g.addColorStop(0, 'rgba(255,170,205,0)');
      g.addColorStop(0.5, 'rgba(255,160,200,0.9)');
      g.addColorStop(0.85, 'rgba(255,220,235,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0.95)');
      x.fillStyle = g;
      x.fill();
      x.beginPath();
      x.moveTo(58, 0);
      x.quadraticCurveTo(0, -9, -50, -2);
      x.lineWidth = 2.2; x.strokeStyle = 'rgba(255,255,255,.85)'; x.stroke();
      x.restore();
    }
  });

  /* ============ 图标（武器/被动） ============ */
  function icon(fn) { return bake2(56, 56, x => { x.translate(28, 28); fn(x); }); }
  // 猫爪印章底：圆形印泥 + 内圈白环（stampDmg 等 7 枚玩家侧词条图标共用）
  function stampSeal(x, cTop, cBot) {
    circ(x, 0, 0, 21, lg(x, 0, -21, 0, 21, [[0, cTop], [1, cBot]]), OUT, 3);
    x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 2;
    x.beginPath(); x.arc(0, 0, 16.5, 0, U.TAU); x.stroke();
  }
  const icons = {
    claw: icon(x => {
      for (let i = -1; i <= 1; i++) {
        x.save(); x.translate(0, i * 13); x.rotate(i * 0.15 + 0.5);
        x.beginPath(); x.moveTo(-16, -4); x.quadraticCurveTo(6, -7, 18, 0); x.quadraticCurveTo(6, 4, -16, 4); x.closePath();
        x.fillStyle = lg(x, -16, 0, 18, 0, [[0, 'rgba(255,157,195,0)'], [1, '#ff9dc3']]);
        x.fill(); x.lineWidth = 2.4; x.strokeStyle = OUT; x.stroke();
        x.restore();
      }
    }),
    sakura: icon(x => {
      for (let i = -1; i <= 1; i++) {
        x.save(); x.translate(0, i * 13); x.rotate(i * 0.15 + 0.5);
        x.beginPath(); x.moveTo(-16, -4); x.quadraticCurveTo(6, -7, 18, 0); x.quadraticCurveTo(6, 4, -16, 4); x.closePath();
        x.fillStyle = lg(x, -16, 0, 18, 0, [[0, 'rgba(255,125,170,0)'], [1, '#ff7daa']]);
        x.fill(); x.lineWidth = 2.4; x.strokeStyle = OUT; x.stroke();
        x.restore();
      }
      circ(x, 12, -14, 4, '#ffd9e6'); circ(x, -14, 14, 3.4, '#ffd9e6');
    }),
    note: icon(x => { x.scale(1.15, 1.15); x.drawImage(projs.note, -18, -20, 36, 40); }),
    ultra: icon(x => {
      x.scale(1.15, 1.15); x.drawImage(projs.note, -18, -20, 36, 40);
      x.strokeStyle = '#7de3e0'; x.lineWidth = 2.6; x.globalAlpha = 0.8;
      x.beginPath(); x.arc(0, -2, 20, -0.8, 0.8); x.stroke();
      x.beginPath(); x.arc(0, -2, 25, -0.7, 0.7); x.stroke();
    }),
    fish: icon(x => { x.scale(1.35, 1.35); x.drawImage(projs.fishProj, -24, -15, 48, 30); }),
    fishStorm: icon(x => {
      for (const [dx, dy, r] of [[-6, -10, -0.4], [8, 2, 0.2], [-4, 12, 0.5]]) {
        x.save(); x.translate(dx, dy); x.rotate(r); x.scale(0.95, 0.95);
        x.drawImage(projs.fishProj, -24, -15, 48, 30); x.restore();
      }
    }),
    axe: icon(x => { x.scale(0.95, 0.95); x.drawImage(projs.axe, -26, -26, 52, 52); }),
    tunaRain: icon(x => { x.scale(1.1, 1.1); x.drawImage(projs.fishProjBig, -32, -20, 64, 40); }),
    yarn: icon(x => { x.drawImage(projs.yarn, -20, -20, 40, 40); }),
    planet: icon(x => { x.drawImage(projs.yarnBig, -28, -28, 56, 56); }),
    aura: icon(x => {
      x.save(); x.globalAlpha = 0.4; circ(x, 0, 0, 20, '#8fe08a'); x.restore();
      circ(x, 0, 0, 6, '#8fd982');
      for (const [dx, dy] of [[-13, -5], [12, -7], [-4, 13], [8, 10], [-15, 8]]) circ(x, dx, dy, 3, '#5fae57');
    }),
    auraStorm: icon(x => {
      x.save(); x.globalAlpha = 0.5; circ(x, 0, 0, 24, '#8fe08a'); x.restore();
      circ(x, 0, 0, 7, '#8fd982');
      x.strokeStyle = '#5fae57'; x.lineWidth = 3;
      for (let i = 0; i < 6; i++) { const a = i / 6 * U.TAU; x.beginPath(); x.moveTo(Math.cos(a) * 15, Math.sin(a) * 15); x.lineTo(Math.cos(a) * 23, Math.sin(a) * 23); x.stroke(); }
      for (const [dx, dy] of [[-16, -8], [14, -9], [-6, 16], [10, 13]]) circ(x, dx, dy, 3.4, '#4d9a47');
    }),
    litter: icon(x => { x.drawImage(projs.litter, -22, -18, 44, 36); }),
    litterRain: icon(x => {
      for (const [dx, dy] of [[-8, -12], [10, -2], [-4, 12]]) { x.save(); x.translate(dx, dy); x.scale(0.7, 0.7); x.drawImage(projs.litter, -22, -18, 44, 36); x.restore(); }
    }),
    zap: icon(x => {
      x.beginPath(); x.moveTo(4, -22); x.lineTo(-10, 2); x.lineTo(0, 2); x.lineTo(-6, 22); x.lineTo(12, -4); x.lineTo(2, -4); x.lineTo(10, -22);
      x.closePath(); x.fillStyle = lg(x, 0, -22, 0, 22, [[0, '#fff4a8'], [1, '#ffd94d']]);
      x.fill(); x.lineWidth = 2.6; x.strokeStyle = '#c9992a'; x.stroke();
    }),
    thunderPuff: icon(x => {
      x.beginPath(); x.moveTo(4, -22); x.lineTo(-10, 2); x.lineTo(0, 2); x.lineTo(-6, 22); x.lineTo(12, -4); x.lineTo(2, -4); x.lineTo(10, -22);
      x.closePath(); x.fillStyle = '#fff27a'; x.fill(); x.lineWidth = 2.8; x.strokeStyle = '#c9992a'; x.stroke();
      circ(x, -14, -16, 3, '#ffe86b'); circ(x, 16, 14, 3.4, '#ffe86b'); circ(x, 15, -18, 2.6, '#ffe86b');
    }),
    catnip: icon(x => {
      ell(x, 0, 2, 8, 14, lg(x, -8, -12, 8, 16, [[0, '#a5e398'], [1, '#7cc46f']]), OUT, 2.6);
      strokePath(x, c => { c.moveTo(0, 14); c.lineTo(0, -12); }, '#5fae57', 3);
      strokePath(x, c => { c.moveTo(0, 0); c.lineTo(-7, -5); c.moveTo(0, 6); c.lineTo(7, 1); }, '#5fae57', 2.6);
      circ(x, -9, 10, 2.6, '#c0ecb8'); circ(x, 11, 12, 2.2, '#c0ecb8');
    }),
    clock: icon(x => {
      circ(x, 0, 0, 15, lg(x, 0, -15, 0, 15, [[0, '#ffffff'], [1, '#f0e8f8']]), OUT, 3);
      strokePath(x, c => { c.moveTo(0, 0); c.lineTo(0, -9); c.moveTo(0, 0); c.lineTo(6, 3); }, OUT, 2.6);
      strokePath(x, c => { c.moveTo(-11, -13); c.lineTo(-15, -17); c.moveTo(11, -13); c.lineTo(15, -17); }, OUT, 3);
      circ(x, 0, 0, 2, '#e2637f');
    }),
    yarnBall: icon(x => { x.scale(0.8, 0.8); x.drawImage(projs.yarn, -20, -20, 40, 40); }),
    bell: icon(x => {
      x.beginPath(); x.moveTo(-11, 8); x.quadraticCurveTo(-11, -14, 0, -14); x.quadraticCurveTo(11, -14, 11, 8); x.closePath();
      x.fillStyle = lg(x, 0, -14, 0, 8, [[0, '#ffe488'], [1, '#f0b13c']]);
      x.fill(); x.lineWidth = 2.6; x.strokeStyle = OUT; x.stroke();
      rr(x, -13, 7, 26, 6, 3); x.fillStyle = '#f0b13c'; x.fill(); x.stroke();
      circ(x, 0, 16, 4, '#f0b13c', OUT, 2.2);
      circ(x, 0, -14, 3, '#a97943', OUT, 2);
      shine(x, -5, -8, 2.4, 3.4, 0.3);
    }),
    glove: icon(x => {
      circ(x, 0, 4, 12, lg(x, 0, -8, 0, 16, [[0, '#ffc389'], [1, '#f79a4c']]), OUT, 2.8);
      circ(x, -11, -8, 5, '#ffb066', OUT, 2.4); circ(x, -4, -12, 5, '#ffb066', OUT, 2.4);
      circ(x, 4, -12, 5, '#ffb066', OUT, 2.4); circ(x, 11, -8, 5, '#ffb066', OUT, 2.4);
      ell(x, 0, 8, 6, 4.6, '#ffc9d4');
      ell(x, -8, -1, 3, 3.6, '#ffc9d4'); ell(x, 8, -1, 3, 3.6, '#ffc9d4');
    }),
    milkIcon: icon(x => { x.scale(0.95, 0.95); x.drawImage(items.milk, -20, -22, 40, 44); }),
    magnetFish: icon(x => {
      x.save(); x.rotate(0.5); x.scale(0.85, 0.85);
      x.drawImage(items.vacuum, -22, -20, 44, 40); x.restore();
    }),
    koi: icon(x => {
      x.save(); x.rotate(-0.3); x.scale(1.1, 1.1);
      fish(x, '#ff8a5e', '#ff6b81', 1.1, '#f0604a');
      x.restore();
      circ(x, 12, -12, 2.6, '#ffe86b'); circ(x, -13, 10, 2.2, '#ffe86b');
    }),
    paw: icon(x => {
      circ(x, 0, 5, 9, '#ffe9c4', OUT, 2.4);
      circ(x, -10, -5, 4.2, '#ffe9c4', OUT, 2.2);
      circ(x, -3.5, -10, 4.2, '#ffe9c4', OUT, 2.2);
      circ(x, 3.5, -10, 4.2, '#ffe9c4', OUT, 2.2);
      circ(x, 10, -5, 4.2, '#ffe9c4', OUT, 2.2);
    }),
    // —— 猫爪印（全武器词条）——
    stampDmg: icon(x => { // 锐爪印：三道爪光
      stampSeal(x, '#ff8fa0', '#e05a76');
      for (let i = -1; i <= 1; i++) {
        x.save(); x.translate(0, i * 8); x.rotate(i * 0.15 + 0.5);
        strokePath(x, c => { c.moveTo(-9, 0); c.quadraticCurveTo(2, -2.6, 10, 0); }, '#fff', 3.4);
        x.restore();
      }
    }),
    stampCd: icon(x => { // 疾风印：秒表
      stampSeal(x, '#7de3e0', '#3fa8a8');
      x.strokeStyle = '#fff'; x.lineWidth = 2.4;
      x.beginPath(); x.arc(0, 1.5, 9.5, 0, U.TAU); x.stroke();
      strokePath(x, c => { c.moveTo(0, 1.5); c.lineTo(0, -4.5); c.moveTo(0, 1.5); c.lineTo(4.5, 3.5); }, '#fff', 2.2);
      strokePath(x, c => { c.moveTo(-4, -10.5); c.lineTo(-7, -13.5); c.moveTo(4, -10.5); c.lineTo(7, -13.5); }, '#fff', 2.4);
    }),
    stampArea: icon(x => { // 广域印：扩散环
      stampSeal(x, '#9fe29a', '#5fae57');
      x.strokeStyle = '#fff'; x.lineWidth = 2;
      x.setLineDash([3, 3]);
      x.beginPath(); x.arc(0, 0, 6.5, 0, U.TAU); x.stroke();
      x.setLineDash([]);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        x.save(); x.translate(Math.cos(a) * 12, Math.sin(a) * 12); x.rotate(a);
        x.beginPath(); x.moveTo(-2.5, -3.2); x.lineTo(3, 0); x.lineTo(-2.5, 3.2);
        x.strokeStyle = '#fff'; x.lineWidth = 2.4; x.lineJoin = 'round'; x.stroke();
        x.restore();
      }
    }),
    stampAmount: icon(x => { // 影分印：本体 + 两个分身
      stampSeal(x, '#ffd98a', '#e0a23c');
      x.strokeStyle = '#fff'; x.lineWidth = 2.4;
      x.beginPath(); x.arc(-5, 3, 7, 0, U.TAU); x.stroke();
      x.globalAlpha = 0.8;
      x.beginPath(); x.arc(8, -6, 4.6, 0, U.TAU); x.stroke();
      x.globalAlpha = 0.6;
      x.beginPath(); x.arc(8.5, 9.5, 3.2, 0, U.TAU); x.stroke();
      x.globalAlpha = 1;
    }),
    stampPierce: icon(x => { // 贯穿印：一箭穿双环
      stampSeal(x, '#ffb066', '#e07a3c');
      x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 2;
      x.beginPath(); x.arc(-7, 4, 5, 0, U.TAU); x.stroke();
      x.beginPath(); x.arc(4, -4, 5, 0, U.TAU); x.stroke();
      x.save(); x.rotate(-0.32);
      strokePath(x, c => { c.moveTo(-14, 8); c.lineTo(10, -7); }, '#fff', 2.8);
      x.beginPath(); x.moveTo(15, -10.5); x.lineTo(6, -10); x.lineTo(10.5, -2.5); x.closePath();
      x.fillStyle = '#fff'; x.fill();
      x.restore();
    }),
    stampCrit: icon(x => { // 会心印：四芒星
      stampSeal(x, '#c9a7ff', '#8f6ad8');
      x.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 - Math.PI / 2;
        x.lineTo(Math.cos(a) * 13, Math.sin(a) * 13);
        x.lineTo(Math.cos(a + Math.PI / 4) * 4.5, Math.sin(a + Math.PI / 4) * 4.5);
      }
      x.closePath(); x.fillStyle = '#fff'; x.fill();
    }),
    stampLife: icon(x => { // 汲血印：爱心
      stampSeal(x, '#ff9dc3', '#e06790');
      x.beginPath();
      x.moveTo(0, 10);
      x.bezierCurveTo(-12, 1, -8.5, -10.5, 0, -4);
      x.bezierCurveTo(8.5, -10.5, 12, 1, 0, 10);
      x.closePath(); x.fillStyle = '#fff'; x.fill();
    })
  };

  /* ============================================================
     城市装饰（地面物件）
     ============================================================ */
  const decor = {
    tree: bake2(96, 104, x => {
      groundShadow(x, 48, 97, 27, 6);
      blob(x, x2 => rr(x2, 42, 60, 12, 34, 5), lg(x, 42, 60, 54, 94, [[0, '#8a6a48'], [1, '#6b4c32']]), { ow: 3 });
      blob(x, circPath(48, 38, 28), lg(x, 0, 10, 0, 66, [[0, '#43805f'], [1, '#2c5a42']]), { ow: 3.6 });
      blob(x, circPath(28, 52, 18), '#356b4e', { ow: 3.4 }); blob(x, circPath(68, 52, 18), '#356b4e', { ow: 3.4 });
      circ(x, 38, 30, 15, '#4f9570'); circ(x, 60, 34, 13, '#4f9570');
      circ(x, 32, 44, 8, '#5fae7e'); circ(x, 56, 48, 7, '#5fae7e');
      circ(x, 44, 20, 6, '#8fd982');
      shine(x, 34, 26, 8, 5, -0.5);
    }),
    bush: bake2(56, 40, x => {
      groundShadow(x, 28, 37, 18, 4);
      blob(x, circPath(18, 24, 13), '#356b4e', { ow: 3.2 }); blob(x, circPath(38, 24, 13), '#356b4e', { ow: 3.2 });
      blob(x, circPath(28, 16, 12), '#43805f', { ow: 3.2 });
      circ(x, 22, 14, 5, '#5fae7e');
      circ(x, 42, 28, 3, '#ff9dc3'); circ(x, 14, 28, 3, '#ffd34d');
      shine(x, 24, 11, 5, 3, -0.4);
    }),
    lamp: bake2(56, 120, x => {
      groundShadow(x, 30, 115, 15, 4.5);
      blob(x, x2 => rr(x2, 24, 34, 8, 80, 3), lg(x, 24, 0, 32, 0, [[0, '#5a6a84'], [1, '#3e4a60']]), { ow: 3 });
      x.beginPath(); x.moveTo(28, 36); x.quadraticCurveTo(28, 18, 44, 18); x.lineWidth = 8; x.strokeStyle = '#4a5568'; x.stroke();
      x.beginPath(); x.moveTo(28, 36); x.quadraticCurveTo(28, 18, 44, 18); x.lineWidth = 3; x.strokeStyle = OUT; x.stroke();
      x.beginPath(); x.moveTo(34, 16); x.quadraticCurveTo(46, 4, 58, 16); x.closePath();
      x.fillStyle = '#5a6a80'; x.fill(); x.lineWidth = 3; x.strokeStyle = OUT; x.stroke();
      circ(x, 46, 20, 6.5, lg(x, 0, 13, 0, 27, [[0, '#fff4c8'], [1, '#f5cf7a']]), '#e8b45c', 2.4);
    }),
    hydrant: bake2(40, 48, x => {
      groundShadow(x, 20, 44, 12, 3.6);
      blob(x, x2 => rr(x2, 12, 20, 16, 22, 6), lg(x, 12, 0, 28, 0, [[0, '#f07a7a'], [1, '#d95353']]), { ow: 3 });
      blob(x, x2 => rr(x2, 8, 26, 24, 7, 3.5), '#e05f5f', { ow: 2.6 });
      ell(x, 20, 18, 9, 6, '#e86a6a', OUT, 2.8);
      circ(x, 20, 12, 3.4, '#ff9d9d', OUT, 2.2);
      rr(x, 15, 38, 10, 5, 2); x.fillStyle = '#c94b4b'; x.fill(); x.lineWidth = 2.2; x.strokeStyle = OUT; x.stroke();
      shine(x, 16, 24, 2.2, 6, 0);
    }),
    bench: bake2(88, 44, x => {
      groundShadow(x, 44, 40, 36, 4.5);
      blob(x, x2 => rr(x2, 8, 16, 72, 10, 4), lg(x, 0, 16, 0, 26, [[0, '#a07848'], [1, '#8a6236']]), { ow: 3 });
      blob(x, x2 => rr(x2, 8, 28, 72, 8, 4), '#9a7244', { ow: 2.8 });
      rr(x, 14, 34, 7, 8, 2); x.fillStyle = '#4a5568'; x.fill(); x.lineWidth = 2.4; x.strokeStyle = OUT; x.stroke();
      rr(x, 67, 34, 7, 8, 2); x.fillStyle = '#4a5568'; x.fill(); x.stroke();
    }),
    manhole: bake2(44, 44, x => {
      circ(x, 22, 22, 18, '#3a4252', '#232a38', 3);
      circ(x, 22, 22, 13, '#454f61');
      x.strokeStyle = '#2f3745'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(12, 22); x.lineTo(32, 22); x.moveTo(22, 12); x.lineTo(22, 32); x.stroke();
    }),
    fountain: bake2(120, 120, x => {
      groundShadow(x, 60, 110, 45, 7);
      blob(x, circPath(60, 62, 44), lg(x, 0, 18, 0, 106, [[0, '#9aa8bc'], [1, '#7e8ca0']]), { ow: 3.6 });
      circ(x, 60, 62, 36, '#3d78ad', '#2c5a84', 3);
      circ(x, 60, 62, 26, '#4f8fc4');
      x.strokeStyle = 'rgba(255,255,255,.4)'; x.lineWidth = 3;
      x.beginPath(); x.arc(60, 62, 30, -0.6, 0.6); x.stroke();
      x.beginPath(); x.arc(60, 62, 30, Math.PI - 0.6, Math.PI + 0.6); x.stroke();
      blob(x, circPath(60, 62, 8), '#9aa8bc', { ow: 3 });
      circ(x, 60, 55, 4, '#bfe3ff');
      shine(x, 46, 52, 8, 4, -0.5);
    }),
    vending: bake2(60, 84, x => {
      groundShadow(x, 30, 80, 21, 4.5);
      blob(x, x2 => rr(x2, 10, 8, 40, 68, 7), lg(x, 10, 0, 50, 0, [[0, '#f0799a'], [1, '#dd5b82']]), { ow: 3.4 });
      rr(x, 16, 16, 20, 34, 4); x.fillStyle = '#232842'; x.fill(); x.lineWidth = 2.6; x.strokeStyle = OUT; x.stroke();
      for (let i = 0; i < 4; i++) {
        const c = ['#ffd34d', '#7de3e0', '#8fd982', '#ff9dc3'][i];
        rr(x, 19, 20 + i * 8, 8, 6, 2); x.fillStyle = c; x.fill();
      }
      rr(x, 40, 16, 7, 40, 2.5); x.fillStyle = '#ffd9e6'; x.fill(); x.lineWidth = 2.2; x.strokeStyle = OUT; x.stroke();
      shine(x, 15, 14, 3, 10, 0.1);
    }),
    puddle: bake2(90, 50, x => {
      ell(x, 45, 27, 40, 16, rg(x, 45, 25, 4, 42, [[0, 'rgba(110,130,190,.55)'], [1, 'rgba(70,85,140,.25)']]));
      x.save(); x.globalAlpha = 0.5;
      ell(x, 30, 24, 10, 3.4, '#ff9dc3'); ell(x, 58, 30, 8, 2.6, '#7de3e0');
      x.restore();
      ell(x, 34, 20, 14, 4, 'rgba(255,255,255,.25)');
    }),
    boxes: bake2(70, 60, x => {
      groundShadow(x, 36, 56, 26, 4.5);
      blob(x, x2 => rr(x2, 6, 28, 40, 26, 4), lg(x, 6, 28, 46, 54, [[0, '#c99a62'], [1, '#b0814a']]), { ow: 3 });
      blob(x, x2 => rr(x2, 20, 6, 42, 26, 4), lg(x, 20, 6, 62, 32, [[0, '#d8ab72'], [1, '#bd8d52']]), { ow: 3 });
      x.fillStyle = 'rgba(230,200,150,.9)';
      x.fillRect(20, 17, 42, 5); x.fillRect(38, 6, 5, 26);
      x.strokeStyle = 'rgba(122,84,44,.45)'; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(12, 42); x.lineTo(40, 42); x.moveTo(12, 48); x.lineTo(40, 48); x.stroke();
      // 鱼干涂鸦
      x.fillStyle = 'rgba(122,84,44,.6)';
      x.font = '700 10px sans-serif'; x.fillText('魚', 24, 48);
    }),
    potted: bake2(44, 56, x => {
      groundShadow(x, 22, 52, 14, 3.6);
      x.beginPath(); x.moveTo(10, 34); x.lineTo(34, 34); x.lineTo(30, 52); x.lineTo(14, 52); x.closePath();
      x.fillStyle = lg(x, 10, 34, 34, 52, [[0, '#d9756b'], [1, '#bd5a52']]); x.fill();
      x.lineWidth = 3; x.strokeStyle = OUT; x.stroke();
      rr(x, 8, 30, 28, 7, 3); x.fillStyle = '#e0847a'; x.fill(); x.lineWidth = 2.6; x.strokeStyle = OUT; x.stroke();
      blob(x, circPath(22, 18, 12), lg(x, 0, 6, 0, 30, [[0, '#4f9570'], [1, '#356b4e']]), { ow: 3 });
      circ(x, 15, 14, 5, '#5fae7e'); circ(x, 29, 16, 4.6, '#5fae7e');
      circ(x, 22, 24, 3, '#ff9dc3');
    }),
    pond: bake2(140, 110, x => {
      ell(x, 70, 56, 60, 42, '#3d5a80', '#2c4258', 4);
      ell(x, 70, 56, 50, 34, '#4a7ba6');
      x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 3;
      x.beginPath(); x.arc(58, 48, 22, -0.8, 0.2); x.stroke();
      ell(x, 100, 70, 10, 4, 'rgba(255,255,255,.25)');
      // 荷叶
      ell(x, 40, 70, 9, 5, '#3f7d5a', '#2f5f47', 2.4);
      ell(x, 96, 40, 8, 4.6, '#3f7d5a', '#2f5f47', 2.4);
      circ(x, 96, 40, 1.6, '#2f5f47');
      shine(x, 56, 44, 10, 4, -0.4);
    }),
    crosswalk: bake2(160, 120, x => {
      x.fillStyle = 'rgba(240,240,230,.75)';
      for (let i = 0; i < 4; i) { rr(x, 16 + i * 36, 8, 22, 104, 8), x.fill(); i++; }
    })
  };
  decor.sign = {};
  function bakeSigns() {
    for (const [txt, color] of [['喵', '#ff8fb5'], ['24H', '#7de3e0'], ['魚', '#ffd34d'], ['OPEN', '#8fd982'], ['拉面', '#ffb066'], ['猫咖', '#c9a7ff']]) {
      decor.sign[txt] = bake2(84, 100, x => {
        groundShadow(x, 44, 95, 16, 4);
        blob(x, x2 => rr(x2, 36, 60, 10, 36, 3), '#3a4252', { ow: 3 });
        blob(x, x2 => rr(x2, 6, 8, 72, 46, 11), '#262b40', { ow: 3 });
        rr(x, 10, 12, 64, 38, 8); x.strokeStyle = color; x.globalAlpha = 0.35; x.lineWidth = 2; x.stroke(); x.globalAlpha = 1;
        x.save();
        x.shadowColor = color; x.shadowBlur = 14;
        x.fillStyle = color;
        x.font = '900 30px "ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(txt, 42, 32);
        x.restore();
      });
    }
  }
  bakeSigns();
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(bakeSigns);

  /* ----- 精英金冠徽记 ----- */
  const eliteCrown = bake2(40, 32, x => {
    x.translate(20, 18);
    x.beginPath();
    x.moveTo(-13, 8); x.lineTo(-13, -5); x.lineTo(-6.5, 0); x.lineTo(0, -9); x.lineTo(6.5, 0); x.lineTo(13, -5); x.lineTo(13, 8);
    x.closePath();
    x.fillStyle = lg(x, 0, -9, 0, 8, [[0, '#ffe488'], [1, '#f0b13c']]);
    x.fill(); x.lineWidth = 2.6; x.strokeStyle = '#8a6236'; x.stroke();
    circ(x, 0, -10, 1.8, '#ff7daa');
    shine(x, -6, -2, 2, 1.4, -0.3);
  });

  /* ----- 夜空（主菜单）：月亮 / 云 / 天际线 ----- */
  const sky = {};
  sky.moon = bake2(150, 150, x => {
    circ(x, 75, 75, 62, rg(x, 55, 55, 8, 110, [[0, 'rgba(255,244,214,.5)'], [1, 'rgba(255,244,214,0)']]));
    circ(x, 75, 75, 44, rg(x, 62, 60, 6, 52, [[0, '#fffbe8'], [1, '#f3e3ae']]));
    circ(x, 62, 62, 8, 'rgba(214,196,150,.55)');
    circ(x, 90, 82, 6, 'rgba(214,196,150,.45)');
    circ(x, 72, 92, 4.4, 'rgba(214,196,150,.4)');
    circ(x, 88, 56, 3.6, 'rgba(214,196,150,.4)');
  });
  function cloud(x, cx, cy, s, col) {
    ell(x, cx, cy, 30 * s, 12 * s, col);
    ell(x, cx - 16 * s, cy + 3 * s, 16 * s, 8 * s, col);
    ell(x, cx + 17 * s, cy + 3 * s, 18 * s, 8 * s, col);
    ell(x, cx + 2 * s, cy - 7 * s, 15 * s, 9 * s, col);
  }
  sky.cloud1 = bake2(240, 90, x => cloud(x, 120, 46, 1.3, 'rgba(190,180,230,.5)'));
  sky.cloud2 = bake2(200, 76, x => cloud(x, 100, 40, 1.0, 'rgba(170,165,220,.42)'));
  // 可平铺天际线（1024 宽，两端无缝：建筑不跨边界）
  sky.skyline = bake(1024, 210, x => {
    let sx = 0;
    let i = 0;
    while (sx < 1004) {
      const r = U.hash2(i, 7, 991);
      const w = 44 + Math.floor(r * 70);
      const h = 60 + Math.floor(U.hash2(i, 13, 991) * 120);
      const bx = 1024 - sx - w > 20 ? sx : 1024 - w - 20;
      x.fillStyle = '#191b34';
      x.fillRect(bx, 210 - h, w, h);
      // 楼顶细节
      if (U.hash2(i, 21, 991) < 0.3) x.fillRect(bx + w / 2 - 2, 210 - h - 14, 4, 14);
      // 亮窗
      for (let wy = 210 - h + 10; wy < 196; wy += 16) {
        for (let wx = bx + 6; wx < bx + w - 8; wx += 12) {
          const lit = U.hash2(wx, wy, 313);
          if (lit < 0.34) {
            x.fillStyle = lit < 0.12 ? 'rgba(255,214,140,.9)' : lit < 0.22 ? 'rgba(255,190,120,.55)' : 'rgba(150,180,255,.4)';
            x.fillRect(wx, wy, 5, 7);
          }
        }
      }
      // 偶尔一块霓虹
      if (U.hash2(i, 31, 991) < 0.22) {
        x.fillStyle = U.hash2(i, 33, 991) < 0.5 ? 'rgba(255,143,181,.8)' : 'rgba(125,227,224,.8)';
        x.fillRect(bx + 6, 210 - h + 22, 4, 18);
      }
      sx = bx + w + 6 + Math.floor(U.hash2(i, 41, 991) * 26);
      i++;
    }
  });

  // 灯光晕（运行时 'lighter' 叠加）
  function glowCanvas(r, c1) {
    return bake(r * 2, r * 2, x => {
      const g = x.createRadialGradient(r, r, 2, r, r, r);
      g.addColorStop(0, c1); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, r * 2, r * 2);
    });
  }
  const glows = {
    lamp: glowCanvas(110, 'rgba(255,214,140,0.34)'),
    player: glowCanvas(90, 'rgba(255,220,170,0.16)'),
    chest: glowCanvas(70, 'rgba(255,220,120,0.5)'),
    gem: glowCanvas(40, 'rgba(180,220,255,0.35)'),
    neonPink: glowCanvas(80, 'rgba(255,143,181,0.24)'),
    neonCyan: glowCanvas(80, 'rgba(125,227,224,0.24)'),
    boss: glowCanvas(130, 'rgba(255,90,110,0.30)'),
    evo: glowCanvas(120, 'rgba(255,170,210,0.45)')
  };

  // 闪电（运行时画）
  function drawLightning(x, x1, y1, x2, y2, col) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const segs = Math.max(3, Math.min(9, len / 34 | 0));
    const nx = -dy / len, ny = dx / len;
    x.beginPath(); x.moveTo(x1, y1);
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const off = (Math.random() - 0.5) * 22 * Math.sin(t * Math.PI);
      x.lineTo(x1 + dx * t + nx * off, y1 + dy * t + ny * off);
    }
    x.lineTo(x2, y2);
    x.lineWidth = 4.5; x.strokeStyle = col || '#ffe86b'; x.stroke();
    x.lineWidth = 1.8; x.strokeStyle = '#fff'; x.stroke();
  }

  return {
    OUT, OUTW, rr, ell, circ, eyeG, blush, rg,
    playerFrames, playerWhite, menuCat, menuCatBlink,
    E, EW, EB, EH,
    items, projs, slash, icons, decor, glows, eliteCrown,
    sky, drawLightning
  };
})();

;
/* 喵都幸存者 - 手工设计地图包
   五张固定面积的地图：老城夜市 / 樱花公园 / 港湾码头 / 雪山温泉 / 幽灵游乐园
   地形码：0 可走 · 1 阻挡（建筑/水/岩石/围墙） · 2 减速（草地/沙地/深雪/落叶） · 3 猫道（只有玩家猫能通过）
   渲染：地面烘焙进 512px 分块画布（零逐帧成本）；立体装饰按 y 排序逐帧绘制；水面波光/温泉蒸汽逐帧点缀 */
'use strict';
const MAPS = (() => {
  const T = { WALK: 0, BLOCK: 1, SLOW: 2, CAT: 3 };
  const CELL = 20, TILE = 512;
  const AWNS = ['#e0678f', '#4fb3b0', '#f0b13c', '#8fd982', '#b79df0'];

  /* ---------- 烘焙小工具（与 art.js 同一套绘本风格） ---------- */
  function bake(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.lineJoin = 'round'; x.lineCap = 'round';
    fn(x, w, h);
    return c;
  }
  function bake2(w, h, fn) { return bake(w * 2, h * 2, x => { x.scale(2, 2); fn(x, w, h); }); }
  function lg(x, x0, y0, x1, y1, stops) {
    const g = x.createLinearGradient(x0, y0, x1, y1);
    for (const [p, c] of stops) g.addColorStop(p, c);
    return g;
  }
  const rr = (x, px, py, w, h, r) => Art.rr(x, px, py, w, h, r);
  const ell = (x, cx, cy, rx, ry, fill, stroke, lw) => Art.ell(x, cx, cy, rx, ry, fill, stroke, lw);
  const circ = (x, cx, cy, r, fill, stroke, lw) => Art.circ(x, cx, cy, r, fill, stroke, lw);
  function shadow(x, cx, cy, rx, ry) {
    x.save(); x.globalAlpha = 0.28;
    ell(x, cx, cy, rx, ry || rx * 0.32, 'rgba(10,8,22,.9)');
    x.restore();
  }
  // 猫爪印（猫道路面 / 招牌共用）
  function paw(x, cx, cy, rot, col, a) {
    x.save(); x.translate(cx, cy); x.rotate(rot || 0);
    if (a !== undefined) x.globalAlpha = a;
    ell(x, 0, 2.4, 3.2, 2.7, col);
    ell(x, -3.1, -2, 1.4, 1.8, col); ell(x, 0, -3.1, 1.4, 1.8, col); ell(x, 3.1, -2, 1.4, 1.8, col);
    x.restore();
  }
  // 装饰精灵里的圆润叶团
  function leafBall(x, cx, cy, r, c1, c2) {
    blob(x, cx, cy, r, lg(x, cx - r, cy - r, cx + r * 0.6, cy + r, [[0, c1], [1, c2]]));
    shine(x, cx - r * 0.3, cy - r * 0.35, r * 0.4, r * 0.26, -0.5);
  }
  function blob(x, cx, cy, r, fill) {
    x.beginPath(); x.arc(cx, cy, r, 0, U.TAU);
    x.fillStyle = fill; x.fill();
    x.lineWidth = 3; x.strokeStyle = 'rgba(30,22,40,.55)'; x.stroke();
  }
  function shine(x, cx, cy, rx, ry, rot) {
    x.save(); x.globalAlpha = 0.45; x.translate(cx, cy); x.rotate(rot || 0);
    ell(x, 0, 0, rx, ry, 'rgba(255,255,255,.85)');
    x.restore();
  }

  /* ============================================================
     装饰精灵（懒烘焙：首次 init 时执行，头接地锚点=底部中心）
     ============================================================ */
  const S = {};
  function bakeSprites() {
    if (S.cherry) return;
    /* 樱花树（两种花色） */
    for (const [key, petal, deep] of [['cherry', '#ffc3da', '#f09ab8'], ['cherry2', '#f6d5e8', '#e0aed0']]) {
      S[key] = bake2(120, 112, x => {
        shadow(x, 60, 104, 30, 7);
        rr(x, 54, 66, 12, 36, 5); x.fillStyle = lg(x, 54, 66, 66, 102, [[0, '#7a5a48'], [1, '#5d433c']]); x.fill();
        x.lineWidth = 3; x.strokeStyle = '#4a3630'; x.stroke();
        blob(x, 60, 42, 32, lg(x, 28, 10, 88, 74, [[0, petal], [1, deep]]));
        blob(x, 32, 58, 20, deep); blob(x, 88, 58, 20, deep);
        for (let i = 0; i < 7; i++) {
          const a = i / 7 * U.TAU;
          circ(x, 60 + Math.cos(a) * 24, 42 + Math.sin(a) * 22, 6.5, '#ffdce9');
        }
        for (let i = 0; i < 5; i++) circ(x, 34 + U.hash2(i, 3, 5) * 54, 24 + U.hash2(i, 7, 5) * 44, 2.4, '#fff');
      });
    }
    /* 雪松 */
    S.pineSnow = bake2(96, 122, x => {
      shadow(x, 48, 115, 24, 6);
      x.beginPath(); x.moveTo(48, 6); x.lineTo(82, 96); x.quadraticCurveTo(48, 108, 14, 96); x.closePath();
      x.fillStyle = lg(x, 20, 6, 76, 100, [[0, '#3f6b52'], [1, '#2b4f3c']]); x.fill();
      x.lineWidth = 3; x.strokeStyle = '#22402f'; x.stroke();
      for (const [yy, w2] of [[30, 20], [58, 30], [86, 38]]) {
        x.beginPath(); x.moveTo(48, yy - 16); x.quadraticCurveTo(48 + w2 * 0.6, yy, 48 + w2, yy + 6);
        x.quadraticCurveTo(48, yy + 10, 48 - w2, yy + 6); x.quadraticCurveTo(48 - w2 * 0.6, yy, 48, yy - 16);
        x.closePath(); x.fillStyle = 'rgba(240,246,252,.92)'; x.fill();
      }
      rr(x, 42, 100, 12, 18, 3); x.fillStyle = '#6b4c32'; x.fill(); x.strokeStyle = '#4a3630'; x.lineWidth = 2.6; x.stroke();
    });
    /* 竹丛 */
    S.bamboo = bake2(76, 112, x => {
      shadow(x, 38, 105, 22, 6);
      for (const [bx, tint] of [[22, '#7fae62'], [38, '#8fbc6e'], [54, '#7fae62']]) {
        rr(x, bx - 4, 8, 8, 98, 3.5);
        x.fillStyle = lg(x, bx - 4, 0, bx + 4, 0, [[0, tint], [1, '#6a9a50']]); x.fill();
        x.lineWidth = 2.4; x.strokeStyle = '#527a3e'; x.stroke();
        x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1.6;
        x.beginPath(); x.moveTo(bx - 1.6, 16); x.lineTo(bx - 1.6, 96); x.stroke();
        for (const ny of [26, 52, 78]) {
          x.strokeStyle = '#527a3e'; x.lineWidth = 2;
          x.beginPath(); x.moveTo(bx, ny); x.lineTo(bx - 12, ny - 10); x.moveTo(bx, ny + 8); x.lineTo(bx + 12, ny - 4); x.stroke();
          ell(x, bx - 14, ny - 12, 6, 2.4, '#8fbc6e', '#527a3e', 1.6);
          ell(x, bx + 14, ny - 6, 6, 2.4, '#8fbc6e', '#527a3e', 1.6);
        }
      }
    });
    /* 岩石（普通 / 覆雪） */
    for (const [key, cap] of [['rock', null], ['rockSnow', 'rgba(240,246,252,.95)']]) {
      S[key] = bake2(92, 74, x => {
        shadow(x, 46, 66, 30, 7);
        blob(x, 46, 44, 26, lg(x, 20, 18, 72, 70, [[0, '#7a7488'], [1, '#575264']]));
        blob(x, 24, 52, 15, '#655f74'); blob(x, 68, 50, 16, '#655f74');
        shine(x, 36, 30, 10, 6, -0.5);
        if (cap) {
          ell(x, 42, 24, 22, 10, cap); ell(x, 68, 40, 12, 6, cap); ell(x, 22, 42, 9, 5, cap);
          x.save(); x.globalAlpha = 0.85;
          ell(x, 46, 20, 8, 4, cap); x.restore();
        }
      });
    }
    /* 石灯笼 */
    S.stoneLantern = bake2(56, 78, x => {
      shadow(x, 28, 72, 15, 4.5);
      rr(x, 20, 62, 16, 10, 2); x.fillStyle = '#6a6578'; x.fill(); x.strokeStyle = '#4c485a'; x.lineWidth = 2.4; x.stroke();
      rr(x, 23, 34, 10, 30, 3); x.fillStyle = '#7a7590'; x.fill(); x.stroke();
      rr(x, 14, 22, 28, 16, 4); x.fillStyle = '#8a84a0'; x.fill(); x.stroke();
      rr(x, 19, 26, 18, 8, 3); x.fillStyle = '#ffe9a8'; x.fill(); x.lineWidth = 2; x.stroke();
      rr(x, 10, 8, 36, 12, 5); x.fillStyle = '#6a6578'; x.fill(); x.stroke();
      circ(x, 28, 4, 5, '#6a6578', '#4c485a', 2);
    });
    /* 鸟居 */
    S.torii = bake2(160, 130, x => {
      shadow(x, 80, 122, 52, 8);
      for (const px of [34, 108]) {
        rr(x, px - 8, 24, 16, 98, 5);
        x.fillStyle = lg(x, px - 8, 0, px + 8, 0, [[0, '#e05548'], [1, '#b83a34']]); x.fill();
        x.lineWidth = 3; x.strokeStyle = '#8a2a26'; x.stroke();
      }
      rr(x, 14, 14, 132, 16, 7); x.fillStyle = '#d04a40'; x.fill(); x.strokeStyle = '#8a2a26'; x.stroke();
      rr(x, 24, 36, 112, 10, 4); x.fillStyle = '#c04438'; x.fill(); x.stroke();
      rr(x, 74, 46, 12, 22, 3); x.fillStyle = '#d04a40'; x.fill(); x.stroke();
      rr(x, 6, 4, 148, 12, 6); x.fillStyle = '#2f2a38'; x.fill(); x.strokeStyle = '#211d2a'; x.stroke();
    });
    /* 红灯笼（立杆悬挂） */
    S.redLantern = bake2(44, 92, x => {
      shadow(x, 22, 86, 12, 3.6);
      rr(x, 18, 4, 8, 82, 3);
      x.fillStyle = lg(x, 18, 4, 26, 86, [[0, '#5a4a3a'], [1, '#43362a']]); x.fill();
      x.lineWidth = 2.2; x.strokeStyle = '#332a20'; x.stroke();
      rr(x, 10, 4, 24, 8, 3); x.fillStyle = '#5a4a3a'; x.fill(); x.strokeStyle = '#332a20'; x.stroke();
      ell(x, 22, 34, 15, 17, lg(x, 7, 17, 37, 51, [[0, '#ff8a6a'], [1, '#d84a3a']]), '#a83226', 2.6);
      x.strokeStyle = 'rgba(255,220,180,.6)'; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(22, 18); x.lineTo(22, 50); x.moveTo(13, 21); x.lineTo(13, 47); x.moveTo(31, 21); x.lineTo(31, 47); x.stroke();
      rr(x, 17, 52, 10, 6, 2); x.fillStyle = '#e8b45c'; x.fill(); x.strokeStyle = '#a8782e'; x.lineWidth = 1.8; x.stroke();
      circ(x, 22, 60, 2, '#ffd34d');
      shine(x, 15, 26, 3.4, 6, 0.2);
    });
    /* 集装箱（多色） */
    S.container = (body) => bake2(150, 76, x => {
      shadow(x, 76, 70, 56, 7);
      rr(x, 8, 10, 134, 56, 7);
      x.fillStyle = lg(x, 8, 10, 142, 66, [[0, body], [1, 'rgba(0,0,0,.35)']]); x.fill();
      // 用 source-atop 叠出瓦楞纹
      x.save(); rr(x, 8, 10, 134, 56, 7); x.clip();
      x.strokeStyle = 'rgba(255,255,255,.22)'; x.lineWidth = 3;
      for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(18 + i * 14, 14); x.lineTo(18 + i * 14, 62); x.stroke(); }
      x.restore();
      rr(x, 8, 10, 134, 56, 7); x.strokeStyle = '#2f2a3a'; x.lineWidth = 3.4; x.stroke();
      for (const cx of [8, 142]) { rr(x, cx - 3, 22, 6, 32, 2); x.fillStyle = '#3a3448'; x.fill(); }
    });
    S.contRed = S.container('#c05a52'); S.contBlue = S.container('#4a7ab5'); S.contGreen = S.container('#4f8f5e'); S.contRust = S.container('#b07a3c');
    /* 小汽车（俯视，多色） */
    S.car = (body) => bake2(116, 64, x => {
      shadow(x, 58, 58, 42, 6);
      rr(x, 8, 8, 100, 44, 14);
      x.fillStyle = lg(x, 8, 8, 108, 52, [[0, body], [1, 'rgba(0,0,0,.30)']]); x.fill();
      x.lineWidth = 3; x.strokeStyle = '#2f2a3a'; x.stroke();
      rr(x, 26, 13, 22, 34, 6); x.fillStyle = '#a8c4dc'; x.fill(); x.lineWidth = 2.4; x.strokeStyle = '#2f2a3a'; x.stroke();
      rr(x, 68, 13, 22, 34, 6); x.fillStyle = '#8fb0cc'; x.fill(); x.stroke();
      x.fillStyle = 'rgba(255,255,255,.3)';
      rr(x, 30, 16, 6, 12, 2); x.fill(); rr(x, 72, 16, 6, 12, 2); x.fill();
      for (const [lx, ly] of [[10, 14], [10, 46], [104, 16], [104, 44]]) circ(x, lx, ly, 3.4, '#ffe9a8', '#2f2a3a', 1.6);
      rr(x, 52, 6, 12, 6, 2); x.fillStyle = '#3a3448'; x.fill();
    });
    S.carPink = S.car('#e0678f'); S.carCyan = S.car('#4fb3b0'); S.carAmber = S.car('#e8a83c');
    /* 渔船 */
    S.boat = bake2(156, 84, x => {
      shadow(x, 78, 76, 58, 7);
      x.beginPath();
      x.moveTo(14, 42); x.quadraticCurveTo(30, 12, 84, 12); x.quadraticCurveTo(130, 12, 144, 36);
      x.quadraticCurveTo(148, 44, 144, 52); x.quadraticCurveTo(130, 72, 84, 72); x.quadraticCurveTo(30, 72, 14, 50);
      x.closePath();
      x.fillStyle = lg(x, 14, 12, 144, 72, [[0, '#7a94b0'], [1, '#54708c']]); x.fill();
      x.lineWidth = 3.4; x.strokeStyle = '#3a4a5e'; x.stroke();
      x.beginPath(); x.ellipse(80, 42, 52, 18, 0, 0, U.TAU); x.fillStyle = '#8a6a48'; x.fill(); x.strokeStyle = '#5d4a34'; x.lineWidth = 2.6; x.stroke();
      for (const bx of [44, 76, 108]) { x.strokeStyle = '#5d4a34'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(bx, 26); x.lineTo(bx, 58); x.stroke(); }
      rr(x, 108, 26, 26, 16, 4); x.fillStyle = '#e8b45c'; x.fill(); x.strokeStyle = '#3a4a5e'; x.lineWidth = 2.4; x.stroke();
      x.strokeStyle = '#3a4a5e'; x.beginPath(); x.moveTo(60, 26); x.lineTo(60, 6); x.stroke();
      circ(x, 60, 5, 3, '#ff8f9f', '#3a4a5e', 1.6);
    });
    /* 灯塔 */
    S.light = bake2(104, 170, x => {
      shadow(x, 52, 162, 34, 8);
      x.beginPath(); x.moveTo(36, 156); x.lineTo(44, 40); x.lineTo(64, 40); x.lineTo(72, 156); x.closePath();
      x.fillStyle = lg(x, 36, 40, 72, 156, [[0, '#f0ead8'], [1, '#c8c0aa']]); x.fill();
      x.lineWidth = 3.4; x.strokeStyle = '#5d4a44'; x.stroke();
      x.save(); x.beginPath(); x.moveTo(36, 156); x.lineTo(44, 40); x.lineTo(64, 40); x.lineTo(72, 156); x.closePath(); x.clip();
      for (const by of [70, 106, 142]) { x.fillStyle = '#d05a4a'; x.fillRect(20, by, 70, 18); }
      x.restore();
      rr(x, 40, 22, 28, 20, 4); x.fillStyle = '#3a4252'; x.fill(); x.strokeStyle = '#2a303e'; x.stroke();
      ell(x, 54, 30, 7, 5, '#ffe9a8', '#e8b45c', 2);
      x.beginPath(); x.moveTo(32, 22); x.lineTo(54, 4); x.lineTo(76, 22); x.closePath();
      x.fillStyle = '#d05a4a'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#8a3a30'; x.stroke();
    });
    /* 摊位（市场/夜市，条纹雨棚） */
    S.stall = (awn) => bake2(132, 104, x => {
      shadow(x, 66, 96, 48, 7);
      rr(x, 18, 52, 96, 40, 6); x.fillStyle = lg(x, 18, 52, 114, 92, [[0, '#8a6a4a'], [1, '#6f5438']]); x.fill();
      x.lineWidth = 3; x.strokeStyle = '#4f3a26'; x.stroke();
      for (const [gx, c] of [[28, '#ffd34d'], [48, '#ff9dc3'], [68, '#7de3e0'], [88, '#8fd982']]) circ(x, gx, 70, 6, c, '#4f3a26', 1.6);
      // 雨棚
      x.beginPath(); x.moveTo(6, 52); x.quadraticCurveTo(66, 30, 126, 52); x.lineTo(120, 64); x.quadraticCurveTo(66, 46, 12, 64); x.closePath();
      x.fillStyle = awn; x.fill(); x.lineWidth = 3; x.strokeStyle = '#4f3a26'; x.stroke();
      x.save(); x.beginPath(); x.moveTo(6, 52); x.quadraticCurveTo(66, 30, 126, 52); x.lineTo(120, 64); x.quadraticCurveTo(66, 46, 12, 64); x.closePath(); x.clip();
      x.fillStyle = 'rgba(255,252,240,.85)';
      for (let i = 0; i < 4; i++) x.fillRect(16 + i * 28, 28, 14, 40);
      x.restore();
      for (const px of [16, 114]) { rr(x, px - 3, 52, 6, 40, 2); x.fillStyle = '#6a5138'; x.fill(); }
      // 挂灯
      x.strokeStyle = '#4f3a26'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(30, 60); x.lineTo(30, 74); x.stroke();
      circ(x, 30, 78, 5, '#ff8a6a', '#a84a30', 1.8);
    });
    S.stallPink = S.stall('#e0678f'); S.stallCyan = S.stall('#4fb3b0'); S.stallAmber = S.stall('#e8a83c');
    /* 马戏帐篷 */
    S.tent = (c1) => bake2(160, 118, x => {
      shadow(x, 80, 108, 56, 8);
      x.beginPath(); x.moveTo(80, 8); x.quadraticCurveTo(140, 40, 148, 92); x.quadraticCurveTo(80, 106, 12, 92); x.quadraticCurveTo(20, 40, 80, 8); x.closePath();
      x.fillStyle = c1; x.fill(); x.lineWidth = 3.4; x.strokeStyle = '#3a2a3e'; x.stroke();
      x.save(); x.beginPath(); x.moveTo(80, 8); x.quadraticCurveTo(140, 40, 148, 92); x.quadraticCurveTo(80, 106, 12, 92); x.quadraticCurveTo(20, 40, 80, 8); x.closePath(); x.clip();
      x.fillStyle = 'rgba(255,250,235,.9)';
      x.beginPath(); x.moveTo(80, 8); x.lineTo(104, 100); x.lineTo(56, 100); x.closePath(); x.fill();
      x.restore();
      ell(x, 80, 96, 20, 8, '#3a2a3e');
      x.strokeStyle = '#3a2a3e'; x.lineWidth = 3; x.beginPath(); x.moveTo(80, 8); x.lineTo(80, -2); x.stroke();
      x.fillStyle = '#ffd34d';
      x.beginPath(); x.moveTo(80, -2); x.lineTo(96, 2); x.lineTo(80, 8); x.closePath(); x.fill(); x.lineWidth = 2; x.stroke();
    });
    S.tentRed = S.tent('#c94a5a'); S.tentPurple = S.tent('#7a5aa8'); S.tentTeal = S.tent('#3f8f8a');
    /* 旋转木马（大圆地标） */
    S.carousel = bake2(260, 226, x => {
      shadow(x, 130, 216, 96, 10);
      // 底座平台
      ell(x, 130, 168, 108, 44, lg(x, 22, 124, 238, 212, [[0, '#b58a5c'], [1, '#8a6236']]), '#5d433c', 4);
      ell(x, 130, 158, 108, 44, '#a87f52', '#5d433c', 3);
      // 围栏
      x.strokeStyle = '#ffd9a0'; x.lineWidth = 4;
      x.beginPath(); x.ellipse(130, 150, 96, 36, 0, 0, U.TAU); x.stroke();
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * U.TAU;
        const fx = 130 + Math.cos(a) * 96, fy = 150 + Math.sin(a) * 36;
        x.strokeStyle = '#ffe9c4'; x.lineWidth = 3;
        x.beginPath(); x.moveTo(fx, fy); x.lineTo(fx, fy + 18); x.stroke();
        circ(x, fx, fy + 20, 3, '#ff8fb5', '#c05a78', 1.6);
      }
      // 木马（俯视简化为三只小马背）
      for (const [mx, my, c] of [[92, 142, '#f0f0f6'], [130, 156, '#b79df0'], [168, 142, '#ffd34d']]) {
        ell(x, mx, my, 13, 8, c, '#5d433c', 2.4);
        circ(x, mx + 11, my - 3, 4, c, '#5d433c', 2);
        x.strokeStyle = '#d8a83c'; x.lineWidth = 2; x.beginPath(); x.moveTo(mx, my - 8); x.lineTo(mx, my + 10); x.stroke();
      }
      // 中心柱 + 锥顶
      circ(x, 130, 118, 12, '#e8b45c', '#a8782e', 3);
      x.beginPath(); x.moveTo(130, -6);
      x.quadraticCurveTo(224, 66, 216, 118); x.quadraticCurveTo(130, 138, 44, 118); x.quadraticCurveTo(36, 66, 130, -6);
      x.closePath();
      x.fillStyle = lg(x, 44, 0, 216, 130, [[0, '#ff8fb5'], [0.5, '#e0678f'], [1, '#c04a70']]); x.fill();
      x.lineWidth = 4; x.strokeStyle = '#a83a58'; x.stroke();
      x.fillStyle = 'rgba(255,250,235,.9)';
      x.beginPath(); x.moveTo(130, -4); x.quadraticCurveTo(190, 50, 182, 116); x.quadraticCurveTo(130, 130, 130, 130); x.closePath(); x.fill();
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * U.TAU;
        circ(x, 130 + Math.cos(a) * 84, 62 + Math.sin(a) * 46, 4, '#ffe9a8', '#e8a83c', 1.6);
      }
      circ(x, 130, 4, 7, '#ffd34d', '#e8a83c', 2.4);
    });
    /* 气球车 / 爆米花车 */
    S.balloonCart = bake2(96, 108, x => {
      shadow(x, 48, 100, 32, 6);
      for (const [bx, by, c] of [[32, 30, '#ff8fb5'], [52, 20, '#7de3e0'], [66, 36, '#ffd34d'], [42, 14, '#b79df0']]) {
        x.strokeStyle = '#8a7468'; x.lineWidth = 1.6;
        x.beginPath(); x.moveTo(bx, by + 10); x.lineTo(46, 62); x.stroke();
        ell(x, bx, by, 11, 13, c, 'rgba(60,40,70,.6)', 2);
        shine(x, bx - 3, by - 4, 2.6, 3.6, -0.3);
      }
      rr(x, 20, 62, 56, 28, 6); x.fillStyle = '#8a6a4a'; x.fill(); x.strokeStyle = '#5d4530'; x.lineWidth = 2.6; x.stroke();
      rr(x, 16, 56, 64, 10, 4); x.fillStyle = '#e0678f'; x.fill(); x.stroke();
      for (const wx of [24, 68]) circ(x, wx, 94, 7, '#3a3448', '#211d2a', 2);
    });
    S.popcorn = bake2(92, 100, x => {
      shadow(x, 46, 92, 30, 6);
      rr(x, 22, 56, 48, 30, 6); x.fillStyle = '#b5443e'; x.fill(); x.strokeStyle = '#6e2a26'; x.lineWidth = 2.6; x.stroke();
      x.fillStyle = '#fff2d8'; x.font = '900 15px sans-serif'; x.textAlign = 'center'; x.fillText('POP', 46, 76);
      x.beginPath(); x.moveTo(10, 56); x.lineTo(46, 30); x.lineTo(82, 56); x.closePath();
      x.fillStyle = '#e0678f'; x.fill(); x.lineWidth = 2.6; x.strokeStyle = '#8a3a50'; x.stroke();
      x.save(); x.beginPath(); x.moveTo(10, 56); x.lineTo(46, 30); x.lineTo(82, 56); x.closePath(); x.clip();
      x.fillStyle = 'rgba(255,250,235,.9)'; x.fillRect(36, 26, 12, 34); x.restore();
      circ(x, 46, 24, 3, '#ffd34d');
      for (const wx of [28, 64]) circ(x, wx, 88, 6, '#3a3448', '#211d2a', 2);
    });
    /* 猫道拱门标记（只有猫能钻） */
    S.catArch = bake2(76, 68, x => {
      shadow(x, 38, 62, 24, 5);
      x.beginPath(); x.moveTo(10, 58); x.lineTo(10, 30); x.quadraticCurveTo(38, 2, 66, 30); x.lineTo(66, 58);
      x.closePath();
      x.fillStyle = lg(x, 10, 0, 66, 58, [[0, '#8a6a94'], [1, '#6a4a74']]); x.fill();
      x.lineWidth = 3.2; x.strokeStyle = '#4a3252'; x.stroke();
      ell(x, 38, 58, 18, 10, '#241d2e', '#17111f', 2.4);
      // 拱上小猫耳 + 爪印
      x.fillStyle = '#8a6a94'; x.strokeStyle = '#4a3252'; x.lineWidth = 2.4;
      x.beginPath(); x.moveTo(24, 14); x.lineTo(30, 2); x.lineTo(36, 12); x.closePath(); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(40, 12); x.lineTo(46, 2); x.lineTo(52, 14); x.closePath(); x.fill(); x.stroke();
      paw(x, 38, 34, 0, '#ffd9e6', 0.9);
    });
    /* 猫爪木牌 */
    S.pawSign = bake2(48, 62, x => {
      shadow(x, 24, 56, 13, 4);
      rr(x, 20, 30, 8, 26, 3); x.fillStyle = '#7a5c3e'; x.fill(); x.strokeStyle = '#54402c'; x.lineWidth = 2.2; x.stroke();
      rr(x, 6, 6, 36, 26, 7); x.fillStyle = '#ffe9c4'; x.fill(); x.strokeStyle = '#c9a06a'; x.lineWidth = 2.6; x.stroke();
      paw(x, 24, 19, 0.15, '#e0864c', 0.95);
    });
    /* 路障锥 / 垃圾袋 / 自行车 / 系船柱 */
    S.cone = bake2(34, 40, x => {
      shadow(x, 17, 35, 11, 3.4);
      x.beginPath(); x.moveTo(17, 4); x.lineTo(27, 32); x.lineTo(7, 32); x.closePath();
      x.fillStyle = lg(x, 7, 4, 27, 32, [[0, '#ff9d5c'], [1, '#e0703a']]); x.fill();
      x.lineWidth = 2.6; x.strokeStyle = '#a84e22'; x.stroke();
      x.fillStyle = '#fff2d8'; x.fillRect(11, 18, 12, 5);
      rr(x, 4, 32, 26, 6, 3); x.fillStyle = '#e0703a'; x.fill(); x.strokeStyle = '#a84e22'; x.stroke();
    });
    S.trash = bake2(72, 52, x => {
      shadow(x, 36, 46, 26, 5);
      blob(x, 24, 34, 15, lg(x, 9, 19, 39, 49, [[0, '#5a6272'], [1, '#414858']]));
      blob(x, 48, 38, 13, lg(x, 35, 25, 61, 51, [[0, '#6a7282'], [1, '#4a5162']]));
      shine(x, 19, 26, 4, 2.6, -0.4);
      // 探出的鱼骨头
      x.strokeStyle = '#cfd4e2'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(52, 26); x.lineTo(64, 18); x.moveTo(56, 24); x.lineTo(58, 20); x.moveTo(60, 22); x.lineTo(62, 18); x.stroke();
      circ(x, 65, 17, 2, '#cfd4e2');
    });
    S.bike = bake2(76, 46, x => {
      shadow(x, 38, 40, 26, 4);
      x.strokeStyle = '#4a5568'; x.lineWidth = 2.6;
      circ(x, 18, 30, 11, null, '#3a4252', 3.4); circ(x, 58, 30, 11, null, '#3a4252', 3.4);
      x.strokeStyle = '#e0864c'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(18, 30); x.lineTo(32, 16); x.lineTo(50, 16); x.lineTo(58, 30); x.moveTo(32, 16); x.lineTo(38, 30); x.lineTo(58, 30); x.stroke();
      x.strokeStyle = '#4a5568'; x.lineWidth = 2.4;
      x.beginPath(); x.moveTo(50, 16); x.lineTo(56, 10); x.moveTo(14, 26); x.lineTo(10, 18); x.stroke();
    });
    S.bollard = bake2(32, 38, x => {
      shadow(x, 16, 33, 10, 3);
      rr(x, 10, 8, 12, 26, 5); x.fillStyle = lg(x, 10, 8, 22, 34, [[0, '#8a93a8'], [1, '#5a6378']]); x.fill();
      x.lineWidth = 2.4; x.strokeStyle = '#3e4454'; x.stroke();
      ell(x, 16, 8, 6, 3, '#a8b0c4', '#3e4454', 2);
    });
    /* 野餐布（平面贴地） */
    S.picnic = bake2(116, 92, x => {
      x.save(); x.translate(58, 46); x.rotate(-0.12);
      rr(x, -50, -36, 100, 72, 8); x.fillStyle = '#d8756b'; x.fill();
      x.lineWidth = 3; x.strokeStyle = 'rgba(90,40,40,.5)'; x.stroke();
      x.strokeStyle = 'rgba(255,244,230,.75)'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(-50, -12); x.lineTo(50, -12); x.moveTo(-50, 12); x.lineTo(50, 12); x.stroke();
      x.restore();
      ell(x, 46, 40, 12, 7, '#c9a06a', '#a87f52', 2);
      circ(x, 72, 38, 5, '#f0ead8', '#a89a80', 1.8);
    });
    /* 彩灯串（平面挂饰） */
    S.stringLights = bake2(232, 44, x => {
      x.strokeStyle = 'rgba(80,60,50,.8)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(4, 8); x.quadraticCurveTo(116, 34, 228, 8); x.stroke();
      for (let i = 0; i < 9; i++) {
        const t = (i + 0.5) / 9;
        const lx = 4 + 224 * t, ly = 8 + Math.sin(t * Math.PI) * 24;
        x.strokeStyle = 'rgba(80,60,50,.8)'; x.lineWidth = 1.4;
        x.beginPath(); x.moveTo(lx, ly); x.lineTo(lx, ly + 5); x.stroke();
        const cols = ['#ffd34d', '#7de3e0', '#ff9dc3', '#c9a7ff'];
        circ(x, lx, ly + 9, 3.6, cols[i % 4], 'rgba(60,40,40,.7)', 1.4);
      }
    });
    S.ready = true;
    // 合并通用城市家具（art.js 的 decor 也可作为装饰精灵使用）
    Object.assign(S, Art.decor);
  }

  /* ============================================================
     地面绘制器（纯函数：只依赖 op 与确定性哈希 → 分块缓存无接缝）
     ============================================================ */
  function hs(op, a, i) { return U.hash2((op.x | 0) + a * 131 + i * 7, (op.y | 0) + a * 57 + i * 17, 71); }
  function specks(x, op, per, cols, sz) {
    const n = Math.min(240, Math.max(6, Math.round(op.w * op.h / per)));
    for (let i = 0; i < n; i++) {
      const px = op.x + hs(op, 1, i) * op.w, py = op.y + hs(op, 2, i) * op.h;
      x.fillStyle = cols[(hs(op, 3, i) * cols.length) | 0];
      x.globalAlpha = 0.4 + hs(op, 4, i) * 0.4;
      x.fillRect(px, py, sz, sz * (0.6 + hs(op, 5, i) * 0.9));
    }
    x.globalAlpha = 1;
  }
  function joints(x, op, gap, col, lw) {
    x.strokeStyle = col; x.lineWidth = lw || 1.6;
    x.beginPath();
    for (let gx = gap; gx < op.w; gx += gap) { x.moveTo(op.x + gx, op.y); x.lineTo(op.x + gx, op.y + op.h); }
    for (let gy = gap; gy < op.h; gy += gap) { x.moveTo(op.x, op.y + gy); x.lineTo(op.x + op.w, op.y + gy); }
    x.stroke();
  }
  function edge(x, op, col, lw) {
    x.strokeStyle = col; x.lineWidth = lw || 3;
    x.strokeRect(op.x + 1.5, op.y + 1.5, op.w - 3, op.h - 3);
  }
  function fillGrad(x, op, c1, c2) {
    x.fillStyle = lg(x, op.x, op.y, op.x, op.y + op.h, [[0, c1], [1, c2]]);
    x.fillRect(op.x, op.y, op.w, op.h);
  }
  const paintOp = (x, op) => {
    switch (op.k) {
      case 'asphalt':
        fillGrad(x, op, '#3a3e5c', '#353957');
        specks(x, op, 900, ['rgba(255,255,255,.05)', 'rgba(0,0,0,.18)'], 3);
        break;
      case 'road': {
        fillGrad(x, op, '#363a58', '#313552');
        specks(x, op, 900, ['rgba(255,255,255,.05)', 'rgba(0,0,0,.2)'], 3);
        x.strokeStyle = '#8f8558'; x.lineWidth = 4; x.setLineDash([26, 32]);
        x.beginPath();
        if (op.w >= op.h) { x.moveTo(op.x + 8, op.y + op.h / 2); x.lineTo(op.x + op.w - 8, op.y + op.h / 2); }
        else { x.moveTo(op.x + op.w / 2, op.y + 8); x.lineTo(op.x + op.w / 2, op.y + op.h - 8); }
        x.stroke(); x.setLineDash([]);
        break;
      }
      case 'walk':
        fillGrad(x, op, '#5d6288', '#565b80');
        joints(x, op, 26, 'rgba(30,32,54,.55)');
        edge(x, op, 'rgba(190,196,230,.16)', 3);
        break;
      case 'court':
        fillGrad(x, op, '#4e537a', '#484d74');
        joints(x, op, 52, 'rgba(24,26,44,.6)', 2);
        specks(x, op, 1400, ['rgba(255,255,255,.04)', 'rgba(0,0,0,.15)'], 3);
        break;
      case 'plazaWarm':
        fillGrad(x, op, '#5b5178', '#524a70');
        specks(x, op, 800, ['rgba(255,220,160,.06)', 'rgba(0,0,0,.2)', 'rgba(255,143,181,.05)'], 3.4);
        x.strokeStyle = 'rgba(20,14,30,.4)'; x.lineWidth = 2;
        x.beginPath();
        for (let i = 0; i < 4; i++) {
          const cx = op.x + hs(op, 8, i) * op.w, cy = op.y + hs(op, 9, i) * op.h;
          x.moveTo(cx, cy); x.lineTo(cx + 20 + hs(op, 10, i) * 30, cy + 8);
        }
        x.stroke();
        break;
      case 'grass':
        fillGrad(x, op, '#3d7a5c', '#377054');
        specks(x, op, 420, ['rgba(120,200,140,.16)', 'rgba(30,70,50,.4)'], 3.6);
        for (let i = 0; i < Math.min(40, op.w * op.h / 5200); i++) {
          if (hs(op, 6, i) < 0.55) {
            x.fillStyle = ['#e8a0bc', '#e8d0a0', '#c9a7ff'][(hs(op, 7, i) * 3) | 0];
            x.globalAlpha = 0.75;
            circ(x, op.x + hs(op, 8, i) * op.w, op.y + hs(op, 9, i) * op.h, 2.6, x.fillStyle);
            x.globalAlpha = 1;
          }
        }
        break;
      case 'flower':
        fillGrad(x, op, '#418065', '#3a7559');
        for (let i = 0; i < Math.min(150, op.w * op.h / 620); i++) {
          const px = op.x + hs(op, 1, i) * op.w, py = op.y + hs(op, 2, i) * op.h;
          x.fillStyle = ['#ff9dc3', '#ffd34d', '#fff', '#c9a7ff'][(hs(op, 3, i) * 4) | 0];
          circ(x, px, py, 3, x.fillStyle);
          circ(x, px, py, 1.2, '#e8a83c');
        }
        break;
      case 'sand':
        fillGrad(x, op, '#a8946e', '#9c8a66');
        specks(x, op, 380, ['rgba(255,240,200,.2)', 'rgba(70,55,35,.25)'], 3);
        x.strokeStyle = 'rgba(70,55,35,.22)'; x.lineWidth = 2.4;
        x.beginPath();
        for (let i = 0; i < 6; i++) {
          const cy = op.y + (i + 0.5) * op.h / 6;
          x.moveTo(op.x + 10, cy); x.quadraticCurveTo(op.x + op.w / 2, cy + 7, op.x + op.w - 10, cy);
        }
        x.stroke();
        break;
      case 'snow':
        fillGrad(x, op, '#e2eaf4', '#d6e1ef');
        specks(x, op, 900, ['rgba(255,255,255,.8)', 'rgba(150,175,215,.3)'], 2.6);
        x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 3;
        x.beginPath();
        for (let i = 0; i < 6; i++) {
          const cy = op.y + (i + 0.5) * op.h / 6;
          x.moveTo(op.x + 8, cy); x.quadraticCurveTo(op.x + op.w / 2, cy + 8, op.x + op.w - 8, cy);
        }
        x.stroke();
        break;
      case 'snowdeep':
        fillGrad(x, op, '#ccd9ec', '#c0cfe6');
        specks(x, op, 700, ['rgba(255,255,255,.6)', 'rgba(140,165,210,.4)'], 3);
        x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 3;
        x.beginPath();
        for (let i = 0; i < 5; i++) {
          const cy = op.y + (i + 0.5) * op.h / 5;
          x.moveTo(op.x + 8, cy); x.quadraticCurveTo(op.x + op.w / 2, cy + 9, op.x + op.w - 8, cy);
        }
        x.stroke();
        break;
      case 'stone': {
        fillGrad(x, op, '#6b7095', '#646989');
        const g2 = 34;
        for (let gy = 0; gy < op.h; gy += g2) for (let gx = 0; gx < op.w; gx += g2) {
          const t = hs(op, 1, gx * 7 + gy);
          x.fillStyle = t < 0.4 ? '#5e6380' : t < 0.8 ? '#545972' : '#4e536b';
          rr(x, op.x + gx + 2, op.y + gy + 2, g2 - 4, g2 - 4, 6); x.fill();
        }
        specks(x, op, 1600, ['rgba(120,200,140,.14)', 'rgba(0,0,0,.16)'], 3);
        break;
      }
      case 'wood': {
        fillGrad(x, op, '#7c5c40', '#6e503a');
        x.strokeStyle = 'rgba(60,40,24,.6)'; x.lineWidth = 2;
        const vert = op.h > op.w;
        x.beginPath();
        if (vert) for (let gx = 18; gx < op.w; gx += 18) { x.moveTo(op.x + gx, op.y); x.lineTo(op.x + gx, op.y + op.h); }
        else for (let gy = 18; gy < op.h; gy += 18) { x.moveTo(op.x, op.y + gy); x.lineTo(op.x + op.w, op.y + gy); }
        x.stroke();
        x.fillStyle = 'rgba(40,26,14,.5)';
        for (let i = 0; i < Math.min(60, op.w * op.h / 2600); i++)
          x.fillRect(op.x + hs(op, 1, i) * op.w, op.y + hs(op, 2, i) * op.h, 2.4, 2.4);
        edge(x, op, 'rgba(40,26,16,.55)', 4);
        break;
      }
      case 'water':
        rr(x, op.x + 2, op.y + 2, op.w - 4, op.h - 4, 20);
        x.fillStyle = lg(x, op.x, op.y, op.x, op.y + op.h, [[0, '#1c3c63'], [1, '#16324f']]); x.fill();
        x.strokeStyle = 'rgba(120,180,230,.35)'; x.lineWidth = 7;
        rr(x, op.x + 6, op.y + 6, op.w - 12, op.h - 12, 16); x.stroke();
        x.strokeStyle = 'rgba(10,22,40,.5)'; x.lineWidth = 10;
        rr(x, op.x + 15, op.y + 15, Math.max(6, op.w - 30), Math.max(6, op.h - 30), 12); x.stroke();
        specks(x, op, 2200, ['rgba(190,225,255,.14)'], 3);
        break;
      case 'ice':
        fillGrad(x, op, '#b9d4ea', '#a9c6e2');
        x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 2;
        x.beginPath();
        for (let i = 0; i < 5; i++) {
          const cx = op.x + hs(op, 1, i) * op.w, cy = op.y + hs(op, 2, i) * op.h;
          x.moveTo(cx, cy); x.lineTo(cx + (hs(op, 3, i) - 0.5) * 60, cy + (hs(op, 4, i) - 0.5) * 60);
        }
        x.stroke();
        break;
      case 'cat': {
        fillGrad(x, op, op.c || '#3a3244', op.c2 || '#332c3d');
        // 木板观感（水上跳板/独木用）：画板条缝
        if (op.plank) {
          const vert = op.h > op.w;
          x.strokeStyle = 'rgba(40,26,14,.5)'; x.lineWidth = 2;
          x.beginPath();
          if (vert) for (let gy = 16; gy < op.h; gy += 16) { x.moveTo(op.x, op.y + gy); x.lineTo(op.x + op.w, op.y + gy); }
          else for (let gx = 16; gx < op.w; gx += 16) { x.moveTo(op.x + gx, op.y); x.lineTo(op.x + gx, op.y + op.h); }
          x.stroke();
        }
        edge(x, op, 'rgba(255,217,230,.22)', 2.4);
        x.setLineDash([10, 12]);
        x.strokeStyle = 'rgba(255,170,200,.3)'; x.lineWidth = 2;
        x.strokeRect(op.x + 5, op.y + 5, op.w - 10, op.h - 10);
        x.setLineDash([]);
        const along = op.w >= op.h, len = along ? op.w : op.h;
        const n2 = Math.max(2, Math.floor(len / 58));
        for (let i = 0; i < n2; i++) {
          const t = (i + 0.5) / n2, off = (hs(op, 1, i) - 0.5) * 12;
          const px = along ? op.x + t * len : op.x + op.w / 2 + off;
          const py = along ? op.y + op.h / 2 + off : op.y + t * len;
          paw(x, px, py, along ? 0 : Math.PI / 2, 'rgba(255,200,220,.5)');
        }
        break;
      }
      case 'track': {
        fillGrad(x, op, '#332e42', '#2c283a');
        const vert = op.h > op.w;
        x.strokeStyle = '#4a4358'; x.lineWidth = 5;
        x.beginPath();
        const nT = Math.floor((vert ? op.h : op.w) / 20);
        for (let i = 0; i <= nT; i++) {
          const t = i * 20;
          if (vert) { x.moveTo(op.x + 2, op.y + t); x.lineTo(op.x + op.w - 2, op.y + t); }
          else { x.moveTo(op.x + t, op.y + 2); x.lineTo(op.x + t, op.y + op.h - 2); }
        }
        x.stroke();
        x.strokeStyle = '#8a8498'; x.lineWidth = 4;
        x.beginPath();
        if (vert) { x.moveTo(op.x + op.w * 0.3, op.y); x.lineTo(op.x + op.w * 0.3, op.y + op.h); x.moveTo(op.x + op.w * 0.7, op.y); x.lineTo(op.x + op.w * 0.7, op.y + op.h); }
        else { x.moveTo(op.x, op.y + op.h * 0.3); x.lineTo(op.x + op.w, op.y + op.h * 0.3); x.moveTo(op.x, op.y + op.h * 0.7); x.lineTo(op.x + op.w, op.y + op.h * 0.7); }
        x.stroke();
        x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1.4;
        x.beginPath();
        if (vert) { x.moveTo(op.x + op.w * 0.3, op.y); x.lineTo(op.x + op.w * 0.3, op.y + op.h); x.moveTo(op.x + op.w * 0.7, op.y); x.lineTo(op.x + op.w * 0.7, op.y + op.h); }
        else { x.moveTo(op.x, op.y + op.h * 0.3); x.lineTo(op.x + op.w, op.y + op.h * 0.3); x.moveTo(op.x, op.y + op.h * 0.7); x.lineTo(op.x + op.w, op.y + op.h * 0.7); }
        x.stroke();
        break;
      }
      case 'net':
        fillGrad(x, op, '#8f7f60', '#83735a');
        x.strokeStyle = 'rgba(60,48,30,.55)'; x.lineWidth = 2;
        x.beginPath();
        for (let gx = 0; gx <= op.w; gx += 16) { x.moveTo(op.x + gx, op.y); x.lineTo(op.x + gx, op.y + op.h); }
        for (let gy = 0; gy <= op.h; gy += 16) { x.moveTo(op.x, op.y + gy); x.lineTo(op.x + op.w, op.y + gy); }
        x.stroke();
        specks(x, op, 900, ['rgba(255,240,200,.14)'], 3);
        break;
      case 'mud':
        fillGrad(x, op, '#5f5348', '#554a40');
        for (let i = 0; i < Math.min(60, op.w * op.h / 1500); i++) {
          ell(x, op.x + hs(op, 1, i) * op.w, op.y + hs(op, 2, i) * op.h, 8 + hs(op, 3, i) * 16, 5 + hs(op, 4, i) * 9, 'rgba(30,24,20,.35)');
        }
        break;
      case 'leaves':
        fillGrad(x, op, '#574d66', '#4e455c');
        specks(x, op, 220, ['rgba(190,110,60,.5)', 'rgba(220,150,80,.4)', 'rgba(140,90,50,.5)'], 4);
        break;
      case 'hedge':
        fillGrad(x, op, '#2c5238', '#274a32');
        for (let t = 0; t < Math.max(op.w, op.h); t += 26) {
          const along = op.w >= op.h;
          const cx = along ? op.x + t + 13 : op.x + op.w / 2, cy = along ? op.y + op.h / 2 : op.y + t + 13;
          blob(x, cx, cy, 15, lg(x, cx - 15, cy - 15, cx + 10, cy + 15, [[0, '#356b4e'], [1, '#2a5a40']]));
        }
        break;
      case 'hedgeDark':
        fillGrad(x, op, '#263530', '#202d29');
        for (let t = 0; t < Math.max(op.w, op.h); t += 30) {
          const along = op.w >= op.h;
          const cx = along ? op.x + t + 15 : op.x + op.w / 2, cy = along ? op.y + op.h / 2 : op.y + t + 15;
          blob(x, cx, cy, 17, lg(x, cx - 17, cy - 17, cx + 12, cy + 17, [[0, '#2e4a3a'], [1, '#223830']]));
        }
        break;
      case 'wall': {
        fillGrad(x, op, '#585268', '#4e4860');
        x.strokeStyle = 'rgba(24,20,34,.7)'; x.lineWidth = 2;
        const bh = 22;
        x.beginPath();
        for (let gy = 0; gy < op.h; gy += bh) {
          x.moveTo(op.x, op.y + gy); x.lineTo(op.x + op.w, op.y + gy);
          const off = (gy / bh) % 2 ? 24 : 0;
          for (let gx = off; gx < op.w; gx += 48) { x.moveTo(op.x + gx, op.y + gy); x.lineTo(op.x + gx, op.y + Math.min(op.h, gy + bh)); }
        }
        x.stroke();
        edge(x, op, 'rgba(200,200,230,.12)', 3);
        break;
      }
      case 'rockwall':
        fillGrad(x, op, '#6a6478', '#5e5a6c');
        for (let i = 0; i < Math.min(120, op.w * op.h / 1100); i++) {
          const cx = op.x + hs(op, 1, i) * op.w, cy = op.y + hs(op, 2, i) * op.h, r2 = 8 + hs(op, 3, i) * 14;
          blob(x, cx, cy, r2, lg(x, cx - r2, cy - r2, cx + r2, cy + r2, [[0, hs(op, 4, i) < 0.5 ? '#6a6478' : '#5d5868'], [1, '#474354']]));
        }
        break;
      case 'fence': {
        const vert = op.h > op.w;
        const c1 = '#6a5240', c2 = '#54402f';
        x.strokeStyle = c1; x.lineWidth = 5;
        x.beginPath();
        if (vert) {
          x.moveTo(op.x + op.w * 0.3, op.y); x.lineTo(op.x + op.w * 0.3, op.y + op.h);
          x.moveTo(op.x + op.w * 0.7, op.y); x.lineTo(op.x + op.w * 0.7, op.y + op.h);
        } else {
          x.moveTo(op.x, op.y + op.h * 0.3); x.lineTo(op.x + op.w, op.y + op.h * 0.3);
          x.moveTo(op.x, op.y + op.h * 0.7); x.lineTo(op.x + op.w, op.y + op.h * 0.7);
        }
        x.stroke();
        const n2 = Math.floor((vert ? op.h : op.w) / 90);
        x.fillStyle = c2; x.strokeStyle = '#3a2c1e'; x.lineWidth = 2;
        for (let i = 0; i <= n2; i++) {
          const t = i * 90;
          if (vert) rr(x, op.x + 1, op.y + t, op.w - 2, 10, 3);
          else rr(x, op.x + t, op.y + 1, 10, op.h - 2, 3);
          x.fill(); x.stroke();
        }
        break;
      }
      case 'parkline': {
        x.strokeStyle = 'rgba(230,230,210,.4)'; x.lineWidth = 5;
        x.beginPath();
        if (op.vert) for (let gx = 0; gx <= op.w; gx += op.gap || 62) { x.moveTo(op.x + gx, op.y); x.lineTo(op.x + gx, op.y + op.h); }
        else for (let gy = 0; gy <= op.h; gy += op.gap || 62) { x.moveTo(op.x, op.y + gy); x.lineTo(op.x + op.w, op.y + gy); }
        x.stroke();
        break;
      }
      case 'crosswalk': {
        x.fillStyle = 'rgba(235,235,220,.55)';
        const n2 = Math.floor((op.w >= op.h ? op.w : op.h) / 40);
        for (let i = 0; i < n2; i++) {
          if (op.w >= op.h) x.fillRect(op.x + i * 40 + 5, op.y, 22, op.h);
          else x.fillRect(op.x, op.y + i * 40 + 5, op.w, 22);
        }
        break;
      }
      case 'roundcourt': {
        x.fillStyle = '#3e4362';
        x.beginPath(); x.arc(op.x, op.y, op.r, 0, U.TAU); x.fill();
        x.strokeStyle = 'rgba(24,26,44,.6)'; x.lineWidth = 2;
        for (let r2 = op.r - 26; r2 > 8; r2 -= 26) { x.beginPath(); x.arc(op.x, op.y, r2, 0, U.TAU); x.stroke(); }
        break;
      }
      case 'roundrock': {
        x.fillStyle = '#575263';
        x.beginPath(); x.arc(op.x, op.y, op.r, 0, U.TAU); x.fill();
        for (let i = 0; i < 26; i++) {
          const a = hs(op, 1, i) * U.TAU, r3 = hs(op, 2, i) * op.r * 0.8;
          const cx = op.x + Math.cos(a) * r3, cy = op.y + Math.sin(a) * r3, r4 = 7 + hs(op, 3, i) * 12;
          blob(x, cx, cy, r4, lg(x, cx - r4, cy - r4, cx + r4, cy + r4, [[0, '#6a6478'], [1, '#474354']]));
        }
        break;
      }
      case 'spr': {
        const s = typeof op.spr === 'string' ? S[op.spr] : op.spr;
        if (!s) break;
        if (op.alpha !== undefined) x.globalAlpha = op.alpha;
        if (op.rot) {
          x.save(); x.translate(op.x + op.w / 2, op.y + op.h / 2); x.rotate(op.rot);
          x.drawImage(s, -op.w / 2, -op.h / 2, op.w, op.h);
          x.restore();
        } else x.drawImage(s, op.x, op.y, op.w, op.h);
        x.globalAlpha = 1;
        break;
      }
      case 'bld': paintBld(x, op); break;
    }
  };
  /* 建筑：屋顶视角 + 檐口 + 屋顶杂物 + 南向雨棚/门（绘本风） */
  function paintBld(x, b) {
    const { x: bx, y: by, w, h } = b;
    const R = (a, i) => U.hash2(b.seed + a * 131 + (i || 0) * 7, b.seed * 7 + a + (i || 0) * 17, 53);
    // 落影
    x.save(); x.globalAlpha = 0.3; x.fillStyle = '#0c0a18';
    rr(x, bx + 8, by + 13, w, h, 10); x.fill(); x.restore();
    const roof = b.roof;
    // 主体
    rr(x, bx, by, w, h, 9);
    x.fillStyle = lg(x, bx, by, bx, by + h, [[0, roof], [1, 'rgba(0,0,0,.20)']]); x.fill();
    x.lineWidth = 3.6; x.strokeStyle = '#211b2c'; x.stroke();
    rr(x, bx + 5, by + 5, w - 10, h - 10, 7);
    x.strokeStyle = 'rgba(255,255,255,.13)'; x.lineWidth = 2; x.stroke();
    // 屋顶杂物
    if (b.style === 'shop' || b.style === 'apt' || b.style === 'shop24') {
      for (let i = 0; i < (b.style === 'apt' ? 3 : 2); i++) {
        const ax = bx + 16 + i * 36, ay = by + 14 + R(2, i) * Math.max(4, h - 70);
        rr(x, ax, ay, 26, 20, 4); x.fillStyle = '#5a6274'; x.fill(); x.lineWidth = 2.4; x.strokeStyle = '#31384a'; x.stroke();
        circ(x, ax + 13, ay + 10, 6, '#454c5e', '#31384a', 2);
        x.strokeStyle = '#31384a'; x.lineWidth = 1.4;
        x.beginPath(); x.moveTo(ax + 13, ay + 4); x.lineTo(ax + 13, ay + 16); x.moveTo(ax + 7, ay + 10); x.lineTo(ax + 19, ay + 10); x.stroke();
      }
      rr(x, bx + w - 40, by + h - 44, 26, 26, 4); x.fillStyle = '#6a7288'; x.fill(); x.strokeStyle = '#31384a'; x.lineWidth = 2.4; x.stroke();
      x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(bx + w - 36, by + h - 40); x.lineTo(bx + w - 18, by + h - 22); x.stroke();
    }
    if (b.style === 'apt') { // 水塔
      const tx = bx + w / 2, ty = by + h / 2;
      circ(x, tx, ty, 20, '#7a6248', '#4a3826', 3);
      x.strokeStyle = '#4a3826'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(tx - 14, ty - 14); x.lineTo(tx + 14, ty + 14); x.moveTo(tx + 14, ty - 14); x.lineTo(tx - 14, ty + 14); x.stroke();
      circ(x, tx - 6, ty - 6, 7, 'rgba(255,255,255,.18)');
    }
    if (b.style === 'house' || b.style === 'inn') { // 坡屋顶
      x.save();
      rr(x, bx, by, w, h, 9); x.clip();
      x.fillStyle = 'rgba(255,255,255,.14)';
      x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + w, by); x.lineTo(bx + w / 2, by + h / 2); x.lineTo(bx, by + h / 2); x.closePath(); x.fill();
      x.fillStyle = 'rgba(0,0,0,.09)';
      x.beginPath(); x.moveTo(bx + w, by + h); x.lineTo(bx, by + h); x.lineTo(bx + w / 2, by + h / 2); x.lineTo(bx + w, by + h / 2); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 2.4;
      x.beginPath();
      for (let t = 26; t < Math.max(w, h); t += 26) {
        x.moveTo(bx + t, by); x.lineTo(bx + Math.max(0, t - h), by + Math.min(h, t));
      }
      x.stroke();
      x.restore();
      x.strokeStyle = '#211b2c'; x.lineWidth = 4;
      x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + w / 2, by + h / 2); x.lineTo(bx + w, by); x.stroke();
      // 烟囱
      rr(x, bx + w - 34, by + 14, 20, 20, 4); x.fillStyle = '#8a5a4a'; x.fill(); x.strokeStyle = '#4a3030'; x.lineWidth = 2.6; x.stroke();
      ell(x, bx + w - 24, by + 14, 10, 4, '#5d4038', '#4a3030', 2);
    }
    if (b.style === 'ware') { // 拱形仓库顶
      x.save(); rr(x, bx, by, w, h, 9); x.clip();
      x.strokeStyle = 'rgba(255,255,255,.10)'; x.lineWidth = 12;
      for (let gx = 20; gx < w; gx += 44) { x.beginPath(); x.moveTo(bx + gx, by); x.lineTo(bx + gx, by + h); x.stroke(); }
      x.restore();
      circ(x, bx + w / 2, by + h / 2, Math.min(26, h / 3), '#5a6274', '#31384a', 3);
      x.strokeStyle = '#31384a'; x.lineWidth = 2;
      x.beginPath(); x.arc(bx + w / 2, by + h / 2, Math.min(26, h / 3) - 6, 0.4, 2.4); x.stroke();
    }
    if (b.style === 'funhouse') { // 鬼屋：星星贴纸
      x.fillStyle = 'rgba(255,230,120,.85)';
      for (let i = 0; i < 5; i++) {
        const sx = bx + 16 + R(3, i) * (w - 32), sy = by + 16 + R(4, i) * (h - 32);
        x.save(); x.translate(sx, sy); x.rotate(R(5, i) * 3);
        x.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = k * Math.PI * 2 / 5 - Math.PI / 2;
          x.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
          x.lineTo(Math.cos(a + Math.PI / 5) * 3.6, Math.sin(a + Math.PI / 5) * 3.6);
        }
        x.closePath(); x.fill(); x.restore();
      }
    }
    // 南向雨棚 + 门垫（临街店铺）
    if (b.awn) {
      const aw = Math.min(w - 20, 96), ax = bx + (w - aw) / 2;
      x.fillStyle = 'rgba(0,0,0,.28)';
      rr(x, ax + 3, by + h - 4, aw, 26, 6); x.fill();
      x.save();
      rr(x, ax, by + h - 7, aw, 26, 6); x.clip();
      x.fillStyle = b.awn; x.fillRect(ax, by + h - 7, aw, 26);
      x.fillStyle = 'rgba(255,252,240,.9)';
      for (let sx2 = 0; sx2 < aw; sx2 += 22) x.fillRect(ax + sx2, by + h - 7, 11, 26);
      x.restore();
      rr(x, ax, by + h - 7, aw, 26, 6); x.strokeStyle = '#3a2a3e'; x.lineWidth = 3; x.stroke();
      // 雨棚扇贝边
      x.fillStyle = b.awn;
      for (let sx2 = 0; sx2 < aw - 8; sx2 += 16) {
        x.beginPath(); x.arc(ax + sx2 + 8, by + h + 19, 8, 0, Math.PI); x.fill();
      }
      rr(x, ax + aw / 2 - 14, by + h + 2, 28, 14, 4); x.fillStyle = '#2f2a3c'; x.fill();
    }
  }

  /* ============================================================
     地图构建器
     ============================================================ */
  class MB {
    constructor(meta) {
      this.id = meta.id;
      this.meta = meta;
      this.w = meta.w; this.h = meta.h;
      this.gw = Math.ceil(this.w / CELL); this.gh = Math.ceil(this.h / CELL);
      this.grid = new Uint8Array(this.gw * this.gh); // 默认可走
      this.ops = []; this.decor = []; this.lamps = [];
      this.waterR = []; this.steam = [];
      this.tiles = new Map();
      this.start = meta.start;
    }
    /* ---- 地形 ---- */
    stamp(x, y, w, h, code) {
      const x0 = Math.max(0, Math.floor(x / CELL)), y0 = Math.max(0, Math.floor(y / CELL));
      const x1 = Math.min(this.gw - 1, Math.floor((x + w - 0.01) / CELL));
      const y1 = Math.min(this.gh - 1, Math.floor((y + h - 0.01) / CELL));
      for (let gy = y0; gy <= y1; gy++) {
        const row = gy * this.gw;
        for (let gx = x0; gx <= x1; gx++) this.grid[row + gx] = code;
      }
    }
    stampCirc(cx, cy, r, code) {
      const x0 = Math.max(0, Math.floor((cx - r) / CELL)), x1 = Math.min(this.gw - 1, Math.floor((cx + r) / CELL));
      const y0 = Math.max(0, Math.floor((cy - r) / CELL)), y1 = Math.min(this.gh - 1, Math.floor((cy + r) / CELL));
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
        const px = gx * CELL + CELL / 2, py = gy * CELL + CELL / 2;
        if ((px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r) this.grid[gy * this.gw + gx] = code;
      }
    }
    fill(k, x, y, w, h, extra) { const op = Object.assign({ k, x, y, w, h }, extra); this.ops.push(op); return op; }
    block(k, x, y, w, h, extra) { this.stamp(x, y, w, h, T.BLOCK); return this.fill(k, x, y, w, h, extra); }
    slow(k, x, y, w, h, extra) { this.stamp(x, y, w, h, T.SLOW); return this.fill(k, x, y, w, h, extra); }
    cat(x, y, w, h, extra) { this.stamp(x, y, w, h, T.CAT); return this.fill('cat', x, y, w, h, Object.assign({ c: this.meta.catGround, c2: this.meta.catGround2 }, extra)); }
    water(x, y, w, h) { this.stamp(x, y, w, h, T.BLOCK); this.waterR.push({ x, y, w, h }); return this.fill('water', x, y, w, h); }
    onsen(x, y, w, h) { // 温泉池：水面 + 石沿 + 蒸汽
      this.block('rockwall', x - 10, y - 10, w + 20, h + 20);
      this.water(x + 8, y + 8, w - 16, h - 16);
      this.ops.push({ k: 'water', x: x + 8, y: y + 8, w: w - 16, h: h - 16 });
      this.steam.push({ x: x + w / 2, y: y + h / 2 });
    }
    /* ---- 建筑 ---- */
    bld(style, x, y, w, h, o) {
      o = o || {};
      if (o.pad !== false) this.fill(o.padK || 'walk', x - 22, y - 22, w + 44, h + 44);
      this.stamp(x, y, w, h, T.BLOCK);
      const seed = ((x * 7 + y * 13) | 0) + this.ops.length;
      const roofs = this.meta.roofs || ['#4e5a74'];
      const wantAwn = o.awn !== null && (o.awn || style === 'shop' || style === 'shop24'); // 雨棚只属于临街店铺
      this.ops.push({ k: 'bld', style, x, y, w, h, seed, roof: roofs[seed % roofs.length], awn: wantAwn ? (o.awn || AWNS[seed % AWNS.length]) : null });
    }
    /* ---- 立体装饰（逐帧绘制） ---- */
    spr(key, x, y, o) {
      o = o || {};
      this.decor.push({ spr: key, x, y, sx: o.sx || 1, sy: o.sy || 1, alpha: o.alpha || 1 });
      if (o.solid) this.stampCirc(x, y, o.solid === true ? 26 : o.solid, T.BLOCK);
      // 双柱阻挡（鸟居等门形装饰）：只在两根柱上放圆，门中央保持可穿行
      if (o.pillars) { const pr = o.pr || 16; this.stampCirc(x - o.pillars, y, pr, T.BLOCK); this.stampCirc(x + o.pillars, y, pr, T.BLOCK); }
    }
    lamp(x, y, glow) { this.lamps.push({ x, y, g: glow || 'lamp' }); }
    flat(key, x, y, w, h, extra) { this.ops.push(Object.assign({ k: 'spr', spr: S[key] || key, x, y, w, h }, extra)); }
    border(k, t) {
      this.block(k, 0, 0, this.w, t);
      this.block(k, 0, this.h - t, this.w, t);
      this.block(k, 0, 0, t, this.h);
      this.block(k, this.w - t, 0, t, this.h);
    }
    /* ---- 查询 ---- */
    code(x, y) {
      const gx = (x / CELL) | 0, gy = (y / CELL) | 0;
      if (gx < 0 || gy < 0 || gx >= this.gw || gy >= this.gh) return T.BLOCK;
      return this.grid[gy * this.gw + gx];
    }
    free(x, y, isCat, r) {
      r = r || 12;
      if (this.code(x, y) === T.BLOCK) return false;
      const rs = r * 0.72, rd = r * 0.5;
      for (const [dx, dy] of DIRS4) {
        const t = this.code(x + dx * rs, y + dy * rs);
        if (t === T.BLOCK || (!isCat && t === T.CAT)) return false;
      }
      for (const [dx, dy] of DIRS4) {
        const t = this.code(x + dx * rd, y + dy * rd);
        if (t === T.BLOCK || (!isCat && t === T.CAT)) return false;
      }
      return true;
    }
    moveActor(a, dx, dy, isCat) {
      const r = (a.r || 14) * 0.8;
      if (dx) { const nx = a.x + dx; if (this.free(nx, a.y, isCat, r)) a.x = nx; }
      if (dy) { const ny = a.y + dy; if (this.free(a.x, ny, isCat, r)) a.y = ny; }
    }
    speedAt(x, y) { return this.code(x, y) === T.SLOW ? (this.meta.slowMul || 0.55) : 1; }
    nearWalk(x, y, isCat, maxR) {
      maxR = maxR || 640;
      x = U.clamp(x, 24, this.w - 24); y = U.clamp(y, 24, this.h - 24);
      if (this.free(x, y, isCat, 14)) return { x, y };
      for (let r2 = CELL; r2 <= maxR; r2 += CELL) {
        const n = Math.max(8, Math.round(r2 / 3));
        for (let i = 0; i < n; i++) {
          const a = i / n * U.TAU;
          const px = x + Math.cos(a) * r2, py = y + Math.sin(a) * r2;
          if (px < 20 || py < 20 || px > this.w - 20 || py > this.h - 20) continue;
          if (this.free(px, py, isCat, 14)) return { x: px, y: py };
        }
      }
      return { x, y };
    }
    /* ---- 渲染 ---- */
    tile(tx, ty) {
      const key = tx * 4096 + ty;
      let c = this.tiles.get(key);
      if (c) return c;
      c = document.createElement('canvas');
      c.width = TILE; c.height = TILE;
      const x = c.getContext('2d');
      x.save();
      x.beginPath(); x.rect(0, 0, TILE, TILE); x.clip(); // 画布自身坐标（先裁剪再平移到世界）
      x.translate(-tx * TILE, -ty * TILE);
      x.lineJoin = 'round'; x.lineCap = 'round';
      x.fillStyle = this.meta.base || '#2b2e44';
      x.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      for (const op of this.ops) {
        const ow = op.w || (op.r ? op.r * 2 : 60), oh = op.h || (op.r ? op.r * 2 : 60);
        const oxx = op.k === 'roundcourt' ? op.x - op.r : op.x, oyy = op.k === 'roundcourt' ? op.y - op.r : op.y;
        if (oxx > tx * TILE + TILE || oyy > ty * TILE + TILE || oxx + ow < tx * TILE || oyy + oh < ty * TILE) continue;
        paintOp(x, op);
      }
      x.restore();
      this.tiles.set(key, c);
      if (this.tiles.size > 42) {
        const k0 = this.tiles.keys().next().value;
        this.tiles.delete(k0);
      }
      return c;
    }
    drawGround(ctx, L, Tp, R2, B2, camX, camY) {
      const tx0 = Math.max(0, Math.floor(L / TILE)), ty0 = Math.max(0, Math.floor(Tp / TILE));
      const tx1 = Math.min(Math.ceil(this.w / TILE) - 1, Math.floor(R2 / TILE));
      const ty1 = Math.min(Math.ceil(this.h / TILE) - 1, Math.floor(B2 / TILE));
      // 世界变换为「相对坐标」：绘制需减去相机（与 w2sx/w2sy 同一套约定）
      const ox = camX === undefined ? 0 : camX, oy = camY === undefined ? 0 : camY;
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) ctx.drawImage(this.tile(tx, ty), tx * TILE - ox, ty * TILE - oy);
    }
    drawDecor(ctx, L, Tp, R2, B2, w2sx, w2sy) {
      for (const d of this.decor) {
        if (d.y < Tp - 320) continue;
        if (d.y > B2 + 80) break; // 已按 y 排序
        if (d.x < L - 220 || d.x > R2 + 220) continue;
        const s = typeof d.spr === 'string' ? S[d.spr] : d.spr;
        if (!s) continue;
        const w2 = s.width / 2, h2 = s.height;
        ctx.save();
        ctx.globalAlpha = d.alpha;
        if (d.sx !== 1 || d.sy !== 1) {
          ctx.translate(w2sx(d.x), w2sy(d.y));
          ctx.scale(d.sx, d.sy);
          ctx.drawImage(s, -w2, -h2 + 6);
        } else ctx.drawImage(s, w2sx(d.x) - w2, w2sy(d.y) - h2 + 6);
        ctx.restore();
      }
    }
    drawFx(ctx, time, w2sx, w2sy, L, Tp, R2, B2, camX, camY) {
      // 世界变换为「相对坐标」：动态元素统一减去相机（与 drawGround 同一套约定）
      const ox = camX === undefined ? 0 : camX, oy = camY === undefined ? 0 : camY;
      ctx.save();
      for (const w of this.waterR) {
        if (w.x > R2 || w.y > B2 || w.x + w.w < L || w.y + w.h < Tp) continue;
        ctx.save();
        ctx.beginPath(); ctx.rect(w.x - ox, w.y - oy, w.w, w.h); ctx.clip();
        ctx.strokeStyle = 'rgba(205,232,255,.15)'; ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          const yy = w.y + w.h * (0.22 + i * 0.28);
          const x0 = w.x - ((time * 30 + i * 90) % w.w);
          for (let px = 0; px <= w.w * 2; px += 30) {
            const xx = x0 + px, yv = yy + Math.sin(xx * 0.035 + time * 2 + i) * 4;
            if (px === 0) ctx.moveTo(xx - ox, yv - oy); else ctx.lineTo(xx - ox, yv - oy);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
      // 温泉蒸汽（常驻雾底 + 蓝灰雾团/提亮芯；雪地上也要可见）
      for (const st of this.steam) {
        if (st.x < L - 200 || st.x > R2 + 200 || st.y < Tp - 260 || st.y > B2 + 200) continue;
        const sx = st.x - ox, sy = st.y - oy;
        // 常驻雾底：水面上一层随呼吸起伏的雾
        const br = 0.2 + Math.sin(time * 1.6 + st.x) * 0.05;
        ctx.globalAlpha = br;
        ctx.fillStyle = '#dce9f4';
        ctx.beginPath(); ctx.ellipse(sx, sy, 72, 46, 0, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = br + 0.1;
        ctx.fillStyle = '#f2f8fd';
        ctx.beginPath(); ctx.ellipse(sx - 8, sy - 4, 42, 26, 0, 0, U.TAU); ctx.fill();
        // 上升雾团
        for (let i = 0; i < 5; i++) {
          const k = ((time * 0.4 + i * 0.37 + st.x * 0.013) % 1);
          const yy = sy - 6 - k * 150, r2 = 14 + k * 30;
          const sway = Math.sin(k * 6 + i * 2) * (10 + k * 18);
          ctx.globalAlpha = (1 - k) * (1 - k) * 0.62;
          ctx.fillStyle = '#7e97ae';
          ctx.beginPath(); ctx.arc(sx + sway, yy, r2, 0, U.TAU); ctx.fill();
          ctx.globalAlpha = (1 - k) * 0.55;
          ctx.fillStyle = '#eef5fc';
          ctx.beginPath(); ctx.arc(sx + sway * 0.7, yy + 4, r2 * 0.5, 0, U.TAU); ctx.fill();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    preview(cvs) {
      const x = cvs.getContext('2d');
      const sx = cvs.width / this.gw, sy = cvs.height / this.gh;
      const cols = this.meta.pv || { 0: '#3d4266', 1: '#1b1e30', 2: '#31584a', 3: '#d9a441' };
      for (let gy = 0; gy < this.gh; gy++) for (let gx = 0; gx < this.gw; gx++) {
        x.fillStyle = cols[this.grid[gy * this.gw + gx]];
        x.fillRect(gx * sx, gy * sy, sx + 0.6, sy + 0.6);
      }
    }
    init() {
      bakeSprites();
      this.decor.sort((a, b) => a.y - b.y);
      this.tiles.clear();
    }
  }
  const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let glowCache = null;

  /* ============================================================
     五张手工地图
     ============================================================ */

  /* ---------- 🌃 老城夜市：不规则路网的真城市（楼宇/夜市/公园/工地/停车场） ---------- */
  function oldtown() {
    const m = new MB({
      id: 'oldtown', name: '老城夜市', emoji: '🌃',
      desc: '街区路网 · 夜市大街 · 中央公园',
      w: 4800, h: 3600, start: { x: 2400, y: 2325 },
      base: '#333754', catGround: '#3a3244', catGround2: '#332c3d',
      roofs: ['#6a7694', '#8a6a76', '#7a6c92', '#6a8a7e', '#8f7d64'],
      pv: { 0: '#3d4266', 1: '#23202f', 2: '#31584a', 3: '#d9a441' }
    });
    const bld = (...a) => m.bld(...a);
    // 基础沥青 + 路网（街道宽度不一、间距不均，像真实老城）
    m.fill('asphalt', 0, 0, m.w, m.h);
    const H = [[500, 130], [1330, 110], [2250, 150], [3130, 110]];
    const V = [[540, 120], [1580, 110], [2640, 130], [3680, 120], [4380, 100]];
    for (const [y, h2] of H) m.fill('road', 0, y, m.w, h2);
    for (const [x, w2] of V) m.fill('road', x, 0, w2, m.h);
    // 小巷
    m.fill('road', 1120, 630, 50, 700);    // A1 竖巷
    m.fill('road', 1690, 1970, 950, 50);   // A2 横巷
    m.fill('road', 3260, 2400, 50, 730);   // A3 竖巷
    // 围墙边界
    m.border('wall', 60);
    /* ---- 街区（每块铺人行道，再放楼宇/场地） ---- */
    const walk = (x, y, w2, h2) => m.fill('walk', x, y, w2, h2);
    const grass = (x, y, w2, h2) => m.slow('grass', x, y, w2, h2);
    // C1R1 住宅
    walk(60, 60, 480, 440);
    bld('apt', 100, 100, 200, 170, { pad: false });
    bld('house', 340, 300, 170, 130, { pad: false });
    m.spr('tree', 160, 380, { solid: 20 });
    m.flat('puddle', 360, 130, 90, 50);
    // C2R1 商店排
    walk(660, 60, 920, 440);
    bld('shop', 700, 100, 240, 170, { pad: false, awn: '#e0678f' });
    bld('shop', 990, 100, 220, 170, { pad: false, awn: '#4fb3b0' });
    bld('shop', 1260, 100, 220, 170, { pad: false, awn: '#f0b13c' });
    m.spr('carPink', 780, 420, { solid: 40 });
    m.spr('cone', 1050, 430);
    m.flat('puddle', 1280, 380, 90, 50);
    // C3R1 社区小公园
    walk(1690, 60, 950, 440);
    grass(1712, 82, 906, 396);
    m.water(2080, 170, 320, 170);
    m.spr('tree', 1820, 240, { solid: 24 });
    m.spr('tree', 2320, 420, { solid: 24 });
    m.spr('bush', 2450, 180);
    m.spr('bush', 1780, 420);
    m.spr('bench', 2000, 430);
    m.spr('bench', 2300, 120);
    // C4R1 停车场
    walk(2770, 60, 910, 440);
    m.fill('court', 2792, 82, 866, 396);
    m.ops.push({ k: 'parkline', x: 2830, y: 140, w: 700, h: 120, vert: true, gap: 88 });
    m.ops.push({ k: 'parkline', x: 2830, y: 330, w: 700, h: 120, vert: true, gap: 88 });
    m.spr('carCyan', 2920, 250, { solid: 40 });
    m.spr('carAmber', 3090, 250, { solid: 40 });
    m.spr('carPink', 3260, 430, { solid: 40 });
    m.flat('puddle', 3420, 180, 90, 50);
    // C5R1 工地
    walk(3800, 60, 940, 440);
    bld('ware', 3850, 100, 280, 160, { pad: false });
    m.slow('sand', 3830, 300, 860, 170);
    m.slow('mud', 4200, 300, 300, 170);
    m.spr('boxes', 3960, 420, { solid: 34 });
    m.spr('boxes', 4520, 300, { solid: 34 });
    m.spr('cone', 4100, 430); m.spr('cone', 4260, 360); m.spr('cone', 4620, 430);
    // 工地围挡（南沿，留口）
    m.block('fence', 3820, 474, 460, 22);
    m.block('fence', 4380, 474, 340, 22);
    // C1R2 巷子住宅
    walk(60, 630, 480, 700);
    bld('house', 100, 700, 180, 150, { pad: false });
    bld('house', 100, 930, 180, 150, { pad: false });
    m.spr('bike', 380, 780);
    m.spr('trash', 380, 1250);
    grass(300, 700, 220, 620);
    // C2R2 公寓院落（猫道穿楼间缝隙）
    walk(660, 630, 920, 700);
    bld('apt', 700, 680, 190, 190, { pad: false });
    bld('apt', 1030, 680, 260, 190, { pad: false });
    m.fill('court', 700, 920, 860, 380);
    m.spr('trash', 760, 1250); m.spr('bike', 1150, 1100); m.spr('boxes', 1320, 900, { solid: 30 });
    m.flat('puddle', 900, 1050, 90, 50);
    // C3R2 中央公园（草地减速 + 池塘 + 猫道）
    walk(1690, 630, 950, 700);
    grass(1712, 652, 906, 656);
    m.water(2020, 830, 340, 200);
    m.spr('tree', 1820, 760, { solid: 24 });
    m.spr('tree', 2200, 1230, { solid: 24 });
    m.spr('tree', 2500, 900, { solid: 24 });
    m.spr('tree', 1800, 1150, { solid: 24 });
    m.spr('bush', 2480, 1240); m.spr('bush', 1900, 950);
    m.spr('bench', 2300, 1290); m.spr('bench', 1900, 720);
    m.spr('potted', 2100, 700);
    // C4R2 中央广场（喷泉地标）
    walk(2770, 630, 910, 700);
    m.fill('court', 2792, 652, 866, 656);
    m.ops.push({ k: 'roundcourt', x: 3225, y: 980, r: 130 });
    m.spr('fountain', 3225, 990, { solid: 62 });
    m.spr('bench', 3080, 1140); m.spr('bench', 3360, 1140);
    m.spr('bench', 3080, 800); m.spr('bench', 3360, 800);
    m.spr('potted', 2860, 700); m.spr('potted', 3580, 700);
    // C5R2 市场后巷
    walk(3800, 630, 940, 700);
    bld('shop', 3850, 680, 240, 180, { pad: false, awn: '#8fd982' });
    bld('house', 4140, 680, 180, 150, { pad: false });
    m.spr('trash', 4400, 950); m.spr('bike', 4560, 1200);
    m.flat('puddle', 4200, 1150, 90, 50);
    grass(3830, 920, 900, 400);
    // C1R3 老仓库院（猫道沿西墙）
    walk(60, 1440, 480, 810);
    bld('ware', 90, 1500, 300, 220, { pad: false });
    m.fill('court', 82, 1740, 440, 480);
    m.spr('boxes', 200, 1900, { solid: 32 }); m.spr('boxes', 380, 2050, { solid: 32 });
    m.spr('trash', 300, 2180);
    // C2R3 夜市广场
    walk(660, 1440, 920, 810);
    m.fill('court', 682, 1462, 876, 766);
    m.spr('stallPink', 780, 1600, { solid: 42 });
    m.spr('stallCyan', 980, 1600, { solid: 42 });
    m.spr('stallAmber', 880, 1830, { solid: 42 });
    m.flat('stringLights', 700, 1660, 300, 56, { rot: 0.06 });
    m.flat('stringLights', 1010, 1660, 300, 56, { rot: -0.06 });
    m.lamp(780, 1540, 'lantern'); m.lamp(980, 1540, 'lantern'); m.lamp(880, 1760, 'lantern');
    m.spr('bench', 1300, 2000); m.spr('vending', 700, 2130, { solid: 22 });
    // C3R3 商住楼
    walk(1690, 1440, 950, 810);
    bld('apt', 1720, 1480, 280, 200, { pad: false });
    bld('shop', 2050, 1480, 240, 180, { pad: false, awn: '#b79df0' });
    bld('house', 2050, 1720, 220, 150, { pad: false });
    m.spr('bike', 2450, 1520); m.spr('trash', 2500, 2160);
    // C4R3 小神社
    walk(2770, 1440, 910, 810);
    m.fill('stone', 2792, 1462, 866, 766);
    m.spr('torii', 3225, 1680, { pillars: 38 });
    m.spr('stoneLantern', 3120, 1720, { solid: 16 }); m.spr('stoneLantern', 3330, 1720, { solid: 16 });
    m.spr('tree', 2900, 2000, { solid: 24 }); m.spr('tree', 3550, 2000, { solid: 24 });
    m.lamp(3120, 1700, 'lamp'); m.lamp(3330, 1700, 'lamp');
    // C5R3 便利店+住宅
    walk(3800, 1440, 940, 810);
    bld('shop', 3850, 1480, 260, 180, { pad: false, awn: '#4fb3b0' });
    bld('apt', 4160, 1480, 240, 200, { pad: false });
    m.spr('vending', 3950, 1740, { solid: 22 });
    m.spr('carAmber', 4400, 2000, { solid: 40 });
    m.flat('puddle', 4100, 2050, 90, 50);
    // C1R4 窄住宅
    walk(60, 2400, 480, 730);
    bld('house', 100, 2460, 190, 160, { pad: false });
    bld('house', 100, 2700, 190, 160, { pad: false });
    grass(310, 2460, 220, 660);
    m.spr('trash', 350, 3050);
    // C2R4 菜市场
    walk(660, 2400, 920, 730);
    m.fill('court', 682, 2422, 876, 686);
    m.spr('stallCyan', 800, 2560, { solid: 42 });
    m.spr('stallAmber', 1020, 2560, { solid: 42 });
    m.spr('stallPink', 1240, 2560, { solid: 42 });
    m.spr('stallCyan', 900, 2800, { solid: 42 });
    m.spr('stallAmber', 1140, 2800, { solid: 42 });
    m.spr('boxes', 1330, 3020, { solid: 32 });
    m.lamp(800, 2500, 'lantern'); m.lamp(1240, 2500, 'lantern');
    // C3R4 街心花园（猫道穿园）
    walk(1690, 2400, 950, 730);
    grass(1712, 2422, 906, 686);
    m.fill('flower', 1900, 2560, 180, 140);
    m.fill('flower', 2260, 2700, 160, 120);
    m.spr('tree', 2050, 2900, { solid: 24 }); m.spr('tree', 2450, 2560, { solid: 24 });
    m.spr('bush', 1800, 2620); m.spr('bench', 2200, 3020);
    // C4R4 临街商铺（猫道穿两店之间）
    walk(2770, 2400, 910, 730);
    bld('shop', 2800, 2450, 240, 180, { pad: false, awn: '#e0678f' });
    bld('shop', 3090, 2450, 230, 180, { pad: false, awn: '#f0b13c' });
    bld('shop', 3360, 2450, 240, 180, { pad: false, awn: '#4fb3b0' });
    m.fill('court', 2792, 2680, 866, 420);
    m.spr('vending', 3300, 2900, { solid: 22 });
    m.spr('cone', 2860, 2950);
    // C5R4 停车场
    walk(3800, 2400, 940, 730);
    m.fill('court', 3822, 2422, 896, 686);
    m.ops.push({ k: 'parkline', x: 3860, y: 2500, w: 800, h: 120, vert: true, gap: 96 });
    m.spr('carCyan', 3950, 2620, { solid: 40 });
    m.spr('carPink', 4240, 2620, { solid: 40 });
    m.spr('carAmber', 4530, 2620, { solid: 40 });
    m.flat('puddle', 4000, 2900, 90, 50);
    m.spr('trash', 4600, 2950);
    // R5 南一排
    walk(60, 3240, 480, 300);
    bld('house', 100, 3290, 170, 150, { pad: false });
    bld('house', 310, 3290, 170, 150, { pad: false });
    walk(660, 3240, 920, 300);
    bld('ware', 700, 3280, 300, 180, { pad: false });
    m.spr('boxes', 1120, 3400, { solid: 32 });
    walk(1690, 3240, 950, 300);
    bld('shop', 1730, 3290, 260, 170, { pad: false, awn: '#8fd982' });
    m.spr('vending', 2100, 3420, { solid: 22 });
    walk(2770, 3240, 910, 300);
    m.fill('court', 2792, 3262, 866, 260);
    m.spr('bench', 3050, 3400); m.spr('tree', 3300, 3380, { solid: 24 });
    walk(3800, 3240, 940, 300);
    bld('apt', 3850, 3280, 240, 170, { pad: false });
    bld('house', 4140, 3280, 200, 150, { pad: false });
    /* ---- 猫道（只有猫能钻的缝隙） ---- */
    m.cat(920, 630, 44, 700);        // 公寓楼间缝 → 上下街
    m.spr('catArch', 942, 660); m.spr('pawSign', 942, 1300);
    m.cat(1660, 1180, 480, 44);      // 公园树篱洞 → 停车场
    m.spr('catArch', 2130, 1202); m.spr('pawSign', 1700, 1202);
    m.cat(3043, 2400, 44, 730);      // 两间店铺的夹缝
    m.spr('catArch', 3065, 2440); m.spr('pawSign', 3065, 3090);
    m.cat(120, 1800, 440, 44);       // 仓库后墙根
    m.spr('catArch', 160, 1822); m.spr('pawSign', 520, 1822);
    /* ---- 夜市大街（H3）摊位与彩灯 ---- */
    for (const sx of [1800, 2050, 2300, 2900, 3150]) m.spr('stallAmber', sx, 2245, { solid: 42 });
    for (const sx of [1900, 2150, 2400]) m.spr('stallCyan', sx, 2465, { solid: 42 });
    m.flat('stringLights', 1700, 2330, 420, 56);
    m.flat('stringLights', 2140, 2330, 420, 56);
    m.flat('stringLights', 2820, 2330, 420, 56);
    for (const lx of [1800, 2300, 2900, 3400]) m.lamp(lx, 2260, 'lantern');
    for (const lx of [1900, 2400, 3000]) m.lamp(lx, 2450, 'lantern');
    /* ---- 街道家具 ---- */
    for (const [lx, ly] of [[560, 480], [1560, 480], [2620, 480], [3660, 480], [560, 1310], [2620, 1310], [4360, 1310],
      [560, 2230], [1560, 2230], [3660, 2230], [560, 3110], [2620, 3110], [3660, 3110], [4360, 3110]]) {
      m.spr('lamp', lx, ly); m.lamp(lx, ly - 40, 'lamp');
    }
    // 斑马线 / 井盖 / 消火栓
    m.ops.push({ k: 'crosswalk', x: 560, y: 560, w: 80, h: 100 });
    m.ops.push({ k: 'crosswalk', x: 2700, y: 2300, w: 100, h: 80 });
    m.ops.push({ k: 'crosswalk', x: 1600, y: 1380, w: 80, h: 100 });
    for (const [mx, my] of [[1000, 560], [2200, 1400], [3000, 2330], [1200, 3180], [3400, 560], [600, 2000]]) {
      m.flat('manhole', mx, my, 44, 44);
    }
    for (const [hx, hy] of [[700, 520], [2700, 1380], [3800, 2230], [1700, 3170]]) m.spr('hydrant', hx, hy);
    // 店门口霓虹招牌
    const sign = Art.decor.sign;
    const neon = [['喵', 820, 290, 'neonPink'], ['拉面', 1100, 290, 'neonCyan'], ['魚', 1370, 290, 'neonPink'],
      ['OPEN', 1970, 1680, 'neonCyan'], ['猫咖', 2170, 1680, 'neonPink'], ['24H', 3980, 1680, 'neonCyan'],
      ['OPEN', 2920, 2650, 'neonPink'], ['拉面', 3205, 2650, 'neonCyan'], ['喵', 3480, 2650, 'neonPink'],
      ['魚', 1860, 3480, 'neonCyan']];
    for (const [k, sx, sy, g] of neon) { m.spr(sign[k], sx, sy); m.lamp(sx, sy - 46, g); }
    return m;
  }

  /* ---------- 🌸 樱花公园：草地减速、石径、池塘木桥、树林迷宫 ---------- */
  function sakura() {
    const m = new MB({
      id: 'sakura', name: '樱花公园', emoji: '🌸',
      desc: '满园樱花 · 池塘木桥 · 树林小径',
      w: 4400, h: 3400, start: { x: 2200, y: 3180 },
      base: '#3a7a5c', catGround: '#5a4642', catGround2: '#4e3c38', slowMul: 0.55,
      pv: { 0: '#c9b8a8', 1: '#1c3a5f', 2: '#3f7057', 3: '#e8a0bc' }
    });
    // 全园草地（减速）→ 石径快走
    m.slow('grass', 0, 0, m.w, m.h);
    const clear = []; // 路径避让区（实心树不踩进路径）
    const stone = (x, y, w2, h2) => { m.stamp(x, y, w2, h2, 0); m.fill('stone', x, y, w2, h2); clear.push([x, y, w2, h2]); };
    const wood = (x, y, w2, h2) => { m.stamp(x, y, w2, h2, 0); m.fill('wood', x, y, w2, h2); clear.push([x, y, w2, h2]); };
    m.border('hedge', 60);
    // 入口广场 + 主径
    stone(1980, 3020, 440, 320);
    stone(2160, 700, 100, 2400);
    m.spr('torii', 2200, 3270, { pillars: 38 });
    m.lamp(2200, 3230, 'lantern');
    // 环池小径
    stone(1500, 880, 1400, 90);
    stone(1500, 1560, 1400, 90);
    stone(1500, 880, 90, 770);
    stone(2810, 880, 90, 770);
    // 西径
    stone(700, 880, 90, 1720);
    // 池塘（中心 + 东湾）
    m.water(2020, 1100, 360, 300);
    m.water(1960, 1160, 480, 180);
    m.water(3160, 460, 1180, 1040);
    // 中央池塘木桥（窄 → 据点）与猫用独木
    wood(2180, 1060, 70, 380);
    m.cat(2340, 1060, 36, 380);
    m.spr('pawSign', 2340, 1470);
    // 跨湖大桥（东湾全线）与平行的猫用独木——木板观感，两端都上岸
    wood(3560, 460, 90, 1240);
    m.cat(3980, 460, 36, 1240, { c: '#8a6a48', c2: '#75573a', plank: true });
    clear.push([3962, 460, 36, 1240]); // 树林避开独木两端
    m.spr('catArch', 3998, 560);
    m.spr('pawSign', 3998, 1640);
    // 支路到空地
    stone(1500, 2000, 340, 90);
    stone(2900, 1200, 260, 90);
    stone(3560, 1700, 90, 300);
    // 花坛（入口两侧）
    m.fill('flower', 2020, 3060, 150, 240);
    m.fill('flower', 2290, 3060, 130, 240);
    /* 树林（实心樱花树 = 迷宫墙；草地减速拖慢鼠群；自动避让路径） */
    const grove = (x0, y0, x1, y1, step, kind) => {
      for (let gy = y0; gy <= y1; gy += step) for (let gx = x0; gx <= x1; gx += step) {
        const jx = (U.hash2(gx, gy, 7) - 0.5) * 30, jy = (U.hash2(gy, gx, 8) - 0.5) * 30;
        const tx = gx + jx, ty = gy + jy;
        if (clear.some(c => tx > c[0] - 62 && tx < c[0] + c[2] + 62 && ty > c[1] - 62 && ty < c[1] + c[3] + 62)) continue;
        const key = U.hash2(tx, ty, 9) < 0.3 ? 'cherry2' : (kind || 'cherry');
        m.spr(key, tx, ty, { solid: 30 });
      }
    };
    grove(200, 200, 1300, 780, 110);
    grove(200, 1900, 1300, 3000, 110);
    grove(3220, 1650, 4300, 2100, 100);
    grove(1560, 1900, 1980, 2500, 100);
    // 零散树
    for (const [tx, ty] of [[1420, 1000], [2980, 1000], [1450, 1500], [2960, 1500], [1000, 1700], [3400, 2600], [2600, 2700], [1800, 2850]]) {
      m.spr('cherry', tx, ty, { solid: 30 });
    }
    /* 猫道：树篱间兽径 */
    m.cat(400, 800, 44, 1800);
    m.spr('catArch', 422, 840); m.spr('pawSign', 422, 2560);
    m.cat(1300, 2450, 680, 44);
    m.spr('pawSign', 1340, 2472); m.spr('catArch', 1940, 2472);
    m.cat(3700, 1560, 44, 840);
    m.spr('catArch', 3722, 1600); m.spr('pawSign', 3722, 2360);
    /* 家具 */
    m.spr('stallPink', 2060, 3260, { solid: 40 });
    for (const [bx, by] of [[1700, 1700], [2700, 1700], [1600, 950], [2760, 950], [2300, 1700]]) m.spr('bench', bx, by);
    for (const [lx, ly] of [[2120, 1200], [2300, 1500], [2120, 2000], [2300, 2400], [2120, 2800], [830, 1200], [830, 2000], [2940, 1000], [2940, 1500]]) {
      m.spr('stoneLantern', lx, ly, { solid: 15 });
      m.lamp(lx, ly - 20, 'lamp');
    }
    for (const [px, py] of [[1600, 2050], [2960, 1260], [900, 2600], [3600, 1850]]) m.flat('picnic', px, py, 116, 92);
    for (const [bx, by] of [[1880, 1250], [2500, 1350], [1500, 2400], [3100, 2400]]) m.spr('bush', bx, by);
    m.spr('potted', 2140, 3200); m.spr('potted', 2270, 3200);
    return m;
  }

  /* ---------- ⚓ 港湾码头：海湾栈桥、集装箱阵、鱼市 ---------- */
  function harbor() {
    const m = new MB({
      id: 'harbor', name: '港湾码头', emoji: '⚓',
      desc: '集装箱阵 · 栈桥码头 · 鱼市沙滩',
      w: 4600, h: 3400, start: { x: 1700, y: 2100 },
      base: '#4a4f76', catGround: '#6e5a3e', catGround2: '#5f4c34',
      roofs: ['#6a7694', '#8f7d64'],
      pv: { 0: '#5a5f74', 1: '#1c3a5f', 2: '#a8946e', 3: '#d9a441' }
    });
    m.fill('court', 0, 0, m.w, m.h);
    // 海湾 + 南水道
    m.water(3350, 0, 1250, 3400);
    m.water(0, 2800, 3350, 600);
    // 北/西围栏（东/南是海）
    m.block('fence', 0, 0, m.w, 50);
    m.block('fence', 0, 0, 50, m.h);
    // 沙滩（水线上，减速）——先铺，避免盖到后画的栈桥
    m.slow('sand', 600, 2600, 2700, 200);
    const pier = (x, y, w2, h2) => { m.stamp(x, y, w2, h2, 0); m.fill('wood', x, y, w2, h2); };
    // 栈桥
    pier(3330, 860, 1000, 100);
    pier(3700, 860, 100, 500);
    pier(2600, 2790, 100, 560);
    pier(3330, 2100, 700, 110);
    // 猫跳板 → 渔船（木质窄板，色调与栈桥一致）
    m.cat(4280, 960, 44, 420, { c: '#7a5c3c', c2: '#684c30' });
    m.spr('catArch', 4296, 948);
    m.spr('pawSign', 4302, 1350);
    m.spr('boat', 4302, 1480);
    // 仓库
    m.bld('ware', 200, 180, 620, 340, { padK: 'court' });
    m.bld('ware', 200, 580, 420, 260, { padK: 'court' });
    m.slow('net', 700, 560, 500, 300);
    // 集装箱阵（中间留出贯通的猫道缝：x1962-2006）
    const cont = (x, y, key) => { m.stamp(x - 72, y - 62, 144, 66, 1); m.spr(key, x, y); };
    const rowC = (y, xs) => { for (const [x, k] of xs) cont(x, y, k); };
    rowC(1260, [[1400, 'contRed'], [1580, 'contBlue'], [1760, 'contGreen'], [2120, 'contRust'], [2300, 'contRed'], [2480, 'contBlue'], [2840, 'contGreen'], [3020, 'contRust']]);
    rowC(1420, [[1400, 'contBlue'], [1580, 'contRust'], [2120, 'contGreen'], [2300, 'contBlue'], [2660, 'contRed'], [2840, 'contRust'], [3020, 'contBlue']]);
    rowC(1580, [[1400, 'contGreen'], [1760, 'contBlue'], [2300, 'contRed'], [2480, 'contGreen'], [2660, 'contBlue'], [3020, 'contRed']]);
    // 集装箱间猫道（缝里只有猫能过；标记都放在真实缺口正中）
    m.cat(1918, 1200, 44, 440);
    m.spr('catArch', 1940, 1230);
    m.spr('pawSign', 1940, 1612);
    m.cat(2200, 1640, 620, 44);
    m.spr('pawSign', 2250, 1700); m.spr('catArch', 2790, 1700);
    // 集装箱双层堆（装饰）
    m.spr('contRed', 1400, 1198, { sy: 1.5 });
    m.spr('contBlue', 3020, 1558, { sy: 1.5 });
    // 鱼市
    m.spr('stallCyan', 2950, 2320, { solid: 42 });
    m.spr('stallAmber', 3150, 2320, { solid: 42 });
    m.spr('stallPink', 2950, 2520, { solid: 42 });
    m.spr('stallCyan', 3150, 2520, { solid: 42 });
    m.spr('boxes', 2820, 2640, { solid: 32 });
    m.flat('puddle', 3060, 2650, 90, 50);
    m.lamp(2950, 2260, 'lantern'); m.lamp(3150, 2260, 'lantern');
    // 灯塔岩
    m.ops.push({ k: 'roundrock', x: 4150, y: 330, r: 150 });
    m.spr('rock', 4060, 420, { solid: 34 }); m.spr('rock', 4260, 260, { solid: 34 });
    m.spr('light', 4150, 400, { solid: 60 });
    m.lamp(4150, 300, 'lamp');
    // 系船柱 / 堆场
    for (const by of [400, 700, 1300, 1900, 2500]) m.spr('bollard', 3310, by, { solid: 12 });
    m.spr('boat', 3560, 700);
    m.spr('boat', 4150, 2450);
    m.spr('boxes', 1250, 2050, { solid: 32 });
    m.spr('boxes', 1450, 2150, { solid: 32 });
    m.spr('boxes', 620, 1000, { solid: 32 });
    m.spr('cone', 2400, 1800); m.spr('cone', 2700, 1900);
    m.flat('puddle', 1900, 2300, 90, 50);
    m.spr('trash', 900, 1500);
    // 码头广场（出生点）+ 南侧码头生活区（摊位/泊船/缆桩/网具，避免大片空地）
    m.ops.push({ k: 'roundcourt', x: 1700, y: 2100, r: 110 });
    m.spr('stallCyan', 2450, 2260, { solid: 42 });
    m.spr('stallPink', 2620, 2330, { solid: 42 });
    m.slow('net', 900, 1850, 380, 240);
    m.spr('boxes', 1180, 1900, { solid: 32 });
    m.spr('boxes', 2280, 1900, { solid: 32 });
    m.spr('boxes', 2620, 2520, { solid: 32 });
    m.spr('boat', 1050, 2950);
    m.spr('boat', 2100, 3020);
    for (const bx of [800, 1150, 1500, 1850, 2200, 2550, 2900, 3200]) m.spr('bollard', bx, 2760, { solid: 12 });
    m.spr('trash', 1350, 2250);
    m.spr('cone', 1950, 2350); m.spr('cone', 2820, 2080);
    m.spr('bike', 1520, 2320);
    m.flat('puddle', 2050, 2450, 90, 50);
    m.flat('puddle', 1300, 2050, 90, 50);
    for (const [lx, ly] of [[3330, 920], [4290, 920], [3330, 2160], [3990, 2160], [2620, 2850], [900, 2740], [1700, 1960], [1400, 2150], [2300, 2200]]) {
      m.spr('lamp', lx, ly); m.lamp(lx, ly - 40, 'lamp');
    }
    m.lamp(2450, 2200, 'lantern'); m.lamp(2620, 2270, 'lantern');
    return m;
  }

  /* ---------- ♨️ 雪山温泉：深雪减速、石径、温泉蒸汽、竹林猫道 ---------- */
  function onsen() {
    const m = new MB({
      id: 'onsen', name: '雪山温泉', emoji: '♨️',
      desc: '深雪没爪 · 温泉蒸汽 · 竹林兽径',
      w: 4200, h: 3600, start: { x: 2100, y: 3400 }, // 门洞正中太贴柱，出生在门前参道开阔处
      base: '#d8e2f0', catGround: '#6a5a44', catGround2: '#5d4e3a', slowMul: 0.5,
      roofs: ['#7c6a74', '#68808e'],
      pv: { 0: '#7a8496', 1: '#575263', 2: '#dfe7f2', 3: '#c98a4a' }
    });
    m.slow('snow', 0, 0, m.w, m.h); // 全图深雪（减速），石径/木台快走
    const stone = (x, y, w2, h2) => { m.stamp(x, y, w2, h2, 0); m.fill('stone', x, y, w2, h2); };
    m.border('rockwall', 60);
    // 入口 + 参道
    stone(1800, 3260, 600, 280);
    stone(2050, 700, 110, 2600);
    m.spr('torii', 2100, 3300, { pillars: 38 }); // 鸟居=门：只挡两柱(±38px)，中央可穿行，勿用 solid 挡门心
    m.lamp(2100, 3260, 'lantern');
    // 横径 / 东径 / 西径
    stone(600, 1900, 3000, 100);
    stone(3200, 700, 100, 1300);
    stone(900, 1100, 100, 900);
    // 温泉旅馆
    m.bld('inn', 1500, 300, 700, 320, { padK: 'stone' });
    stone(1500, 620, 700, 90);
    // 温泉池（蒸汽）
    m.onsen(2400, 1000, 300, 200);
    m.onsen(2600, 2400, 260, 180);
    m.onsen(1000, 2600, 200, 140);
    // 冻湖 + 冰桥
    m.water(3300, 600, 600, 700);
    m.stamp(3480, 600, 100, 700, 0); m.fill('ice', 3480, 600, 100, 700);
    stone(3300, 1150, 180, 100);
    // 汤田木台
    m.stamp(2450, 1250, 300, 160, 0); m.fill('wood', 2450, 1250, 300, 160);
    // 竹林（实心）
    const bambooGrove = (x0, y0, x1, y1) => {
      for (let gy = y0; gy <= y1; gy += 90) for (let gx = x0; gx <= x1; gx += 90) {
        const jx = (U.hash2(gx, gy, 11) - 0.5) * 26, jy = (U.hash2(gy, gx, 12) - 0.5) * 26;
        m.spr('bamboo', gx + jx, gy + jy, { solid: 22 });
      }
    };
    bambooGrove(3420, 2100, 4080, 3380);
    bambooGrove(160, 2250, 820, 3400);
    /* 猫道：竹林兽径 */
    m.cat(3700, 1960, 44, 1420);
    m.spr('catArch', 3722, 2000); m.spr('pawSign', 3722, 3340);
    m.cat(500, 1960, 44, 1440);
    m.spr('pawSign', 522, 2000); m.spr('catArch', 522, 3360);
    // 岩石与雪松
    for (const [rx, ry] of [[2350, 950], [2750, 1150], [2550, 2650], [900, 2550], [1150, 2750], [3150, 1950], [1350, 1000], [2900, 2100]]) {
      m.spr('rock', rx, ry, { solid: 26 });
    }
    for (const [rx, ry] of [[1300, 300], [2900, 400], [700, 800], [4050, 1550], [1500, 2200], [2450, 3050], [1050, 3050], [4000, 1900]]) {
      m.spr('rockSnow', rx, ry, { solid: 26 });
    }
    for (const [px, py] of [[500, 400], [1000, 300], [1750, 1100], [2950, 1550], [820, 1500], [2600, 1750], [1200, 2300], [2000, 2650], [3350, 2350], [1550, 3200], [3000, 3200], [2900, 1550]]) {
      m.spr('pineSnow', px, py, { solid: 24 });
    }
    // 红灯笼参道
    for (const ly of [900, 1300, 1700, 2100, 2500, 2900]) {
      m.spr('redLantern', 2170, ly);
      m.lamp(2170, ly - 45, 'lantern');
    }
    for (const lx of [1560, 2140]) { m.spr('redLantern', lx, 660); m.lamp(lx, 615, 'lantern'); }
    for (const [sx, sy] of [[2020, 1080], [2200, 1080], [2560, 2480], [970, 2660]]) {
      m.spr('stoneLantern', sx, sy, { solid: 15 });
      m.lamp(sx, sy - 20, 'lamp');
    }
    return m;
  }

  /* ---------- 🎡 幽灵游乐园：旋转木马、过山车轨道（猫能钻过）、马戏帐篷 ---------- */
  function carnival() {
    const m = new MB({
      id: 'carnival', name: '幽灵游乐园', emoji: '🎡',
      desc: '废弃乐园 · 过山车 · 马戏帐篷',
      w: 4600, h: 3400, start: { x: 2300, y: 3180 },
      base: '#544b68', catGround: '#463d52', catGround2: '#3e3650',
      roofs: ['#7e6e96', '#8a6a76'],
      pv: { 0: '#4a4160', 1: '#2c2438', 2: '#6a5340', 3: '#d9a441' }
    });
    m.fill('plazaWarm', 0, 0, m.w, m.h);
    m.border('hedgeDark', 60);
    const court = (x, y, w2, h2) => m.fill('court', x, y, w2, h2);
    // 入口广场 + 大道
    court(1900, 3000, 800, 340);
    court(2050, 700, 500, 2340);
    m.spr('stallAmber', 2050, 3220, { solid: 36 });
    m.spr('stallCyan', 2550, 3220, { solid: 36 });
    m.flat('stringLights', 1980, 3060, 320, 56);
    m.flat('stringLights', 2300, 3060, 320, 56);
    // 旋转木马（地标）
    m.ops.push({ k: 'roundcourt', x: 2300, y: 1560, r: 150 });
    m.spr('carousel', 2300, 1620, { solid: 112 });
    m.lamp(2160, 1420, 'lantern'); m.lamp(2440, 1420, 'lantern');
    m.lamp(2160, 1720, 'lantern'); m.lamp(2440, 1720, 'lantern');
    // 落叶区（减速）——先铺，避免盖到后面的阻挡物
    m.slow('leaves', 200, 700, 420, 1400);
    // 落叶堆拆成错落小块（避免生硬大矩形）
    m.slow('leaves', 2760, 2680, 300, 200);
    m.slow('leaves', 3100, 2840, 340, 180);
    m.slow('leaves', 2880, 3040, 420, 160);
    m.slow('leaves', 3320, 2640, 240, 140);
    m.slow('mud', 2150, 2400, 300, 300);
    // 鬼屋
    m.bld('funhouse', 660, 900, 480, 380, { padK: 'plazaWarm' });
    m.spr('pawSign', 900, 1320);
    // 过山车轨道（环形闭合，大道开口处做两侧站台；阻挡；两处猫能钻的涵洞）
    const track = (x, y, w2, h2) => m.block('track', x, y, w2, h2);
    track(1200, 600, 2400, 64);
    track(3600, 600, 64, 1600);
    track(2620, 2200, 1044, 64);
    track(1200, 1400, 64, 864);
    track(1200, 2200, 820, 64);
    // 大道开口两侧的小站台
    m.fill('wood', 1930, 2140, 110, 190);
    m.fill('wood', 2634, 2140, 110, 190);
    m.cat(2020, 560, 120, 144);
    m.spr('catArch', 2080, 726);
    m.cat(3560, 1340, 140, 120);
    m.spr('pawSign', 3630, 1500);
    // 轨道支柱装饰
    for (const [px, py] of [[1500, 690], [1800, 690], [2400, 690], [2900, 690], [3300, 690], [3690, 1000], [3690, 1400], [3690, 1800], [1300, 2290], [1600, 2290], [2820, 2290], [3200, 2290], [3550, 2290], [1232, 1700], [1232, 2000]]) {
      m.spr('bollard', px, py);
    }
    // 游艺摊位一排
    m.spr('balloonCart', 2620, 1200, { solid: 30 });
    m.spr('popcorn', 2620, 1500, { solid: 30 });
    m.spr('stallPink', 2620, 1900, { solid: 42 });
    m.spr('stallCyan', 2620, 2060, { solid: 42 });
    m.lamp(2620, 1140, 'lantern'); m.lamp(2620, 1440, 'lantern');
    // 碰碰车场（围栏开一口，能进去打；南移避开过山车南轨）
    m.block('fence', 1200, 2320, 400, 22);
    m.block('fence', 1200, 2598, 130, 22);
    m.block('fence', 1470, 2598, 130, 22);
    m.block('fence', 1200, 2320, 22, 300);
    m.block('fence', 1578, 2320, 22, 300);
    court(1222, 2342, 356, 256);
    m.spr('carPink', 1320, 2500, { sx: 0.55, sy: 0.55 });
    m.spr('carCyan', 1480, 2440, { sx: 0.55, sy: 0.55 });
    // 破喷泉（岩石堆）
    m.ops.push({ k: 'roundrock', x: 2300, y: 2560, r: 60 });
    m.spr('rock', 2300, 2590, { solid: 30 });
    // 马戏帐篷阵（实心 + 帐篷缝猫道）
    m.spr('tentRed', 4000, 2600, { solid: 66 });
    m.spr('tentPurple', 4230, 2860, { solid: 66 });
    m.spr('tentTeal', 4020, 3060, { solid: 66 });
    m.cat(4100, 2380, 44, 940);
    m.spr('catArch', 4122, 2420); m.spr('pawSign', 4122, 3280);
    // 帐篷阵以西补些内容（气球车/摊位/灯），避免东侧空旷
    m.spr('balloonCart', 3620, 2980, { solid: 30 });
    m.spr('stallAmber', 3660, 2560, { solid: 42 });
    m.spr('lamp', 3560, 2740); m.lamp(3560, 2700, 'lantern');
    m.spr('trash', 3900, 3200);
    m.spr('cone', 3560, 2900);
    m.flat('puddle', 3780, 2880, 90, 50);
    // 摩天轮底座 + 支柱（远景装饰感）
    m.ops.push({ k: 'roundcourt', x: 700, y: 2600, r: 120 });
    m.spr('bollard', 640, 2600); m.spr('bollard', 760, 2600);
    m.spr('balloonCart', 700, 2760, { solid: 30 });
    // 路灯与彩灯
    for (const ly of [1000, 1500, 2000, 2500, 2900]) {
      m.spr('lamp', 2090, ly); m.lamp(2090, ly - 40, 'lamp');
      m.spr('lamp', 2510, ly + 200); m.lamp(2510, ly + 160, 'lamp');
    }
    m.flat('stringLights', 2050, 900, 500, 56);
    m.flat('stringLights', 2050, 1900, 500, 56);
    m.spr('trash', 1800, 1600); m.spr('trash', 2750, 2700);
    m.spr('cone', 1900, 2450); m.spr('cone', 2700, 1300);
    m.spr('bike', 1600, 2050);
    m.flat('puddle', 2600, 2000, 90, 50);
    return m;
  }


  const list = [oldtown(), sakura(), harbor(), onsen(), carnival()];
  // 经典「无尽街区」伪地图：curMap = null 时走旧的无限 chunk 逻辑
  const endless = {
    id: 'endless', endless: true,
    meta: { id: 'endless', name: '无尽街区', emoji: '♾️', desc: '经典模式 · 无限城市', w: 0, h: 0 },
    preview(cvs) {
      const x = cvs.getContext('2d');
      x.fillStyle = '#3d4266'; x.fillRect(0, 0, cvs.width, cvs.height);
      for (let gy = 0; gy < cvs.height; gy += 14) for (let gx = 0; gx < cvs.width; gx += 14) {
        x.fillStyle = (gx === 0 || gy === 0) ? '#2b2e44' : (U.hash2(gx, gy, 3) < 0.3 ? '#454a68' : '#3a3f5c');
        x.fillRect(gx + 1, gy + 1, 12, 12);
      }
    }
  };
  return {
    T, CELL, list: [endless, ...list], defaultId: 'oldtown',
    get(id) { return list.find(m => m.id === id) || null; },
    glow() {
      if (!glowCache) glowCache = {
        lantern: bake(160, 160, x => {
          const g = x.createRadialGradient(80, 80, 2, 80, 80, 80);
          g.addColorStop(0, 'rgba(255,150,90,.32)'); g.addColorStop(1, 'rgba(255,150,90,0)');
          x.fillStyle = g; x.fillRect(0, 0, 160, 160);
        })
      };
      return glowCache;
    }
  };
})();

;
/* ============================================================
   《喵都幸存者》平衡设置文件  game_config.js  (v2)
   ------------------------------------------------------------
   这是整个游戏【唯一的规则数值表】。
   · 改法：用记事本/VSCode 打开本文件 → 改数字 → 保存 → 刷新页面即可生效。
   · 所有数组都按「等级顺序」排列：第 1 个数字 = 1 级，第 2 个 = 2 级……
     例如 claw.dmg 有 8 个数字，对应猫爪连击 1~8 级的伤害。
   · 时间单位：秒；距离/尺寸单位：像素；不要改动字段名和引号、逗号。
   · 改坏了别慌：把文件恢复成下面的内容（或用游戏内 ⚙ 面板重新导出一份）即可。
   · 游戏内右上角 ⚙「平衡设置」面板可预览配置、一键导出，还有简单/普通/困难
     三个预设档位可参照。
   ============================================================ */
window.GAME_CONFIG = {

  /* ---------- 总难度开关（改一个数 = 全局变难/变简单） ---------- */
  // 各项都是「倍率」：1 = 标准。大于 1 更难（玩家血量除外，越大越肉）。
  difficulty: {
    enemyHp: 1.0,      // 敌人生命倍率
    enemyDmg: 1.0,     // 敌人伤害倍率
    enemySpd: 1.0,     // 敌人速度倍率
    spawnRate: 1.0,    // 刷怪频率倍率（越大怪越多）
    eliteHp: 1.0,      // 精英生命倍率（再乘 enemyHp）
    bossHp: 1.0,       // 鼠王生命倍率
    playerHp: 1.0,     // 玩家生命倍率（越大越容易存活）
    xpGain: 1.0,       // 经验获取倍率（小鱼干经验越多升级越快）
    goldGain: 1.0      // 金币获取倍率
  },

  /* ---------- 玩家（大橘）基础属性 ---------- */
  player: {
    hp: 100,        // 初始生命
    speed: 172,     // 移动速度（像素/秒）
    r: 16,          // 身体碰撞半径
    pickupR: 55,    // 拾取小鱼干的基础范围（被动「磁铁鱼」在此基础上加成）
    iframes: 0.55,  // 受击后的无敌时间（秒），防止被连续咬
    regenBase: 0    // 自带每秒回血（一般保持 0，回血交给「牛奶盒」被动）
  },

  /* ---------- 成长与刷怪曲线 ---------- */
  growth: {
    // 升级所需经验公式（分段抛物线：前期快，30/40/50 三档台阶，50 级起每 10 级越来越慢）：
    //   xpNeed(等级) = xpBase + (等级-1)*xpPerLv + (等级-1)^p
    //   p = xpPow(<30) / xpPow30(30~39) / xpPow40(40~49) / min(xpPowMax, xpPow50 + xpPowStep*floor((等级-50)/10))
    xpBase: 7,      // 2 级所需经验的基础值
    xpPerLv: 8,     // 每高 1 级，线性增加的经验
    xpPow: 1.32,    // 30 级前的指数（前期手感）
    xpPow30: 1.5,   // 30~39 级指数（30 级起变慢）
    xpPow40: 1.65,  // 40~49 级指数（再上一档）
    xpPow50: 1.8,   // 50 级起指数
    xpPowStep: 0.05, // 50 级起每 10 级的指数增量（越往后越慢）
    xpPowMax: 2.4,  // 指数封顶

    hpPerMin: 0.55,       // 敌人生命：每过 1 分钟 +55%（乘法成长）
    hpLatePerMin: 0.38,   // 8 分钟后，每分钟再加 38%（后期陡峭）
    hpLateFromMin: 8,     // 陡峭成长从第几分钟开始
    dmgPerMin: 0.045,     // 敌人伤害：每分钟 +4.5%
    spdPerMin: 0.012,     // 敌人速度：每分钟 +1.2%
    spdMax: 1.28,         // 敌人速度成长上限（倍率）
    capBase: 38,          // 开局同屏敌人上限
    capPerMin: 16.5,      // 每分钟上限增加量
    capMax: 265,          // 同屏敌人上限（性能保护，勿调太大）
    spawnBase: 1.05,      // 开局刷怪间隔（秒）
    spawnPerMin: 0.055,   // 每分钟刷怪间隔缩短量（秒）
    spawnMin: 0.24,       // 刷怪间隔下限（秒）
    batchPerMin: 2.2,     // 每过多少分钟，单次刷怪数量 +1
    despawnR: 1.6,        // 敌人离屏幕多少倍屏距后传送回包围圈
    countRoundMul: 2,     // 轮间杂兵数量乘数：×此值^(轮次-1)（只作用于杂兵刷怪与同屏上限，不影响 boss/精英/事件）
    countHardMax: 480,    // 数量乘区后的同屏硬顶（性能保护；超出部分自然转化为"补怪速度"）
    countBatchPerTick: 64, // 单帧单波刷怪钳制（防帧率尖峰；刷怪拍间隔不变，场子靠下一拍继续补满）

    // 轮间指数成长（意见2）：叠在既有机制（轮内曲线×轮次难度表/动态难度）之上。
    // 作用对象：杂兵 / 精英 / 批次头目 / 鼠王（含其召唤鼠）；老鼠妈妈不受影响（数值全固定）。
    roundHpMul: 3,        // 敌人生命轮间倍率：×3^(轮次-1)
    roundDmgMul: 2,       // 敌人攻击轮间倍率：×2^(轮次-1)
    roundSpdMul: 1.1      // 敌人移速轮间倍率：×1.1^(轮次-1)
  },

  /* ---------- 70 级后的成长规则（意见1） ----------
     autoFrom 级起：升级不再弹出三选一（不再出现任何可选的武器/技能/进化/猫爪印），
       每升 1 级自动：最大生命 +hpPerLv、移动速度 +spdPerLv，若血不满则恢复满血；
     chestOnlyFrom 级起：拾取经验不再直接升级——攒下的经验只能通过开宝箱结算成等级（同样享受上面的自动成长）。 */
  postLevel: {
    autoFrom: 70,       // 该级起升级自动转化为属性成长（不再弹三选一）
    chestOnlyFrom: 80,  // 该级起升级只能通过宝箱结算
    hpPerLv: 0.02,      // 每级最大生命 +2%
    spdPerLv: 0.01      // 每级移动速度 +1%
  },

  /* ---------- 轮次系统：15 分钟一轮 · 无限轮次 ----------
     parTime ÷ batchCount = 每批标称时长；每批进行到 bossFrac 比例时，该批「头目」降临；
     头目被讨伐 → 下一批无视剩余时间立刻来袭（内容时间轴直接快进到下一批起点）；
     最后一批头目被讨伐 → 鼠王降临；讨伐鼠王 → 本轮结束（场上残怪保留，可继续收割）并立刻进入下一轮。
     第 3 轮特例：鼠王被讨伐后，压轴 Boss「老鼠妈妈」降临（见 finale.mother* 参数）。 */
  rounds: {
    parTime: 900,         // 每轮标称时长（秒），也是动态难度的「标准清场用时」
    batchCount: 4,        // 每轮批次数
    bossFrac: 0.72,       // 批次头目在批次进度达到该比例时降临
    dynamicStartRound: 2, // 该轮起进入动态难度（此前轮次查 fixed 固定表；第 1 轮固定 = 基准教学轮）

    /* dynamicStartRound 之前的轮次：固定难度表（乘在轮内成长曲线之上）
       hp 敌人生命 / dmg 敌人伤害 / spawn 刷怪间隔倍率(越小越密) / eliteHp 宝箱精英生命 /
       bossHp 鼠王与批次头目生命 / mixMin 波次表起点偏移(分钟，越往后怪种越凶) /
       eventMul 事件数量倍率 / bbAffix 头目词条数 / bbAffixIds 头目固定词条 / bossAffix 鼠王词条数 */
    batchBossTypes: ['goose', 'raccoon', 'bulldog', 'calico'], // 头目怪类型（按 批次+轮次 轮换）
    batchBossHpFracs: [0.07, 0.13, 0.25, 0.45], // 头目生命 = 鼠王基础生命 × 此值（越靠后越硬）
    batchBossScale: 1.85, // 头目体型倍率（在精英体型之上）

    /* 前 6 轮：固定难度表（乘在轮内成长曲线之上）
       hp 敌人生命 / dmg 敌人伤害 / spawn 刷怪间隔倍率(越小越密) / eliteHp 宝箱精英生命 /
       bossHp 鼠王与批次头目生命 / mixMin 波次表起点偏移(分钟，越往后怪种越凶) /
       eventMul 事件数量倍率 / bbAffix 头目词条数 / bbAffixIds 头目固定词条 / bossAffix 鼠王词条数 */
    fixed: [
      { hp: 1.0, dmg: 1.0,  spawn: 1.0,  eliteHp: 1.0, bossHp: 1.0, mixMin: 0,    eventMul: 1,   bbAffix: 0, bossAffix: 0 },
      { hp: 1.5, dmg: 1.10, spawn: 0.90, eliteHp: 1.6, bossHp: 1.7, mixMin: 2.5,  eventMul: 1,   bbAffix: 0, bossAffix: 0 },
      { hp: 2.2, dmg: 1.20, spawn: 0.83, eliteHp: 2.4, bossHp: 2.8, mixMin: 5,    eventMul: 1.5, bbAffix: 0, bossAffix: 1 },
      { hp: 3.2, dmg: 1.30, spawn: 0.76, eliteHp: 3.5, bossHp: 4.2, mixMin: 7.5,  eventMul: 1.5, bbAffix: 1, bbAffixIds: ['tough'], bossAffix: 1 },
      { hp: 4.6, dmg: 1.40, spawn: 0.70, eliteHp: 5.0, bossHp: 6.0, mixMin: 10,   eventMul: 2,   bbAffix: 1, bbAffixIds: ['swift'], bossAffix: 1 },
      { hp: 6.5, dmg: 1.52, spawn: 0.65, eliteHp: 7.0, bossHp: 8.2, mixMin: 12.5, eventMul: 2.5, bbAffix: 2, bbAffixIds: ['swift', 'split'], bossAffix: 2 }
    ],

    /* dynamicStartRound（默认第 2 轮）起：动态难度（读上一轮实测数据自动调整）。三根轴各管各的：
       · 压力轴（杂兵血/伤害/密度）看清场速度：clear = parTime ÷ 本轮实际用时
       · DPS轴（鼠王/头目血）看击杀用时是否贴 parBossTTK：秒杀→下轮追血，磨半天→回落
       · 生存轴（伤害）看本轮平均血线：血线常年红→下轮喘息
       所有系数都有钳制区间 → 任何一轮最多比上一轮难 hpClamp 上限倍，绝不突刺。
       mixMin（怪种组合）与头目词条数按轮次线性爬坡，不会因提前开动而瞬间跳怪。 */
    dynamic: {
      hpK: 1.45, hpClamp: [1.25, 1.7],           // 杂兵生命轮增量与区间（涨最快：追玩家输出）
      dmgK: 1.08, dmgClamp: [1.04, 1.13],        // 伤害轮增量（涨最慢！这是「容错次数」旋钮）
      denK: 1.12, denClamp: [1.06, 1.18],        // 密度轮增量
      spawnFloor: 0.5,                            // 刷怪间隔倍率下限（性能保护）
      bossK: 1.2, bossKClamp: [0.85, 1.7],       // 头目生命轮增量（由击杀用时恒温调节）
      parBossTTK: 15,                             // 轮Boss标准击杀用时（秒）
      hpLow: 0.35, dmgRelief: 0.9,                // 平均血线低于此 → 下轮伤害 × 此值（喘息）
      hpHigh: 0.85, dmgTighten: 1.1,              // 平均血线高于此 → 下轮伤害 × 此值（收紧）
      lvLow: 5, lvHigh: 12, xpClamp: [0.8, 1.2],  // 每轮升级数超出/不足 → 经验获取微调
      softCapRound: 12, hpStep: 1.2               // 该轮起杂兵血改加法步进，防指数爆墙
    },

    /* 头目词条池（头目/鼠王按词条数随机抽取；鼠王不会抽到「分裂」） */
    affixes: {
      swift:  { name: '迅捷', spd: 1.28 },
      tough:  { name: '铁壁', dmgTaken: 0.8, kbRes: 0.5 },
      enrage: { name: '狂暴', atFrac: 0.3, spd: 1.3, dmg: 1.35 },
      split:  { name: '分裂', n: 3, hpMul: 4 }
    }
  },

  /* ---------- 8 种武器 ----------
     maxLv   : 最高等级（升级表数组长度要和它一致）
     evo     : 进化形态代号（勿改）
     evoPassive : 进化条件——需要携带的被动 id（对应下方 passives 的 id）
     其余数组 = 逐级数值（长度 = maxLv）。statsEvo = 进化后的固定数值。 */
  weapons: {
    claw: {  // 猫爪连击：朝面向方向的爪击
      maxLv: 8, evo: 'sakura', evoPassive: 'catnip',
      dmg:   [14, 18, 18, 24, 30, 30, 30, 38],   // 每击伤害
      cd:    [1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.05, 1.05], // 冷却秒
      area:  [1, 1, 1.28, 1.28, 1.28, 1.28, 1.28, 1.55], // 爪击范围倍率
      waves: [1, 1, 1, 2, 2, 2, 2, 2],           // 连挥段数
      both:  [0, 0, 0, 0, 0, 1, 1, 1],           // 1=前后双向挥击
      kb: 130,                                    // 击退力度
      statsEvo: { dmg: 46, cd: 0.9, area: 1.8, waves: 2, both: 1, kb: 170, crit: 0.3, critMul: 2, lifesteal: 0.06 }
    },
    note: {  // 喵喵音波：追踪音符
      maxLv: 8, evo: 'ultra', evoPassive: 'alarm',
      dmg:    [10, 10, 13, 13, 17, 17, 17, 22],
      cd:     [1.1, 1.1, 0.95, 0.95, 0.95, 0.95, 0.8, 0.8],
      amount: [1, 2, 2, 3, 3, 4, 4, 5],          // 每次发射的音符数
      speed:  [330, 330, 330, 330, 370, 370, 370, 370], // 弹速
      pierce: [1, 1, 1, 1, 1, 2, 2, 2],          // 可穿透敌人数
      statsEvo: { dmg: 27, cd: 0.42, amount: 2, speed: 440, pierce: 4 }
    },
    fish: {  // 飞鱼干：直线飞刀
      maxLv: 8, evo: 'fishstorm', evoPassive: 'bell',
      dmg:    [9, 9, 12, 12, 15, 15, 18, 18],
      cd:     [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.8, 0.8],
      amount: [1, 2, 2, 3, 3, 4, 4, 6],
      speed:  [490, 490, 530, 530, 530, 530, 530, 530],
      pierce: [1, 1, 1, 1, 2, 2, 2, 3],
      spread: 0.09,                              // 多发时的扇形散布（弧度）
      statsEvo: { dmg: 25, cd: 0.68, amount: 8, speed: 580, pierce: 3, spread: 0.55 }
    },
    axe: {   // 鱼头斧：抛物线砸落
      maxLv: 8, evo: 'tunarain', evoPassive: 'yarnball',
      dmg:    [22, 28, 28, 34, 34, 34, 44, 50],
      cd:     [2.3, 2.3, 2.3, 2.3, 2.0, 2.0, 2.0, 2.0],
      amount: [1, 1, 2, 2, 2, 3, 3, 4],
      area:   [1, 1, 1, 1.3, 1.3, 1.3, 1.3, 1.6],
      statsEvo: { dmg: 68, cd: 1.9, amount: 5, area: 2.1 }
    },
    orbit: { // 毛线环绕：绕身旋转
      maxLv: 8, evo: 'planet', evoPassive: 'gloves',
      dmg:    [12, 12, 16, 16, 22, 22, 22, 30],
      cd:     [3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.2],  // 一轮总冷却
      active: [2.6, 2.6, 2.6, 2.6, 3.0, 3.0, 3.0, 3.0],  // 每轮旋转持续时间
      amount: [1, 2, 2, 3, 3, 3, 4, 4],          // 毛线球数量
      radius: [95, 95, 95, 110, 110, 110, 110, 130], // 环绕半径
      speed:  [3.2, 3.2, 3.6, 3.6, 3.6, 4.2, 4.2, 4.2],  // 旋转角速度
      hitCd: 0.5, kb: 200,                       // 同一敌人被撞间隔 / 击退
      statsEvo: { dmg: 46, cd: 5.2, active: 4.8, amount: 6, radius: 155, speed: 5.2, hitCd: 0.32, kb: 260 }
    },
    aura: {  // 猫薄荷光环：持续伤害圈
      maxLv: 8, evo: 'aurastorm', evoPassive: 'milk',
      dmg:    [4, 4, 6, 6, 9, 9, 13, 16],        // 每跳伤害
      tick:   [0.55, 0.55, 0.55, 0.5, 0.5, 0.5, 0.5, 0.5], // 每跳间隔秒
      radius: [75, 88, 88, 102, 102, 118, 118, 135],
      slow:   [0, 0, 0, 0, 0, 0, 0.15, 0.25],    // 减速比例（0~1）
      statsEvo: { dmg: 25, tick: 0.4, radius: 195, slow: 0.35 }
    },
    litter: { // 猫砂弹：炸开留伤害区
      maxLv: 8, evo: 'littermeteor', evoPassive: 'yarnball',
      dmg:    [10, 10, 14, 14, 18, 18, 23, 23],
      cd:     [2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.0, 2.0],
      amount: [1, 2, 2, 3, 3, 4, 4, 5],
      zoneR:  [55, 55, 64, 64, 64, 74, 74, 74],  // 伤害区半径
      zoneT:  [2.2, 2.2, 2.2, 2.8, 2.8, 2.8, 2.8, 3.4], // 伤害区持续秒
      statsEvo: { dmg: 32, cd: 1.7, amount: 7, zoneR: 96, zoneT: 3.6 }
    },
    zap: {   // 炸毛静电：随机落雷
      maxLv: 8, evo: 'thunderpuff', evoPassive: 'gloves',
      dmg:     [24, 24, 32, 32, 42, 42, 54, 54],
      cd:      [2.9, 2.9, 2.9, 2.7, 2.7, 2.7, 2.5, 2.5],
      strikes: [1, 2, 2, 3, 3, 4, 4, 6],         // 每次落雷道数
      chain: 0,                                  // 进化前链式跳跃数（0=不连链）
      statsEvo: { dmg: 72, cd: 1.9, strikes: 8, chain: 2 }
    }
  },

  /* ---------- 8 种被动道具 ----------
     maxLv = 最高等级；其余数组 = 逐级数值（长度 = maxLv）。 */
  passives: {
    catnip:     { maxLv: 10, might:    [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00] },  // 所有伤害 +10%/级
    alarm:      { maxLv: 8, cdMult:   [0.93, 0.86, 0.79, 0.72, 0.65, 0.58, 0.51, 0.44] },  // 冷却 -7%/级（乘法）
    yarnball:   { maxLv: 10, areaMult: [1.10, 1.20, 1.30, 1.40, 1.50, 1.60, 1.70, 1.80, 1.90, 2.00] },  // 范围 +10%/级
    bell:       { maxLv: 8, spdMult:  [1.12, 1.24, 1.36, 1.48, 1.60, 1.72, 1.84, 1.96] },  // 弹速 +12%/级
    gloves:     { maxLv: 5, amount:   [1, 2, 3, 4, 5] },                          // 投射物数量 +1/级
    milk:       { maxLv: 10, hpMult:   [1.15, 1.30, 1.45, 1.60, 1.75, 1.90, 2.05, 2.20, 2.35, 2.50],    // 生命 +15%/级
                  regen:    [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0] },                 // 回复 +0.5/秒/级
    magnetfish: { maxLv: 5, pickMult: [1.20, 1.40, 1.60, 1.80, 2.00] },  // 拾取范围 +20%/级
    koi:        { maxLv: 20, luck:     [0.15, 0.30, 0.45, 0.60, 0.75, 0.90, 1.05, 1.20, 1.35, 1.50, 1.65, 1.80, 1.95, 2.10, 2.25, 2.40, 2.55, 2.70, 2.85, 3.00],  // 幸运 +15%/级
                  crit:     [0.0025, 0.005, 0.0075, 0.01, 0.0125, 0.015, 0.0175, 0.02, 0.0225, 0.025, 0.0275, 0.03, 0.0325, 0.035, 0.0375, 0.04, 0.0425, 0.045, 0.0475, 0.05] } // 暴击率 +0.25%/级（全武器）
  },

  /* ---------- 敌人图鉴数值 ----------
     hp 生命 / spd 速度 / dmg 碰撞伤害 / r 碰撞半径 / xp 掉落经验 / mass 质量(影响击退)
     kbRes 击退抵抗(0~1，1=完全吃击退) ；zig/erratic/lunge 是特殊走位标记（勿改）
     意见6（第三版）行为特性标记（参数见下方 enemyTraits，勿改标记名）：
     slime=留下黏液减速带 / steal=会扑抢地上的鱼干 / dash=蓄力突进 / ranged=远程吐羽毛 */
  enemies: {
    rat:     { hp: 8,    spd: 62,  dmg: 8,  r: 15, xp: 1, mass: 1 },                     // 灰灰鼠
    sparrow: { hp: 6,    spd: 102, dmg: 6,  r: 13, xp: 1, mass: 1,   zig: 1 },         // 小麻雀（蛇形）
    snail:   { hp: 55,   spd: 20,  dmg: 12, r: 17, xp: 3, mass: 2.4, slime: 1 },       // 蜗牛仔（身后留黏液）
    goose:   { hp: 26,   spd: 80,  dmg: 12, r: 16, xp: 2, mass: 1.6, lunge: 1 },       // 大白鹅（会冲锋）
    bat:     { hp: 12,   spd: 118, dmg: 8,  r: 13, xp: 2, mass: 0.8, erratic: 1 },     // 蝙蝠仔（乱窜）
    raccoon: { hp: 46,   spd: 68,  dmg: 10, r: 16, xp: 3, mass: 1.8, steal: 1 },       // 浣熊团子（贪吃扑鱼干）
    bulldog: { hp: 115,  spd: 52,  dmg: 16, r: 19, xp: 5, mass: 3.2, kbRes: 0.35 },    // 斗牛犬（抗击退）
    calico:  { hp: 82,   spd: 92,  dmg: 13, r: 16, xp: 4, mass: 1.5, dash: 1 },        // 三花姐（蓄力突进）
    pigeon:  { hp: 24,   spd: 74,  dmg: 9,  r: 15, xp: 2, mass: 1.2, ranged: 1 },      // 鸽子咕咕（远程吐羽毛）
    boss:    { hp: 11000, spd: 68, dmg: 26, r: 50, xp: 0, mass: 60,                  // 鼠王·铁须
               boss: 1 },
    mother:  { hp: 5000000, spd: 100, dmg: 80, r: 66, xp: 0, mass: 200,               // 老鼠妈妈（第3轮压轴）
               boss: 1, mother: 1 }  // hp/dmg/spd 全部为固定值，运行时不吃任何难度/动态/成长/轮间倍率
  },

  /* ---------- 敌人行为特性参数（enemies 表中对应标记为 1 时启用；普通精英也会带特性，头目级不受影响） ---------- */
  enemyTraits: {
    dash:   { cd: 3.4, range: 460, windup: 0.5, mul: 3.6, time: 0.26 },  // 三花姐：预警定身后朝主角突进
    ranged: { cd: 2.6, range: 430, speed: 300, dmgMul: 0.7, life: 2.2 }, // 鸽子：中距离吐羽毛（隔墙不发射）
    steal:  { radius: 250, keep: 170, eatR: 22 },                        // 浣熊：主角离得远就先扑鱼干吞掉
    slime:  { gap: 0.55, life: 2.8, r: 15, slow: 0.55, max: 70 }         // 蜗牛：黏液带只拖慢主角（与地形减速叠乘）
  },

  /* ---------- 装备槽位 ----------
     weapon = 默认猫爪之外可选的武器数（场上共 1+4 把）；选满后不再出现新武器 */
  slots: { weapon: 4, passive: 6 },

  /* ---------- 猫爪印（玩家侧全武器词条，区别于 rounds.affixes 的头目词条） ----------
     玩家 ≥ minLevel 级后【只在宝箱中出现】（升级三选一永不出印卡）；不占槽位、无层数上限、跨轮累计。
     7 枚印全部无上限：dmg/cd/area 为乘法（每层乘一次）；crit/lifesteal 为概率/比例
     （加法累积）；amount/pierce 为整数（每层 +1）。
     引擎级硬底线（不属于词条上限）：单武器冷却最低 minCd 秒、场上投射物总量 480。 */
  stamps: {
    minLevel: 70,      // 解锁等级（此前永不掉落；且只通过宝箱发放）
    share: 0.5,        // 出现强度：印卡概率 = 常规卡概率 × share（0.5 = 现有类别的一半）
    chestAffix: 0.6,   // 宝箱无可升级项时，该奖励位出猫爪印的概率（其余金币）
    dmg: 0.12,         // 锐爪印：全武器伤害 ×(1+0.12)/层
    cd: 0.06,          // 疾风印：全武器冷却 ×(1-0.06)/层
    area: 0.10,        // 广域印：攻击范围 ×(1+0.10)/层
    amount: 1,         // 影分印：投射物数量 +1/层
    pierce: 1,         // 贯穿印：投射物穿透 +1/层
    crit: 0.04,        // 会心印：暴击率 +0.04/层（暴伤固定 ×2，超过 100% 即必暴击）
    lifesteal: 0.004,  // 汲血印：攻击吸血 +0.004/层
    amountWeight: 0.7, // 影分印在印池内的相对权重（其余为 1）
    pierceWeight: 0.8, // 贯穿印在印池内的相对权重
    minCd: 0.10        // 引擎底线：单武器冷却绝对下限（秒），与词条无关
  },

  /* ---------- 波次表：每 30 秒一格，数字 = 权重（越大刷得越多） ----------
     可用的敌人 id：rat sparrow snail goose bat raccoon bulldog calico pigeon */
  waves: [
    /* 0:00 */ { rat: 1 },
    /* 0:30 */ { rat: 1 },
    /* 1:00 */ { rat: 4, sparrow: 1 },
    /* 1:30 */ { rat: 4, sparrow: 1 },
    /* 2:00 */ { rat: 4, sparrow: 1, snail: 1 },
    /* 2:30 */ { rat: 3, sparrow: 1, snail: 1 },
    /* 3:00 */ { rat: 3, sparrow: 1, snail: 1, goose: 1 },
    /* 3:30 */ { rat: 3, sparrow: 1, goose: 2 },
    /* 4:00 */ { rat: 2, sparrow: 1, snail: 1, goose: 2 },
    /* 4:30 */ { rat: 2, sparrow: 1, goose: 2, snail: 1 },
    /* 5:00 */ { rat: 2, sparrow: 2, goose: 2, bat: 2 },
    /* 5:30 */ { rat: 2, goose: 2, bat: 3 },
    /* 6:00 */ { rat: 2, goose: 2, bat: 2, raccoon: 2 },
    /* 6:30 */ { sparrow: 2, goose: 2, bat: 2, raccoon: 2 },
    /* 7:00 */ { rat: 1, sparrow: 2, goose: 2, bat: 2, raccoon: 2 },
    /* 7:30 */ { sparrow: 2, goose: 3, bat: 2, raccoon: 2, snail: 1 },
    /* 8:00 */ { sparrow: 2, goose: 2, bat: 2, raccoon: 2, bulldog: 1 },
    /* 8:30 */ { sparrow: 2, goose: 2, bat: 2, bulldog: 2 },
    /* 9:00 */ { sparrow: 1, goose: 2, bat: 3, bulldog: 2, raccoon: 1 },
    /* 9:30 */ { goose: 2, bat: 3, bulldog: 2, raccoon: 2 },
    /*10:00 */ { goose: 2, bat: 2, bulldog: 2, raccoon: 2, calico: 2 },
    /*10:30 */ { goose: 1, bat: 2, bulldog: 2, calico: 3 },
    /*11:00 */ { bat: 2, bulldog: 2, raccoon: 2, calico: 3 },
    /*11:30 */ { bat: 3, bulldog: 3, calico: 3, snail: 1 },
    /*12:00 */ { bat: 2, bulldog: 3, raccoon: 2, calico: 3 },
    /*12:30 */ { bulldog: 3, bat: 3, calico: 3, goose: 1 },
    /*13:00 */ { bulldog: 3, bat: 3, calico: 4 },
    /*13:30 */ { bulldog: 4, bat: 3, calico: 4, raccoon: 2 },
    /*14:00 */ { bulldog: 4, bat: 4, calico: 4, goose: 2 },
    /*14:30 */ { bulldog: 5, bat: 4, calico: 5, raccoon: 2 }
  ],

  /* ---------- 精英时间轴：t = 出现秒数，type = 敌人 id，打倒掉金宝箱 ---------- */
  elites: [
    { t: 120,  type: 'rat' },
    { t: 240,  type: 'goose' },
    { t: 360,  type: 'raccoon' },
    { t: 480,  type: 'bulldog' },
    { t: 600,  type: 'bat' },
    { t: 720,  type: 'calico' },
    { t: 840,  type: 'bulldog' },
    { t: 840,  type: 'calico' }
  ],
  elite: {
    hpMul: 40,     // 精英生命 = 普通生命 × 曲线 × 40
    dmgMul: 1.8,   // 精英伤害倍率
    scale: 1.55,   // 精英体型倍率
    spdMul: 0.92,  // 精英速度倍率
    chestBase: 0.5,  // 意见7：普通精英掉宝箱的基础概率（此前 100%；批次头目属 boss 级不受影响、必掉）
    chestLuck: 0.06  // 幸运每点额外提高的宝箱概率（锦鲤满级 luck=3.0 → 50%+18%=68%，封顶 85%）；未掉宝箱改掉 1 枚金币
  },

  /* ---------- 事件演出：ring=环形包围，line=直线冲锋 ---------- */
  events: [
    { t: 270, type: 'ring', enemy: 'pigeon',  count: 34, msg: '鸽子大军包围过来了！咕咕咕——' },
    { t: 540, type: 'ring', enemy: 'bat',     count: 40, msg: '蝙蝠仔成群袭来！吱吱吱——' },
    { t: 750, type: 'line', enemy: 'bulldog', count: 12, msg: '汪汪汪！斗牛犬队从东边冲过来了！' },
    { t: 870, type: 'ring', enemy: 'goose',   count: 28, msg: '鹅鹅鹅！大白鹅钳形攻势！' }
  ],

  /* ---------- 终局（鼠王演出参数；降临时机由上方 rounds 的批次推进决定） ---------- */
  finale: {
    bossWarn: 2.8,     // 降临前的警告演出时长（秒）
    bossSummonN: 6,    // 鼠王召唤小老鼠数量
    bossSummonCd: 8,   // 召唤间隔（秒）
    bossChargeDist: 420, // 距离多近开始蓄力冲锋
    bossTeleTime: 0.65,  // 蓄力（定身）时间
    bossChargeTime: 0.85, // 冲刺时间
    bossChargeMul: 3.4,   // 冲刺速度倍率
    bossSummonHpMul: 3,   // 召唤鼠生命倍率

    /* 老鼠妈妈（第 3 轮鼠王被讨伐后降临的压轴 Boss）
       她的全部参数都是固定值：不吃难度倍率 / 动态难度 / 轮内成长，也不享受头目词条。 */
    motherWarn: 3.2,       // 鼠王被讨伐后，老鼠妈妈降临前的警告演出时长（秒）
    motherSkillCd: 10,     // 全屏斩间隔（秒）
    motherTele: 0.6,       // 全屏斩预警时长（秒，主角脚下红圈收缩）
    motherHpFrac: 0.5,     // 全屏斩扣除主角「当前」体力的比例
    motherHpFloor: 1,      // 全屏斩后主角保底剩余体力（绝不直接致死）
    motherStun: 1,         // 全屏斩命中后：眩晕时长（秒）——无法移动、武器暂停
    motherDisarm: 1,       // 眩晕结束后：缴械时长（秒）——可移动但武器继续暂停
    motherSlowT: 2,        // 眩晕结束后：减速时长（秒，与缴械前1秒重叠）
    motherSlowMul: 0.55,   // 减速倍率（等同踩到减速地面）
    motherGold: 500,       // 讨伐奖励金币（直接入账）
    motherCoinN: 30,       // 死后掉落在地上的金币堆数量（拾取时照常走金币抽奖）
    motherChestN: 5        // 死后掉落的专属宝箱：必定含有最多 N 件物品，且必定不含金币（金币位由印章/升级/牛奶兜底）
  },

  /* ---------- 特效/音效治理（中后期防过载：屏幕不常驻晃动、地面可见、无持续噪声） ---------- */
  fx: {
    shakeMax: 14,        // 震屏总上限（主震源：boss落地/精英死亡/玩家受伤/boss死亡等低频大震）
    shakeMinorCap: 4,    // 次震源上限（暴击/大体型怪死亡等高频小震，且随现有震幅阻尼递减）
    shakeDecay: 34,      // 震屏每秒衰减量
    zoneMax: 28,         // 猫砂伤害区域同屏上限（超出移除最旧的，视觉淡出同步减弱）
    particleLodAt: 450   // 粒子数超过此值时，新粒子生成量减半（LOD）
  },

  /* ---------- 掉落与经济 ---------- */
  drops: {
    coin: 0.035,       // 击杀掉金币概率（幸运可提高）
    milk: 0.012,       // 掉牛奶（回血 30）概率
    firework: 0.0045,  // 掉烟花（全屏伤害）概率
    vacuum: 0.0045,    // 掉猫薄荷吸尘器（吸走全场鱼干）概率
    milkHeal: 30,      // 牛奶回复量
    fireworkDmg: 150,  // 烟花全屏伤害
    gemMax: 330,       // 场上鱼干上限（超出自动合并，性能保护）
    gemTiers: [        // 经验分层：大于等于 v 的掉高级鱼干（从大到小排列）
      { v: 25, tier: 3 },
      { v: 5,  tier: 2 },
      { v: 1,  tier: 1 }
    ],
    chestDrop: 0.001,  // 普通怪掉宝箱的基础概率（约 1/1000 击杀）
    chestLuck: 0.0016  // 幸运每点提高的宝箱概率（锦鲤满级 luck=0.75 → 约 2.2 倍）
  },

  /* ---------- 宝箱规则 ----------
     金币不再按固定数额发放：奖励位里的金币 = 恰好 1 枚，按上方 lottery 规则折算成经验。 */
  chest: {
    radius: 40,          // 触碰开箱距离
    p5: 0.02,            // 5件奖励概率（幸运每点 +0.06）
    p3: 0.12,            // 3件奖励概率（幸运每点 +0.14）
    luckP5: 0.06,        // 幸运对 5 件的加成系数
    luckP3: 0.14         // 幸运对 3 件的加成系数
  },

  /* ---------- 金币经验规则 ----------
     拾到金币 → 均匀随机查 tiers 定档（pct 从大到小比较）：
     单枚金币经验 = pct × 当前等级升级所需经验（80% 封顶）。
     绝大部分集中在最小的 1%，极少到 30%，非常罕见到 80%。
     幸运（锦鲤）：大于最小档的各档概率 ×(1 + luck × luckBoost)，最小档吸收剩余概率。 */
  lottery: {
    tiers: [             // 档位表：pct = 经验比例，p = 概率（无需恰好加和为 1，最小档兜底）
      { pct: 0.80, p: 0.0001 },  // 非常罕见：经验 80%
      { pct: 0.50, p: 0.0009 },  // 经验 50%
      { pct: 0.30, p: 0.009 },   // 极少：经验 30%
      { pct: 0.10, p: 0.04 },    // 经验 10%
      { pct: 0.05, p: 0.10 },    // 经验 5%
      { pct: 0.01, p: 0.85 }     // 绝大部分：经验 1%
    ],
    luckBoost: 1         // 幸运对非最小档概率的放大系数
  }
};

;
/* 喵都幸存者 - 数值装配层：把 js/game_config.js 的可调数值装配成运行时数据表
   （武器/被动的名称与文案、行为类型在这里；所有"数字"都在 game_config.js） */
'use strict';
const DATA = (() => {
  const CFG = (function load() {
    const user = (typeof window !== 'undefined' && window.GAME_CONFIG) || {};
    // 与内置默认深度合并：用户文件缺字段时用默认值兜底，避免改坏文件导致崩游戏
    const def = {
      difficulty: { enemyHp: 1, enemyDmg: 1, enemySpd: 1, spawnRate: 1, eliteHp: 1, bossHp: 1, playerHp: 1, xpGain: 1, goldGain: 1 },
      player: { hp: 100, speed: 172, r: 16, pickupR: 55, iframes: 0.55, regenBase: 0 },
      growth: { xpBase: 7, xpPerLv: 8, xpPow: 1.32, xpPow30: 1.5, xpPow40: 1.65, xpPow50: 1.8,
        xpPowStep: 0.05, xpPowMax: 2.4,
        hpPerMin: 0.55, hpLatePerMin: 0.38, hpLateFromMin: 8,
        dmgPerMin: 0.045, spdPerMin: 0.012, spdMax: 1.28, capBase: 38, capPerMin: 16.5, capMax: 265,
        spawnBase: 1.05, spawnPerMin: 0.055, spawnMin: 0.24, batchPerMin: 2.2, despawnR: 1.6,
        countRoundMul: 2, countHardMax: 480, countBatchPerTick: 64,
        roundHpMul: 3, roundDmgMul: 2, roundSpdMul: 1.1 },
      // 70 级后成长规则：autoFrom 级起升级自动+属性；chestOnlyFrom 级起只能靠宝箱升级
      postLevel: { autoFrom: 70, chestOnlyFrom: 80, hpPerLv: 0.02, spdPerLv: 0.01 },
      slots: { weapon: 4, passive: 6 },
      stamps: {
        minLevel: 70, share: 0.5, chestAffix: 0.6,
        dmg: 0.12, cd: 0.06, area: 0.10, amount: 1, pierce: 1, crit: 0.04, lifesteal: 0.004,
        amountWeight: 0.7, pierceWeight: 0.8, minCd: 0.10
      },
      elite: { hpMul: 40, dmgMul: 1.8, scale: 1.55, spdMul: 0.92, chestBase: 0.5, chestLuck: 0.06 },
      // 意见6（第三版）：敌人行为特性参数（enemies 表的 slime/steal/dash/ranged 标记启用）
      enemyTraits: {
        dash:   { cd: 3.4, range: 460, windup: 0.5, mul: 3.6, time: 0.26 },
        ranged: { cd: 2.6, range: 430, speed: 300, dmgMul: 0.7, life: 2.2 },
        steal:  { radius: 250, keep: 170, eatR: 22 },
        slime:  { gap: 0.55, life: 2.8, r: 15, slow: 0.55, max: 70 }
      },
      rounds: {
        parTime: 900, batchCount: 4, bossFrac: 0.72, dynamicStartRound: 2,
        batchBossTypes: ['goose', 'raccoon', 'bulldog', 'calico'],
        batchBossHpFracs: [0.07, 0.13, 0.25, 0.45],
        batchBossScale: 1.85,
        fixed: [
          { hp: 1.0, dmg: 1.0,  spawn: 1.0,  eliteHp: 1.0, bossHp: 1.0, mixMin: 0,    eventMul: 1,   bbAffix: 0, bossAffix: 0 },
          { hp: 1.5, dmg: 1.10, spawn: 0.90, eliteHp: 1.6, bossHp: 1.7, mixMin: 2.5,  eventMul: 1,   bbAffix: 0, bossAffix: 0 },
          { hp: 2.2, dmg: 1.20, spawn: 0.83, eliteHp: 2.4, bossHp: 2.8, mixMin: 5,    eventMul: 1.5, bbAffix: 0, bossAffix: 1 },
          { hp: 3.2, dmg: 1.30, spawn: 0.76, eliteHp: 3.5, bossHp: 4.2, mixMin: 7.5,  eventMul: 1.5, bbAffix: 1, bbAffixIds: ['tough'], bossAffix: 1 },
          { hp: 4.6, dmg: 1.40, spawn: 0.70, eliteHp: 5.0, bossHp: 6.0, mixMin: 10,   eventMul: 2,   bbAffix: 1, bbAffixIds: ['swift'], bossAffix: 1 },
          { hp: 6.5, dmg: 1.52, spawn: 0.65, eliteHp: 7.0, bossHp: 8.2, mixMin: 12.5, eventMul: 2.5, bbAffix: 2, bbAffixIds: ['swift', 'split'], bossAffix: 2 }
        ],
        dynamic: { hpK: 1.45, hpClamp: [1.25, 1.7], dmgK: 1.08, dmgClamp: [1.04, 1.13],
          denK: 1.12, denClamp: [1.06, 1.18], spawnFloor: 0.5, bossK: 1.2, bossKClamp: [0.85, 1.7],
          parBossTTK: 15, hpLow: 0.35, dmgRelief: 0.9, hpHigh: 0.85, dmgTighten: 1.1,
          lvLow: 5, lvHigh: 12, xpClamp: [0.8, 1.2], softCapRound: 12, hpStep: 1.2 },
        affixes: { swift: { name: '迅捷', spd: 1.28 }, tough: { name: '铁壁', dmgTaken: 0.8, kbRes: 0.5 },
          enrage: { name: '狂暴', atFrac: 0.3, spd: 1.3, dmg: 1.35 }, split: { name: '分裂', n: 3, hpMul: 4 } }
      },
      finale: { bossWarn: 2.8, bossSummonN: 6, bossSummonCd: 8, bossChargeDist: 420,
        bossTeleTime: 0.65, bossChargeTime: 0.85, bossChargeMul: 3.4, bossSummonHpMul: 3,
        motherWarn: 3.2, motherSkillCd: 10, motherTele: 0.6, motherHpFrac: 0.5,
        motherHpFloor: 1, motherStun: 1, motherDisarm: 1, motherSlowT: 2, motherSlowMul: 0.55, motherGold: 500,
        motherCoinN: 30, motherChestN: 5 },
      fx: { shakeMax: 14, shakeMinorCap: 4, shakeDecay: 34, zoneMax: 28, particleLodAt: 450 },
      // 老鼠妈妈兜底：旧版导出的 game_config.js 可能没有 mother 条目，避免压轴 Boss 消失
      motherFallback: { hp: 5000000, spd: 100, dmg: 80, r: 66, xp: 0, mass: 200, boss: 1, mother: 1 },
      drops: { coin: 0.035, milk: 0.012, firework: 0.0045, vacuum: 0.0045, milkHeal: 30, fireworkDmg: 150,
        gemMax: 330, chestDrop: 0.001, chestLuck: 0.0016,
        gemTiers: [{ v: 25, tier: 3 }, { v: 5, tier: 2 }, { v: 1, tier: 1 }] },
      chest: { radius: 40, p5: 0.02, p3: 0.12, luckP5: 0.06, luckP3: 0.14 },
      lottery: { // 金币经验规则：单枚金币 = 档位% × 当前等级升级所需经验（80% 封顶）
        tiers: [
          { pct: 0.80, p: 0.0001 }, { pct: 0.50, p: 0.0009 }, { pct: 0.30, p: 0.009 },
          { pct: 0.10, p: 0.04 }, { pct: 0.05, p: 0.1 }, { pct: 0.01, p: 0.85 }
        ],
        luckBoost: 1
      },
    };
    const out = {};
    for (const k in def) out[k] = Object.assign({}, def[k], user[k] || {});
    out.weapons = user.weapons || {};
    out.passives = user.passives || {};
    // 敌人表逐项兜底：老版导出的 game_config.js 缺新特性标记（slime/steal/dash/ranged）时行为不丢
    //（mother 整项兜底同理；用户显式改过的字段以用户为准）
    const TRAIT_FLAGS = { snail: { slime: 1 }, raccoon: { steal: 1 }, calico: { dash: 1 }, pigeon: { ranged: 1 } };
    out.enemies = Object.assign({ mother: def.motherFallback }, user.enemies || {});
    for (const id in TRAIT_FLAGS) {
      if (!out.enemies[id]) continue;
      for (const k in TRAIT_FLAGS[id]) if (out.enemies[id][k] === undefined) out.enemies[id][k] = TRAIT_FLAGS[id][k];
    }
    out.waves = Array.isArray(user.waves) && user.waves.length ? user.waves : [{ rat: 1 }];
    out.elites = user.elites || [];
    out.events = user.events || [];
    out.difficulty = Object.assign(out.difficulty, user.difficulty || {});
    // rounds 是嵌套结构，做一层定向深合并，用户文件缺块时用默认兜底
    out.rounds = Object.assign({}, def.rounds, user.rounds || {});
    out.rounds.dynamic = Object.assign({}, def.rounds.dynamic, (user.rounds || {}).dynamic || {});
    out.rounds.affixes = Object.assign({}, def.rounds.affixes, (user.rounds || {}).affixes || {});
    if (!Array.isArray(out.rounds.fixed) || !out.rounds.fixed.length) out.rounds.fixed = def.rounds.fixed;
    if (!Array.isArray(out.rounds.batchBossTypes) || !out.rounds.batchBossTypes.length) out.rounds.batchBossTypes = def.rounds.batchBossTypes;
    if (!Array.isArray(out.rounds.batchBossHpFracs) || !out.rounds.batchBossHpFracs.length) out.rounds.batchBossHpFracs = def.rounds.batchBossHpFracs;
    return out;
  })();
  const DIFF = CFG.difficulty;

  /* ---------- 武器：行为/名称/图标（数值见 game_config.js） ---------- */
  const W_META = {
    claw:  { kind: 'claw',  name: '猫爪连击', evo: 'sakura', evoName: '樱花爆爪', icon: 'claw', iconEvo: 'sakura',
             desc: '朝面向方向挥出大大的猫爪！', descEvo: '樱花瓣爆裂双爪！暴击吸血，猫见猫怕。' },
    note:  { kind: 'homing', name: '喵喵音波', evo: 'ultra', evoName: '超声波', icon: 'note', iconEvo: 'ultra',
             desc: '音符 ♪ 自动飞向最近的敌人。', descEvo: '超声波冲击！超高频穿透音浪。' },
    fish:  { kind: 'knife', name: '飞鱼干', evo: 'fishstorm', evoName: '千鱼风暴', icon: 'fish', iconEvo: 'fishStorm',
             desc: '朝面向方向甩出小鱼干，又快又直。', descEvo: '千鱼风暴！扇形鱼干弹幕！' },
    axe:   { kind: 'axe',   name: '鱼头斧', evo: 'tunarain', evoName: '金枪鱼雨', icon: 'axe', iconEvo: 'tunaRain',
             desc: '把咸鱼斧头抛上天，砸穿一片敌人。', descEvo: '金枪鱼雨！巨无霸金枪鱼从天而降！' },
    orbit: { kind: 'orbit', name: '毛线环绕', evo: 'planet', evoName: '星球毛线', icon: 'yarn', iconEvo: 'planet',
             desc: '毛线球绕着大橘转，撞飞靠近的敌人。', descEvo: '星球毛线！六颗巨大毛线行星的引力护罩！' },
    aura:  { kind: 'aura',  name: '猫薄荷光环', evo: 'aurastorm', evoName: '猫薄荷风暴', icon: 'aura', iconEvo: 'auraStorm',
             desc: '猫薄荷香气环绕，靠近的敌人持续掉血。', descEvo: '猫薄荷风暴！大型香气领域并减速敌人。' },
    litter:{ kind: 'lobzone', name: '猫砂弹', evo: 'littermeteor', evoName: '猫砂流星雨', icon: 'litter', iconEvo: 'litterRain',
             desc: '抛出猫砂团，炸开并留下伤害区域。', descEvo: '猫砂流星雨！大片持续伤害区域！' },
    zap:   { kind: 'zap',   name: '炸毛静电', evo: 'thunderpuff', evoName: '雷霆炸毛', icon: 'zap', iconEvo: 'thunderPuff',
             desc: '炸毛啦！闪电随机劈中敌人。', descEvo: '雷霆炸毛！链式闪电风暴！' }
  };
  const WEAPON_ORDER = ['claw', 'note', 'fish', 'axe', 'orbit', 'aura', 'litter', 'zap'];

  // 把配置数组包装成 stats(l)（l 从 1 开始）
  function mkStats(cw) {
    return l => {
      const i = Math.min(cw.maxLv, Math.max(1, l)) - 1;
      const s = {};
      for (const k in cw) {
        if (k === 'maxLv' || k === 'evo' || k === 'evoPassive' || k === 'statsEvo') continue;
        const v = cw[k];
        s[k] = Array.isArray(v) ? v[i] : v;
      }
      if ('both' in s) s.both = !!s.both;
      return s;
    };
  }
  const WEAPONS = {};
  for (const id of WEAPON_ORDER) {
    const cw = CFG.weapons[id];
    if (!cw) continue;
    WEAPONS[id] = Object.assign({}, W_META[id], cw, {
      stats: mkStats(cw),
      statsEvo: Object.assign({}, cw.statsEvo, { both: !!(cw.statsEvo && cw.statsEvo.both) })
    });
  }

  /* ---------- 升级文案：按相邻两级数值差自动生成（改数值文案自动跟着变） ---------- */
  const STAT_LABEL = {
    dmg: '伤害', cd: '冷却', area: '范围', amount: '数量', waves: '段数', speed: '弹速',
    pierce: '穿透', radius: '半径', tick: '跳伤间隔', slow: '减速', zoneR: '区域', zoneT: '持续',
    active: '旋转持续', hitCd: '碰撞间隔', spread: '散布', strikes: '落雷', chain: '连链', kb: '击退'
  };
  const PCT_KEYS = { area: 1, radius: 1, zoneR: 1, slow: 1, might: 1 };
  function fmtV(v) {
    if (v === true) return '有';
    if (v === false) return '无';
    return '' + (Math.round(v * 100) / 100);
  }
  function statGain(k, a, b) {
    if (b === a) return null;
    if (k === 'both') return b ? '前后双向爪击！' : null;
    if (typeof b === 'boolean') return b ? (STAT_LABEL[k] || k) + '！' : null;
    if (PCT_KEYS[k] && a > 0) {
      const p = Math.round((b / a - 1) * 100);
      if (p !== 0) return STAT_LABEL[k] + (p > 0 ? ' +' : ' ') + p + '%';
      return null;
    }
    if (k === 'slow') return b > (a || 0) ? '减速 ' + Math.round(b * 100) + '%' : null;
    if (k === 'cd') return '冷却 ' + fmtV(a) + '→' + fmtV(b) + ' 秒';
    if (k === 'waves') return b > a ? '第 ' + b + ' 段爪击！' : null;
    if (k === 'chain') return b ? '闪电连链 ×' + b + '！' : null;
    if (k === 'crit') return '暴击 ' + Math.round(b * 100) + '%！';
    if (k === 'lifesteal') return b ? '攻击吸血！' : null;
    return STAT_LABEL[k] + ' ' + fmtV(a) + '→' + fmtV(b);
  }
  const GAIN_FLAVOR = { // 个别等级的定制文案（覆盖自动生成）
    'claw:5': '伤害 24 → 30',
    'claw:8': '伤害 30 → 38，范围 +21%'
  };
  function genGains(id) {
    const def = WEAPONS[id];
    const arr = ['攻击 ' + fmtV(def.stats(1).dmg)];
    for (let l = 2; l <= def.maxLv; l++) {
      const a = def.stats(l - 1), b = def.stats(l);
      if (GAIN_FLAVOR[id + ':' + l]) { arr.push(GAIN_FLAVOR[id + ':' + l]); continue; }
      const parts = [];
      for (const k in b) {
        if (k === 'kb' || k === 'hitCd' || k === 'tick' || k === 'spread') continue; // 手感细节不上文案
        const g = statGain(k, a[k], b[k]);
        if (g) parts.push(g);
      }
      arr.push(parts.length ? parts.join('，') : '微调强化');
    }
    return arr;
  }
  for (const id in WEAPONS) WEAPONS[id].gain = genGains(id);

  /* ---------- 被动道具 ---------- */
  const P_META = {
    catnip:     { name: '猫薄荷', icon: 'catnip', desc: '所有伤害 +10%' },
    alarm:      { name: '小闹钟', icon: 'clock', desc: '武器冷却 -7%' },
    yarnball:   { name: '弹力毛线', icon: 'yarnBall', desc: '攻击范围 +10%' },
    bell:       { name: '小铃铛', icon: 'bell', desc: '投掷物速度 +12%' },
    gloves:     { name: '猫爪手套', icon: 'glove', desc: '投掷物数量 +1' },
    milk:       { name: '牛奶盒', icon: 'milkIcon', desc: '最大生命 +15%，回复 +0.5/秒' },
    magnetfish: { name: '磁铁鱼', icon: 'magnetFish', desc: '拾取范围 +20%' },
    koi:        { name: '幸运锦鲤', icon: 'koi', desc: '幸运 +15%，暴击率 +0.25%（全武器）' }
  };
  const PASSIVE_ORDER = ['catnip', 'alarm', 'yarnball', 'bell', 'gloves', 'milk', 'magnetfish', 'koi'];
  // 把逐级数组变成 mod(l)（l 从 1 开始）
  function mkMod(cp) {
    return l => {
      const i = Math.min(cp.maxLv, Math.max(1, l)) - 1;
      const m = {};
      for (const k in cp) {
        if (k === 'maxLv') continue;
        const v = cp[k];
        if (Array.isArray(v)) m[k === 'amount' ? 'amountBonus' : k] = v[i];
      }
      return m;
    };
  }
  const PASSIVES = {};
  for (const id of PASSIVE_ORDER) {
    const cp = CFG.passives[id];
    if (!cp) continue;
    PASSIVES[id] = Object.assign({}, P_META[id], cp, { mod: mkMod(cp) });
  }

  /* ---------- 猫爪印（玩家侧全武器词条） ----------
     每层数值 = CFG.stamps[id]；ch = 加成通道（mods 字段）。
     mode: mulUp = 逐层 ×(1+v) / mulDown = 逐层 ×(1-v) / add = 逐层 +v。
     7 枚印全部无上限；引擎底线：单武器冷却 minCd、场上投射物总量 480（在 main.js）。
     weightKey：个别印在印池里的相对权重（默认 1）。 */
  const STAMP_META = {
    dmg:       { name: '锐爪印', icon: 'stampDmg',    ch: 'might',       mode: 'mulUp',   desc: '全武器伤害 +12%/层（乘法，无上限）' },
    cd:        { name: '疾风印', icon: 'stampCd',     ch: 'cdMult',      mode: 'mulDown', desc: '全武器冷却 -6%/层（乘法）' },
    area:      { name: '广域印', icon: 'stampArea',   ch: 'areaMult',    mode: 'mulUp',   desc: '攻击范围 +10%/层（乘法）' },
    amount:    { name: '影分印', icon: 'stampAmount', ch: 'amountBonus', mode: 'add',     desc: '投射物数量 +1/层', weightKey: 'amountWeight' },
    pierce:    { name: '贯穿印', icon: 'stampPierce', ch: 'pierceBonus', mode: 'add',     desc: '投射物穿透 +1/层（无上限）', weightKey: 'pierceWeight' },
    crit:      { name: '会心印', icon: 'stampCrit',   ch: 'crit',        mode: 'add',     desc: '暴击率 +4%/层（暴伤 ×2）' },
    lifesteal: { name: '汲血印', icon: 'stampLife',   ch: 'lifesteal',   mode: 'add',     desc: '攻击吸血 +0.4%/层' }
  };
  const STAMP_ORDER = ['dmg', 'cd', 'area', 'amount', 'pierce', 'crit', 'lifesteal'];

  /* ---------- 敌人（基础值；难度倍率在生成时应用） ---------- */
  const E_META = {
    rat: '灰灰鼠', sparrow: '小麻雀', snail: '蜗牛仔', goose: '大白鹅', bat: '蝙蝠仔',
    raccoon: '浣熊团子', bulldog: '斗牛犬', calico: '三花姐', pigeon: '鸽子咕咕', boss: '鼠王·铁须',
    mother: '老鼠妈妈'
  };
  const ENEMIES = {};
  for (const id in E_META) {
    const ce = CFG.enemies[id];
    if (!ce) continue;
    ENEMIES[id] = Object.assign({ id, name: E_META[id], mass: 1, kbRes: 1 }, ce);
  }

  /* ---------- 成长曲线（读取 growth 配置） ---------- */
  const G = CFG.growth;
  function mixAt(t) {
    const idx = Math.min(CFG.waves.length - 1, Math.floor(t / 30));
    return CFG.waves[idx] || CFG.waves[CFG.waves.length - 1];
  }
  function hpMult(t) {
    const m = t / 60;
    return 1 + m * G.hpPerMin + (m > G.hpLateFromMin ? (m - G.hpLateFromMin) * G.hpLatePerMin : 0);
  }
  function dmgMult(t) { return 1 + (t / 60) * G.dmgPerMin; }
  function spdMult(t) { return Math.min(G.spdMax, 1 + (t / 60) * G.spdPerMin); }
  function aliveCap(t) { return Math.min(G.capMax, G.capBase + (t / 60) * G.capPerMin); }
  function spawnEvery(t) { return Math.max(G.spawnMin, G.spawnBase - (t / 60) * G.spawnPerMin) / DIFF.spawnRate; }
  function spawnBatch(t) { return 1 + Math.floor((t / 60) / G.batchPerMin); }
  // 分段抛物线升级曲线：前期快，30/40/50 三档台阶变慢，50 级起每 10 级指数递增（加速变慢）
  function xpPowAt(lv) {
    if (lv < 30) return G.xpPow;
    if (lv < 40) return G.xpPow30;
    if (lv < 50) return G.xpPow40;
    return Math.min(G.xpPowMax, G.xpPow50 + G.xpPowStep * Math.floor((lv - 50) / 10));
  }
  function xpNeed(lv) { return Math.round(G.xpBase + (lv - 1) * G.xpPerLv + Math.pow(lv - 1, xpPowAt(lv))); }

  /* ---------- 轮次难度：dynamicStartRound 之前查固定表，之后按上一轮实测数据动态推算 ----------
     prev = { mods: 上一轮难度对象, stats: { actualTime 实际用时, bossTTK 头目等效击杀秒,
              avgHpFrac 平均血线, lvGain 本轮升级数 } }
     返回 { hp, dmg, spawn, eliteHp, bossHp, mixMin, eventMul, bossAffix, bbAffix, bbAffixIds, xpMul } */
  function roundMods(round, prev) {
    const R = CFG.rounds;
    const D = R.dynamic;
    const startAt = Math.max(2, R.dynamicStartRound || (R.fixed.length + 1));
    if (round < startAt) {
      const r = R.fixed[Math.min(round, R.fixed.length) - 1];
      return {
        round, hp: r.hp, dmg: r.dmg, spawn: r.spawn, eliteHp: r.eliteHp, bossHp: r.bossHp,
        mixMin: r.mixMin || 0, eventMul: r.eventMul || 1,
        bossAffix: r.bossAffix || 0, bbAffix: r.bbAffix || 0, bbAffixIds: r.bbAffixIds || [], xpMul: 1
      };
    }
    const pm = (prev && prev.mods) || roundMods(startAt - 1, null);
    const st = (prev && prev.stats) || { actualTime: R.parTime, bossTTK: D.parBossTTK, avgHpFrac: 0.7, lvGain: Math.round((D.lvLow + D.lvHigh) / 2) };
    // 压力轴：清场越快 → 下轮越难（钳制保证单轮增幅有上限）
    const clear = Math.min(2, Math.max(0.5, R.parTime / Math.max(120, st.actualTime)));
    const kHp = Math.min(D.hpClamp[1], Math.max(D.hpClamp[0], D.hpK * (0.75 + 0.25 * clear)));
    let kDmg = Math.min(D.dmgClamp[1], Math.max(D.dmgClamp[0], D.dmgK * (0.85 + 0.15 * clear)));
    const kDen = Math.min(D.denClamp[1], Math.max(D.denClamp[0], D.denK * (0.85 + 0.15 * clear)));
    // 生存轴：平均血线常年红 → 伤害喘息；毫发无伤 → 收紧
    if (st.avgHpFrac < D.hpLow) kDmg *= D.dmgRelief;
    else if (st.avgHpFrac > D.hpHigh) kDmg *= D.dmgTighten;
    // DPS轴：头目等效击杀用时贴着 parBossTTK 恒温（防海绵/防磨洋工）
    const kB = Math.min(D.bossKClamp[1], Math.max(D.bossKClamp[0],
      D.bossK * Math.min(1.7, Math.max(0.7, D.parBossTTK / Math.max(3, st.bossTTK)))));
    let hp, eliteHp, bossHp;
    if (round >= D.softCapRound) { // 软上限：杂兵血改加法步进，头目血缓涨，防指数爆墙
      hp = pm.hp + D.hpStep;
      const k2 = 1 + (kB - 1) * 0.5;
      eliteHp = pm.eliteHp * k2; bossHp = pm.bossHp * k2;
    } else {
      hp = pm.hp * kHp;
      eliteHp = pm.eliteHp * (1 + (kB - 1) * 0.35); // 宝箱精英无恒温，涨幅打折
      bossHp = pm.bossHp * kB;
    }
    // 经验节流：升级太快 → 下轮经验打折；太慢 → 补贴
    let xpMul = pm.xpMul || 1;
    if (st.lvGain > D.lvHigh) xpMul = Math.max(D.xpClamp[0], xpMul * 0.85);
    else if (st.lvGain < D.lvLow) xpMul = Math.min(D.xpClamp[1], xpMul * 1.15);
    // 怪种组合按轮次线性爬坡（封顶为固定表最大值）：动态提前开动也不会瞬间跳到最强怪
    let maxMix = 0;
    for (const r of R.fixed) maxMix = Math.max(maxMix, r.mixMin || 0);
    const mixMin = Math.min(maxMix, (round - 1) * 2.5);
    // 头目/鼠王词条数同样按轮次爬坡
    const bbAffix = round >= 6 ? 2 : round >= 4 ? 1 : 0;
    const bossAffix = round >= 6 ? 2 : round >= 3 ? 1 : 0;
    return {
      round, hp, dmg: pm.dmg * kDmg,
      // spawn 是「刷怪间隔倍率」，越小越密 → 密度增长用除法，并保住性能下限
      spawn: Math.max(D.spawnFloor, pm.spawn / kDen),
      eliteHp, bossHp, mixMin,
      eventMul: Math.min(3, Math.max(1, pm.eventMul * Math.sqrt(kDen))),
      bossAffix, bbAffix, bbAffixIds: [], xpMul
    };
  }

  /* ---------- 时间轴 / 掉落 / 其他 ---------- */
  const ELITES = CFG.elites;
  const EVENTS = CFG.events;
  const BOSS_T = CFG.rounds.parTime;
  const ROUNDS = Object.assign({ batchLen: CFG.rounds.parTime / Math.max(1, CFG.rounds.batchCount) }, CFG.rounds);
  const DROPS = { coin: CFG.drops.coin, milk: CFG.drops.milk, firework: CFG.drops.firework, vacuum: CFG.drops.vacuum,
    chestDrop: CFG.drops.chestDrop || 0, chestLuck: CFG.drops.chestLuck || 0 };
  const GEM_TIERS = (CFG.drops.gemTiers || []).slice().sort((a, b) => b.v - a.v);
  const SLOTS = CFG.slots;
  const LOTTERY = CFG.lottery;
  const DIFF_ = DIFF;
  const PLAYER = {
    hp: Math.round(CFG.player.hp * DIFF.playerHp), speed: CFG.player.speed, r: CFG.player.r,
    pickupR: CFG.player.pickupR, iframes: CFG.player.iframes, regenBase: CFG.player.regenBase || 0
  };

  return {
    CFG, DIFF: DIFF_,
    WEAPONS, WEAPON_ORDER, PASSIVES, PASSIVE_ORDER, ENEMIES,
    STAMP_META, STAMP_ORDER,
    mixAt, hpMult, dmgMult, spdMult, aliveCap, spawnEvery, spawnBatch,
    ELITES, EVENTS, BOSS_T, ROUNDS, roundMods, DROPS, GEM_TIERS, xpNeed, SLOTS, LOTTERY, PLAYER
  };
})();

;
/* 喵都幸存者 - 📜更新日志数据（玩家在游戏内「更新日志」面板看到的版本记录）
   ── 发新版本时的维护流程 ──
   ① 把 index.html 里所有脚本的 ?v= 缓存号升一位（如 20260908b → 20260908c）
   ② 运行 node tools/gen-changelog.js：自动把上次之后的 git 提交整理成一条新日志
      （或 node tools/gen-changelog.js --title "标题" "新增：xxx" "修复：yyy" 手写条目）
   ③ 条目措辞面向玩家：说清「改了什么、现在怎么样了」即可，不写内部实现与具体数值
   条目按时间新→旧排列；items.t 类型：new 新增 / opt 优化 / bal 平衡 / fix 修复 */
'use strict';
const CHANGELOG = {
  /* 工具记账：已收录到哪个提交（gen-changelog.js 维护，请勿手改） */
  lastCommit: 'ed359e8d1902676ab1b3de2b8a5701a1f8a8d7cd',
  entries: [
    {
      date: "2026-09-09", version: "20260908e", title: "🗺️ 专属BGM×怪物脾性×缩放加速！", items: [
        { t: 'new', text: "画面缩放！对局中点右上角🔍按钮（或按 - / = 键）从 1X 一路放大到 4X——4X 就是之前的大画面，档位会记住" },
        { t: 'new', text: "游戏加速！对局中点⏩按钮或按 1 / 2 / 3，最高 3 倍速，刷图不再干等" },
        { t: 'new', text: "六张地图各有专属背景音乐了：老城夜市、樱花公园、港湾码头、雪山温泉、幽灵游乐园、无尽街区风格各不相同" },
        { t: 'new', text: "怪物们更有脾气——三花姐会蓄力突进、鸽子隔空吐羽毛、浣熊爱扑抢地上的鱼干、蜗牛身后留下黏液拖慢你，见招拆招！" },
        { t: 'bal', text: "精英不再必掉宝箱：大约一半掉宝箱、一半掉金币；幸运锦鲤能明显提高宝箱概率（批次头目必掉宝箱不变）" },
        { t: 'fix', text: "雪山温泉开局可能被鸟居卡住的问题——现在出生在门前空地，四方向都能走；顺带把另外两张图挡在门心的隐形墙也拆了" },
        { t: 'opt', text: "更新日志面板可以上下滚动翻阅了" },
      ]
    },
    {
      date: "2026-09-08", version: "20260908d", title: "头目卡墙修复！", items: [
        { t: 'fix', text: "修复了批次头目可能被楼房卡住、一直追不上主角，导致波次迟迟无法结束的问题——被卡住的头目会自动抄近路追上来" },
        { t: 'fix', text: "开宝箱的精英敌人同样不会再被建筑卡住，都能正常追上主角了" },
      ]
    },
    {
      date: "2026-09-08", version: "20260908c", title: "📜 更新日志上线！", items: [
        { t: 'new', text: "新增「更新日志」面板：主菜单随时查看每次更新的内容，有新版本时进入游戏会自动提醒" },
      ]
    },
    {
      date: "2026-09-08", version: "20260908a", title: "手机、平板适配！", items: [
        { t: 'fix', text: "修复了在手机和平板上游玩时画面大小异常的问题，横屏、竖屏都能正常显示了" },
      ]
    },
    {
      date: "2026-09-07", version: "20260907", title: "《喵都幸存者》正式开服！", items: [
        { t: 'new', text: "游戏上线！带领大橘迎战无尽鼠潮：每轮 15 分钟、4 个批次头目，第 3 轮讨伐压轴 Boss「老鼠妈妈」" },
        { t: 'new', text: "六张夜巡地图任选：老城夜市 / 樱花公园 / 港湾码头 / 雪山温泉 / 幽灵游乐园 / 无尽街区" },
        { t: 'new', text: "8 种武器 + 8 种被动自由构筑，武器满级后开宝箱可触发进化；70 级解锁可无限叠加的猫爪印" },
        { t: 'new', text: "地形与养成玩法齐备：草地深雪会拖慢脚步、🐾 猫道只有你能钻，精英出没、宝箱掉落，走位与构筑缺一不可" },
      ]
    },
  ],
};

;
/* 喵都幸存者 - 统一结算面板（成功/失败共用）+ 战报分享图（Canvas 绘制 → PNG 下载） */
'use strict';
const Result = (() => {
  let last = null; // 最近一次结算数据快照（collectResult 产出）
  const FONT = '"ZCOOL KuaiLe","Microsoft YaHei",sans-serif';

  const $ = id => document.getElementById(id);

  /* ================= 面板 DOM ================= */
  function chipDom(icon, badge, cls, title) {
    const d = document.createElement('div');
    d.className = 'chip' + (cls ? ' ' + cls : '');
    d.title = title;
    const c = document.createElement('canvas');
    c.width = 72; c.height = 72;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.drawImage(icon, 0, 0, 72, 72);
    d.appendChild(c);
    const s = document.createElement('span');
    s.className = 'lv';
    s.textContent = badge;
    d.appendChild(s);
    return d;
  }

  function open(d) {
    last = d;
    // 标题与文案：收工 / 失败倒下 / 讨伐老鼠妈妈，共用同一布局
    if (d.mother) {
      $('over-title').textContent = '🐭 老鼠妈妈已讨伐！';
      $('over-sub').textContent = '喵都暂时安全了……但夜巡还长，鼠群仍会再来。';
      $('over-mother').hidden = false;
      $('over-mother').textContent = '⏱ 讨伐用时 ' + U.fmtTime(d.motherTTK || 0);
    } else {
      $('over-mother').hidden = true;
      if (d.win) {
        $('over-title').textContent = '🎉 收工大吉！';
        $('over-sub').textContent = '第 ' + d.round + ' 轮平安归来，小鱼干满满，喵都为你骄傲！';
      } else {
        $('over-title').textContent = '😿 大橘累倒了…';
        $('over-sub').textContent = d.diedToMother
          ? '在第 ' + d.round + ' 轮倒在了老鼠妈妈面前！她的全屏斩太狠了……再试一次吧！'
          : '在第 ' + d.round + ' 轮被鼠群击倒了！小鱼干被抢走了，再试一次吧！';
      }
    }
    // 「继续夜巡」：仅讨伐老鼠妈妈成功时提供（无缝续玩无限模式）
    $('btn-continue').hidden = !d.continueOffer;
    $('st-round').textContent = d.round;
    $('st-time').textContent = U.fmtTime(d.time);
    $('st-lv').textContent = d.lv;
    $('st-kill').textContent = d.kills;
    $('st-gold').textContent = d.gold;
    $('st-dmg').textContent = U.fmtNum(d.dmgTotal);
    $('st-dps').textContent = U.fmtNum(d.dps);
    $('st-peak').textContent = U.fmtNum(d.peakSec);
    // 构筑清单：武器（进化显示进化图标）/ 被动 / 猫爪印
    const W = DATA.WEAPONS, P = DATA.PASSIVES, S = DATA.STAMP_META;
    const bw = $('bchips-w'); bw.innerHTML = '';
    for (const w of d.weapons) {
      const def = W[w.id];
      bw.appendChild(chipDom(Art.icons[w.evolved ? def.iconEvo : def.icon],
        w.evolved ? '★' : '' + w.lv, w.evolved ? 'evo' : '',
        def.name + (w.evolved ? ' · 进化完成' : ' · Lv' + w.lv)));
    }
    const bp = $('bchips-p'); bp.innerHTML = '';
    for (const p of d.passives) {
      const def = P[p.id];
      bp.appendChild(chipDom(Art.icons[def.icon], '' + p.lv, '', def.name + ' · Lv' + p.lv));
    }
    $('brow-p').hidden = d.passives.length === 0;
    const bs = $('bchips-s'); bs.innerHTML = '';
    for (const a of d.affixes) {
      const meta = S[a.id];
      bs.appendChild(chipDom(Art.icons[meta.icon], '×' + a.stacks, 'stamp', meta.name + ' ×' + a.stacks));
    }
    $('brow-s').hidden = d.affixes.length === 0;
    let bestTxt = '最佳纪录 · 坚持 ' + U.fmtTime(d.best.time) + ' · 最远第 ' + (d.best.rounds || 1) + ' 轮';
    if (d.bestMother) bestTxt += ' · 老鼠妈妈最速 ' + U.fmtTime(d.bestMother);
    $('best-line2').textContent = bestTxt;
  }

  /* ================= 战报分享图 ================= */
  // 版式：夜空背景 + 奶油面板（猫耳 + 大橘）+ 2×4 数据格 + 构筑清单 + 落款
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fillRR(x, px, py, w, h, r, fill, stroke, lw) {
    Art.rr(x, px, py, w, h, r);
    if (fill) { x.fillStyle = fill; x.fill(); }
    if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw || 4; x.stroke(); }
  }
  function drawBadge(x, bx, by, txt, bg, fg) {
    x.font = '900 22px ' + FONT;
    const w = Math.max(42, x.measureText(txt).width + 20);
    fillRR(x, bx - w, by, w, 34, 17, bg, '#fff', 3);
    x.fillStyle = fg || '#fff';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(txt, bx - w / 2, by + 18);
  }
  function drawChip(x, cx, cy, icon, badgeTxt, kind) {
    const S = 78;
    const stamp = kind === 'stamp', evo = kind === 'evo';
    x.save();
    if (evo) { x.shadowColor = 'rgba(255,125,170,.85)'; x.shadowBlur = 18; }
    const g = x.createLinearGradient(0, cy, 0, cy + S);
    g.addColorStop(0, stamp ? '#fff6df' : '#fffdf6');
    g.addColorStop(1, stamp ? '#ffe9bd' : '#ffefd6');
    fillRR(x, cx, cy, S, S, 18, g, evo ? '#ff7daa' : stamp ? '#e8b96a' : '#ffd9a0', 5);
    x.restore();
    x.drawImage(icon, cx + 10, cy + 9, 60, 60);
    if (badgeTxt != null) {
      const bg = stamp ? '#f0b13c' : evo ? '#ff7daa' : '#ff8fb5';
      const fg = stamp ? '#5c3a08' : '#fff';
      drawBadge(x, cx + S + 12, cy + S - 20, badgeTxt, bg, fg);
    }
  }

  function renderCard(d) {
    const W = 1080, panelX = 46, panelW = 988, innerX = panelX + 44, innerW = 900;
    const panelTop = 150;
    // 先算面板高度（决定背景地面与画布高）
    const rows = [{ label: '武器', items: d.weapons.map(w => ({ icon: Art.icons[w.evolved ? DATA.WEAPONS[w.id].iconEvo : DATA.WEAPONS[w.id].icon], badge: w.evolved ? '★' : 'Lv' + w.lv, kind: w.evolved ? 'evo' : 'w' })) }];
    if (d.passives.length) rows.push({ label: '被动', items: d.passives.map(p => ({ icon: Art.icons[DATA.PASSIVES[p.id].icon], badge: 'Lv' + p.lv, kind: 'p' })) });
    if (d.affixes.length) rows.push({ label: '猫爪印', items: d.affixes.map(a => ({ icon: Art.icons[DATA.STAMP_META[a.id].icon], badge: '×' + a.stacks, kind: 'stamp' })) });
    const buildH = 46 + rows.length * 96 + 18;
    const panelH = 596 + buildH;
    const panelBot = panelTop + panelH;
    const groundY = panelBot + 66;
    const H = groundY + 210;

    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const x = tmp.getContext('2d');
    x.textBaseline = 'middle';

    /* ---- 夜空背景 ---- */
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d0e26'); g.addColorStop(0.45, '#232050');
    g.addColorStop(0.75, '#3a2c5e'); g.addColorStop(1, '#59395e');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    let rs = 20260906; // 固定种子：星星布局稳定
    const rnd = () => (rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    x.fillStyle = '#fff';
    for (let i = 0; i < 140; i++) {
      x.globalAlpha = 0.2 + rnd() * 0.55;
      x.beginPath(); x.arc(rnd() * W, rnd() * groundY * 0.8, 0.8 + rnd() * 1.7, 0, U.TAU); x.fill();
    }
    x.globalAlpha = 1;
    x.drawImage(Art.sky.moon, W - 292, 36, 206, 206);
    x.globalAlpha = 0.9;
    x.drawImage(Art.sky.cloud1, 52, 64, 330, 124);
    x.drawImage(Art.sky.cloud2, 560, 88, 260, 98);
    x.globalAlpha = 1;
    // 城市剪影 + 地面 + 路灯光
    for (let sx = -80; sx < W + 200; sx += 1024) x.drawImage(Art.sky.skyline, sx, groundY - 300, 1024, 300);
    const gg = x.createLinearGradient(0, groundY, 0, H);
    gg.addColorStop(0, '#232441'); gg.addColorStop(1, '#191a30');
    x.fillStyle = gg; x.fillRect(0, groundY, W, H - groundY);
    x.save();
    x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.9;
    x.drawImage(Art.glows.lamp, 46, groundY - 170, 250, 250);
    x.drawImage(Art.glows.lamp, W - 300, groundY - 150, 250, 250);
    x.restore();

    /* ---- 面板底 + 猫耳 + 大橘 ---- */
    fillRR(x, panelX + 4, panelTop + 16, panelW, panelH, 34, 'rgba(40,24,60,.30)');
    const pg = x.createLinearGradient(0, panelTop, 0, panelBot);
    pg.addColorStop(0, '#fffdf6'); pg.addColorStop(1, '#ffefd6');
    fillRR(x, panelX, panelTop, panelW, panelH, 30, pg, '#ffd9a0', 6);
    x.save();
    x.strokeStyle = '#fff'; x.lineWidth = 4;
    Art.rr(x, panelX + 8, panelTop + 8, panelW - 16, panelH - 16, 24); x.stroke();
    x.restore();
    // 猫耳
    for (const side of [-1, 1]) {
      x.save();
      x.translate(side < 0 ? panelX + 148 : panelX + panelW - 148, panelTop - 4);
      x.rotate(side < 0 ? -0.42 : Math.PI * 0.63);
      fillRR(x, -22, -22, 44, 44, 14, '#ffefd6', '#ffd9a0', 5);
      x.restore();
    }
    // 大橘（成功站姿 / 失败躺平），趴在面板右上角
    const cat = d.win ? Art.playerFrames.idle[0] : Art.playerFrames.dead;
    x.save();
    x.translate(panelX + panelW - 118, panelTop - 62);
    x.rotate(0.07);
    x.globalAlpha = 0.35;
    x.drawImage(Art.glows.player, -110, -110, 220, 220);
    x.globalAlpha = 1;
    x.drawImage(cat, -78, -78, 156, 156);
    x.restore();

    /* ---- 面板内容 ---- */
    let y = panelTop + 44;
    x.font = '700 28px ' + FONT;
    x.fillStyle = '#4fb3b0'; x.textAlign = 'center';
    x.fillText('🌙 喵都幸存者 · 夜巡战报', W / 2, y + 17);
    y += 34;
    x.font = '900 58px ' + FONT;
    x.fillStyle = d.mother ? '#a44fc9' : d.win ? '#e2637f' : '#5b4a44';
    x.fillText(d.mother ? '🐭 老鼠妈妈已讨伐！' : d.win ? '🎉 收工大吉！' : '😿 大橘累倒了…', W / 2, y + 37);
    y += 74;
    x.font = '400 27px ' + FONT;
    x.fillStyle = '#96806f';
    let sub;
    if (d.mother) sub = '🐭 讨伐用时 ' + U.fmtTime(d.motherTTK || 0) + '！喵都暂时安全了，小鱼干满满！';
    else if (d.win) sub = '第 ' + d.round + ' 轮平安归来，小鱼干满满，喵都为你骄傲！';
    else sub = '在第 ' + d.round + ' 轮被鼠群击倒了！小鱼干被抢走了，再试一次吧！';
    x.fillText(sub, W / 2, y + 22);
    y += 44 + 26;
    // 2×4 数据格
    const stats = [
      ['' + d.round, '到达轮次'], [U.fmtTime(d.time), '本局时长'], ['' + d.lv, '等级'], ['' + d.kills, '打跑敌人'],
      ['' + d.gold, '金币'], [U.fmtNum(d.dmgTotal), '总伤害'], [U.fmtNum(d.dps), '平均 DPS'], [U.fmtNum(d.peakSec), '最高秒伤']
    ];
    const gap = 18, cellW = (innerW - gap * 3) / 4, cellH = 112;
    stats.forEach((st, i) => {
      const cx = innerX + (i % 4) * (cellW + gap), cy = y + Math.floor(i / 4) * (cellH + 16);
      fillRR(x, cx, cy, cellW, cellH, 20, '#fff', '#ffe1b0', 4);
      x.textAlign = 'center';
      x.font = '900 40px ' + FONT;
      x.fillStyle = '#e2637f';
      x.fillText(st[0], cx + cellW / 2, cy + 42);
      x.font = '400 22px ' + FONT;
      x.fillStyle = '#96806f';
      x.fillText(st[1], cx + cellW / 2, cy + 84);
    });
    y += 242 + 26;
    // 构筑清单
    fillRR(x, innerX, y, innerW, buildH, 20, '#fff', '#ffe1b0', 4);
    x.font = '700 30px ' + FONT;
    x.fillStyle = '#c47b1e'; x.textAlign = 'left';
    x.fillText('🐾 本局构筑', innerX + 30, y + 32);
    let ry = y + 46 + 9;
    for (const row of rows) {
      x.font = '400 26px ' + FONT;
      x.fillStyle = '#96806f'; x.textAlign = 'right';
      x.fillText(row.label, innerX + 104, ry + 39);
      let cx2 = innerX + 122;
      for (const it of row.items) {
        drawChip(x, cx2, ry, it.icon, it.badge, it.kind);
        cx2 += 78 + 18;
      }
      ry += 96;
    }
    y += buildH + 22;
    // 最佳纪录
    x.font = '400 26px ' + FONT;
    x.fillStyle = '#96806f'; x.textAlign = 'center';
    let bestTxt2 = '最佳纪录 · 坚持 ' + U.fmtTime(d.best.time) + ' · 最远第 ' + (d.best.rounds || 1) + ' 轮';
    if (d.bestMother) bestTxt2 += ' · 老鼠妈妈最速 ' + U.fmtTime(d.bestMother);
    x.fillText(bestTxt2, W / 2, y + 20);
    /* ---- 落款（地面） ---- */
    x.font = '900 36px ' + FONT;
    x.lineWidth = 6; x.strokeStyle = 'rgba(20,14,40,.85)';
    x.strokeText('喵都幸存者 · MEOW SURVIVORS', W / 2, groundY + 76);
    x.fillStyle = '#ffe9c4';
    x.fillText('喵都幸存者 · MEOW SURVIVORS', W / 2, groundY + 76);
    x.font = '400 24px ' + FONT;
    x.fillStyle = 'rgba(255,255,255,.5)';
    const dt = d.date || new Date();
    x.fillText(dt.getFullYear() + '/' + pad2(dt.getMonth() + 1) + '/' + pad2(dt.getDate()) + ' ' +
      pad2(dt.getHours()) + ':' + pad2(dt.getMinutes()) + ' · 猫爪认证战报 🐾', W / 2, groundY + 126);
    return tmp;
  }

  function saveImage() {
    if (!last) return;
    if (document.fonts && document.fonts.load) document.fonts.load('900 58px "ZCOOL KuaiLe"');
    const card = renderCard(last);
    card.toBlob(blob => {
      if (!blob) return;
      const dt = last.date || new Date();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'meow-report-' + dt.getFullYear() + pad2(dt.getMonth() + 1) + pad2(dt.getDate()) +
        '-' + pad2(dt.getHours()) + pad2(dt.getMinutes()) + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  }

  return { open, saveImage, renderCard };
})();

;
/* 喵都幸存者 · 小游戏版 Canvas UI 层
   H5 版的菜单/三选一/宝箱/暂停/结算/帮助/更新日志都是 HTML 覆盖层，小游戏没有 DOM——
   这里用同一套绘本风格在主画布上重建全部界面。
   设计约定：本层只做「呈现 + 命中」，业务状态全部在 main（fork）里；
   main 在每帧渲染末尾调用 MUI.draw()，触摸事件先经 MUI.touch()（界面吃掉就不给摇杆）。 */
'use strict';
const MUI = (() => {
  const FONT = '"ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
  const TAU = Math.PI * 2;

  /* ---------- 运行时（init 注入） ---------- */
  let ctx = null, cb = {}, maps = [];
  let screen = null; // null=无覆盖层（游戏进行中） | menu/help/log/levelup/chest/pause/over
  let now = 0;       // 每帧更新的时间戳（秒）
  let cards = [], onPick = null;      // 三选一
  let chestRows = [], onChestOk = null; // 宝箱
  let result = null;                  // 结算数据（fork 已整理成展示结构）
  const scroll = { help: 0, log: 0, over: 0 };
  const drag = { on: false, y: 0, base: 0, moved: 0 };
  let hits = []; // 本帧命中区 [{x,y,w,h,fn}]
  let mapPvs = null; // 地图缩略图懒烘焙 [canvas]
  let zoomLv = '1X', speedLv = '1X'; // HUD 按钮文案（fork 每帧同步）

  /* ---------- 基础绘制 ---------- */
  function rr(x, px, py, w, h, r) { Art.rr(x, px, py, w, h, r); }
  function panel(x, px, py, w, h) {
    x.save();
    x.shadowColor = 'rgba(30,18,50,.45)'; x.shadowBlur = 26; x.shadowOffsetY = 10;
    const g = x.createLinearGradient(0, py, 0, py + h);
    g.addColorStop(0, '#fffdf6'); g.addColorStop(1, '#ffefd6');
    rr(x, px, py, w, h, 22);
    x.fillStyle = g; x.fill();
    x.lineWidth = 5; x.strokeStyle = '#ffd9a0'; x.stroke();
    x.shadowColor = 'transparent'; x.shadowBlur = 0;
    rr(x, px + 6, py + 6, w - 12, h - 12, 16);
    x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 3; x.stroke();
    // 猫耳
    for (const side of [-1, 1]) {
      x.save();
      x.translate(side < 0 ? px + Math.min(90, w * 0.2) : px + w - Math.min(90, w * 0.2), py - 8);
      x.rotate(side < 0 ? -0.42 : Math.PI * 0.58);
      rr(x, -14, -14, 28, 28, 9);
      x.fillStyle = '#ffefd6'; x.fill();
      x.lineWidth = 4; x.strokeStyle = '#ffd9a0'; x.stroke();
      x.restore();
    }
    x.restore();
  }
  function btn(x, id, bx, by, bw, bh, label, kind) {
    const hot = kind !== 'secondary';
    const g = x.createLinearGradient(0, by, 0, by + bh);
    if (hot) { g.addColorStop(0, '#ffa8c4'); g.addColorStop(1, '#ff8fb5'); }
    else { g.addColorStop(0, '#a5f0ee'); g.addColorStop(1, '#7de3e0'); }
    x.save();
    x.shadowColor = 'rgba(20,12,40,.3)'; x.shadowBlur = 10; x.shadowOffsetY = 4;
    rr(x, bx, by, bw, bh, bh / 2);
    x.fillStyle = g; x.fill();
    x.restore();
    rr(x, bx, by, bw, bh, bh / 2);
    x.lineWidth = 3; x.strokeStyle = hot ? '#e0678f' : '#4fb3b0'; x.stroke();
    x.font = '700 ' + Math.round(bh * 0.48) + 'px ' + FONT;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 4; x.strokeStyle = 'rgba(60,30,20,.2)';
    x.strokeText(label, bx + bw / 2, by + bh / 2 + 1);
    x.fillStyle = hot ? '#fff' : '#0e4a48';
    x.fillText(label, bx + bw / 2, by + bh / 2 + 1);
    hits.push({ x: bx, y: by, w: bw, h: bh, fn: id });
  }
  // 中文按字换行
  function wrap(x, txt, maxW) {
    const out = [];
    let line = '';
    for (const ch of String(txt)) {
      if (ch === '\n') { out.push(line); line = ''; continue; }
      if (x.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; }
      else line += ch;
    }
    if (line) out.push(line);
    return out;
  }

  /* ---------- 屏幕尺寸 ---------- */
  let vw = 800, vh = 400;
  function setViewport(w, h) { vw = w; vh = h; }

  /* ================= 主菜单 ================= */
  function bakeMapPvs() {
    if (mapPvs || !maps.length) return;
    mapPvs = maps.map(m => {
      const c = document.createElement('canvas');
      c.width = 96; c.height = 72;
      try { m.preview(c); } catch (e) { /* 无尽街区也带 preview */ }
      return c;
    });
  }
  function drawMenu(x) {
    bakeMapPvs();
    const best = U.storage.get('meow_best', null);
    // 主标题
    x.save();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 ' + Math.round(vh * 0.13) + 'px ' + FONT;
    x.lineWidth = 8; x.strokeStyle = '#d96a8f';
    x.strokeText('喵都幸存者', vw / 2, vh * 0.14);
    x.fillStyle = '#fff';
    x.fillText('喵都幸存者', vw / 2, vh * 0.14);
    x.font = '400 ' + Math.round(vh * 0.05) + 'px ' + FONT;
    x.fillStyle = '#7de3e0';
    x.fillText('MEOW SURVIVORS', vw / 2, vh * 0.24);
    x.font = '400 ' + Math.round(vh * 0.042) + 'px ' + FONT;
    x.fillStyle = '#cfd0ff';
    x.fillText(best && best.time ? '最佳纪录 · 坚持 ' + U.fmtTime(best.time) + ' · 最远第 ' + (best.rounds || 1) + ' 轮'
      : '今晚的喵都，等一只勇敢的猫 🐾', vw / 2, vh * 0.32);
    x.restore();
    // 主视觉猫（左下角，摆尾）
    const mc = Art.menuCat[Math.floor(now * 1.6) % 2];
    const blink = (now % 4.6) < 0.14;
    const cs = vh * 0.4;
    x.save();
    x.globalAlpha = 0.95;
    x.drawImage(blink ? Art.menuCatBlink : mc, vw * 0.02, vh - cs * 0.78, cs, cs);
    x.restore();
    // 地图选择
    const pw = 92, ph = 69, gapX = 18, gapY = 12;
    const cols = 3, rowsN = Math.ceil(maps.length / cols);
    const gridW = cols * pw + (cols - 1) * gapX;
    const gx0 = vw - gridW - Math.max(24, vw * 0.035);
    const gy0 = Math.max(vh * 0.40, vh - rowsN * (ph + 22 + gapY) - vh * 0.16);
    x.save();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '400 ' + Math.round(vh * 0.04) + 'px ' + FONT;
    x.fillStyle = '#cfd0ff';
    x.textAlign = 'right';
    x.fillText('🐾 选择夜巡地图', gx0 + gridW, gy0 - vh * 0.045);
    x.restore();
    for (let i = 0; i < maps.length; i++) {
      const m = maps[i];
      const cx = gx0 + (i % cols) * (pw + gapX), cy = gy0 + Math.floor(i / cols) * (ph + 22 + gapY);
      const on = cb.getMap() === m.id;
      x.save();
      x.shadowColor = 'rgba(20,12,40,.35)'; x.shadowBlur = 8; x.shadowOffsetY = 3;
      rr(x, cx, cy, pw, ph + 20, 10);
      x.fillStyle = 'rgba(30,26,58,.88)'; x.fill();
      x.restore();
      rr(x, cx, cy, pw, ph + 20, 10);
      x.lineWidth = 3; x.strokeStyle = on ? '#ff8fb5' : '#4a4478'; x.stroke();
      if (on) { x.save(); x.shadowColor = 'rgba(255,143,181,.6)'; x.shadowBlur = 12; x.stroke(); x.restore(); }
      if (mapPvs[i]) x.drawImage(mapPvs[i], cx + 4, cy + 4, pw - 8, ph - 4);
      x.font = '400 ' + Math.round(vh * 0.036) + 'px ' + FONT;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = '#ffe9c4';
      x.fillText(m.meta.emoji + m.meta.name, cx + pw / 2, cy + ph + 6, pw - 8);
      hits.push({ x: cx, y: cy, w: pw, h: ph + 20, fn: () => cb.selectMap(m.id) });
    }
    // 按钮行
    const bw = Math.min(150, vw * 0.16), bh = Math.max(38, vh * 0.095);
    const by = vh - bh - Math.max(16, vh * 0.05);
    const totalW = bw * 3 + 24;
    const bx0 = Math.max(vw * 0.02, vw / 2 - bw * 1.2);
    btn(x, cb.startRun, bx0, by, bw, bh, '开始夜巡 !', 'primary');
    btn(x, cb.showHelp, bx0 + bw + 12, by, bw, bh, '玩法说明', 'secondary');
    btn(x, cb.showLog, bx0 + (bw + 12) * 2, by, bw, bh, '📜更新日志', 'secondary');
    if (cb.hasNewLog()) {
      x.save();
      x.translate(bx0 + (bw + 12) * 2 + bw - 14, by - 6);
      x.rotate(Math.sin(now * 4) * 0.12);
      x.font = '900 12px ' + FONT;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = '#ff5d7e';
      rr(x, -20, -10, 40, 18, 9); x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = 2; x.stroke();
      x.fillStyle = '#fff'; x.fillText('NEW', 0, 1);
      x.restore();
    }
    // 底部提示
    x.save();
    x.font = '400 ' + Math.round(vh * 0.033) + 'px ' + FONT;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(207,208,255,.6)';
    x.fillText('拖动屏幕移动 · 武器全自动 · 界面右上角可暂停/缩放/加速', vw / 2, vh - 12);
    x.restore();
  }

  /* ================= 滚动文本屏（玩法说明 / 更新日志） ================= */
  function scrollArea(x, key, px, py, w, h, contentH) {
    x.save();
    rr(x, px, py, w, h, 14);
    x.fillStyle = 'rgba(255,255,255,.35)'; x.fill();
    x.restore();
    x.save();
    rr(x, px, py, w, h, 14); x.clip();
    const maxScroll = Math.max(0, contentH - h);
    scroll[key] = Math.max(0, Math.min(maxScroll, scroll[key]));
    return { clipY: py, clipH: h, maxScroll };
  }
  const TAGS = { new: ['#8fd982', '#245c1d', '新增'], opt: ['#4fb3b0', '#fff', '优化'], bal: ['#f0b13c', '#5c3a08', '平衡'], fix: ['#ff8fb5', '#fff', '修复'] };
  function drawHelp(x) {
    const w = Math.min(vw * 0.86, 720), h = vh * 0.86;
    const px = (vw - w) / 2, py = (vh - h) / 2;
    panel(x, px, py, w, h);
    x.save();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '700 ' + Math.round(vh * 0.065) + 'px ' + FONT;
    x.fillStyle = '#5b4a44';
    x.fillText('🐱 玩法说明', vw / 2, py + vh * 0.07);
    x.restore();
    const lines = cb.helpLines();
    const fs = Math.max(12, Math.round(vh * 0.038));
    x.font = '400 ' + fs + 'px ' + FONT;
    const lh = fs * 1.55;
    const innerW = w - 70;
    const paras = [];
    for (const ln of lines) paras.push(...wrap(x, ln, innerW), '');
    const contentH = paras.length * lh + 20;
    const lp = py + vh * 0.13, lh2 = h - vh * 0.13 - vh * 0.14;
    const a = scrollArea(x, 'help', px + 28, lp, w - 56, lh2, contentH);
    x.textAlign = 'left'; x.textBaseline = 'top';
    let yy = lp - scroll.help;
    for (const ln of paras) {
      if (yy > lp + a.clipH || yy < lp - lh * 2) { yy += lh; continue; }
      x.fillStyle = '#5b4a44';
      x.fillText(ln, px + 36, yy, innerW);
      yy += lh;
    }
    x.restore();
    btn(x, cb.closeOverlay, vw / 2 - 60, py + h - vh * 0.105, 120, Math.max(30, vh * 0.08), '知道啦！', 'primary');
    drag.area = { x: px + 28, y: lp, w: w - 56, h: lh2, key: 'help', contentH };
  }
  function drawLog(x) {
    const w = Math.min(vw * 0.88, 640), h = vh * 0.9;
    const px = (vw - w) / 2, py = (vh - h) / 2;
    panel(x, px, py, w, h);
    x.save();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '700 ' + Math.round(vh * 0.065) + 'px ' + FONT;
    x.fillStyle = '#5b4a44';
    x.fillText('📜 更新日志', vw / 2, py + vh * 0.07);
    x.restore();
    const entries = cb.changelog();
    const fs = Math.max(11, Math.round(vh * 0.034));
    const innerW = w - 64;
    // 预排版：条目 → 行块
    const blocks = [];
    entries.forEach((e, ei) => {
      const b = { head: '📅 ' + e.date + (e.version ? '   v' + e.version : ''), title: e.title || '', items: e.items || [], newest: ei === 0, y: 0, h: 0 };
      blocks.push(b);
    });
    // 计算高度
    x.font = '700 ' + fs + 'px ' + FONT;
    const lh = fs * 1.5;
    for (const b of blocks) {
      b.h = lh * 1.3 + (b.title ? lh * 1.25 : 0) + b.items.length * lh * 1.7 + 14;
      b.h = Math.round(b.h);
    }
    const contentH = blocks.reduce((s, b) => s + b.h + 12, 0);
    const lp = py + vh * 0.125, lhh = h - vh * 0.125 - vh * 0.15;
    const a = scrollArea(x, 'log', px + 24, lp, w - 48, lhh, contentH);
    let yy = lp + 4 - scroll.log;
    for (const b of blocks) {
      if (yy + b.h > lp - 40 && yy < lp + a.clipH + 10) {
        // 条目卡片
        x.save();
        rr(x, px + 30, yy, w - 60, b.h, 12);
        x.fillStyle = '#fff'; x.fill();
        x.lineWidth = 3; x.strokeStyle = b.newest ? '#ff8fb5' : '#ffe1b0'; x.stroke();
        x.restore();
        x.textAlign = 'left'; x.textBaseline = 'top';
        x.font = '700 ' + fs + 'px ' + FONT;
        x.fillStyle = '#c47b1e';
        x.fillText(b.head, px + 44, yy + 8, innerW - 20);
        let y2 = yy + 8 + lh * 1.3;
        if (b.title) {
          x.font = '700 ' + Math.round(fs * 1.2) + 'px ' + FONT;
          x.fillStyle = '#5b4a44';
          x.fillText(b.title, px + 44, y2, innerW - 20);
          y2 += lh * 1.25;
        }
        for (const it of b.items) {
          const tg = TAGS[it.t] || TAGS.opt;
          x.font = '400 ' + Math.round(fs * 0.82) + 'px ' + FONT;
          const tw = x.measureText(tg[2]).width + 12;
          rr(x, px + 44, y2 + 1, tw, fs * 1.15, 5);
          x.fillStyle = tg[0]; x.fill();
          x.textAlign = 'center';
          x.fillStyle = tg[1];
          x.fillText(tg[2], px + 44 + tw / 2, y2 + 1 + fs * 0.58);
          x.textAlign = 'left';
          x.font = '400 ' + Math.round(fs * 0.95) + 'px ' + FONT;
          x.fillStyle = '#6d5a52';
          const lines2 = wrap(x, it.text, innerW - tw - 24);
          let y3 = y2;
          for (const l2 of lines2) {
            x.fillText(l2, px + 44 + tw + 10, y3 + 1, innerW - tw - 20);
            y3 += fs * 1.35;
          }
          y2 += Math.max(fs * 1.7, lines2.length * fs * 1.35 + 4);
        }
      }
      yy += b.h + 12;
    }
    x.restore();
    btn(x, cb.closeOverlay, vw / 2 - 60, py + h - vh * 0.105, 120, Math.max(30, vh * 0.08), '知道啦！', 'primary');
    drag.area = { x: px + 24, y: lp, w: w - 48, h: lhh, key: 'log', contentH };
  }

  /* ================= 升级三选一 ================= */
  function drawLevelup(x) {
    x.save();
    x.fillStyle = 'rgba(12,10,34,.66)';
    x.fillRect(0, 0, vw, vh);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 ' + Math.round(vh * 0.085) + 'px ' + FONT;
    x.lineWidth = 6; x.strokeStyle = '#d96a8f';
    x.strokeText('⭐ 升级啦！选一个强化 ⭐', vw / 2, vh * 0.14);
    x.fillStyle = '#fff';
    x.fillText('⭐ 升级啦！选一个强化 ⭐', vw / 2, vh * 0.14);
    x.restore();
    const n = cards.length;
    const cw = Math.min(168, (vw - 60) / n - 14), chh = Math.min(vh * 0.62, 236);
    const gap = 16;
    const x0 = vw / 2 - (n * cw + (n - 1) * gap) / 2;
    const y0 = vh * 0.26;
    cards.forEach((c, i) => {
      const cx = x0 + i * (cw + gap);
      const pop = 1 + Math.sin(now * 3 + i) * 0.012;
      x.save();
      x.translate(cx + cw / 2, y0 + chh / 2);
      x.scale(pop, pop);
      x.translate(-(cx + cw / 2), -(y0 + chh / 2));
      panel(x, cx, y0, cw, chh);
      // 顶部标签
      x.save();
      x.textAlign = 'center'; x.textBaseline = 'middle';
      const tagCol = c.tagCls === 'new' ? ['#8fd982', '#245c1d'] : c.tagCls === 'evo' ? ['#ff7daa', '#fff'] : c.tagCls === 'stamp' ? ['#f0b13c', '#5c3a08'] : ['#ffd166', '#7a4b12'];
      x.font = '700 ' + Math.round(cw * 0.1) + 'px ' + FONT;
      const tw = Math.min(cw - 20, x.measureText(c.tag).width + 22);
      rr(x, cx + cw / 2 - tw / 2, y0 - 11, tw, 22, 11);
      x.fillStyle = tagCol[0]; x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = 2.5; x.stroke();
      x.fillStyle = tagCol[1];
      x.fillText(c.tag, cx + cw / 2, y0 + 1, tw - 8);
      x.restore(); // 标签层
      // 图标
      if (c.icon) x.drawImage(c.icon, cx + cw / 2 - 27, y0 + 18, 54, 54);
      // 名称
      x.font = '700 ' + Math.round(cw * 0.125) + 'px ' + FONT;
      x.fillStyle = '#5b4a44';
      x.fillText(c.name, cx + cw / 2, y0 + 86, cw - 14);
      // 描述
      x.font = '400 ' + Math.round(cw * 0.082) + 'px ' + FONT;
      x.fillStyle = '#8a7468';
      const dl = wrap(x, c.desc, cw - 20).slice(0, 3);
      let dy = y0 + 108;
      for (const d of dl) { x.fillText(d, cx + cw / 2, dy, cw - 18); dy += cw * 0.105; }
      // 进度点 / 层数
      const py2 = y0 + chh - 20;
      if (c.kind === 's') {
        x.font = '700 ' + Math.round(cw * 0.085) + 'px ' + FONT;
        x.fillStyle = '#a8813d';
        x.fillText('已叠 ×' + c.stacks + '（无限叠加）', cx + cw / 2, py2, cw - 14);
      } else {
        const pn = Math.min(10, c.pipsMax || 0), r2 = 4;
        const pw2 = pn * (r2 * 2 + 4) - 4;
        let px2 = cx + cw / 2 - pw2 / 2;
        for (let k = 0; k < pn; k++) {
          x.beginPath(); x.arc(px2 + r2, py2, r2, 0, TAU);
          x.fillStyle = k < (c.pips || 0) ? '#ffab5e' : '#e8dcc8';
          x.fill();
          if (k < (c.pips || 0)) { x.lineWidth = 1.5; x.strokeStyle = '#e08a3c'; x.stroke(); }
          px2 += r2 * 2 + 4;
        }
      }
      x.restore();
      hits.push({ x: cx, y: y0 - 12, w: cw, h: chh + 16, fn: () => onPick && onPick(i) });
    });
  }

  /* ================= 宝箱 ================= */
  function drawChest(x) {
    x.save();
    x.fillStyle = 'rgba(12,10,34,.66)';
    x.fillRect(0, 0, vw, vh);
    x.restore();
    const w = Math.min(vw * 0.8, 400), rowsH = chestRows.length * Math.max(40, vh * 0.115) + 16;
    const h = Math.min(vh * 0.86, vh * 0.3 + rowsH);
    const px = (vw - w) / 2, py = (vh - h) / 2;
    panel(x, px, py, w, h);
    x.save();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    // 宝箱图 + 光柱
    const cs = Math.min(72, h * 0.2);
    x.save();
    x.globalAlpha = 0.5 + Math.sin(now * 3) * 0.1;
    x.drawImage(Art.glows.chest, vw / 2 - cs * 0.8, py + h * 0.06 - cs * 0.2, cs * 1.6, cs * 1.6);
    x.restore();
    x.drawImage(Art.items.chestOpen, vw / 2 - cs / 2, py + h * 0.05, cs, cs * 0.85);
    x.font = '700 ' + Math.round(vh * 0.06) + 'px ' + FONT;
    x.fillStyle = '#c47b1e';
    x.fillText('🎁 金宝箱！', vw / 2, py + h * 0.05 + cs + 14);
    // 奖励行
    let ry = py + h * 0.05 + cs + 38;
    const rh = Math.max(40, vh * 0.115);
    for (const r2 of chestRows) {
      rr(x, px + 24, ry, w - 48, rh - 8, 12);
      x.fillStyle = '#fff'; x.fill();
      x.lineWidth = 3; x.strokeStyle = '#ffe1b0'; x.stroke();
      if (r2.icon) x.drawImage(r2.icon, px + 30, ry + (rh - 8 - 34) / 2, 34, 34);
      x.textAlign = 'left';
      x.font = '700 ' + Math.round(rh * 0.34) + 'px ' + FONT;
      x.fillStyle = '#5b4a44';
      x.fillText(r2.name, px + 74, ry + rh * 0.32, w - 110);
      x.font = '400 ' + Math.round(rh * 0.27) + 'px ' + FONT;
      x.fillStyle = '#96806f';
      x.fillText(r2.desc, px + 74, ry + rh * 0.66, w - 110);
      ry += rh;
    }
    x.restore();
    btn(x, onChestOk, vw / 2 - 70, py + h - Math.max(34, vh * 0.09) - 8, 140, Math.max(32, vh * 0.08), '开心收下！', 'primary');
  }

  /* ================= 暂停 ================= */
  function drawPause(x) {
    x.save();
    x.fillStyle = 'rgba(12,10,34,.66)';
    x.fillRect(0, 0, vw, vh);
    x.restore();
    const w = Math.min(vw * 0.6, 320), h = Math.min(vh * 0.82, 300);
    const px = (vw - w) / 2, py = (vh - h) / 2;
    panel(x, px, py, w, h);
    x.save();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 ' + Math.round(vh * 0.08) + 'px ' + FONT;
    x.fillStyle = '#8a6fb8';
    x.fillText('💤 休息一下', vw / 2, py + h * 0.16);
    x.restore();
    const bw = w * 0.68, bh = Math.max(32, vh * 0.09), gap = Math.max(8, vh * 0.024);
    let by = py + h * 0.3;
    btn(x, cb.resume, vw / 2 - bw / 2, by, bw, bh, '继续夜巡', 'primary'); by += bh + gap;
    btn(x, cb.restart, vw / 2 - bw / 2, by, bw, bh, '重新开始', 'secondary'); by += bh + gap;
    btn(x, cb.quitToMenu, vw / 2 - bw / 2, by, bw, bh, '回主菜单', 'secondary'); by += bh + gap;
    btn(x, cb.toggleMute, vw / 2 - bw / 2, by, bw, bh, cb.muted() ? '音效：关' : '音效：开', 'secondary');
  }

  /* ================= 结算 ================= */
  function drawOver(x) {
    if (!result) return; // 防御：showResult 之前不会到这
    x.save();
    x.fillStyle = 'rgba(12,10,34,.72)';
    x.fillRect(0, 0, vw, vh);
    x.restore();
    const w = Math.min(vw * 0.9, 620), h = vh * 0.92;
    const px = (vw - w) / 2, py = (vh - h) / 2;
    panel(x, px, py, w, h);
    const fs = Math.max(11, Math.round(vh * 0.036));
    const d = result;
    const contentH = d.contentH || 600;
    const lp = py + 14, lhh = h - vh * 0.16;
    const a = scrollArea(x, 'over', px + 14, lp, w - 28, lhh, contentH);
    let yy = lp + 6 - scroll.over;
    const cxx = px + w / 2;
    x.save();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 ' + Math.round(vh * 0.062) + 'px ' + FONT;
    x.fillStyle = d.mother ? '#a44fc9' : d.win ? '#e2637f' : '#5b4a44';
    x.fillText(d.title, cxx, yy + 16, w - 40);
    yy += vh * 0.075;
    x.font = '400 ' + fs + 'px ' + FONT;
    x.fillStyle = '#96806f';
    for (const l2 of wrap(x, d.sub, w - 70)) { x.fillText(l2, cxx, yy + 8, w - 70); yy += fs * 1.4; }
    if (d.motherLine) {
      yy += 6;
      x.font = '900 ' + Math.round(vh * 0.045) + 'px ' + FONT;
      x.fillStyle = '#e2637f';
      x.fillText(d.motherLine, cxx, yy + 10);
      yy += vh * 0.06;
    }
    yy += 8;
    // 2×4 数据格
    const cellW = (w - 76) / 4 - 6, cellH = Math.max(52, vh * 0.14);
    d.stats.forEach((st, i) => {
      const cx = px + 38 + (i % 4) * (cellW + 6), cy = yy + Math.floor(i / 4) * (cellH + 8);
      rr(x, cx, cy, cellW, cellH, 10);
      x.fillStyle = '#fff'; x.fill();
      x.lineWidth = 2.5; x.strokeStyle = '#ffe1b0'; x.stroke();
      x.font = '900 ' + Math.round(cellH * 0.36) + 'px ' + FONT;
      x.fillStyle = '#e2637f';
      x.fillText(st[0], cx + cellW / 2, cy + cellH * 0.36, cellW - 8);
      x.font = '400 ' + Math.round(cellH * 0.21) + 'px ' + FONT;
      x.fillStyle = '#96806f';
      x.fillText(st[1], cx + cellW / 2, cy + cellH * 0.72, cellW - 8);
    });
    yy += (cellH + 8) * 2 + 10;
    // 构筑清单
    for (const row of d.buildRows) {
      x.textAlign = 'right';
      x.font = '400 ' + fs + 'px ' + FONT;
      x.fillStyle = '#96806f';
      x.fillText(row.label, px + 62, yy + 20);
      let cx2 = px + 72;
      for (const chip of row.chips) {
        rr(x, cx2, yy, 40, 40, 9);
        x.fillStyle = '#fffdf6'; x.fill();
        x.lineWidth = 2.5; x.strokeStyle = chip.kind === 'evo' ? '#ff7daa' : chip.kind === 'stamp' ? '#e8b96a' : '#ffd9a0'; x.stroke();
        if (chip.icon) x.drawImage(chip.icon, cx2 + 4, yy + 4, 32, 32);
        x.font = '900 ' + Math.round(fs * 0.95) + 'px ' + FONT;
        x.textAlign = 'center';
        const bd = chip.badge + '';
        const bw2 = Math.max(16, x.measureText(bd).width + 8);
        rr(x, cx2 + 26, yy + 26, bw2, 15, 7);
        x.fillStyle = chip.kind === 'evo' ? '#ff7daa' : chip.kind === 'stamp' ? '#f0b13c' : '#ff8fb5'; x.fill();
        x.strokeStyle = '#fff'; x.lineWidth = 2; x.stroke();
        x.fillStyle = chip.kind === 'stamp' ? '#5c3a08' : '#fff';
        x.fillText(bd, cx2 + 26 + bw2 / 2, yy + 34);
        x.textAlign = 'right';
        cx2 += 48;
      }
      yy += 50;
    }
    x.textAlign = 'center';
    x.font = '400 ' + fs + 'px ' + FONT;
    x.fillStyle = '#96806f';
    x.fillText(d.bestTxt, cxx, yy + 18, w - 60);
    x.restore(); // 标题/文案层
    x.restore(); // scrollArea 的裁剪层（少一次会把按钮全部裁掉）
    // 按钮行（面板底部固定，不随滚动）
    const bh = Math.max(32, vh * 0.085), bw = Math.min(120, (w - 40) / (d.continueOffer ? 4 : 3) - 8);
    let bx = px + w / 2 - (bw * (d.continueOffer ? 4 : 3) + 8 * ((d.continueOffer ? 4 : 3) - 1)) / 2;
    const by = py + h - bh - 10;
    if (d.continueOffer) { btn(x, cb.continueRun, bx, by, bw, bh, '🌙继续夜巡', 'primary'); bx += bw + 8; }
    btn(x, cb.again, bx, by, bw, bh, '再来一局！', 'primary'); bx += bw + 8;
    btn(x, cb.saveImg, bx, by, bw, bh, '📷 保存战报', 'secondary'); bx += bw + 8;
    btn(x, cb.toMenu, bx, by, bw, bh, '回主菜单', 'secondary');
    drag.area = { x: px + 14, y: lp, w: w - 28, h: lhh, key: 'over', contentH };
  }

  /* ================= HUD 角落按钮（游戏中） ================= */
  function drawHud(x) {
    if (screen) return; // 覆盖层打开时不画 HUD 角落按钮
    const r2 = Math.max(18, Math.min(24, vh * 0.055));
    const cx = vw - r2 - 8;
    const defs = [
      { icon: '⏸', fn: cb.pause, dy: vh * 0.16 },
      { icon: '🔍', sub: zoomLv, fn: cb.cycleZoom, dy: vh * 0.16 + (r2 + 6) },
      { icon: '⏩', sub: speedLv, fn: cb.cycleSpeed, dy: vh * 0.16 + (r2 + 6) * 2 },
      { icon: cb.muted() ? '🔇' : '🔊', fn: cb.toggleMute, dy: vh * 0.16 + (r2 + 6) * 3 }
    ];
    for (const d2 of defs) {
      const cy = d2.dy + r2;
      x.save();
      x.globalAlpha = 0.85;
      x.beginPath(); x.arc(cx, cy, r2, 0, TAU);
      x.fillStyle = 'rgba(30,26,58,.75)'; x.fill();
      x.lineWidth = 2.5; x.strokeStyle = 'rgba(255,233,196,.7)'; x.stroke();
      x.globalAlpha = 1;
      x.fillStyle = '#ffe9c4';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '700 ' + Math.round(r2 * (d2.sub ? 0.72 : 0.9)) + 'px ' + FONT;
      if (d2.sub) {
        x.fillText(d2.icon, cx, cy - r2 * 0.32);
        x.font = '900 ' + Math.round(r2 * 0.5) + 'px ' + FONT;
        x.fillStyle = '#ffd34d';
        x.fillText(d2.sub, cx, cy + r2 * 0.42);
      } else {
        x.fillText(d2.icon, cx, cy + 1);
      }
      x.restore();
      hits.push({ x: cx - r2 - 4, y: cy - r2 - 4, w: (r2 + 4) * 2, h: (r2 + 4) * 2, fn: d2.fn });
    }
  }

  /* ================= 对外 ================= */
  function draw(context, timeSec) {
    ctx = context; now = timeSec;
    hits = [];
    drag.area = null;
    if (screen === 'menu') drawMenu(ctx);
    else if (screen === 'help') drawHelp(ctx);
    else if (screen === 'log') drawLog(ctx);
    else if (screen === 'levelup') drawLevelup(ctx);
    else if (screen === 'chest') drawChest(ctx);
    else if (screen === 'pause') drawPause(ctx);
    else if (screen === 'over') drawOver(ctx);
    drawHud(ctx);
  }
  // 触摸：返回 true = 界面已消费（不给摇杆/游戏）
  function touch(type, x, y) {
    if (type === 'start') {
      // HUD 按钮优先（游戏进行中也可点）
      for (const h2 of hits) {
        if (x >= h2.x && x <= h2.x + h2.w && y >= h2.y && y <= h2.y + h2.h) {
          const fn = h2.fn;
          if (typeof fn === 'function') fn();
          return true;
        }
      }
      if (!screen) return false;
      if (drag.area) { drag.on = true; drag.y = y; drag.base = scroll[drag.area.key]; drag.moved = 0; }
      return true;
    }
    if (type === 'move') {
      if (!screen) return false;
      if (drag.on && drag.area) {
        const dy = drag.y - y;
        drag.moved = Math.max(drag.moved, Math.abs(dy));
        scroll[drag.area.key] = drag.base + dy;
      }
      return true;
    }
    // end/cancel
    drag.on = false;
    return !!screen;
  }
  function setScreen(s) { screen = s; if (s === null) drag.on = false; }
  function showLevelUp(cardsData, pick) { cards = cardsData; onPick = pick; setScreen('levelup'); }
  function closeLevelUp() { if (screen === 'levelup') setScreen(null); }
  function showChest(rows, ok) { chestRows = rows; onChestOk = ok; setScreen('chest'); }
  function showResult(d) { result = d; scroll.over = 0; setScreen('over'); }
  function clearOver() { if (screen === 'over') setScreen(null); }

  function init(opts) {
    cb = opts.callbacks;
    maps = opts.maps || [];
    setViewport(opts.vw, opts.vh);
  }

  return {
    init, draw, touch, setScreen, showLevelUp, closeLevelUp, showChest, showResult, clearOver,
    setViewport, setZoomLv: v => { zoomLv = v; }, setSpeedLv: v => { speedLv = v; },
    get screen() { return screen; },
    // 测试钩子：当前帧命中区（fire 直接触发回调，坐标用于 wx.__fire 全链路测试）
    debugHits: () => hits.map(h2 => ({ x: h2.x, y: h2.y, w: h2.w, h: h2.h,
      fire: () => { if (typeof h2.fn === 'function') h2.fn(); },
      label: h2.label || '' }))
  };
})();

;
/* 喵都幸存者 - 游戏主程序 */
'use strict';
(() => {
  const { WEAPONS, WEAPON_ORDER, PASSIVES, PASSIVE_ORDER, ENEMIES, STAMP_META, STAMP_ORDER } = DATA;
  const DEV = typeof window !== 'undefined' && !!window.__DEV__; // 小游戏版：测试桩里置真开 dev
  const AUTO = null; // 小游戏版自动化走 __MS 调试钩子
  const TAU = U.TAU;

  /* ================= 画布与视口 ================= */
  const cv = __platform.screenCanvas(); // 适配层：wx.createCanvas 首调即屏幕画布
  const ctx = cv.getContext('2d');
  let vw = 0, vh = 0, dpr = 1, vignette = null;
  let zoom = 1, worldW = 0, worldH = 0; // 世界层缩放：小屏缩小世界保证视野；worldW/H 为可视范围对应的世界尺寸
  /* 意见1（第三版）：整体缩放档位。1X = 当前视野（小屏优先保证可视范围）；4X = 旧版大小
     （视野 4 倍化改版前的角色尺寸，即世界缩放 ×2，按档位在 1X~4X 间线性过渡）。 */
  const ZOOM_LV = [1, 2, 3, 4];
  let userZoom = U.storage.get('meow_zoom', 1);
  if (!ZOOM_LV.includes(userZoom)) userZoom = 1;
  /* 意见2（第三版）：游戏加速档位 1X/2X/3X（只作用游戏逻辑时间，演出与菜单不受影响） */
  const SPD_LV = [1, 2, 3];
  let gameSpeed = U.storage.get('meow_speed', 1);
  if (!SPD_LV.includes(gameSpeed)) gameSpeed = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = window.innerWidth; vh = window.innerHeight;
    MUI.setViewport(vw, vh);
    if (vw < 2 || vh < 2) return; // 旋转/分屏切换瞬间 innerWidth 可能短暂为 0，等下一帧自愈检查再量
    // 意见6：整体视野 = 原来的 4 倍（2 倍宽 × 2 倍高）→ 世界缩放减半，
    // 人物/敌人/武器随世界变换等比缩小一半，屏幕可见的世界范围翻倍。
    // 下限 0.35 只作用于手机（短边 <700）：0.25 时主角只有 16px 实在太小
    // 玩家缩放档位乘在上面：1X=该基准，4X=×2（旧版大小）
    zoom = Math.min(0.5, Math.max(0.35, Math.min(vw, vh) / 2000)) * (1 + (userZoom - 1) / 3);
    worldW = vw / zoom; worldH = vh / zoom;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    // 关键：CSS 显示尺寸必须与渲染用的 vw/vh 同步，否则 canvas 会按属性尺寸(=视口×dpr)显示
    cv.style.width = vw + 'px'; cv.style.height = vh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    vignette = document.createElement('canvas');
    vignette.width = vw; vignette.height = vh;
    const vx = vignette.getContext('2d');
    const g = vx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.42, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.62);
    g.addColorStop(0, 'rgba(8,8,28,0)');
    g.addColorStop(1, 'rgba(8,8,28,0.55)');
    vx.fillStyle = g; vx.fillRect(0, 0, vw, vh);
  }
  window.addEventListener('resize', resize);
  // 横竖屏切换：iOS Safari 触发 orientationchange 时 innerWidth/innerHeight 还没定，延迟再校一次；
  // Android 走 screen.orientation。帧循环里还有兜底自检，任何设备漏事件都能自愈
  window.addEventListener('orientationchange', () => { resize(); setTimeout(resize, 300); });
  if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', resize);
  resize();

  // 小游戏版：无 DOM，界面全部走 MUI（Canvas 覆盖层）

  /* ================= 缩放 / 加速档位控制 ================= */
  function updateToggleBtns() { MUI.setZoomLv(userZoom + 'X'); MUI.setSpeedLv(gameSpeed + 'X'); }
  function setZoom(lv) {
    if (!ZOOM_LV.includes(lv) || lv === userZoom) return;
    userZoom = lv;
    U.storage.set('meow_zoom', lv);
    resize();
    if (G.state !== 'menu') banner('🔍 画面缩放 ' + lv + 'X' + (lv === 4 ? '（旧版大小）' : ''), 1.5);
    updateToggleBtns();
  }
  function cycleZoom(dir) {
    setZoom(ZOOM_LV[U.clamp(ZOOM_LV.indexOf(userZoom) + dir, 0, ZOOM_LV.length - 1)]);
  }
  function setSpeed(lv) {
    if (!SPD_LV.includes(lv)) return;
    gameSpeed = lv;
    U.storage.set('meow_speed', lv);
    if (G.state === 'play') banner('⏩ 游戏速度 ' + lv + 'X', 1.5);
    updateToggleBtns();
  }

  /* ================= 城市地图（无限网格，chunk 缓存） ================= */
  const CHUNK = 512, ROAD = 96, SIDEWALK = 22, CHUNK_PAD = 48;
  let curMap = null; // 手工地图（MAPS 里的固定面积地图）；null = 经典无限街区
  const chunkCache = new Map();
  function blockType(cx, cy) {
    const h = U.hash2(cx, cy, 77);
    if (h < 0.3) return 'park';
    if (h < 0.55) return 'plaza';
    if (h < 0.78) return 'lot';
    return 'market';
  }
  function genChunk(cx, cy) {
    const PAD = CHUNK_PAD, S = CHUNK + PAD * 2;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const x = c.getContext('2d');
    x.lineJoin = 'round'; x.lineCap = 'round';
    x.translate(PAD, PAD);
    const lamps = [], signs = [];
    const bx = cx * CHUNK, by = cy * CHUNK;
    // 地面
    const isRoadW = wx => ((wx % CHUNK) + CHUNK) % CHUNK < ROAD;
    // 每像素级判断太慢，逐 16px 网格填色
    for (let gy = -PAD; gy < CHUNK + PAD; gy += 16) {
      for (let gx = -PAD; gx < CHUNK + PAD; gx += 16) {
        const wx = bx + gx, wy = by + gy;
        const road = isRoadW(wx) || isRoadW(wy);
        if (road) x.fillStyle = '#2e3046';
        else {
          const inBlockX = ((wx % CHUNK) + CHUNK) % CHUNK, inBlockY = ((wy % CHUNK) + CHUNK) % CHUNK;
          const nearEdge = inBlockX < ROAD + SIDEWALK || inBlockY < ROAD + SIDEWALK;
          if (nearEdge) x.fillStyle = '#454963'; // 人行道
          else x.fillStyle = '#3a3d58';
        }
        x.fillRect(gx, gy, 16, 16);
      }
    }
    // 草地 / 广场 / 停车场地面色块（块内部 96+22 起到 512）
    const type = blockType(cx, cy);
    const ix = ROAD + SIDEWALK, iw = CHUNK - ix;
    if (type === 'park') { x.fillStyle = '#2c463a'; x.fillRect(ix, ix, iw, iw); }
    else if (type === 'plaza') { x.fillStyle = '#3e4160'; x.fillRect(ix, ix, iw, iw); }
    else if (type === 'lot') { x.fillStyle = '#343650'; x.fillRect(ix, ix, iw, iw); }
    // 块内随机点缀坐标
    const R = (a, b) => U.hash2(cx * 31 + a, cy * 57 + b, 913);
    const px = i => ix + 30 + R(1, i) * (iw - 60);
    const py = i => ix + 30 + R(2, i) * (iw - 60);
    // 沥青噪点（路上）
    x.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = 0; i < 44; i++) {
      const gx2 = R(11, i) * CHUNK, gy2 = R(12, i) * CHUNK;
      if (gx2 < ROAD || gy2 < ROAD) x.fillRect(gx2, gy2, 3, 3);
    }
    // 人行道砖缝 + 路缘亮线
    x.strokeStyle = 'rgba(255,255,255,.05)'; x.lineWidth = 2;
    x.beginPath();
    for (let t2 = 0; t2 < CHUNK; t2 += 26) {
      x.moveTo(t2, ROAD); x.lineTo(t2, ROAD + SIDEWALK);
      x.moveTo(ROAD, t2); x.lineTo(ROAD + SIDEWALK, t2);
    }
    x.stroke();
    x.strokeStyle = 'rgba(220,225,255,.13)'; x.lineWidth = 3;
    x.beginPath();
    x.moveTo(-PAD, ROAD + SIDEWALK); x.lineTo(CHUNK + PAD, ROAD + SIDEWALK);
    x.moveTo(ROAD + SIDEWALK, -PAD); x.lineTo(ROAD + SIDEWALK, CHUNK + PAD);
    x.stroke();
    // 道路中线（黄虚线）
    x.strokeStyle = '#8f8558'; x.lineWidth = 4; x.setLineDash([26, 30]);
    x.beginPath(); x.moveTo(-PAD, 48); x.lineTo(CHUNK + PAD, 48);
    x.moveTo(48, -PAD); x.lineTo(48, CHUNK + PAD); x.stroke();
    x.setLineDash([]);
    // 斑马线（路口：chunk 左上角区域）
    const cw = Art.decor.crosswalk;
    x.save(); x.translate(2, 6); x.rotate(0); x.globalAlpha = 0.8;
    x.drawImage(cw, 8, ROAD + 8, 34, 80); x.rotate(0);
    x.restore();
    x.save(); x.translate(6, 2); x.globalAlpha = 0.8;
    x.rotate(Math.PI / 2); x.drawImage(cw, 10, ROAD + 4, 34, 80);
    x.restore();
    // 井盖
    x.drawImage(Art.decor.manhole, ROAD + 150 + R(3, 1) * 200, 36, 40, 40);
    x.drawImage(Art.decor.manhole, 34, ROAD + 180 + R(3, 2) * 180, 36, 36);
    // 路灯：放块角
    const lampC = Art.decor.lamp;
    const lampPos = [[ix - 34, ix - 60], [CHUNK - 40, ix - 60], [ix - 34, CHUNK - 40], [CHUNK - 40, CHUNK - 40]];
    for (const [lx, ly] of lampPos) {
      x.drawImage(lampC, lx, ly);
      lamps.push({ x: bx + lx + 28, y: by + ly + 40 });
    }
    // 块内容
    if (type === 'park') {
      const n = 3 + Math.floor(R(4, 1) * 3);
      for (let i = 0; i < n; i++) {
        const tx = px(i + 10), ty = py(i + 20);
        x.drawImage(Art.decor.tree, tx - 48, ty - 52);
      }
      for (let i = 0; i < 4; i++) x.drawImage(Art.decor.bush, px(i + 30) - 28, py(i + 40) - 20);
      if (R(5, 1) < 0.45) x.drawImage(Art.decor.pond, ix + iw / 2 - 70, ix + iw / 2 - 55);
      x.drawImage(Art.decor.bench, px(50) - 44, py(51) - 22);
      x.drawImage(Art.decor.potted, px(52) - 22, py(53) - 28);
      // 草丛
      x.fillStyle = 'rgba(120,200,140,.16)';
      for (let i = 0; i < 24; i++) {
        x.beginPath(); x.ellipse(px(i + 80), py(i + 90), 7, 3, 0, 0, TAU); x.fill();
      }
      // 小花
      x.save();
      for (let i = 0; i < 14; i++) {
        x.fillStyle = ['#ff9dc3', '#ffd34d', '#c9a7ff'][i % 3];
        x.globalAlpha = 0.7;
        x.beginPath(); x.arc(px(i + 60), py(i + 70), 3, 0, TAU); x.fill();
      }
      x.restore();
    } else if (type === 'plaza') {
      x.drawImage(Art.decor.fountain, ix + iw / 2 - 60, ix + iw / 2 - 60);
      x.drawImage(Art.decor.bench, px(11) - 44, py(12) - 22);
      x.drawImage(Art.decor.bench, px(13) - 44, py(14) - 22);
      for (let i = 0; i < 3; i++) x.drawImage(Art.decor.bush, px(i + 15) - 28, py(i + 16) - 20);
      x.drawImage(Art.decor.potted, px(17) - 22, py(18) - 28);
    } else if (type === 'lot') {
      // 停车位线
      x.strokeStyle = 'rgba(220,220,200,.35)'; x.lineWidth = 4;
      for (let i = 0; i < 6; i++) {
        const lx = ix + 40 + i * 60;
        x.beginPath(); x.moveTo(lx, ix + 50); x.lineTo(lx, ix + 170); x.stroke();
        x.beginPath(); x.moveTo(lx, ix + iw - 50); x.lineTo(lx, ix + iw - 170); x.stroke();
      }
      x.drawImage(Art.decor.vending, px(21) - 30, py(22) - 42);
      x.drawImage(Art.decor.hydrant, px(23) - 20, py(24) - 24);
      x.drawImage(Art.decor.puddle, px(25) - 45, py(26) - 20);
    } else { // market 夜市
      const signKeys = Object.keys(Art.decor.sign);
      const n = 2 + Math.floor(R(6, 1) * 2);
      for (let i = 0; i < n; i++) {
        const sx = ix + 40 + i * (iw - 120) / Math.max(1, n - 1) + R(7, i) * 30;
        const spr = Art.decor.sign[signKeys[Math.floor(R(8, i) * signKeys.length)]];
        x.drawImage(spr, sx, ix + 30);
        signs.push({ x: bx + sx + 42, y: by + ix + 30, c: i % 2 ? 'neonPink' : 'neonCyan' });
      }
      x.drawImage(Art.decor.bench, px(31) - 44, py(32) - 22);
      x.drawImage(Art.decor.hydrant, px(33) - 20, py(34) - 24);
      x.drawImage(Art.decor.boxes, ix + 30, CHUNK - 92);
      x.drawImage(Art.decor.puddle, px(35) - 45, py(36) - 20);
      // 彩灯串
      const ly0 = ix + 24;
      x.strokeStyle = 'rgba(255,220,150,.35)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(ix + 20, ly0); x.quadraticCurveTo(ix + iw / 2, ly0 + 26, ix + iw - 20, ly0); x.stroke();
      for (let i = 0; i < 9; i++) {
        const t2 = (i + 0.5) / 9;
        const lx2 = U.lerp(ix + 20, ix + iw - 20, t2);
        const ly2 = ly0 + Math.sin(t2 * Math.PI) * 19;
        x.fillStyle = ['#ffd34d', '#7de3e0', '#ff9dc3', '#c9a7ff'][i % 4];
        x.beginPath(); x.arc(lx2, ly2 + 4, 3, 0, TAU); x.fill();
      }
    }
    return { canvas: c, pad: PAD, lamps, signs };
  }
  function getChunk(cx, cy) {
    const key = cx + ',' + cy;
    let ch = chunkCache.get(key);
    if (!ch) {
      ch = genChunk(cx, cy);
      chunkCache.set(key, ch);
      if (chunkCache.size > 26) {
        const k0 = chunkCache.keys().next().value;
        chunkCache.delete(k0);
      }
    }
    return ch;
  }

  /* ================= 输入 ================= */
  const keys = {};
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    keys[e.code] = true;
    onAnyInput();
    handleKey(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  // 触摸摇杆
  const IS_TOUCH = 'ontouchstart' in window; // 手机/平板：提示文案与桌面不同
  const joy = { on: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  cv.addEventListener('touchstart', e => {
    onAnyInput();
    const t = e.changedTouches[0];
    if (MUI.touch('start', t.clientX, t.clientY)) return; // 覆盖层 / HUD 按钮吃掉
    if (G.state !== 'play') return;
    joy.on = true; joy.id = t.identifier;
    joy.ox = t.clientX; joy.oy = t.clientY; joy.x = 0; joy.y = 0;
    e.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    const t0 = e.changedTouches[0];
    if (MUI.touch('move', t0.clientX, t0.clientY)) { e.preventDefault(); return; }
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) {
        const dx = t.clientX - joy.ox, dy = t.clientY - joy.oy;
        const d = Math.hypot(dx, dy);
        const cl = Math.min(1, d / 46);
        joy.x = d > 4 ? dx / d * cl : 0;
        joy.y = d > 4 ? dy / d * cl : 0;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const endTouch = e => {
    const t0 = e.changedTouches[0];
    if (t0) MUI.touch('end', t0.clientX, t0.clientY);
    for (const t of e.changedTouches) if (t.identifier === joy.id) { joy.on = false; joy.x = 0; joy.y = 0; }
  };
  cv.addEventListener('touchend', endTouch);
  cv.addEventListener('touchcancel', endTouch);
  // iOS Safari 无视 user-scalable=no：捏合会放大页面导致画面错位，用 Safari 专有 gesture 事件拦掉
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('gesturechange', e => e.preventDefault());
  let lastInputAt = 0;
  function onAnyInput() { lastInputAt = performance.now(); Sfx.ensure(); }

  /* ================= 游戏状态 ================= */
  const G = {
    state: 'menu', time: 0, timeScale: 1, realTime: 0,
    cam: { x: 0, y: 0 }, shake: 0, flash: 0,
    player: null, enemies: [], projs: [], slashes: [], zones: [], gems: [],
    slimes: [], eprojs: [], // 意见6：蜗牛黏液带 / 敌方羽毛弹
    pickups: [], chests: [], parts: [], dmgs: [], after: [],
    spawnT: 1, pendingLv: 0, bossWarn: 0, bossSpawned: false, boss: null,
    kills: 0, gold: 0, gemCombo: 0, gemComboT: 0, idleMeowT: 8,
    elitesDone: 0, eventsDone: 0, dyingT: 0, victoryT: 0, hitSfxT: 0,
    flies: [], petals: [], uid: 0, slowmoT: 0, lowHpPulse: 0, heartT: 0, evoPending: false,
    // 轮次系统
    round: 1, roundTime: 0, waveT: 0, batch: 0, batchBossSpawned: false, roundBossPending: false,
    countMul: 1, // 轮间杂兵数量乘数 ×2^(轮次-1)（只作用于杂兵刷怪与同屏上限）
    roundMods: null, prevRound: null, batchBossSpawnT: 0, batchBossFrac: 1,
    bossSpawnT: -1, bossTTKSamples: [], pendingBossAffixes: [],
    rsHpSum: 0, rsHpN: 0, lvStart: 1,
    // 老鼠妈妈（第3轮压轴）：motherWarnT 警告演出计时 / motherActive 战斗中 / motherDone 已讨伐
    motherWarnT: 0, motherActive: false, motherDone: false, mother: null, motherSpawnT: 0,
    motherTTK: 0, motherFxT: 0,
    // 伤害统计：总量 + 逐秒桶（结算 DPS / 最高秒伤）
    dmgTotal: 0, secDmg: 0, secIdx: -1, peakSec: 0
  };
  const FX = DATA.CFG.fx;
  let mods = null;
  function calcMods() {
    const m = { might: 1, cdMult: 1, areaMult: 1, spdMult: 1, amountBonus: 0, regen: 0, pickMult: 1, luck: 0,
                crit: 0, lifesteal: 0, pierceBonus: 0 };
    for (const p of G.player.passives) {
      const pm = PASSIVES[p.id].mod(p.lv);
      if (pm.might) m.might += pm.might;
      if (pm.cdMult) m.cdMult *= pm.cdMult;
      if (pm.areaMult) m.areaMult *= pm.areaMult;
      if (pm.spdMult) m.spdMult *= pm.spdMult;
      if (pm.amountBonus) m.amountBonus += pm.amountBonus;
      if (pm.regen) m.regen += pm.regen;
      if (pm.pickMult) m.pickMult *= pm.pickMult;
      if (pm.luck) m.luck += pm.luck;
      if (pm.crit) m.crit += pm.crit; // 幸运锦鲤：每级 +0.25% 暴击（全武器）
    }
    // 猫爪印：mulUp 逐层 ×(1+v)、mulDown 逐层 ×(1-v)、add 逐层累加（每层数值 = CFG.stamps[id]）
    const ST = DATA.CFG.stamps;
    for (const af of G.player.affixes || []) {
      const meta = STAMP_META[af.id];
      if (!meta) continue;
      const v = ST[af.id];
      for (let i = 0; i < af.stacks; i++) {
        if (meta.mode === 'mulUp') m[meta.ch] *= 1 + v;
        else if (meta.mode === 'mulDown') m[meta.ch] *= 1 - v;
        else m[meta.ch] += v;
      }
    }
    // 7 枚印全部无上限；引擎底线在别处兜底（单武器冷却 minCd、场上投射物总量 480）
    mods = m;
    // 意见1：70 级起每级 +2% 最大生命 / +1% 移速（乘在被动加成之上）；maxHp/移速统一在这里重算
    const PL = DATA.CFG.postLevel || {};
    const glv = Math.max(0, (G.player.lv || 1) - (PL.autoFrom != null ? PL.autoFrom : 70));
    const milkLv = passLv('milk');
    const milkMod = milkLv > 0 ? PASSIVES.milk.mod(milkLv) : {}; // 未拥有牛奶盒时不给任何加成（mod(0) 会被钳到 1 级）
    G.player.maxHp = Math.round(DATA.PLAYER.hp * (milkMod.hpMult || 1) * Math.pow(1 + (PL.hpPerLv != null ? PL.hpPerLv : 0.02), glv));
    G.player.spdMul = Math.pow(1 + (PL.spdPerLv != null ? PL.spdPerLv : 0.01), glv);
  }
  // 70 级起升 1 级的自动成长：重算 maxHp/移速，并把血回满
  function applyPostGrow() {
    const P = G.player;
    calcMods();
    P.hp = P.maxHp; // 如果血不满，恢复满血
    heartAt(P.x, P.y - 34);
    part({ x: P.x, y: P.y - 8, life: 0.7, size: 34, col: '#8fd982', kind: 'ring' });
  }
  // 80 级起拾取经验不再直接升级；开宝箱时把攒下的经验一次结算成等级（同样享受自动成长）
  function applyChestLevels() {
    const P = G.player, PL = DATA.CFG.postLevel || {};
    if (PL.chestOnlyFrom == null) return;
    let n = 0, need = DATA.xpNeed(P.lv || 1);
    while ((P.xp || 0) >= need && n < 80) {
      P.xp -= need;
      P.lv = (P.lv || 1) + 1;
      applyPostGrow(); // 走到这里的等级必然 ≥ 80，早已过了三选一区间：直接自动成长
      n++; need = DATA.xpNeed(P.lv);
    }
    if (n) {
      banner('📦 宝箱经验结算：连升 ' + n + ' 级！（生命 +' + Math.round((PL.hpPerLv || 0.02) * 100) + '%/级 · 移速 +' +
        Math.round((PL.spdPerLv || 0.01) * 100) + '%/级）', 2.4);
      Sfx.sfx.lvl();
    }
  }
  function passLv(id) {
    const p = G.player.passives.find(p => p.id === id);
    return p ? p.lv : 0;
  }

  /* ================= 猫爪印（全武器词条） ================= */
  function stampStacks(id) {
    const af = G.player && G.player.affixes.find(a => a.id === id);
    return af ? af.stacks : 0;
  }
  function stampUnlocked() {
    return !!G.player && (G.player.lv || 1) >= DATA.CFG.stamps.minLevel;
  }
  function stampPoolIds() {
    return stampUnlocked() ? STAMP_ORDER.slice() : [];
  }
  // 按权重抽一种印；exclude = 本次三选一/宝箱内已出现的印（同屏去重）
  function pickStampId(exclude) {
    const avail = stampPoolIds().filter(id => !exclude.includes(id));
    if (!avail.length) return null;
    const ST = DATA.CFG.stamps;
    let total = 0;
    const ws = avail.map(id => {
      const wk = STAMP_META[id].weightKey;
      const w = wk ? (ST[wk] || 1) : 1;
      total += w;
      return w;
    });
    let r = Math.random() * total;
    for (let i = 0; i < avail.length; i++) { r -= ws[i]; if (r <= 0) return avail[i]; }
    return avail[avail.length - 1];
  }
  // 卡片/宝箱文案：展示叠到第 n 层后的累计效果（n ≥ 1）
  function stampEffectText(id, n) {
    const f2 = v => '' + (Math.round(v * 100) / 100);
    const pct = v => Math.round(v * 1000) / 10;
    const ST = DATA.CFG.stamps;
    switch (id) {
      case 'dmg': return '全武器伤害 ×' + f2(Math.pow(1 + ST.dmg, n - 1)) + ' → ×' + f2(Math.pow(1 + ST.dmg, n));
      case 'cd': return '全武器冷却 ×' + f2(Math.pow(1 - ST.cd, n - 1)) + ' → ×' + f2(Math.pow(1 - ST.cd, n));
      case 'area': return '攻击范围 ×' + f2(Math.pow(1 + ST.area, n - 1)) + ' → ×' + f2(Math.pow(1 + ST.area, n));
      case 'amount': return '投射物数量 +' + (n - 1) + ' → +' + n;
      case 'pierce': return '投射物穿透 +' + (n - 1) + ' → +' + n;
      case 'crit': return '暴击率 ' + pct(ST.crit * (n - 1)) + '% → ' + pct(ST.crit * n) + '%（暴伤 ×2）';
      case 'lifesteal': return '攻击吸血 ' + pct(ST.lifesteal * (n - 1)) + '% → ' + pct(ST.lifesteal * n) + '%';
    }
    return '';
  }

  function resetRun() {
    G.time = 0; G.timeScale = 1; G.slowmoT = 0;
    G.enemies.length = 0; G.projs.length = 0; G.slashes.length = 0; G.zones.length = 0;
    G.slimes.length = 0; G.eprojs.length = 0;
    G.gems.length = 0; G.pickups.length = 0; G.chests.length = 0; G.parts.length = 0; G.dmgs.length = 0; G.after.length = 0;
    G.spawnT = 1.2; G.pendingLv = 0;
    G.kills = 0; G.gold = 0; G.gemCombo = 0; G.idleMeowT = U.rand(8, 14);
    G.dmgTotal = 0; G.secDmg = 0; G.secIdx = -1; G.peakSec = 0;
    G.dyingT = 0; G.victoryT = 0; G.shake = 0; G.flash = 0;
    G.motherWarnT = 0; G.motherActive = false; G.motherDone = false; G.mother = null;
    G.motherSpawnT = 0; G.motherTTK = 0; G.motherFxT = 0;
    G.banner = null;
    G.prevRound = null;
    G.catHint = false; G.dustT = 0;
    chunkCache.clear();
    // 手工地图初始化（地形/装饰烘焙在选图时确定）
    curMap = MAPS.get(G.mapId);
    if (curMap) curMap.init();
    const st = curMap ? curMap.start : { x: 0, y: 0 };
    G.player = {
      x: st.x, y: st.y, vx: 0, vy: 0, r: DATA.PLAYER.r, fx: 1, fy: 0, flip: false,
      hp: DATA.PLAYER.hp, maxHp: DATA.PLAYER.hp,
      iframes: 0, walkT: 0, moving: false, slowT: 0, slowF: 1, stunT: 0, disarmT: 0,
      weapons: [{ id: 'claw', lv: 1, t: 0.4, state: 0 }],
      passives: [], affixes: [], hurtT: 0, blinkT: U.rand(2, 5), blinkA: 0
    };
    mods = null; calcMods();
    G.cam.x = 0; G.cam.y = 0;
    G.flies.length = 0;
    for (let i = 0; i < 26; i++) G.flies.push({
      x: U.rand(-vw, vw), y: U.rand(-vh, vh),
      ph: U.rand(0, TAU), sp: U.rand(0.4, 1)
    });
    G.petals.length = 0;
    for (let i = 0; i < 14; i++) G.petals.push({
      x: Math.random(), y: Math.random(), ph: U.rand(0, TAU), sp: U.rand(0.5, 1.1), sz: U.rand(2.4, 4.2)
    });
    G.heartT = 0; G.evoPending = false;
    startRound(1);
  }

  /* ================= 轮次系统 ================= */
  // 震屏统一入口：主震（boss落地/精英死/受伤等低频大震）直接累加、上限 shakeMax；
  // 次震（暴击/大体型怪死亡等高频小震）带阻尼（现有震幅越大加得越少）且上限更低 —— 中后期不再常驻晃动
  function addShake(v, major) {
    if (major) { G.shake = Math.min(FX.shakeMax, G.shake + v); return; }
    const damp = Math.max(0, 1 - G.shake / FX.shakeMax);
    G.shake = Math.min(Math.min(FX.shakeMinorCap, FX.shakeMax), G.shake + v * damp);
  }
  // 进入第 n 轮：重置轮内时间轴与批次进度，套用该轮难度；残怪与掉落全部保留
  function startRound(n) {
    const R = DATA.ROUNDS;
    G.round = n; G.roundTime = 0; G.waveT = 0;
    G.countMul = Math.pow(DATA.CFG.growth.countRoundMul || 1, n - 1); // 杂兵数量 ×2^(轮次-1)
    G.batch = 0; G.batchBossSpawned = false; G.batchBossSpawnT = 0; G.batchBossFrac = 1;
    G.roundBossPending = false;
    G.elitesDone = 0; G.eventsDone = 0;
    G.bossSpawned = false; G.bossWarn = 0; G.boss = null;
    G.bossTTKSamples = []; G.pendingBossAffixes = [];
    G.bossSpawnT = -1;
    G.roundMods = DATA.roundMods(n, G.prevRound);
    G.spawnT = n > 1 ? 4 : 1.2; // 轮间喘息：留出清理残怪的时间窗
    G.rsHpSum = 0; G.rsHpN = 0; G.lvStart = G.player ? (G.player.lv || 1) : 1;
    if (DEV) console.log('[round ' + n + ']', JSON.stringify(G.roundMods));
    if (n > 1) banner('🌙 第 ' + n + ' 轮开始！（批次 1/' + R.batchCount + ' · 威胁 ×' + G.roundMods.hp.toFixed(2) + '）', 3.4);
  }
  // 批次头目被讨伐 → 下一批立刻来袭；最后一批完成 → 鼠王待命
  function advanceBatch() {
    const R = DATA.ROUNDS;
    G.batch++;
    G.batchBossSpawned = false;
    // 内容时间轴快进：头目讨伐得越快，下一批（含头目降临点）来得越早，整轮自然短于标称 15 分钟
    G.waveT = Math.max(G.waveT, G.batch * R.batchLen);
    if (G.batch >= R.batchCount) {
      G.roundBossPending = true;
      banner('👑 批次头目全灭！宝箱已掉落，鼠王·铁须 正在赶来…', 2.6);
    } else {
      banner('⚔ 头目讨伐成功！掉落了宝箱！第 ' + (G.batch + 1) + '/' + R.batchCount + ' 批次来袭！', 2.4);
      G.spawnT = Math.max(G.spawnT, 2.2); // 批次衔接喘息
    }
  }
  function pickAffixes(n, forced, noSplit) {
    const pool = Object.keys(DATA.ROUNDS.affixes).filter(id => !(noSplit && id === 'split'));
    const out = [];
    for (const id of forced || []) { if (out.length < n && pool.includes(id) && !out.includes(id)) out.push(id); }
    while (out.length < n && out.length < pool.length) {
      const id = U.pick(pool);
      if (!out.includes(id)) out.push(id);
    }
    return out;
  }
  function applyAffixes(e) {
    const A = DATA.ROUNDS.affixes;
    for (const id of e.affixes || []) {
      const a = A[id];
      if (!a) continue;
      if (a.spd) e.spd *= a.spd;
      if (a.dmgTaken) e.dmgTakenMul = a.dmgTaken;
      if (a.kbRes) e.kbRes = a.kbRes;
      if (a.atFrac) e.affEnrage = true;
      if (a.n) e.affSplit = true;
    }
  }
  function affixNames(e) {
    return (e.affixes || []).map(id => (DATA.ROUNDS.affixes[id] || {}).name || id).join('·');
  }
  // 批次头目：精英模板 + 鼠王生命比例 + 词条
  function spawnBatchBoss() {
    const R = DATA.ROUNDS, M = G.roundMods;
    const type = R.batchBossTypes[(G.batch + G.round - 1) % R.batchBossTypes.length];
    const frac = R.batchBossHpFracs[Math.min(G.batch, R.batchBossHpFracs.length - 1)];
    const pt = edgePoint(80);
    const e = spawnEnemy(type, pt.x, pt.y, true);
    // 生命按鼠王公式重算（含轮间指数成长）；伤害/速度沿用 spawnEnemy 的轮内+轮间结果
    e.hp = e.maxHp = ENEMIES.boss.hp * DATA.DIFF.bossHp * (M ? M.bossHp : 1) * frac * roundPow().hp;
    e.scale = R.batchBossScale; e.r *= 1.12; e.dmg *= 1.15;
    e.batchBoss = true;
    e.affixes = pickAffixes(M ? M.bbAffix : 0, M ? M.bbAffixIds : [], false);
    applyAffixes(e);
    G.batchBossSpawnT = G.roundTime; G.batchBossFrac = frac;
    const aff = affixNames(e);
    banner('⚠ 第 ' + (G.batch + 1) + ' 批次头目 · ' + e.def.name + (aff ? '【' + aff + '】' : '') + ' 来袭！', 2.8);
    Sfx.sfx.boss();
    addShake(6, true);
  }
  // 本轮结算数据（动态难度的输入）
  function collectRoundStats() {
    const D = DATA.ROUNDS.dynamic;
    let ttk = D.parBossTTK;
    if (G.bossTTKSamples.length) {
      let s = 0;
      for (const v of G.bossTTKSamples) s += v;
      ttk = s / G.bossTTKSamples.length;
    }
    return {
      actualTime: G.roundTime,
      bossTTK: ttk,
      avgHpFrac: G.rsHpN > 60 ? G.rsHpSum / G.rsHpN : 0.75,
      lvGain: (G.player ? (G.player.lv || 1) : 1) - G.lvStart
    };
  }
  // 鼠王被讨伐 → 本轮结束，进入下一轮（残怪保留）
  function finishRound(stats) {
    G.prevRound = { mods: G.roundMods, stats };
    G.gold += 60 + G.round * 15; // 守轮奖励
    startRound(G.round + 1);
  }
  // 老鼠妈妈被讨伐 → 压轴胜利演出，随后弹出以「讨伐用时」为核心指标的成功结算
  function killMother(e) {
    G.motherDone = true;
    G.motherActive = false;
    G.motherTTK = Math.max(1, G.time - (G.motherSpawnT || G.time));
    G.gold += DATA.CFG.finale.motherGold;
    // 意见3：死后掉落 30 枚金币（落在地上，拾取照常走金币抽奖）+ 1 个专属宝箱
    //（必定最多 5 件奖励、必定不含金币，见 openChest）
    const F = DATA.CFG.finale;
    for (let i = 0; i < (F.motherCoinN != null ? F.motherCoinN : 30); i++) {
      const a2 = U.rand(0, TAU), d2 = U.rand(24, 130);
      dropPickup(e.x + Math.cos(a2) * d2, e.y + Math.sin(a2) * d2, 'coin');
    }
    G.chests.push({ x: e.x, y: e.y + 10, t: 0, taken: false, mother: true });
    G.player.iframes = Math.max(G.player.iframes, 3); // 庆祝演出期无敌：压轴胜利绝不被残怪翻盘
    popStars(e.x, e.y, '#e2b7ff', 60);
    part({ x: e.x, y: e.y, life: 1.1, size: 180, col: '#e2b7ff', kind: 'ring' });
    part({ x: e.x, y: e.y, life: 0.8, size: 120, col: '#ffffff', kind: 'ring' });
    G.flash = 0.7; addShake(14, true);
    Sfx.sfx.bigPop(); Sfx.meow('victory');
    G.timeScale = 0.25; G.slowmoT = 1.4;
    G.after.push({ t: 1.6, fn: showMotherResult });
  }
  function showMotherResult() {
    G.state = 'over';
    const data = collectResult(true);
    data.mother = true;
    data.motherTTK = G.motherTTK;
    data.continueOffer = true;
    const mb = U.storage.get('meow_best_mother', 0);
    if (!mb || G.motherTTK < mb) U.storage.set('meow_best_mother', Math.round(G.motherTTK * 10) / 10);
    data.bestMother = U.storage.get('meow_best_mother', 0);
    data.best = saveBest();
    showResultPanel(data);
    Sfx.sfx.victory(); Sfx.meow('happy');
  }

  /* ================= 粒子 / 飘字 ================= */
  function part(o) {
    if (G.parts.length > 600) G.parts.shift();
    G.parts.push(Object.assign({ t: 0, life: 0.6, vx: 0, vy: 0, size: 5, col: '#fff', kind: 'dot', rot: U.rand(0, TAU), vr: U.rand(-4, 4) }, o));
  }
  function popStars(x, y, col, n) {
    if (G.parts.length > FX.particleLodAt) n = Math.ceil(n / 2); // 粒子过载时生成量减半（LOD）
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, TAU), s = U.rand(40, 160);
      part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: U.rand(0.3, 0.6), size: U.rand(3, 6), col, kind: 'star', grav: 300 });
    }
  }
  function heartAt(x, y) { part({ x, y, vy: -46, life: 1.1, size: 7, col: '#ff8fb5', kind: 'heart' }); }
  function sweatDrop(x, y) { part({ x, y, vy: -30, vx: U.rand(-8, 8), life: 0.8, size: 4, col: '#9fd8f2', kind: 'dot' }); }
  // 光柱（升级/开箱/进化演出）
  function beamAt(x, y, col) {
    part({ x, y, life: 0.55, size: 26, col, kind: 'beam' });
    for (let i = 0; i < 10; i++) {
      part({ x: x + U.rand(-14, 14), y: y + U.rand(-8, 8), vy: -U.rand(120, 260), vx: U.rand(-20, 20), life: U.rand(0.4, 0.8), size: U.rand(2.5, 5), col, kind: 'star' });
    }
  }
  function dmgNum(x, y, v, crit) {
    if (G.dmgs.length > 90) G.dmgs.shift();
    G.dmgs.push({ x: x + U.rand(-8, 8), y, t: 0, life: crit ? 0.9 : 0.7, txt: '' + Math.round(v), crit: !!crit, vy: crit ? -84 : -58 });
  }
  // 金色小飘字（金币抽奖小奖反馈）
  function goldFloat(x, y, txt) {
    if (G.dmgs.length > 90) G.dmgs.shift();
    G.dmgs.push({ x: x + U.rand(-8, 8), y, t: 0, life: 0.8, txt: '' + txt, crit: false, col: '#ffd34d', vy: -46 });
  }
  function banner(txt, t) { G.banner = { txt, t: t || 3 }; }

  /* ================= 敌人 ================= */
  // 统一出生点约束：手工地图上钳到可行走位置（不卡墙、不进猫道）
  function walkPoint(x, y, maxR) {
    if (!curMap) return { x, y };
    return curMap.nearWalk(x, y, false, maxR || 640);
  }
  // 在玩家周围屏幕外一点点生成
  function edgePoint(margin) {
    const a = U.rand(0, TAU);
    const rx = worldW / 2 + (margin || 50), ry = worldH / 2 + (margin || 50);
    return walkPoint(G.player.x + Math.cos(a) * rx, G.player.y + Math.sin(a) * ry);
  }
  // 意见2：轮间指数成长（×3^(轮-1) 血 / ×2^(轮-1) 攻 / ×1.1^(轮-1) 速），
  // 叠在既有机制之上；作用杂兵/精英/头目/鼠王，老鼠妈妈不走这里（数值全固定）
  function roundPow() {
    const Gw = DATA.CFG.growth, k = Math.max(0, G.round - 1);
    return {
      hp: Math.pow(Gw.roundHpMul != null ? Gw.roundHpMul : 3, k),
      dmg: Math.pow(Gw.roundDmgMul != null ? Gw.roundDmgMul : 2, k),
      spd: Math.pow(Gw.roundSpdMul != null ? Gw.roundSpdMul : 1.1, k)
    };
  }
  function spawnEnemy(type, x, y, elite) {
    const def = ENEMIES[type];
    const D = DATA.DIFF, EC = DATA.CFG.elite;
    const M = G.roundMods;
    const RP = roundPow();
    if (curMap) { const p2 = walkPoint(x, y); x = p2.x; y = p2.y; }
    // 轮内成长曲线（按本轮时间）× 轮次难度倍率 × 轮间指数成长
    const hpM = DATA.hpMult(G.roundTime) * (M ? M.hp : 1) * RP.hp;
    const dm = DATA.dmgMult(G.roundTime) * (M ? M.dmg : 1) * RP.dmg;
    const sm = DATA.spdMult(G.roundTime) * RP.spd;
    const e = {
      uid: ++G.uid, type, def,
      x, y, vx: 0, vy: 0, kx: 0, ky: 0,
      hp: def.hp * hpM * D.enemyHp, maxHp: def.hp * hpM * D.enemyHp,
      spd: def.spd * sm * U.rand(0.92, 1.08) * D.enemySpd,
      dmg: def.dmg * dm * D.enemyDmg, r: def.r,
      phase: U.rand(0, TAU), flash: 0, slowT: 0, slowF: 1,
      blinkT: U.rand(2, 6), blinkA: 0, faceT: 0,
      elite: !!elite, scale: elite ? EC.scale : 1, orbCd: 0, lungeT: 0, lungeCd: U.rand(1, 2),
      // 意见6：行为特性计时（首次触发时间随机错开，避免同帧群体行动）
      dashSt: 0, dashT: 0, dashCd: U.rand(1.5, 3.2), dashX: 0, dashY: 0,
      fireCd: U.rand(1.2, 2.8), slimeT: U.rand(0.2, 0.7), stealT: 0, tgtGem: null,
      boss: false, dieDone: false
    };
    if (elite) { e.hp *= EC.hpMul * (M ? M.eliteHp : 1); e.maxHp = e.hp; e.dmg *= EC.dmgMul; e.r *= 1.5; e.spd *= EC.spdMul; }
    G.enemies.push(e);
    return e;
  }
  function spawnBoss(affixIds) {
    const a = U.rand(0, TAU);
    const d = Math.min(worldW, worldH) * 0.4; // 落在视野内，登场演出可见
    const def = ENEMIES.boss;
    const F = DATA.CFG.finale;
    const M = G.roundMods;
    const RP = roundPow();
    let bx = G.player.x + Math.cos(a) * d, by = G.player.y + Math.sin(a) * d;
    if (curMap) { const p2 = walkPoint(bx, by, 900); bx = p2.x; by = p2.y; }
    const b = {
      uid: ++G.uid, type: 'boss', def,
      x: bx, y: by,
      vx: 0, vy: 0, kx: 0, ky: 0,
      hp: def.hp * DATA.DIFF.bossHp * (M ? M.bossHp : 1) * RP.hp, maxHp: def.hp * DATA.DIFF.bossHp * (M ? M.bossHp : 1) * RP.hp,
      spd: def.spd * RP.spd, dmg: def.dmg * DATA.DIFF.enemyDmg * RP.dmg, r: def.r,
      phase: 0, flash: 0, slowT: 0, slowF: 1, elite: false, scale: 1,
      blinkT: U.rand(2, 5), blinkA: 0, faceT: 0, landT: 0,
      boss: true, state: 'entry', entryT: 0.9, entryD: 0.9, st: 0, summonT: F.bossSummonCd, lungeT: 0, lungeCd: 0, orbCd: 0, dieDone: false
    };
    b.affixes = affixIds || [];
    applyAffixes(b);
    G.enemies.push(b); G.boss = b;
    G.bossSpawnT = G.roundTime;
  }
  // 老鼠妈妈警告演出（第 3 轮鼠王被讨伐后触发；守轮奖励与动态难度输入已提前记好）
  function startMotherWarn() {
    if (G.state !== 'play') return;
    const F = DATA.CFG.finale;
    G.motherWarnT = F.motherWarn;
    G.motherActive = true;
    banner('🐭 老鼠妈妈 正在赶来——为了孩子们，她很生气！', 3.2);
    Sfx.sfx.boss();
  }
  // 压轴 Boss 老鼠妈妈：全部数值固定，不吃难度倍率 / 动态难度 / 轮内成长
  function spawnMother() {
    const def = ENEMIES.mother;
    const a = U.rand(0, TAU);
    const d = Math.min(worldW, worldH) * 0.42;
    let bx = G.player.x + Math.cos(a) * d, by = G.player.y + Math.sin(a) * d;
    if (curMap) { const p2 = walkPoint(bx, by, 900); bx = p2.x; by = p2.y; }
    const m = {
      uid: ++G.uid, type: 'mother', def,
      x: bx, y: by, vx: 0, vy: 0, kx: 0, ky: 0,
      hp: def.hp, maxHp: def.hp, // 固定值（500 万），不吃任何难度/动态/轮间倍率
      spd: def.spd, dmg: def.dmg, r: def.r,
      phase: 0, flash: 0, slowT: 0, slowF: 1, elite: false, scale: 1,
      blinkT: U.rand(2, 5), blinkA: 0, faceT: 0, landT: 0,
      boss: true, mother: true, state: 'entry', entryT: 1.1, entryD: 1.1,
      st: 0, skillT: DATA.CFG.finale.motherSkillCd, orbCd: 0, dieDone: false
    };
    G.enemies.push(m); G.mother = m;
    G.motherSpawnT = G.time; // 讨伐用时从这里起算（结算核心指标）
    banner('🐭 老鼠妈妈 降临！讨伐她！', 3);
  }
  // 老鼠妈妈行为：追击 + 唯一技能「全屏斩」（10 秒一次，0.6 秒预警）
  function updateMother(m, dt) {
    const F = DATA.CFG.finale;
    m.st -= dt;
    if (m.landT > 0) m.landT -= dt;
    if (m.state === 'entry') { // 从天而降
      m.entryT -= dt;
      if (m.entryT <= 0) {
        m.state = 'chase'; m.st = 1.4; m.landT = 0.3;
        addShake(14, true);
        part({ x: m.x, y: m.y + 26, life: 0.8, size: 130, col: '#e2b7ff', kind: 'ring' });
        for (let i = 0; i < 18; i++) {
          const a2 = U.rand(0, TAU);
          part({ x: m.x + Math.cos(a2) * 40, y: m.y + 30, vx: Math.cos(a2) * U.rand(70, 190), vy: -U.rand(30, 140), life: U.rand(0.3, 0.8), size: U.rand(3, 8), col: '#bfa9d8', kind: 'dot', grav: 320 });
        }
        Sfx.sfx.bigPop();
      }
      return;
    }
    if (m.state === 'chase') {
      bossUnstuck(m, Math.hypot(G.player.x - m.x, G.player.y - m.y), dt);
      m.skillT -= dt;
      if (m.skillT <= F.motherTele) { m.state = 'tele'; m.st = F.motherTele; Sfx.sfx.motherWarn(); }
    } else if (m.state === 'tele') { // 预警结束 → 全屏斩
      if (m.st <= 0) { m.state = 'chase'; m.skillT = F.motherSkillCd; motherSlash(); }
    }
  }
  // 全屏斩：扣除主角「当前」体力的 50%（保底 1 点，绝不直接致死）
  // 控制链：眩晕1秒（不能动/武器停）→ 缴械1秒（能动/武器停）→ 减速×0.55共2秒（与缴械前1秒重叠）
  // 命中表现 0.3 秒内结束：短闪 + 冲击环 + 短促紫边，不做长驻全屏覆盖
  function motherSlash() {
    const F = DATA.CFG.finale, P = G.player;
    const before = P.hp;
    P.hp = Math.max(F.motherHpFloor, P.hp * (1 - F.motherHpFrac));
    P.stunT = F.motherStun || 0;
    P.disarmT = (F.motherStun || 0) + (F.motherDisarm || 0);
    P.slowT = (F.motherStun || 0) + (F.motherSlowT || 0);
    P.slowF = F.motherSlowMul;
    P.hurtT = 0.3;
    P.moving = false;
    dmgNum(P.x, P.y - 30, Math.max(1, Math.round(before - P.hp)), true);
    part({ x: P.x, y: P.y, life: 0.45, size: 150, col: '#d9a8ff', kind: 'ring' });
    part({ x: P.x, y: P.y, life: 0.3, size: 90, col: '#ffffff', kind: 'ring' });
    G.flash = 0.3;
    G.motherFxT = 0.3;
    addShake(12, true);
    Sfx.sfx.motherSkill();
    Sfx.meow('hurt');
    if (P.hp <= 0) { P.hp = 0; startDying(); } // 保底理论上不会触发，兜底
  }
  function killEnemy(e) {
    if (e.dieDone) return;
    e.dieDone = true;
    G.kills++;
    // 掉落
    if (e.boss) {
      if (e.mother) { killMother(e); return; }
      // 轮Boss被讨伐：本轮结束（残怪保留），短暂演出后进入下一轮
      G.bossTTKSamples.push(Math.max(2, G.roundTime - Math.max(0, G.bossSpawnT)));
      popStars(e.x, e.y, '#ffd34d', 40);
      part({ x: e.x, y: e.y, life: 0.9, size: 120, col: '#ffd9e6', kind: 'ring' });
      G.flash = 0.6; addShake(14, true);
      Sfx.sfx.bigPop(); Sfx.meow('victory'); Sfx.sfx.victory();
      G.timeScale = 0.25;
      G.slowmoT = 1.1;
      const stats = collectRoundStats();
      if (G.round === 3 && !G.motherDone && !G.motherActive) {
        // 第 3 轮压轴：守轮结算照记（金币 + 动态难度输入），但不进入下一轮——老鼠妈妈即将降临
        G.prevRound = { mods: G.roundMods, stats };
        G.gold += 60 + G.round * 15;
        G.after.push({ t: 1.3, fn: startMotherWarn });
      } else {
        G.after.push({ t: 1.3, fn: () => finishRound(stats) });
      }
      return;
    }
    if (e.elite) {
      for (let i = 0; i < 6; i++) dropGem(e.x + U.rand(-24, 24), e.y + U.rand(-24, 24), 5);
      dropGem(e.x, e.y, 25);
      // 意见7：普通精英不再必掉宝箱——基础 50%，幸运每点 +6%（锦鲤满级 luck=3 → 68%，封顶 85%），
      // 没掉宝箱改掉 1 枚金币；批次头目属 boss 级不受影响、必掉宝箱
      const EC2 = DATA.CFG.elite;
      const chestP = Math.min(0.85, (EC2.chestBase != null ? EC2.chestBase : 1) + mods.luck * (EC2.chestLuck || 0));
      if (e.batchBoss || U.chance(chestP)) {
        G.chests.push({ x: e.x, y: e.y, t: 0, taken: false });
        banner('✨ 精英倒下了！掉落了宝箱 ✨', 2.2);
      } else {
        dropPickup(e.x, e.y, 'coin');
        banner('✨ 精英倒下了！掉了一枚金币 ✨', 2);
      }
      dropPickup(e.x + 20, e.y, 'milk');
      // 分裂词条：死后裂出一圈小型精英血量的同类
      if (e.affSplit && !e.noSplit) {
        const S = DATA.ROUNDS.affixes.split;
        for (let i = 0; i < S.n; i++) {
          const a2 = i / S.n * TAU;
          const c = spawnEnemy(e.type, e.x + Math.cos(a2) * 46, e.y + Math.sin(a2) * 46, false);
          c.hp *= S.hpMul; c.maxHp = c.hp; c.scale = 1.3; c.r *= 1.25; c.noSplit = true;
        }
        banner('❗ 头目分裂了！', 1.5);
      }
      if (e.batchBoss) {
        G.bossTTKSamples.push(Math.max(2, (G.roundTime - G.batchBossSpawnT) / (G.batchBossFrac || 1)));
        G.chests.push({ x: e.x, y: e.y, t: 0, taken: false }); // 头目讨伐 → 宝箱（每轮 4 次）
        advanceBatch();
      }
    } else {
      dropGem(e.x, e.y, e.def.xp);
      const D = DATA.DROPS;
      const luck = mods.luck;
      if (U.chance(D.coin + luck * 0.01)) dropPickup(e.x, e.y, 'coin');
      else if (U.chance(D.milk + luck * 0.004)) dropPickup(e.x, e.y, 'milk');
      else if (U.chance(D.firework + luck * 0.003)) dropPickup(e.x, e.y, 'firework');
      else if (U.chance(D.vacuum + luck * 0.003)) dropPickup(e.x, e.y, 'vacuum');
      else if (U.chance(D.chestDrop + luck * D.chestLuck)) G.chests.push({ x: e.x, y: e.y, t: 0, taken: false }); // 极小概率掉宝箱，幸运提升
      Sfx.sfx.pop();
      popStars(e.x, e.y, '#fff', 5 + (e.def.mass > 2 ? 4 : 0));
      if (e.def.mass > 2) addShake(2.5);
    }
  }
  function hitEnemy(e, dmg, kbx, kby, opts) {
    if (e.dieDone || e.hp <= 0) return;
    opts = opts || {};
    // 猫爪印：全局会心/汲血并入每一次伤害（全武器 + 光环/区域生效）
    if (mods.crit) opts.crit = (opts.crit || 0) + mods.crit;
    if (mods.lifesteal) opts.lifesteal = (opts.lifesteal || 0) + mods.lifesteal;
    let d = dmg, crit = false;
    if (opts.crit && U.chance(opts.crit)) { d *= opts.critMul || 2; crit = true; }
    if (e.dmgTakenMul) d *= e.dmgTakenMul; // 「铁壁」词条：受伤减免
    e.hp -= d;
    G.dmgTotal += d; G.secDmg += d; // 结算统计：总伤害 + 当前秒桶
    e.flash = 0.12;
    dmgNum(e.x, e.y - e.r - 6, d, crit);
    if (!e.boss && !opts.noKb) {
      const res = e.kbRes != null ? e.kbRes : (e.def.kbRes || 1);
      const m = e.def.mass || 1;
      e.kx += (kbx || 0) * res / m; e.ky += (kby || 0) * res / m;
      if (Math.abs(kbx || 0) + Math.abs(kby || 0) > 60) e.faceT = 0.4; // 被打飞的惊讶脸
    }
    if (crit) {
      addShake(2);
      part({ x: e.x, y: e.y - e.r, life: 0.3, size: 16, col: '#ffd34d', kind: 'ring' });
    }
    if (opts.lifesteal) healPlayer(d * opts.lifesteal);
    Sfx.sfx.hitThrottle();
    if (e.hp <= 0) killEnemy(e);
  }
  // 节流打击音效
  let hitSfxLast = 0;
  Sfx.sfx.hitThrottle = () => {
    const now = performance.now();
    if (now - hitSfxLast > 70) { hitSfxLast = now; Sfx.sfx.hit(); }
  };

  /* ================= 掉落物 ================= */
  function dropGem(x, y, v) {
    if (curMap) { const p2 = walkPoint(x, y, 120); x = p2.x; y = p2.y; } // 别掉进墙里捡不到
    if (G.gems.length > DATA.CFG.drops.gemMax) { // 合并最旧的两颗
      const a = G.gems[0], b = G.gems[1];
      a.val += b ? b.val : 0;
      if (b) U.swapRemove(G.gems, 1);
    }
    G.gems.push({ x: x + U.rand(-6, 6), y: y + U.rand(-6, 6), vx: U.rand(-40, 40), vy: U.rand(-40, 40), val: v, vac: false, t: U.rand(0, TAU) });
  }
  function dropPickup(x, y, kind) {
    if (curMap) { const p2 = walkPoint(x, y, 120); x = p2.x; y = p2.y; }
    G.pickups.push({ x, y, kind, t: U.rand(0, TAU) });
  }

  /* ================= 空间哈希 ================= */
  const CELL = 76;
  let grid = new Map();
  function gridKey(cx, cy) { return cx * 100003 + cy; }
  function rebuildGrid() {
    grid.clear();
    for (const e of G.enemies) {
      if (e.dieDone) continue;
      const k = gridKey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
      let arr = grid.get(k);
      if (!arr) { arr = []; grid.set(k, arr); }
      arr.push(e);
    }
  }
  function queryGrid(x, y, r, out) {
    out.length = 0;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const arr = grid.get(gridKey(cx, cy));
      if (arr) for (const e of arr) out.push(e);
    }
    return out;
  }
  const qbuf = [];

  /* ================= 武器系统 ================= */
  // 意见5：所有攻击无论叠加后理论范围多大，最大都不超过屏幕——
  // 范围类攻击以「可视区短边的一半」为半径上限，投射物离开视野即消失（见 updateProjs）
  function atkMaxR() { return Math.min(worldW, worldH) * 0.5; }
  function wStats(w) {
    const def = WEAPONS[w.id];
    if (w.evolved) return Object.assign({}, def.statsEvo);
    const s = Object.assign({}, def.stats(w.lv));
    return s;
  }
  function evoEligible(w) {
    const def = WEAPONS[w.id];
    return !w.evolved && w.lv >= def.maxLv && passLv(def.evoPassive) > 0;
  }
  function nearestEnemy(x, y, maxR) {
    let best = null, bd = maxR * maxR;
    for (const e of G.enemies) {
      if (e.dieDone) continue;
      const d = U.dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function fireProj(o) {
    if (G.projs.length > 480) return;
    G.projs.push(Object.assign({ t: 0, life: 1.5, pierce: 1, hitSet: null, rot: 0, spin: 0 }, o));
  }
  function updateWeapons(dt) {
    const P = G.player;
    if (P.stunT > 0 || P.disarmT > 0) return; // 眩晕/缴械：全武器暂停（冷却与环绕球一并冻结）
    for (const w of P.weapons) {
      const def = WEAPONS[w.id];
      const s = wStats(w);
      const cd = Math.max(DATA.CFG.stamps.minCd, s.cd * mods.cdMult); // 引擎底线：冷却再低也不快过 minCd
      w.cdMax = cd; // 供 HUD 冷却指示
      w.t -= dt;
      if (w.id === 'orbit' || w.evolved && w.id === 'planet') {
        // 环绕武器独立状态机
        if (w.state === 0) { if (w.t <= 0) { w.state = 1; w.activeT = s.active; } }
        else {
          w.activeT -= dt;
          w.ang = (w.ang || 0) + s.speed * dt;
          if (w.activeT <= 0) { w.state = 0; w.t = cd; }
        }
        continue;
      }
      if (w.t > 0) continue;
      w.t = cd;
      const might = mods.might;
      switch (def.kind) {
        case 'claw': {
          const dmg = s.dmg * might, area = s.area * mods.areaMult;
          const mR = atkMaxR();
          const dirs = [[P.fx, P.fy]];
          if (s.both) dirs.push([-P.fx, -P.fy]);
          for (let wi = 0; wi < s.waves; wi++) {
            for (const [dx, dy] of dirs) {
              const delay = wi * 0.14 + (dx === -P.fx && dy === -P.fy ? 0.07 : 0);
              const fx = dx, fy = dy;
              G.after.push({
                t: delay, fn: () => {
                  G.slashes.push({
                    x: P.x, y: P.y, fx, fy, t: 0, life: 0.2,
                    reach: Math.min(145 * area, mR), half: Math.min(62 * area, mR * 0.5),
                    dmg, crit: s.crit, critMul: s.critMul, lifesteal: s.lifesteal,
                    kb: s.kb, hitSet: new Set()
                  });
                  Sfx.sfx.hit();
                }
              });
            }
          }
          break;
        }
        case 'homing': {
          const n = s.amount + mods.amountBonus;
          for (let i = 0; i < n; i++) {
            const a = U.rand(0, TAU);
            fireProj({
              kind: 'note', x: P.x, y: P.y - 10,
              vx: Math.cos(a) * s.speed * 0.5, vy: Math.sin(a) * s.speed * 0.5,
              speed: s.speed * mods.spdMult, dmg: s.dmg * might, pierce: s.pierce + mods.pierceBonus,
              life: 2.6, r: 12, retarget: 0
            });
          }
          break;
        }
        case 'knife': {
          const n = s.amount + mods.amountBonus;
          const base = Math.atan2(P.fy, P.fx);
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * s.spread + U.rand(-0.03, 0.03);
            const sp = s.speed * mods.spdMult;
            fireProj({
              kind: 'fish', x: P.x, y: P.y - 6,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              dmg: s.dmg * might, pierce: s.pierce + mods.pierceBonus, life: 1.3, r: 12,
              rot: a, spin: 0
            });
          }
          break;
        }
        case 'axe': {
          const n = s.amount + mods.amountBonus;
          for (let i = 0; i < n; i++) {
            fireProj({
              kind: 'axe', x: P.x + U.rand(-14, 14), y: P.y - 10,
              vx: U.rand(-130, 130) + P.fx * 60, vy: -U.rand(500, 600),
              grav: 980, dmg: s.dmg * might, pierce: 99, life: 2.6,
              r: Math.min(20 * s.area * mods.areaMult, atkMaxR() * 0.3),
              area: s.area * mods.areaMult, spin: U.rand(6, 9) * (U.chance(0.5) ? 1 : -1), startY: P.y
            });
          }
          break;
        }
        case 'lobzone': {
          const n = s.amount + mods.amountBonus;
          const lobR = Math.min(560, atkMaxR());
          for (let i = 0; i < n; i++) {
            const tgt = nearestEnemy(P.x, P.y, lobR);
            let tx, ty;
            if (tgt) { tx = tgt.x + U.rand(-30, 30); ty = tgt.y + U.rand(-30, 30); }
            else { const a = U.rand(0, TAU), d = U.rand(120, Math.min(320, lobR)); tx = P.x + Math.cos(a) * d; ty = P.y + Math.sin(a) * d; }
            fireProj({
              kind: 'litter', sx: P.x, sy: P.y - 12, tx, ty,
              T: U.rand(0.6, 0.8), t: 0, arc: 130,
              dmg: s.dmg * might, zoneR: Math.min(s.zoneR * mods.areaMult, atkMaxR() * 0.6), zoneT: s.zoneT, r: 12
            });
          }
          break;
        }
        case 'zap': {
          const strike = (e, d) => {
            G.parts.push({ t: 0, life: 0.26, kind: 'bolt', x1: e.x + U.rand(-30, 30), y1: e.y - 330, x2: e.x, y2: e.y - 8, col: '#ffe86b', size: 0, vr: 0, rot: 0, vx: 0, vy: 0 });
            part({ x: e.x, y: e.y - 8, life: 0.3, size: 22, col: '#fff7c8', kind: 'ring' });
            hitEnemy(e, d, 0, 0, { noKb: true });
          };
          const n = s.strikes + mods.amountBonus;
          const zapR2 = Math.min(560, atkMaxR());
          const inR = [];
          for (const e of G.enemies) if (!e.dieDone && U.dist2(P.x, P.y, e.x, e.y) < zapR2 * zapR2) inR.push(e);
          if (!inR.length) { w.t = 0.35; break; }
          let struck = [];
          for (let i = 0; i < n; i++) {
            const e = U.pick(inR);
            if (struck.includes(e)) continue;
            strike(e, s.dmg * might);
            struck.push(e);
            if (s.chain) {
              let from = e;
              for (let ci = 0; ci < s.chain; ci++) {
                let nb = null, bd = 160 * 160;
                for (const o of G.enemies) {
                  if (o.dieDone || struck.includes(o)) continue;
                  const d = U.dist2(from.x, from.y, o.x, o.y);
                  if (d < bd) { bd = d; nb = o; }
                }
                if (!nb) break;
                G.parts.push({ t: 0, life: 0.22, kind: 'bolt', x1: from.x, y1: from.y - 10, x2: nb.x, y2: nb.y - 10, col: '#ffe86b', size: 0, vr: 0, rot: 0, vx: 0, vy: 0 });
                strike(nb, s.dmg * might * 0.6);
                struck.push(nb); from = nb;
              }
            }
          }
          Sfx.sfx.thunder();
          break;
        }
      }
    }
    // 光环武器（持续型）
    for (const w of P.weapons) {
      if (WEAPONS[w.id].kind !== 'aura') continue;
      const s = wStats(w);
      const r = Math.min(s.radius * mods.areaMult, atkMaxR());
      w.tickT = (w.tickT || 0) - dt;
      if (w.tickT <= 0) {
        w.tickT = Math.max(0.15, s.tick * mods.cdMult); // 疾风印/小闹钟同样提高跳伤频率
        const dmg = s.dmg * mods.might;
        queryGrid(P.x, P.y, r, qbuf);
        for (const e of qbuf) {
          if (e.dieDone) continue;
          if (U.dist2(P.x, P.y, e.x, e.y) < (r + e.r) * (r + e.r)) {
            hitEnemy(e, dmg, 0, 0, { noKb: true });
            e.slowT = 0.5; e.slowF = 1 - (s.slow || 0);
          }
        }
        if (U.chance(0.6)) part({ x: P.x + U.rand(-r, r), y: P.y + U.rand(-r, r), vy: -20, life: 0.8, size: 4, col: '#9fe29a', kind: 'leaf' });
      }
    }
    // 环绕球碰撞
    for (const w of P.weapons) {
      if (WEAPONS[w.id].kind !== 'orbit' || w.state !== 1) continue;
      const s = wStats(w);
      const R = Math.min(s.radius * mods.areaMult, atkMaxR() * 0.8);
      const dmg = s.dmg * mods.might;
      const nOrb = s.amount + mods.amountBonus; // 影分印/手套对毛线球同样生效
      for (let i = 0; i < nOrb; i++) {
        const a = (w.ang || 0) + i * TAU / nOrb;
        const bx = P.x + Math.cos(a) * R, by = P.y + Math.sin(a) * R * 0.72; // 椭圆轨道更俯视
        queryGrid(bx, by, 30, qbuf);
        for (const e of qbuf) {
          if (e.dieDone || e.orbCd > 0) continue;
          if (U.dist2(bx, by, e.x, e.y) < (26 + e.r) * (26 + e.r)) {
            e.orbCd = s.hitCd;
            const ka = Math.atan2(e.y - P.y, e.x - P.x);
            hitEnemy(e, dmg, Math.cos(ka) * s.kb, Math.sin(ka) * s.kb);
          }
        }
      }
    }
  }
  // 挥击结算
  function updateSlashes(dt) {
    for (let i = G.slashes.length - 1; i >= 0; i--) {
      const s = G.slashes[i];
      s.t += dt;
      if (s.t < 0.02 || s.t > 0.16) { if (s.t >= s.life) U.swapRemove(G.slashes, i); continue; }
      const P = G.player;
      queryGrid(P.x + s.fx * s.reach / 2, P.y + s.fy * s.reach / 2, s.reach, qbuf);
      for (const e of qbuf) {
        if (e.dieDone || s.hitSet.has(e.uid)) continue;
        const dx = e.x - P.x, dy = e.y - P.y;
        const fw = dx * s.fx + dy * s.fy;
        const sd = -dx * s.fy + dy * s.fx;
        if (fw > -e.r && fw < s.reach && Math.abs(sd) < s.half + e.r) {
          s.hitSet.add(e.uid);
          const ka = Math.atan2(s.fy, s.fx);
          hitEnemy(e, s.dmg, Math.cos(ka) * s.kb, Math.sin(ka) * s.kb, { crit: s.crit, critMul: s.critMul, lifesteal: s.lifesteal });
          if (s.lifesteal) part({ x: P.x + U.rand(-10, 10), y: P.y - 20, vy: -40, life: 0.7, size: 5, col: '#ff8fb5', kind: 'heart' });
        }
      }
      if (s.t >= s.life) U.swapRemove(G.slashes, i);
    }
  }

  /* ================= 子弹更新 ================= */
  function updateProjs(dt) {
    for (let i = G.projs.length - 1; i >= 0; i--) {
      const p = G.projs[i];
      p.t += dt;
      // 意见5：任何攻击都不跑到屏幕外面——投射物一离开视野（留 40px 余量）立即消失
      //（猫砂弹例外：起/落点都已按攻击上限钳在屏内，中途剔除会导致伤害区丢失）
      if (p.kind !== 'litter' &&
          (Math.abs(p.x - G.cam.x) > worldW / 2 + 40 || Math.abs(p.y - G.cam.y) > worldH / 2 + 40)) {
        U.swapRemove(G.projs, i);
        continue;
      }
      if (p.kind === 'note') {
        p.retarget -= dt;
        if (p.retarget <= 0 || !p.tgt || p.tgt.dieDone) { p.tgt = nearestEnemy(p.x, p.y, 900); p.retarget = 0.25; }
        if (p.tgt) {
          const a = Math.atan2(p.tgt.y - p.y, p.tgt.x - p.x);
          const ca = Math.atan2(p.vy, p.vx);
          const na = ca + U.angNorm(a - ca) * Math.min(1, dt * 7);
          const sp = Math.hypot(p.vx, p.vy) || p.speed;
          p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
        }
        const sp = Math.hypot(p.vx, p.vy);
        if (sp < p.speed) { p.vx *= 1 + dt * 4; p.vy *= 1 + dt * 4; }
        p.rot = Math.sin(p.t * 10) * 0.3;
      } else if (p.kind === 'fish') {
        p.rot = Math.atan2(p.vy, p.vx);
      } else if (p.kind === 'axe') {
        p.vy += p.grav * dt;
        p.rot += p.spin * dt;
        if (p.vy > 0 && p.y > p.startY + 90) { p.t = p.life + 1; }
      } else if (p.kind === 'litter') {
        const k = Math.min(1, p.t / p.T);
        p.x = U.lerp(p.sx, p.tx, k); p.y = U.lerp(p.sy, p.ty, k) - Math.sin(k * Math.PI) * p.arc;
        p.rot = k * 9;
        if (k >= 1) { // 落地
          if (G.zones.length >= FX.zoneMax) G.zones.shift(); // 同屏伤害区上限：移除最旧的，地面不被猫砂淹没
          G.zones.push({ x: p.tx, y: p.ty, r: p.zoneR, t: p.zoneT, maxT: p.zoneT, tickT: 0, dmg: p.dmg });
          queryGrid(p.tx, p.ty, p.zoneR, qbuf);
          for (const e of qbuf) {
            if (e.dieDone) continue;
            if (U.dist2(p.tx, p.ty, e.x, e.y) < (p.zoneR * 0.8 + e.r) * (p.zoneR * 0.8 + e.r)) hitEnemy(e, p.dmg, 0, 0, { noKb: true });
          }
          popStars(p.tx, p.ty, '#e4d7c2', 6);
          Sfx.sfx.hitThrottle(); // 落地音走统一节流，连发时不再糊成一片噪声
          U.swapRemove(G.projs, i);
          continue;
        }
      }
      if (p.kind !== 'litter') { p.x += p.vx * dt; p.y += p.vy * dt; }
      // 碰撞
      queryGrid(p.x, p.y, p.r + 30, qbuf);
      let dead = false;
      for (const e of qbuf) {
        if (e.dieDone) continue;
        if (p.hitSet && p.hitSet.has(e.uid)) continue;
        if (U.dist2(p.x, p.y, e.x, e.y) < (p.r + e.r) * (p.r + e.r)) {
          if (!p.hitSet) p.hitSet = new Set();
          p.hitSet.add(e.uid);
          const sp2 = Math.hypot(p.vx || 0, p.vy || 0) || 1;
          hitEnemy(e, p.dmg, (p.vx || 0) / sp2 * 90, (p.vy || 0) / sp2 * 90);
          p.pierce--;
          if (p.pierce <= 0) { dead = true; break; }
        }
      }
      if (dead || p.t >= p.life) U.swapRemove(G.projs, i);
    }
  }
  function updateZones(dt) {
    for (let i = G.zones.length - 1; i >= 0; i--) {
      const z = G.zones[i];
      z.t -= dt; z.tickT -= dt;
      if (z.tickT <= 0) {
        z.tickT = 0.42;
        queryGrid(z.x, z.y, z.r, qbuf);
        for (const e of qbuf) {
          if (e.dieDone) continue;
          if (U.dist2(z.x, z.y, e.x, e.y) < (z.r + e.r) * (z.r + e.r)) hitEnemy(e, z.dmg * 0.55, 0, 0, { noKb: true });
        }
      }
      if (z.t <= 0) U.swapRemove(G.zones, i);
    }
  }

  /* ================= 敌方羽毛弹 / 视线（意见6） ================= */
  // 手工地图两点间是否无墙体阻隔（鸽子吐羽毛前用；40px 步长抽样足够粗）
  function hasLoS(x0, y0, x1, y1) {
    if (!curMap) return true;
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(d / 40));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (curMap.code(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) === MAPS.T.BLOCK) return false;
    }
    return true;
  }
  function updateEprojs(dt) {
    const P = G.player;
    for (let i = G.eprojs.length - 1; i >= 0; i--) {
      const p = G.eprojs[i];
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t >= p.life ||
          Math.abs(p.x - G.cam.x) > worldW / 2 + 60 || Math.abs(p.y - G.cam.y) > worldH / 2 + 60) {
        U.swapRemove(G.eprojs, i); continue;
      }
      if (G.state === 'play' && U.dist2(p.x, p.y, P.x, P.y) < (p.r + P.r) * (p.r + P.r)) {
        damagePlayer(p.dmg);
        part({ x: p.x, y: p.y, life: 0.25, size: 12, col: '#f0ead8', kind: 'ring' });
        U.swapRemove(G.eprojs, i);
      }
    }
  }

  /* ================= 敌人更新 ================= */
  function updateEnemies(dt) {
    const P = G.player;
    const cap = trashCap(); // 远敌传送回收的补怪判断使用同一杂兵上限
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      if (e.dieDone) { U.swapRemove(G.enemies, i); continue; }
      e.flash -= dt; e.orbCd -= dt; e.faceT -= dt;
      // 「狂暴」词条：血量低于阈值后一次性提速增伤
      if (e.affEnrage && !e.enraged && e.hp <= e.maxHp * (DATA.ROUNDS.affixes.enrage.atFrac || 0.3)) {
        e.enraged = true;
        const A = DATA.ROUNDS.affixes.enrage;
        e.spd *= A.spd; e.dmg *= A.dmg; e.flash = 0.3;
        part({ x: e.x, y: e.y - e.r, life: 0.5, size: 30, col: '#ff6b81', kind: 'ring' });
      }
      if (e.slowT > 0) { e.slowT -= dt; } else e.slowF = 1;
      // 眨眼（生命感）
      e.blinkT -= dt;
      if (e.blinkT <= 0) { e.blinkA = 0.14; e.blinkT = U.rand(2.4, 5.5); }
      if (e.blinkA > 0) e.blinkA -= dt;
      // 清理太远的敌人（传送回包围圈）
      const pdx = P.x - e.x, pdy = P.y - e.y;
      const pd2 = pdx * pdx + pdy * pdy;
      const despawnR = Math.max(worldW, worldH) * 1.6;
      if (pd2 > despawnR * despawnR && !e.boss && !e.elite) {
        U.swapRemove(G.enemies, i);
        if (G.enemies.length < cap * 0.7) {
          const pt = edgePoint(60);
          spawnEnemy(e.type, pt.x, pt.y, false);
        }
        continue;
      }
      const dist = Math.sqrt(pd2) || 1;
      let dirx = pdx / dist, diry = pdy / dist;
      let sp = e.spd * e.slowF * (curMap ? curMap.speedAt(e.x, e.y) : 1); // 地形减速同样拖慢鼠群
      const def = e.def;
      if (def.zig) { // 麻雀 zigzag
        const px2 = -diry, py2 = dirx;
        const w2 = Math.sin(G.time * 5 + e.phase) * 0.7;
        dirx += px2 * w2; diry += py2 * w2;
        const l = Math.hypot(dirx, diry); dirx /= l; diry /= l;
      } else if (def.erratic) { // 蝙蝠乱窜
        e.phase -= dt;
        if (e.phase <= 0) { e.phase = U.rand(0.2, 0.45); e.wobble = U.rand(-1.2, 1.2); }
        const px2 = -diry, py2 = dirx;
        dirx += px2 * (e.wobble || 0); diry += py2 * (e.wobble || 0);
        const l = Math.hypot(dirx, diry); dirx /= l; diry /= l;
      } else if (def.lunge) { // 大鹅冲锋
        e.lungeCd -= dt;
        if (e.lungeT > 0) { e.lungeT -= dt; sp *= 2.6; }
        else if (dist < 220 && e.lungeCd <= 0) { e.lungeT = 0.5; e.lungeCd = 2.6; }
      } else if (e.boss) {
        if (e.mother) updateMother(e, dt);
        else updateBoss(e, dt, dist, dirx, diry);
        if (e.state !== 'chase') sp = 0; // 蓄力定身 / 冲刺自控位移
        sp *= e.slowF;
      }
      // 意见6：行为特性（杂兵与普通精英生效；头目级 boss/batchBoss 保持专一打法）
      const TR = DATA.CFG.enemyTraits;
      const trash = !e.boss && !e.batchBoss;
      if (trash && def.dash) { // 三花姐：黄圈预警定身 → 直线突进
        e.dashCd -= dt;
        if (e.dashSt === 1) {
          e.dashT -= dt; sp = 0;
          e.teleFx = (e.teleFx || 0) - dt;
          if (e.teleFx <= 0) { e.teleFx = 0.16; part({ x: e.x, y: e.y + 12, life: 0.32, size: 26, col: '#ffd34d', kind: 'ring' }); }
          if (e.dashT <= 0) { e.dashSt = 2; e.dashT = TR.dash.time; e.dashX = dirx; e.dashY = diry; Sfx.sfx.pop(); }
        } else if (e.dashSt === 2) {
          e.dashT -= dt;
          sp = e.spd * TR.dash.mul; dirx = e.dashX; diry = e.dashY;
          if (e.dashT <= 0) { e.dashSt = 0; e.dashCd = TR.dash.cd; }
        } else if (e.dashCd <= 0 && dist < TR.dash.range) {
          e.dashSt = 1; e.dashT = TR.dash.windup;
        }
      }
      if (trash && def.ranged) { // 鸽子：中距离吐羽毛（有墙隔着就不打）
        e.fireCd -= dt;
        if (e.fireCd <= 0 && dist > 90 && dist < TR.ranged.range) {
          e.fireCd = TR.ranged.cd * U.rand(0.85, 1.2);
          if (hasLoS(e.x, e.y, P.x, P.y)) {
            const fa = Math.atan2(P.y - e.y, P.x - e.x);
            G.eprojs.push({ x: e.x, y: e.y - 6, vx: Math.cos(fa) * TR.ranged.speed, vy: Math.sin(fa) * TR.ranged.speed,
              r: 7, dmg: e.dmg * TR.ranged.dmgMul, t: 0, life: TR.ranged.life, rot: fa });
            part({ x: e.x, y: e.y - e.r - 8, life: 0.22, size: 9, col: '#fff', kind: 'ring' });
            Sfx.sfx.pop();
          }
        }
      }
      if (trash && def.steal) { // 浣熊：主角不在跟前就先扑最近的鱼干吞掉
        e.stealT -= dt;
        if (e.stealT <= 0) {
          e.stealT = 0.25;
          e.tgtGem = null;
          if (dist > TR.steal.keep) {
            let bd = TR.steal.radius * TR.steal.radius;
            for (const g of G.gems) {
              const d2 = U.dist2(e.x, e.y, g.x, g.y);
              if (d2 < bd) { bd = d2; e.tgtGem = g; }
            }
          }
        }
        if (e.tgtGem && G.gems.indexOf(e.tgtGem) >= 0) {
          const gd = Math.hypot(e.tgtGem.x - e.x, e.tgtGem.y - e.y) || 1;
          dirx = (e.tgtGem.x - e.x) / gd; diry = (e.tgtGem.y - e.y) / gd;
          if (gd < TR.steal.eatR) {
            U.swapRemove(G.gems, G.gems.indexOf(e.tgtGem));
            e.tgtGem = null;
            goldFloat(e.x, e.y - 22, '咕！');
            popStars(e.x, e.y, '#9fe29a', 6);
            Sfx.sfx.pop();
          }
        }
      }
      if (trash && def.slime && sp > 4) { // 蜗牛：移动时身后留黏液（只拖慢主角）
        e.slimeT -= dt;
        if (e.slimeT <= 0) {
          e.slimeT = TR.slime.gap;
          if (G.slimes.length >= TR.slime.max) G.slimes.shift();
          G.slimes.push({ x: e.x, y: e.y + 8, r: TR.slime.r, t: TR.slime.life, maxT: TR.slime.life });
        }
      }
      // 分离（同格拥挤互推）
      queryGrid(e.x, e.y, e.r + 8, qbuf);
      let sepx = 0, sepy = 0, nsep = 0;
      for (const o of qbuf) {
        if (o === e || o.dieDone) continue;
        const dx = e.x - o.x, dy = e.y - o.y;
        const d2 = dx * dx + dy * dy;
        const rr2 = (e.r + o.r) * 0.9;
        if (d2 < rr2 * rr2 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          sepx += dx / d; sepy += dy / d;
          if (++nsep >= 5) break;
        }
      }
      if (nsep) {
        const l = Math.hypot(sepx, sepy) || 1;
        dirx = dirx * 0.82 + sepx / l * 0.35; diry = diry * 0.82 + sepy / l * 0.35;
      }
      // 位移（手工地图上绕墙滑动；猫道对敌人是墙）
      const mdx = (dirx * sp + e.kx) * dt, mdy = (diry * sp + e.ky) * dt;
      if (curMap) curMap.moveActor(e, mdx, mdy, false);
      else { e.x += mdx; e.y += mdy; }
      e.kx *= 1 - Math.min(1, dt * 7); e.ky *= 1 - Math.min(1, dt * 7);
      // 精英/批次头目卡墙自救：批次头目到不了主角面前 → 波次永远无法推进，必须兜底
      if (e.elite) bossUnstuck(e, dist, dt);
      // 碰撞玩家
      if (!e.dieDone && pd2 < (e.r + P.r) * (e.r + P.r)) {
        damagePlayer(e.dmg);
      }
    }
  }
  // Boss/精英/老鼠妈妈卡墙自救：视野扩大后生成距离翻倍，直线追人容易被楼房卡死——
  // 每秒抽查一次位移，连续卡住且离主角还远时，就地"抄近路"绕到主角附近（带传送演出）。
  // 位移阈值按自身移速缩放：蜗牛系精英移速只有 ~18px/s，固定阈值会把正常移动误判成卡死
  function bossUnstuck(e, dist, dt) {
    e.chkT = (e.chkT || 0) - dt;
    if (e.chkT > 0) return;
    e.chkT = 1;
    const moved = e.chkX != null ? Math.hypot(e.x - e.chkX, e.y - e.chkY) : 999;
    e.chkX = e.x; e.chkY = e.y;
    const expect = Math.max(24, e.spd * (e.slowF || 1) * (curMap ? curMap.speedAt(e.x, e.y) : 1));
    if (moved >= expect * 0.4 || dist < 220) { e.stuckN = 0; return; }
    e.stuckN = (e.stuckN || 0) + 1;
    if (e.stuckN < 2) return; // 连续 2 秒几乎没挪动才判定卡死
    e.stuckN = 0;
    const a2 = U.rand(0, TAU);
    let nx = G.player.x + Math.cos(a2) * 300, ny = G.player.y + Math.sin(a2) * 300;
    if (curMap) { const p2 = walkPoint(nx, ny, 500); nx = p2.x; ny = p2.y; }
    part({ x: e.x, y: e.y, life: 0.5, size: 60, col: '#cfd0ff', kind: 'ring' });
    e.x = nx; e.y = ny;
    part({ x: nx, y: ny, life: 0.5, size: 70, col: '#cfd0ff', kind: 'ring' });
    popStars(nx, ny, '#cfd0ff', 10);
    Sfx.sfx.boss();
  }
  function updateBoss(b, dt, dist, dirx, diry) {
    const F = DATA.CFG.finale;
    b.st -= dt;
    b.summonT -= dt;
    if (b.landT > 0) b.landT -= dt;
    if (b.state === 'entry') { // 从天而降
      b.entryT -= dt;
      if (b.entryT <= 0) {
        b.state = 'chase'; b.st = 1.6; b.landT = 0.28;
        addShake(14, true);
        part({ x: b.x, y: b.y + 20, life: 0.7, size: 90, col: '#cfd0ff', kind: 'ring' });
        for (let i = 0; i < 14; i++) {
          const a2 = U.rand(0, TAU);
          part({ x: b.x + Math.cos(a2) * 30, y: b.y + 24, vx: Math.cos(a2) * U.rand(60, 160), vy: -U.rand(30, 120), life: U.rand(0.3, 0.7), size: U.rand(3, 7), col: '#8d93aa', kind: 'dot', grav: 300 });
        }
        Sfx.sfx.bigPop();
      }
      return;
    }
    if (b.state === 'chase') {
      bossUnstuck(b, dist, dt);
      if (b.summonT <= 0) {
        b.summonT = F.bossSummonCd;
        banner('鼠王：吱吱吱！孩子们上！', 2);
        for (let i = 0; i < F.bossSummonN; i++) {
          const a = U.rand(0, TAU);
          const r = spawnEnemy('rat', b.x + Math.cos(a) * 60, b.y + Math.sin(a) * 60, false);
          r.hp *= F.bossSummonHpMul; r.maxHp = r.hp;
        }
      }
      if (dist < F.bossChargeDist && b.st <= 0) { b.state = 'tele'; b.st = F.bossTeleTime; }
    } else if (b.state === 'tele') {
      if (b.st <= 0) {
        b.state = 'charge'; b.st = F.bossChargeTime;
        b.cvx = dirx * b.spd * F.bossChargeMul; b.cvy = diry * b.spd * F.bossChargeMul;
        Sfx.sfx.boss();
      }
    } else if (b.state === 'charge') {
      if (curMap) curMap.moveActor(b, b.cvx * dt, b.cvy * dt, false);
      else { b.x += b.cvx * dt; b.y += b.cvy * dt; }
      if (U.chance(0.5)) part({ x: b.x + U.rand(-20, 20), y: b.y + 30, vy: -30, life: 0.4, size: 6, col: '#8d93aa', kind: 'dot' });
      if (b.st <= 0) { b.state = 'chase'; b.st = 2.2; }
    }
  }

  /* ================= 玩家 ================= */
  function healPlayer(v) {
    const P = G.player;
    P.hp = Math.min(P.maxHp, P.hp + v);
  }
  function damagePlayer(d) {
    const P = G.player;
    if (P.iframes > 0 || G.state !== 'play') return;
    P.hp -= d;
    P.iframes = DATA.PLAYER.iframes;
    P.hurtT = 0.25;
    addShake(7, true);
    G.flash = 0.25;
    Sfx.sfx.playerHurt();
    Sfx.meow('hurt');
    dmgNum(P.x, P.y - 26, d, false);
    popStars(P.x, P.y - 10, '#ff8f9f', 5);
    if (P.hp <= 0) { P.hp = 0; startDying(); }
  }
  function updatePlayer(dt) {
    const P = G.player;
    // 老鼠妈妈全屏斩控制链：眩晕（不能动）→ 缴械（能动但武器停，updateWeapons 处理）
    if (P.stunT > 0) P.stunT -= dt;
    if (P.disarmT > 0) P.disarmT -= dt;
    let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    let iy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    if (joy.on) { ix = joy.x; iy = joy.y; }
    if (P.stunT > 0) { ix = 0; iy = 0; }
    const l = Math.hypot(ix, iy);
    P.moving = l > 0.15;
    // 老鼠妈妈全屏斩减速（等同踩到减速地面）+ 地形减速（草地/沙地/深雪/落叶）+ 70级后移速成长
    if (P.slowT > 0) { P.slowT -= dt; if (P.slowT <= 0) P.slowF = 1; }
    // 意见6：蜗牛黏液带踩上去额外减速（与地形减速叠乘）
    let slimeMul = 1;
    const SLT = (DATA.CFG.enemyTraits || {}).slime;
    if (SLT) for (const s of G.slimes) {
      if (U.dist2(P.x, P.y, s.x, s.y) < (s.r + 10) * (s.r + 10)) { slimeMul = Math.min(slimeMul, SLT.slow); break; }
    }
    const terMul = (curMap ? curMap.speedAt(P.x, P.y) : 1) * (P.slowT > 0 ? (P.slowF || 1) : 1) * (P.spdMul || 1) * slimeMul;
    // 移动加速曲线：渐起渐停，走起来更"软"
    const acc = Math.min(1, dt * 11), dec = Math.min(1, dt * 13);
    if (P.moving) {
      ix /= Math.max(1, l); iy /= Math.max(1, l);
      P.vx = U.lerp(P.vx, ix * DATA.PLAYER.speed * terMul, acc);
      P.vy = U.lerp(P.vy, iy * DATA.PLAYER.speed * terMul, acc);
      P.fx = ix; P.fy = iy;
      if (Math.abs(ix) > 0.2) P.flip = ix < 0;
      P.walkT += dt * Math.min(1.3, Math.hypot(P.vx, P.vy) / DATA.PLAYER.speed + 0.35);
      // 减速地形扬尘
      G.dustT -= dt;
      if (terMul < 1 && G.dustT <= 0) {
        G.dustT = 0.16;
        part({ x: P.x + U.rand(-8, 8), y: P.y + 20, vx: U.rand(-12, 12), vy: -U.rand(10, 26), life: 0.5, size: 3, col: (curMap && curMap.meta.dust) || '#cfd8e8', kind: 'dot' });
      }
    } else {
      P.vx = U.lerp(P.vx, 0, dec); P.vy = U.lerp(P.vy, 0, dec);
    }
    // 手工地图：碰撞滑动（猫可以走猫道）
    if (curMap) curMap.moveActor(P, P.vx * dt, P.vy * dt, true);
    else { P.x += P.vx * dt; P.y += P.vy * dt; }
    // 第一次踏上猫道：教学提示
    if (curMap && !G.catHint && curMap.code(P.x, P.y) === MAPS.T.CAT) {
      G.catHint = true;
      banner('🐾 猫道！只有你能钻过去，鼠群进不来～', 2.8);
      Sfx.meow('idle');
    }
    P.iframes -= dt; P.hurtT -= dt;
    // 眨眼
    P.blinkT -= dt;
    if (P.blinkT <= 0) { P.blinkA = 0.13; P.blinkT = U.rand(2.2, 5); }
    if (P.blinkA > 0) P.blinkA -= dt;
    if (mods.regen) healPlayer(mods.regen * dt);
    // 闲置喵叫（真实采样）：间隔拉大，时不时来一声就好
    G.idleMeowT -= dt;
    if (G.idleMeowT <= 0) {
      G.idleMeowT = U.rand(14, 26);
      Sfx.meow('idle');
      heartAt(P.x + 14 * (P.flip ? -1 : 1), P.y - 34);
    }
  }

  /* ================= 拾取更新 ================= */
  function updatePickups(dt) {
    const P = G.player;
    const pickR = DATA.PLAYER.pickupR * mods.pickMult;
    // 鱼干
    for (let i = G.gems.length - 1; i >= 0; i--) {
      const g = G.gems[i];
      g.t += dt;
      const d2 = U.dist2(P.x, P.y, g.x, g.y);
      if (g.vac || d2 < pickR * pickR) {
        const d = Math.sqrt(d2) || 1;
        const pull = g.vac ? 700 : 380 + (1 - Math.min(1, d / pickR)) * 520; // 越近吸得越快
        g.vx = (P.x - g.x) / d * pull; g.vy = (P.y - g.y) / d * pull;
        g.x += g.vx * dt; g.y += g.vy * dt;
        if (d < 20) {
          addXp(g.val);
          G.gemCombo++; G.gemComboT = 1;
          Sfx.sfx.gem(G.gemCombo);
          U.swapRemove(G.gems, i);
        }
      } else {
        g.x += g.vx * dt; g.y += g.vy * dt;
        g.vx *= 1 - Math.min(1, dt * 6); g.vy *= 1 - Math.min(1, dt * 6);
      }
    }
    G.gemComboT -= dt;
    if (G.gemComboT <= 0) G.gemCombo = 0;
    // 其他掉落
    for (let i = G.pickups.length - 1; i >= 0; i--) {
      const p = G.pickups[i];
      p.t += dt;
      const pdx2 = U.dist2(P.x, P.y, p.x, p.y);
      if (p.vac || pdx2 < (pickR * 0.8 + 14) * (pickR * 0.8 + 14)) {
        const d = Math.sqrt(pdx2) || 1;
        const pull = p.vac ? 700 : 260; // 被吸尘器盯上的金币：全场高速飞向主角
        p.x += (P.x - p.x) / d * pull * dt; p.y += (P.y - p.y) / d * pull * dt;
      }
      if (U.dist2(P.x, P.y, p.x, p.y) < 26 * 26) {
        if (p.kind === 'coin') { G.gold += Math.round(U.randInt(3, 8) * DATA.DIFF.goldGain); Sfx.sfx.coin(); coinLottery(p.x, p.y); }
        else if (p.kind === 'milk') { healPlayer(DATA.CFG.drops.milkHeal); Sfx.sfx.milk(); heartAt(P.x, P.y - 30); part({ x: P.x, y: P.y - 20, life: 0.6, size: 26, col: '#bfe3ff', kind: 'ring' }); }
        else if (p.kind === 'firework') {
          Sfx.sfx.firework();
          G.flash = 0.5; addShake(12, true);
          part({ x: P.x, y: P.y, life: 0.5, size: 60, col: '#ffd34d', kind: 'ring' });
          for (const e of G.enemies) {
            if (e.dieDone) continue;
            if (Math.abs(e.x - P.x) < worldW / 2 + 60 && Math.abs(e.y - P.y) < worldH / 2 + 60) hitEnemy(e, DATA.CFG.drops.fireworkDmg, 0, 0, { noKb: true });
          }
        } else if (p.kind === 'vacuum') {
          Sfx.sfx.vacuum();
          for (const g of G.gems) g.vac = true;
          for (const o of G.pickups) if (o.kind === 'coin') o.vac = true; // 意见4：吸小鱼干时金币一起吸
          part({ x: P.x, y: P.y, life: 0.8, size: 40, col: '#9fe29a', kind: 'ring' });
        }
        U.swapRemove(G.pickups, i);
      }
    }
    // 宝箱
    for (let i = G.chests.length - 1; i >= 0; i--) {
      const c = G.chests[i];
      c.t += dt;
      if (!c.taken && U.dist2(P.x, P.y, c.x, c.y) < DATA.CFG.chest.radius * DATA.CFG.chest.radius) {
        c.taken = true;
        U.swapRemove(G.chests, i);
        // 开箱小演出：光柱 + 彩纸，稍候弹面板
        part({ x: c.x, y: c.y, life: 0.8, size: 40, col: '#ffe9a8', kind: 'ring' });
        beamAt(c.x, c.y - 10, '#ffe9a8');
        popStars(c.x, c.y, '#ffd34d', 16);
        Sfx.sfx.chest();
        G.after.push({ t: 0.4, fn: () => openChest(!!c.mother) });
      }
    }
  }

  /* ================= 金币经验规则 ================= */
  // 拾到金币 → 均匀随机查 lottery.tiers 定档：单枚经验 = 档位% × 当前等级升级所需经验（80% 封顶）。
  // 绝大部分落在最小的 1%，极少到 30%，非常罕见到 80%；幸运（锦鲤）放大非最小档概率。
  function rollLotteryTier() {
    const L = DATA.LOTTERY;
    const tiers = L.tiers || [];
    if (!tiers.length) return 0.01;
    const minPct = tiers[tiers.length - 1].pct;
    const luck = mods ? (mods.luck || 0) : 0;
    const boost = 1 + luck * (L.luckBoost || 1);
    let total = 0;
    const eff = tiers.map(t => {
      const p = t.pct === minPct ? t.p : t.p * boost;
      total += p;
      return { pct: t.pct, p };
    });
    let r = Math.random() * total;
    for (const t of eff) { if (r < t.p) return t.pct; r -= t.p; }
    return minPct;
  }
  function applyLottery(pct, x, y) {
    const need = DATA.xpNeed(G.player.lv || 1);
    const v = Math.max(1, Math.round(need * pct));
    addXp(v);
    if (pct >= 0.10) {
      // ≥10%：金币大奖式演出（数值直达，演出加强）
      popStars(x, y, '#ffd34d', 18);
      part({ x, y, life: 0.7, size: 55, col: '#ffd34d', kind: 'ring' });
      goldFloat(x, y - 16, (Math.round(pct * 100)) + '% 经验 +' + v);
      Sfx.sfx.chest();
      if (pct >= 0.80) { G.flash = 0.35; addShake(8, true); Sfx.sfx.firework(); }
    } else {
      goldFloat(x, y - 14, '+' + v);
    }
    return v;
  }
  function coinLottery(x, y) {
    applyLottery(rollLotteryTier(), x, y);
  }
  function addXp(v) {
    const P = G.player;
    const PL = DATA.CFG.postLevel || {};
    P.xp = (P.xp || 0) + v * DATA.DIFF.xpGain * ((G.roundMods && G.roundMods.xpMul) || 1);
    let need = DATA.xpNeed(P.lv || 1);
    while (P.xp >= need) {
      const nl = (P.lv || 1) + 1;
      if (PL.chestOnlyFrom != null && nl > PL.chestOnlyFrom) break; // 80 级后：经验攒着，只能靠宝箱结算升级
      P.xp -= need;
      P.lv = nl;
      if (PL.autoFrom != null && nl >= PL.autoFrom) applyPostGrow(); // 70 级起：自动成长（+2% 生命/+1% 移速/回满），不再弹三选一
      else G.pendingLv++;
      need = DATA.xpNeed(P.lv);
    }
    if (G.pendingLv > 0 && G.state === 'play') openLevelUp();
  }

  /* ================= 升级 3 选 1 ================= */
  let lvlChoices = [];
  // 专有被动门槛：被动是武器进化的钥匙（evoPassive 配对）——没拥有对应武器前不进卡池；
  // 武器选满后拿不到新武器，未拥有武器的专有被动随之绝迹。无配对的通用被动（磁铁鱼/锦鲤）不受限。
  function passiveOffered(id) {
    let paired = false;
    for (const wid of WEAPON_ORDER) {
      if ((WEAPONS[wid] || {}).evoPassive !== id) continue;
      paired = true;
      if (G.player.weapons.find(w => w.id === wid)) return true;
    }
    return !paired;
  }
  function buildPool() {
    const P = G.player;
    const pool = [];
    for (const w of P.weapons) if (!w.evolved && w.lv < WEAPONS[w.id].maxLv) pool.push({ kind: 'w', id: w.id, cur: w });
    // 武器上限：默认猫爪不计入，猫爪外最多再选 slots.weapon 种
    const pickedW = P.weapons.filter(w => w.id !== 'claw').length;
    if (pickedW < DATA.SLOTS.weapon)
      for (const id of WEAPON_ORDER) if (!P.weapons.find(w => w.id === id)) pool.push({ kind: 'w', id, cur: null });
    for (const p of P.passives) if (p.lv < PASSIVES[p.id].maxLv) pool.push({ kind: 'p', id: p.id, cur: p });
    if (P.passives.length < DATA.SLOTS.passive)
      for (const id of PASSIVE_ORDER) if (!P.passives.find(p => p.id === id) && passiveOffered(id)) pool.push({ kind: 'p', id, cur: null });
    return pool;
  }
  function openLevelUp() {
    G.state = 'levelup';
    Sfx.sfx.lvl();
    Sfx.meow('happy');
    const pool = buildPool();
    const idx = U.pickIndices(pool.length, 3); // 洗牌抽 3 张（不足 3 张时全出）
    lvlChoices = idx.map(i => pool[i]);
    // 意见1：升级三选一不再出现猫爪印（70 级后只通过宝箱发放）；常规卡也抽空了才给安慰奖
    if (!lvlChoices.length) lvlChoices = [{ kind: 'heal' }];
    const cards = lvlChoices.map(c => {
      let tag, name, desc, iconKey, pips = 0, pipsMax = 0, tagCls = '';
      if (c.kind === 'w') {
        const def = WEAPONS[c.id];
        if (c.cur) {
          tag = `Lv ${c.cur.lv} → ${c.cur.lv + 1}`;
          desc = def.gain[c.cur.lv];
          pips = c.cur.lv + 1; pipsMax = def.maxLv;
          if (c.cur.lv + 1 >= def.maxLv && passLv(def.evoPassive) > 0) { tagCls = 'evo'; tag = '满级！可进化 →'; }
        } else { tagCls = 'new'; tag = '新武器！'; desc = def.desc; pips = 1; pipsMax = def.maxLv; }
        name = def.name; iconKey = def.icon;
      } else if (c.kind === 'p') {
        const def = PASSIVES[c.id];
        if (c.cur) { tag = `Lv ${c.cur.lv} → ${c.cur.lv + 1}`; pips = c.cur.lv + 1; pipsMax = def.maxLv; }
        else { tagCls = 'new'; tag = '新道具！'; pips = 1; pipsMax = def.maxLv; }
        name = def.name; desc = def.desc; iconKey = def.icon;
      } else if (c.kind === 's') {
        const meta = STAMP_META[c.id];
        const stacks = stampStacks(c.id);
        tagCls = 'stamp';
        tag = stacks > 0 ? `猫爪印 ×${stacks} → ×${stacks + 1}` : '新猫爪印！';
        name = meta.name;
        desc = stampEffectText(c.id, stacks + 1);
        iconKey = meta.icon;
      } else { tagCls = 'new'; tag = '安慰奖'; name = '金枪鱼罐头'; desc = '回复 30 生命 + 100 金币'; iconKey = 'milkIcon'; }
      return { kind: c.kind, tag, name, desc, icon: iconKey ? Art.icons[iconKey] : null, pips, pipsMax, tagCls, stacks: c.kind === 's' ? stampStacks(c.id) : 0 };
    });
    MUI.showLevelUp(cards, i => chooseCard(i));
  }
  function chooseCard(i) {
    if (G.state !== 'levelup') return;
    const c = lvlChoices[i];
    if (!c) return;
    Sfx.sfx.click();
    const P = G.player;
    if (c.kind === 'w') {
      if (c.cur) c.cur.lv++;
      else P.weapons.push({ id: c.id, lv: 1, t: 0.3, state: 0 });
    } else if (c.kind === 'p') {
      if (c.cur) c.cur.lv++;
      else P.passives.push({ id: c.id, lv: 1 });
      calcMods();
    } else if (c.kind === 's') {
      const af = P.affixes.find(a => a.id === c.id);
      if (af) af.stacks++;
      else P.affixes.push({ id: c.id, stacks: 1 });
      calcMods();
    } else {
      healPlayer(30); G.gold += 100;
    }
    G.pendingLv--;
    MUI.closeLevelUp();
    if (G.pendingLv > 0) { openLevelUp(); return; }
    G.state = 'play';
    // 升级光柱演出
    const PP = G.player;
    beamAt(PP.x, PP.y - 6, '#a8ecff');
    heartAt(PP.x + 12 * (PP.flip ? -1 : 1), PP.y - 42);
  }

  /* ================= 宝箱 ================= */
  function openChest(isMother) {
    G.state = 'chest';
    const P = G.player;
    applyChestLevels(); // 80 级后攒下的经验：开宝箱时一次结算成等级（+2% 生命/+1% 移速/回满）
    const luck = mods.luck;
    // 进化优先
    const evoW = P.weapons.find(w => evoEligible(w));
    const rewards = [];
    let count = 1;
    const CH = DATA.CFG.chest;
    if (isMother) count = Math.max(1, DATA.CFG.finale.motherChestN || 5); // 老鼠妈妈宝箱：必定最多 N 件
    else {
      const p5 = CH.p5 + luck * CH.luckP5, p3 = CH.p3 + luck * CH.luckP3;
      if (U.chance(p5)) count = 5; else if (U.chance(p3)) count = 3;
    }
    if (evoW) {
      rewards.push({ type: 'evo', w: evoW });
    }
    let upgradable = () => {
      const list = [];
      for (const w of P.weapons) if (!w.evolved && w.lv < WEAPONS[w.id].maxLv) list.push({ kind: 'w', ref: w, id: w.id });
      for (const p of P.passives) if (p.lv < PASSIVES[p.id].maxLv) list.push({ kind: 'p', ref: p, id: p.id });
      return list;
    };
    const nUp = count - (evoW ? 1 : 0);
    const usedStamps = [];
    const stampOk = () => (P.lv || 1) >= DATA.CFG.stamps.minLevel;
    // 老鼠妈妈宝箱必定不含金币：金币位由 猫爪印 → 可升级项 → 牛奶回血 兜底
    const goldFallback = () => {
      if (stampOk()) {
        const sid = pickStampId(usedStamps);
        if (sid) { usedStamps.push(sid); rewards.push({ type: 's', id: sid }); return; }
      }
      const list = upgradable();
      if (list.length) { const pick = U.pick(list); rewards.push({ type: pick.kind, ref: pick.ref, id: pick.id }); return; }
      rewards.push({ type: 'heal' });
    };
    for (let i = 0; i < nUp; i++) {
      const list = upgradable();
      if (list.length) {
        // 印卡概率 = 常规奖励位概率 × share（与三选一同源的类别模型；印卡只出自宝箱）
        const sid = stampOk() && U.chance(DATA.CFG.stamps.share / (1 + DATA.CFG.stamps.share)) ? pickStampId(usedStamps) : null;
        if (sid) { usedStamps.push(sid); rewards.push({ type: 's', id: sid }); continue; }
        const pick = U.pick(list);
        rewards.push({ type: pick.kind, ref: pick.ref, id: pick.id });
      } else if (isMother) {
        goldFallback();
      } else if (stampOk() && U.chance(DATA.CFG.stamps.chestAffix)) {
        // 无可升级项：60% 出猫爪印（无尽期的硬通货），其余金币位
        const sid = pickStampId(usedStamps);
        if (sid) { usedStamps.push(sid); rewards.push({ type: 's', id: sid }); continue; }
        rewards.push({ type: 'gold' });
      } else {
        rewards.push({ type: 'gold' });
      }
    }
    // 呈现：奖励行 → MUI 宝箱面板（同一奖励抽中多次会逐行显示递进等级，每次都是真实+1级）
    G.evoPending = rewards.some(r => r.type === 'evo');
    Sfx.meow('chest');
    const rows = [];
    const applyLater = [];
    const lvlPreview = new Map();
    const stampPreview = new Map();
    rewards.forEach(r => {
      let name, desc, iconKey;
      if (r.type === 'evo') {
        const def = WEAPONS[r.w.id];
        name = `✨ ${def.name} → ${evoName(r.w.id)} ✨`;
        desc = def.descEvo;
        iconKey = def.iconEvo;
        applyLater.push(() => evolveWeapon(r.w));
      } else if (r.type === 'w') {
        const def = WEAPONS[r.id];
        const from = lvlPreview.has(r.ref) ? lvlPreview.get(r.ref) : r.ref.lv;
        lvlPreview.set(r.ref, from + 1);
        name = def.name; desc = `威力提升！Lv ${from} → ${from + 1}`;
        iconKey = def.icon;
        applyLater.push(() => { r.ref.lv++; });
      } else if (r.type === 'p') {
        const def = PASSIVES[r.id];
        const from = lvlPreview.has(r.ref) ? lvlPreview.get(r.ref) : r.ref.lv;
        lvlPreview.set(r.ref, from + 1);
        name = def.name; desc = `效果增强！Lv ${from} → ${from + 1}`;
        iconKey = def.icon;
        applyLater.push(() => { r.ref.lv++; calcMods(); });
      } else if (r.type === 's') {
        const meta = STAMP_META[r.id];
        const cur = stampPreview.has(r.id) ? stampPreview.get(r.id) : stampStacks(r.id);
        stampPreview.set(r.id, cur + 1);
        name = '🐾 ' + meta.name + ' ×' + (cur + 1);
        desc = stampEffectText(r.id, cur + 1);
        iconKey = meta.icon;
        applyLater.push(() => {
          const af = P.affixes.find(a => a.id === r.id);
          if (af) af.stacks++;
          else P.affixes.push({ id: r.id, stacks: 1 });
          calcMods();
        });
      } else if (r.type === 'heal') { // 老鼠妈妈宝箱的兜底奖励位（无印可出、无可升级项时）
        name = '鲜奶 ×1';
        desc = '回复 ' + DATA.CFG.drops.milkHeal + ' 生命';
        iconKey = 'milkIcon';
        applyLater.push(() => { healPlayer(DATA.CFG.drops.milkHeal); heartAt(P.x, P.y - 30); });
      } else { // 金币位：恰好 1 枚金币 → 按金币经验规则抽奖折算，行内直接显示结果
        const pct = rollLotteryTier();
        const v = Math.max(1, Math.round(DATA.xpNeed(P.lv || 1) * pct));
        name = '金币 ×1';
        desc = pct >= 0.10 ? `💥 抽中经验 ${Math.round(pct * 100)}% 大奖！（+${v}）`
                           : `抽奖 → 经验 +${Math.round(pct * 100)}%（+${v}）`;
        iconKey = null;
        applyLater.push(() => applyLottery(pct, P.x, P.y - 10));
      }
      rows.push({ name, desc, icon: iconKey ? (Art.icons[iconKey] || Art.items.gem3) : Art.items.coin });
    });
    // 立即结算属性（与 H5 版一致：统一立即应用）
    for (const f of applyLater) f();
    MUI.showChest(rows, onChestOkPanel);
    if (rewards.some(r => r.type === 'evo')) { setTimeout(() => { Sfx.sfx.evolve(); Sfx.meow('happy'); }, 550); }
  }
  function onChestOkPanel() {
    Sfx.sfx.click();
    MUI.setScreen(null);
    G.state = 'play';
    if (G.evoPending) { // 进化全屏演出
      G.evoPending = false;
      const PP = G.player;
      G.flash = 0.5; G.timeScale = 0.35; G.slowmoT = 0.7;
      beamAt(PP.x, PP.y - 6, '#ffbfe0');
      part({ x: PP.x, y: PP.y, life: 0.9, size: 110, col: '#ff9dc3', kind: 'ring' });
      part({ x: PP.x, y: PP.y, life: 1.1, size: 70, col: '#ffe9a8', kind: 'ring' });
      popStars(PP.x, PP.y, '#ff9dc3', 26);
      addShake(8, true);
    }
    if (G.pendingLv > 0) openLevelUp();
  }
  const EVO_NAMES = {
    sakura: '樱花爆爪', ultra: '超声波', fishstorm: '千鱼风暴', tunarain: '金枪鱼雨',
    planet: '星球毛线', aurastorm: '猫薄荷风暴', littermeteor: '猫砂流星雨', thunderpuff: '雷霆炸毛'
  };
  function evoName(baseId) {
    return EVO_NAMES[WEAPONS[baseId].evo] || WEAPONS[baseId].evo;
  }
  function evolveWeapon(w) {
    const def = WEAPONS[w.id];
    // 用进化形态替换：直接在实例上记录 evolved，并保留原 id 以便查表
    w.evolved = true;
    w.evoFrom = w.id;
    w.dispName = evoName(w.id);
    w.t = 0.3; w.state = 0;
    popStars(G.player.x, G.player.y - 20, '#ff8fb5', 16);
    part({ x: G.player.x, y: G.player.y, life: 0.7, size: 50, col: '#ffd9e6', kind: 'ring' });
  }

  /* ================= 生成器 =================
     双时间轴：G.waveT = 内容时间轴（精英/事件/批次头目降临/怪种表——头目被打死就快进，打得快轮次更短）；
     G.roundTime = 真实时间（强度成长与同屏上限按它走，性能保护不破）。
     杂兵数量另乘轮间乘数 G.countMul = ×2^(轮次-1)（只作用杂兵，boss/精英/事件不受影响）。 */
  // 杂兵同屏上限：轮内成长曲线 × 轮间数量乘数，钳在性能硬顶内
  function trashCap() {
    return Math.min(DATA.CFG.growth.countHardMax || 480, DATA.aliveCap(G.roundTime) * (G.countMul || 1));
  }
  function updateSpawner(dt) {
    const R = DATA.ROUNDS, M = G.roundMods;
    G.spawnT -= dt;
    const cap = trashCap();
    if (G.spawnT <= 0) {
      G.spawnT = DATA.spawnEvery(G.roundTime) * (M ? M.spawn : 1);
      const batchN = Math.min(DATA.CFG.growth.countBatchPerTick || 64, DATA.spawnBatch(G.roundTime) * (G.countMul || 1));
      const mix = DATA.mixAt(G.waveT + (M ? M.mixMin : 0) * 60); // 波次表起点随轮次后移
      const types = [];
      for (const k in mix) for (let i = 0; i < mix[k]; i++) types.push(k);
      const d = Math.hypot(worldW, worldH) / 2 + 50;
      for (let i = 0; i < batchN; i++) {
        if (G.enemies.length >= cap) break;
        const pt = edgePoint(50);
        spawnEnemy(U.pick(types), pt.x, pt.y, false);
      }
    }
    // 精英（宝箱）
    while (G.elitesDone < DATA.ELITES.length && G.waveT >= DATA.ELITES[G.elitesDone].t) {
      const el = DATA.ELITES[G.elitesDone++];
      const pt = edgePoint(60);
      spawnEnemy(el.type, pt.x, pt.y, true);
      banner('⚠ 出现了精英敌人！打倒它开宝箱！', 2.6);
    }
    // 事件
    while (G.eventsDone < DATA.EVENTS.length && G.waveT >= DATA.EVENTS[G.eventsDone].t) {
      const ev = DATA.EVENTS[G.eventsDone++];
      const count = Math.max(2, Math.round(ev.count * (M ? M.eventMul : 1)));
      banner(ev.msg, 3);
      if (ev.type === 'ring') {
        const rx = worldW / 2 + 40, ry = worldH / 2 + 40;
        for (let i = 0; i < count; i++) {
          const a = i / count * TAU;
          spawnEnemy(ev.enemy, G.player.x + Math.cos(a) * rx, G.player.y + Math.sin(a) * ry, false);
        }
      } else if (ev.type === 'line') {
        const d = worldW / 2 + 60;
        for (let i = 0; i < count; i++) {
          spawnEnemy(ev.enemy, G.player.x + d, G.player.y + (i - count / 2) * 70, false);
        }
      }
    }
    // 批次头目：批次进度达到 bossFrac 比例时降临（按内容时间轴）
    if (!G.batchBossSpawned && G.batch < R.batchCount && G.waveT >= (G.batch + R.bossFrac) * R.batchLen) {
      G.batchBossSpawned = true;
      spawnBatchBoss();
    }
    // 轮Boss：最后一批头目被讨伐后降临
    if (G.roundBossPending && !G.bossSpawned && G.bossWarn <= 0) {
      G.roundBossPending = false;
      G.bossSpawned = true;
      G.bossWarn = DATA.CFG.finale.bossWarn;
      G.pendingBossAffixes = pickAffixes(M ? M.bossAffix : 0, [], true);
      const aff = G.pendingBossAffixes.map(id => (R.affixes[id] || {}).name || id).join('·');
      Sfx.sfx.boss();
      banner('☠ 喵都之敌 · 鼠王·铁须' + (aff ? '【' + aff + '】' : '') + ' 降临！ ☠', 2.8);
    }
    if (G.bossWarn > 0) {
      G.bossWarn -= dt;
      if (G.bossWarn <= 0) spawnBoss(G.pendingBossAffixes);
    }
    // 老鼠妈妈：第 3 轮鼠王被讨伐后降临（压轴）
    if (G.motherWarnT > 0) {
      G.motherWarnT -= dt;
      if (G.motherWarnT <= 0) spawnMother();
    }
  }

  /* ================= 死亡 / 胜利 ================= */
  function startDying() {
    if (G.motherDone) return; // 老鼠妈妈已被讨伐：本局必定成功结算，不再翻转为失败
    G.state = 'dying';
    G.dyingT = 1.6;
    Sfx.meow('death', { force: true });
    Sfx.bgmStop();
    setTimeout(() => Sfx.sfx.gameOver(), 700);
    G.timeScale = 0.35;
    popStars(G.player.x, G.player.y, '#ffb066', 14);
  }
  function saveBest() {
    const b = U.storage.get('meow_best', { time: 0, kills: 0, gold: 0, rounds: 0 });
    if (G.time > b.time) b.time = Math.floor(G.time);
    if (G.kills > b.kills) b.kills = G.kills;
    if (G.gold > b.gold) b.gold = G.gold;
    if (G.round > (b.rounds || 0)) b.rounds = G.round;
    U.storage.set('meow_best', b);
    return b;
  }
  // 统一结算：成功（收工）与失败（倒下）共用同一张面板，只有标题/文案不同
  function collectResult(win) {
    // 把最后不满一秒的伤害桶也计入峰值
    if (G.secDmg > G.peakSec) G.peakSec = G.secDmg;
    return {
      win, round: G.round, time: G.time, lv: G.player.lv || 1, kills: G.kills, gold: G.gold,
      dmgTotal: G.dmgTotal, dps: G.time > 0 ? G.dmgTotal / G.time : 0, peakSec: G.peakSec,
      motherTTK: G.motherTTK || 0,
      diedToMother: !win && G.motherActive && !G.motherDone,
      weapons: G.player.weapons.map(w => ({ id: w.id, lv: w.lv, evolved: !!w.evolved })),
      passives: G.player.passives.map(p => ({ id: p.id, lv: p.lv })),
      affixes: (G.player.affixes || []).map(a => ({ id: a.id, stacks: a.stacks })),
      date: new Date()
    };
  }
  function showResult(win) {
    G.state = 'over';
    const data = collectResult(win);
    const b = saveBest();
    data.best = b;
    showResultPanel(data);
    if (win) { Sfx.sfx.victory(); Sfx.meow('happy'); }
  }
  function gameOver() { showResult(false); }

  /* ================= 主更新 ================= */
  function update(dt) {
    G.time += dt;
    G.roundTime += dt;
    G.waveT += dt; // 内容时间轴（精英/事件/头目降临按它推进；头目被讨伐时快进）
    // 最高秒伤：游戏时间每跨过 1 秒，把刚结束的整秒伤害桶与峰值比较
    const si = Math.floor(G.time);
    if (si !== G.secIdx) {
      if (G.secIdx >= 0 && G.secDmg > G.peakSec) G.peakSec = G.secDmg;
      G.secIdx = si; G.secDmg = 0;
    }
    const P = G.player;
    G.rsHpSum += Math.max(0, P.hp / P.maxHp); G.rsHpN++; // 血线采样（动态难度输入）
    updatePlayer(dt);
    rebuildGrid();
    updateSpawner(dt);
    updateWeapons(dt);
    updateSlashes(dt);
    updateProjs(dt);
    updateZones(dt);
    updateEprojs(dt); // 意见6：鸽子羽毛弹
    // 蜗牛黏液带老化
    for (let i = G.slimes.length - 1; i >= 0; i--) { G.slimes[i].t -= dt; if (G.slimes[i].t <= 0) U.swapRemove(G.slimes, i); }
    updateEnemies(dt);
    updatePickups(dt);
    updateFx(dt); // 粒子 / 飘字（雷电、开箱特效、伤害数字等，需随游戏时间老化消失）
    // after 队列（延迟挥击等）
    for (let i = G.after.length - 1; i >= 0; i--) {
      const a = G.after[i];
      a.t -= dt;
      if (a.t <= 0) { a.fn(); U.swapRemove(G.after, i); }
    }
    // 相机
    G.cam.x = U.lerp(G.cam.x, P.x, Math.min(1, dt * 6));
    G.cam.y = U.lerp(G.cam.y, P.y, Math.min(1, dt * 6));
    clampCam();
    G.shake = Math.max(0, G.shake - dt * FX.shakeDecay);
    G.flash = Math.max(0, G.flash - dt);
    G.motherFxT = Math.max(0, G.motherFxT - dt);
    // 萤火虫
    for (const f of G.flies) {
      f.ph += dt * f.sp;
      f.x += Math.cos(f.ph * 1.7) * 22 * dt;
      f.y += Math.sin(f.ph) * 16 * dt - 6 * dt;
    }
    // 樱花瓣氛围
    for (const pt of G.petals) {
      pt.ph += dt * pt.sp;
      pt.x += dt * 0.012 * pt.sp;
      pt.y += dt * 0.03 * pt.sp;
      if (pt.y > 1) { pt.y = 0; pt.x = Math.random(); }
      if (pt.x > 1) pt.x -= 1;
    }
    // 低血量脉冲 + 心跳
    G.lowHpPulse = P.hp < P.maxHp * 0.3 ? G.lowHpPulse + dt : 0;
    if (G.lowHpPulse > 0) {
      G.heartT -= dt;
      if (G.heartT <= 0) {
        G.heartT = 0.95;
        Sfx.sfx.heartbeat();
        if (U.chance(0.5)) sweatDrop(P.x + (P.flip ? -16 : 16), P.y - 40);
      }
    }
    // 眩晕表现：头顶打转的星星
    if (P.stunT > 0) {
      G.stunFxT = (G.stunFxT || 0) - dt;
      if (G.stunFxT <= 0) {
        G.stunFxT = 0.13;
        const sa = G.time * 9;
        part({ x: P.x + Math.cos(sa) * 16, y: P.y - 42 + Math.sin(sa) * 5, vy: -12, life: 0.45, size: 5, col: '#ffd34d', kind: 'star', vr: 8 });
      }
    }
    if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
  }
  function updateDying(dt) {
    G.dyingT -= dt;
    G.cam.x = U.lerp(G.cam.x, G.player.x, dt * 4);
    G.cam.y = U.lerp(G.cam.y, G.player.y, dt * 4);
    clampCam();
    if (G.dyingT <= 0) { G.timeScale = 1; gameOver(); }
  }

  /* ================= 渲染 ================= */
  let shX = 0, shY = 0;
  // 有界地图：相机钳在地图内，看不到"外面"
  function clampCam() {
    if (!curMap) return;
    const hx = Math.min(worldW / 2, curMap.w / 2), hy = Math.min(worldH / 2, curMap.h / 2);
    G.cam.x = U.clamp(G.cam.x, hx, Math.max(hx, curMap.w - hx));
    G.cam.y = U.clamp(G.cam.y, hy, Math.max(hy, curMap.h - hy));
  }
  // 世界坐标 → 视图坐标（视图中心为原点）；居中、震屏与 zoom 由变换矩阵承担
  function w2sx(x) { return x - G.cam.x; }
  function w2sy(y) { return y - G.cam.y; }
  function setWorldXf() { ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (vw / 2 + shX), dpr * (vh / 2 + shY)); }
  function setScreenXf() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  // 屏幕坐标系下锚定世界物体（HUD 用）
  function w2sxA(x) { return (x - G.cam.x) * zoom + vw / 2 + shX; }
  function w2syA(y) { return (y - G.cam.y) * zoom + vh / 2 + shY; }

  function render() {
    shX = G.shake > 0 ? U.rand(-G.shake, G.shake) : 0;
    shY = G.shake > 0 ? U.rand(-G.shake, G.shake) : 0;
    setScreenXf();
    ctx.fillStyle = '#20223a';
    ctx.fillRect(0, 0, vw, vh);
    const halfW = worldW / 2, halfH = worldH / 2;
    const camL = G.cam.x - halfW - 90, camT = G.cam.y - halfH - 90;
    const camR = G.cam.x + halfW + 90, camB = G.cam.y + halfH + 90;
    const cullP1 = 100 / zoom, cullP2 = 40 / zoom, cullP3 = 60 / zoom;
    setWorldXf();
    // ---- 地面 ----
    const lamps = [];
    if (curMap) {
      curMap.drawGround(ctx, camL, camT, camR, camB, G.cam.x, G.cam.y);
      for (const l of curMap.lamps) if (l.x > camL - 130 && l.x < camR + 130 && l.y > camT - 130 && l.y < camB + 130) lamps.push(l);
    } else {
      const c0x = Math.floor(camL / CHUNK), c1x = Math.floor(camR / CHUNK);
      const c0y = Math.floor(camT / CHUNK), c1y = Math.floor(camB / CHUNK);
      for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
        const ch = getChunk(cx, cy);
        const sx = Math.floor(cx * CHUNK - ch.pad - G.cam.x);
        const sy = Math.floor(cy * CHUNK - ch.pad - G.cam.y);
        ctx.drawImage(ch.canvas, sx, sy);
        for (const l of ch.lamps) if (l.x > camL && l.x < camR && l.y > camT && l.y < camB) lamps.push(l);
      }
    }
    // ---- 手工地图：立体装饰（y 排序）与水面波光 / 蒸汽 ----
    if (curMap) {
      curMap.drawDecor(ctx, camL, camT, camR, camB, w2sx, w2sy);
      curMap.drawFx(ctx, G.time, w2sx, w2sy, camL, camT, camR, camB, G.cam.x, G.cam.y);
    }
    const P = G.player;
    // ---- 区域（猫砂）：数量越多整体越淡越简（LOD），地面不被淹没 ----
    const zDim = Math.max(0.45, 1 - G.zones.length / (FX.zoneMax * 1.6));
    const zDots = G.zones.length > 14 ? 3 : 6;
    for (const z of G.zones) {
      const sx = w2sx(z.x), sy = w2sy(z.y);
      if (sx < -halfW - cullP1 || sx > halfW + cullP1 || sy < -halfH - cullP1 || sy > halfH + cullP1) continue;
      ctx.save();
      ctx.globalAlpha = 0.5 * zDim * Math.min(1, z.t / 0.6);
      ctx.fillStyle = '#cfc0a4';
      ctx.beginPath(); ctx.ellipse(sx, sy, z.r, z.r * 0.72, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.35 * zDim * Math.min(1, z.t / 0.6);
      ctx.fillStyle = '#a89878';
      for (let i = 0; i < zDots; i++) {
        const a = i / zDots * TAU + z.r;
        ctx.beginPath(); ctx.arc(sx + Math.cos(a) * z.r * 0.5, sy + Math.sin(a) * z.r * 0.4, 4, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    // ---- 蜗牛黏液带（地面亮泽拖慢区） ----
    for (const s of G.slimes) {
      const sx = w2sx(s.x), sy = w2sy(s.y);
      if (sx < -halfW - cullP1 || sx > halfW + cullP1 || sy < -halfH - cullP1 || sy > halfH + cullP1) continue;
      ctx.save();
      ctx.globalAlpha = 0.38 * Math.min(1, s.t / 0.6);
      ctx.fillStyle = '#a8d890';
      ctx.beginPath(); ctx.ellipse(sx, sy, s.r, s.r * 0.68, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.3 * Math.min(1, s.t / 0.6);
      ctx.fillStyle = '#e8f6d8';
      ctx.beginPath(); ctx.ellipse(sx - s.r * 0.2, sy - s.r * 0.15, s.r * 0.45, s.r * 0.28, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // ---- 老鼠妈妈全屏斩预警：主角脚下红圈收缩 ----
    if (G.mother && !G.mother.dieDone && G.mother.state === 'tele') {
      const k = Math.max(0, Math.min(1, G.mother.st / DATA.CFG.finale.motherTele)); // 1 → 0
      const rr2 = 40 + 70 * k;
      ctx.save();
      ctx.globalAlpha = 0.55 + Math.sin(G.time * 24) * 0.2;
      ctx.strokeStyle = '#ff5f7a'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(w2sx(P.x), w2sy(P.y), rr2, rr2 * 0.6, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    // ---- 猫薄荷光环 ----
    for (const w of P.weapons) {
      if (WEAPONS[w.id].kind !== 'aura') continue;
      const s = wStats(w);
      const r = Math.min(s.radius * mods.areaMult, atkMaxR());
      const sx = w2sx(P.x), sy = w2sy(P.y);
      ctx.save();
      const g = ctx.createRadialGradient(sx, sy, r * 0.2, sx, sy, r);
      g.addColorStop(0, 'rgba(140,220,130,0.20)');
      g.addColorStop(0.8, 'rgba(140,220,130,0.13)');
      g.addColorStop(1, 'rgba(140,220,130,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(170,240,160,0.5)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = -G.time * 30;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    // ---- 鱼干 / 掉落物 / 宝箱 ----
    for (const g of G.gems) {
      const sx = w2sx(g.x), sy = w2sy(g.y);
      if (sx < -halfW - cullP2 || sx > halfW + cullP2 || sy < -halfH - cullP2 || sy > halfH + cullP2) continue;
      const tier = g.val >= 25 ? Art.items.gem3 : g.val >= 5 ? Art.items.gem2 : Art.items.gem1;
      const bob = Math.sin(g.t * 4) * 3;
      ctx.drawImage(tier, sx - tier.width / 2, sy - tier.height / 2 + bob);
    }
    for (const p of G.pickups) {
      const sx = w2sx(p.x), sy = w2sy(p.y);
      if (sx < -halfW - cullP2 || sx > halfW + cullP2 || sy < -halfH - cullP2 || sy > halfH + cullP2) continue;
      const spr = p.kind === 'coin' ? Art.items.coin : p.kind === 'milk' ? Art.items.milk : p.kind === 'firework' ? Art.items.firework : Art.items.vacuum;
      const bob = Math.sin(p.t * 3.4) * 4;
      if (p.kind !== 'coin') { ctx.save(); ctx.globalAlpha = 0.6; ctx.drawImage(Art.glows.gem, sx - 20, sy + bob - 20, 40, 40); ctx.restore(); }
      ctx.drawImage(spr, sx - spr.width / 2, sy - spr.height / 2 + bob);
    }
    for (const c of G.chests) {
      const sx = w2sx(c.x), sy = w2sy(c.y);
      const bob = Math.sin(c.t * 3) * 4;
      ctx.drawImage(Art.glows.chest, sx - 70, sy - 70 + bob, 140, 140);
      ctx.drawImage(Art.items.chestClosed, sx - 36, sy - 30 + bob);
    }
    // ---- 实体（y 排序） ----
    const drawList = [];
    for (const e of G.enemies) {
      if (e.x < camL || e.x > camR || e.y < camT || e.y > camB) continue;
      drawList.push(e);
    }
    drawList.push(P);
    drawList.sort((a, b) => a.y - b.y);
    for (const e of drawList) {
      if (e === P) drawPlayer();
      else drawEnemy(e);
    }
    // ---- 环绕毛线 ----
    for (const w of P.weapons) {
      if (WEAPONS[w.id].kind !== 'orbit' || w.state !== 1) continue;
      const s = wStats(w);
      const R = Math.min(s.radius * mods.areaMult, atkMaxR() * 0.8);
      const spr = w.evolved ? Art.projs.yarnBig : Art.projs.yarn;
      const nOrb = s.amount + mods.amountBonus;
      for (let i = 0; i < nOrb; i++) {
        const a = (w.ang || 0) + i * TAU / nOrb;
        const bx = P.x + Math.cos(a) * R, by = P.y + Math.sin(a) * R * 0.72;
        const sx = w2sx(bx), sy = w2sy(by);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(G.time * 6 + i);
        ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
        ctx.restore();
      }
    }
    // ---- 子弹 ----
    for (const p of G.projs) {
      const sx = w2sx(p.x), sy = w2sy(p.y);
      if (sx < -halfW - cullP3 || sx > halfW + cullP3 || sy < -halfH - cullP3 || sy > halfH + cullP3) continue;
      ctx.save();
      if (p.kind === 'note') {
        ctx.translate(sx, sy); ctx.rotate(p.rot || 0);
        ctx.drawImage(Art.projs.note, -18, -20);
      } else if (p.kind === 'fish') {
        ctx.translate(sx, sy); ctx.rotate(p.rot || 0);
        ctx.drawImage(Art.projs.fishProj, -24, -15);
      } else if (p.kind === 'axe') {
        ctx.save(); ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(sx, w2sy(p.startY) + 6, 12, 4, 0, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.translate(sx, sy); ctx.rotate(p.rot || 0);
        ctx.drawImage(Art.projs.axe, -26, -26);
      } else if (p.kind === 'litter') {
        ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(w2sx(p.tx), w2sy(p.ty), 10, 4, 0, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.translate(sx, sy); ctx.rotate(p.rot || 0);
        ctx.drawImage(Art.projs.litter, -22, -18);
      }
      ctx.restore();
    }
    // ---- 敌方羽毛弹（意见6：鸽子远程） ----
    for (const p of G.eprojs) {
      const sx = w2sx(p.x), sy = w2sy(p.y);
      if (sx < -halfW - cullP3 || sx > halfW + cullP3 || sy < -halfH - cullP3 || sy > halfH + cullP3) continue;
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(p.rot + Math.sin(p.t * 12) * 0.18);
      ctx.fillStyle = '#f2f0e4';
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 4, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(110,100,80,.75)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(9, 0); ctx.stroke();
      ctx.restore();
    }
    // ---- 爪击 ----
    for (const s of G.slashes) {
      const a = Math.atan2(s.fy, s.fx);
      ctx.save();
      ctx.translate(w2sx(s.x), w2sy(s.y));
      ctx.rotate(a);
      const k = s.t / s.life;
      ctx.globalAlpha = Math.sin(Math.min(1, k) * Math.PI);
      const sc = 0.8 + k * 0.5;
      ctx.drawImage(Art.slash, -30, -50 * sc, 150 * sc, 100 * sc);
      ctx.restore();
    }
    // ---- 粒子 ----
    for (const p of G.parts) {
      const sx = w2sx(p.x), sy = w2sy(p.y);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      if (p.kind === 'bolt') {
        Art.drawLightning(ctx, w2sx(p.x1), w2sy(p.y1), w2sx(p.x2), w2sy(p.y2), p.col);
      } else if (p.kind === 'ring') {
        const r = p.size * (0.4 + (p.t / p.life) * 1.2);
        ctx.strokeStyle = p.col; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.stroke();
      } else if (p.kind === 'star') {
        ctx.translate(sx, sy); ctx.rotate(p.rot + p.t * p.vr);
        ctx.fillStyle = p.col;
        const s2 = p.size * (1 - p.t / p.life * 0.5);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a2 = i * Math.PI / 2;
          ctx.lineTo(Math.cos(a2) * s2, Math.sin(a2) * s2);
          ctx.lineTo(Math.cos(a2 + Math.PI / 4) * s2 * 0.4, Math.sin(a2 + Math.PI / 4) * s2 * 0.4);
        }
        ctx.closePath(); ctx.fill();
      } else if (p.kind === 'heart') {
        ctx.translate(sx, sy); ctx.scale(p.size / 7, p.size / 7);
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.moveTo(0, 3);
        ctx.bezierCurveTo(-7, -4, -3, -10, 0, -5);
        ctx.bezierCurveTo(3, -10, 7, -4, 0, 3);
        ctx.fill();
      } else if (p.kind === 'leaf') {
        ctx.translate(sx, sy); ctx.rotate(p.rot + p.t * p.vr);
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, TAU); ctx.fill();
      } else if (p.kind === 'beam') {
        const k = p.t / p.life;
        const h = 280 * (0.35 + 0.65 * (1 - k));
        const w2 = p.size * (1 - k * 0.4);
        const gb = ctx.createLinearGradient(0, sy - h, 0, sy + 8);
        gb.addColorStop(0, 'rgba(255,255,255,0)');
        gb.addColorStop(0.75, p.col);
        gb.addColorStop(1, '#ffffff');
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.fillStyle = gb;
        ctx.fillRect(sx - w2 / 2, sy - h, w2, h + 8);
      } else {
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(sx, sy, p.size * (1 - p.t / p.life * 0.6), 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    // ---- 飘字（屏幕层：字号不随 zoom 缩小，保证小屏可读） ----
    setScreenXf();
    ctx.textAlign = 'center';
    for (const d of G.dmgs) {
      const sx = w2sxA(d.x), sy = w2syA(d.y) + d.vy * d.t * zoom;
      const k = d.t / d.life;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = (d.crit ? '900 22px' : '700 15px') + ' "ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(30,20,40,.8)';
      ctx.strokeText(d.txt, sx, sy);
      ctx.fillStyle = d.col || (d.crit ? '#ffd34d' : '#fff');
      ctx.fillText(d.txt, sx, sy);
      ctx.globalAlpha = 1;
    }
    // ---- 樱花瓣氛围（屏幕层） ----
    setScreenXf();
    ctx.save();
    for (const pt of G.petals) {
      const sx2 = pt.x * (vw + 80) - 40;
      const sy2 = pt.y * (vh + 40) - 20 + Math.sin(pt.ph) * 14;
      ctx.save();
      ctx.translate(sx2, sy2);
      ctx.rotate(pt.ph * 1.4);
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#ffc3da';
      ctx.beginPath(); ctx.ellipse(0, 0, pt.sz, pt.sz * 0.6, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // ---- 夜幕 & 灯光 ----
    ctx.fillStyle = 'rgba(18,16,52,0.30)';
    ctx.fillRect(0, 0, vw, vh);
    setWorldXf();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const LG = curMap ? MAPS.glow() : null;
    for (const l of lamps) {
      const sx = w2sx(l.x), sy = w2sy(l.y);
      const g = l.g === 'lantern' ? LG.lantern : l.g !== 'lamp' ? Art.glows[l.g] : Art.glows.lamp;
      ctx.drawImage(g || Art.glows.lamp, sx - 110, sy - 110);
    }
    // 霓虹招牌微光（仅无限街区）
    if (!curMap) {
      const c0x2 = Math.floor(camL / CHUNK), c1x2 = Math.floor(camR / CHUNK);
      const c0y2 = Math.floor(camT / CHUNK), c1y2 = Math.floor(camB / CHUNK);
      for (let cy2 = c0y2; cy2 <= c1y2; cy2++) for (let cx2 = c0x2; cx2 <= c1x2; cx2++) {
        const ch = chunkCache.get(cx2 + ',' + cy2);
        if (!ch) continue;
        for (const s of ch.signs) {
          const sx = w2sx(s.x), sy = w2sy(s.y);
          const g = Art.glows[s.c];
          ctx.drawImage(g, sx - 80, sy - 80);
        }
      }
    }
    ctx.drawImage(Art.glows.player, w2sx(P.x) - 90, w2sy(P.y) - 90);
    ctx.restore();
    // 萤火虫（在最上，屏幕层）
    setScreenXf();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of G.flies) {
      const sx = ((f.x % (vw + 200)) + vw + 200) % (vw + 200) - 100;
      const sy = ((f.y % (vh + 200)) + vh + 200) % (vh + 200) - 100;
      const a = 0.4 + Math.sin(f.ph * 3) * 0.3;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#d8f7b8';
      ctx.beginPath(); ctx.arc(sx, sy, 2.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // ---- 受击红闪 & 低血量 & 老鼠妈妈全屏斩紫边 & 暗角 ----
    if (G.flash > 0) {
      ctx.fillStyle = `rgba(255,60,80,${G.flash * 0.5})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (G.motherFxT > 0) { // 全屏斩命中：0.3 秒即散的短促紫边，不做长驻覆盖
      const k = G.motherFxT / 0.3;
      const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.25, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.55);
      g.addColorStop(0, 'rgba(170,100,235,0)');
      g.addColorStop(1, `rgba(170,100,235,${0.4 * k})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    }
    if (G.lowHpPulse > 0) {
      const a = 0.14 + Math.sin(G.lowHpPulse * 6) * 0.08;
      const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.55);
      g.addColorStop(0, 'rgba(255,40,60,0)');
      g.addColorStop(1, `rgba(255,40,60,${a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    }
    ctx.drawImage(vignette, 0, 0);
    drawHUD();
    drawJoystick();
    MUI.draw(ctx, G.realTime);
  }

  function drawEnemy(e) {
    const set = Art.E[e.type];
    const white = Art.EW[e.type];
    const blinkSpr = Art.EB[e.type] ? Art.EB[e.type][0] : null;
    const hurtSpr = Art.EH[e.type] ? Art.EH[e.type][0] : null;
    const sc = e.scale;
    const sx = w2sx(e.x), sy = w2sy(e.y);
    const sprW = e.mother ? 240 : e.boss ? 160 : 64;
    let yOff = 0, entryK = 0;
    if (e.boss && e.state === 'entry') { // 从天而降
      entryK = Math.max(0, e.entryT / (e.entryD || 0.9));
      yOff = -entryK * entryK * 460;
    }
    const fi = Math.floor(G.time * 7 + e.phase) % 2;
    const bob = Math.sin(G.time * 9 + e.phase) * 2.4 * sc + (e.landT > 0 ? Math.sin(e.landT / 0.28 * Math.PI) * 5 : 0);
    ctx.save();
    // 精英 / Boss 光环
    if (e.elite || e.boss) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (e.elite ? 0.4 : 0.5) + Math.sin(G.time * 5) * 0.12;
      const g = e.boss ? Art.glows.boss : Art.glows.chest;
      const gs = (e.mother ? 420 : e.boss ? 250 : 140) * sc;
      ctx.drawImage(g, sx - gs / 2, sy - gs / 2, gs, gs);
      ctx.restore();
    }
    // 影子（登场时缩小）
    ctx.save();
    ctx.globalAlpha = 0.28 * (1 - entryK * 0.7);
    ctx.fillStyle = '#000';
    const shw = (e.mother ? 44 : e.boss ? 30 : 17) * sc * (1 - entryK * 0.5);
    ctx.beginPath();
    ctx.ellipse(sx, sy + 24 * sc, shw, shw * 0.36, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    // 本体
    ctx.translate(sx, sy + bob + yOff);
    ctx.scale(sc, sc);
    if (e.landT > 0) ctx.scale(1.12, 0.88); // 落地压扁
    if (G.player.x < e.x) ctx.scale(-1, 1);
    let spr;
    if (e.boss && e.state === 'tele') spr = set.tele;
    else if (e.faceT > 0 && hurtSpr) spr = hurtSpr;
    else if (e.blinkA > 0 && blinkSpr) spr = blinkSpr;
    else spr = set.walk[fi];
    ctx.drawImage(spr, -sprW / 2, -sprW * 0.62, sprW, sprW);
    if (e.flash > 0) {
      ctx.globalAlpha = Math.min(1, e.flash / 0.12);
      ctx.drawImage(white[fi], -sprW / 2, -sprW * 0.62, sprW, sprW);
    }
    ctx.restore();
    // 精英金冠
    if (e.elite) {
      ctx.save();
      const k = 1 + Math.sin(G.time * 4 + e.phase) * 0.08;
      ctx.translate(sx, sy - 52 * sc + Math.sin(G.time * 2.6 + e.phase) * 3);
      ctx.scale(k, k);
      ctx.drawImage(Art.eliteCrown, -14, -12, 28, 22);
      ctx.restore();
    }
    // Boss 蓄力前摇提示
    if (e.boss && e.state === 'tele') {
      ctx.save();
      const k = 1 + Math.sin(G.time * 20) * 0.12;
      ctx.translate(sx, sy - (e.mother ? 165 : 78 * sc));
      ctx.scale(k, k);
      ctx.fillStyle = '#ff6b81';
      ctx.font = '900 ' + (e.mother ? 44 : 30) + 'px "ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 6; ctx.strokeStyle = '#fff';
      ctx.strokeText('!', 0, 0);
      ctx.fillText('!', 0, 0);
      ctx.restore();
    }
    // Boss / 精英血条
    if ((e.boss || e.elite) && e.hp < e.maxHp && e.state !== 'entry') {
      const w2 = e.mother ? 130 : e.boss ? 90 : 60;
      const barY = e.mother ? sy - 128 : sy - 52 * sc;
      ctx.save();
      ctx.fillStyle = 'rgba(20,12,34,.6)';
      Art.rr(ctx, sx - w2 / 2, barY, w2, 8, 4); ctx.fill();
      if (e.hp > 0) {
        ctx.fillStyle = e.boss ? '#ff6b81' : '#ffd34d';
        Art.rr(ctx, sx - w2 / 2 + 1.5, barY + 1.5, Math.max(3, (w2 - 3) * Math.max(0, e.hp / e.maxHp)), 5, 2.5); ctx.fill();
      }
      ctx.restore();
    }
  }
  function drawPlayer() {
    const P = G.player;
    const F = Art.playerFrames;
    const sx = w2sx(P.x), sy = w2sy(P.y);
    const dead = G.state === 'dying' || G.state === 'over';
    ctx.save();
    if (P.iframes > 0 && Math.floor(G.time * 18) % 2 === 0) ctx.globalAlpha = 0.45;
    // 影子
    ctx.save();
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(sx, sy + 30, 19, 6.5, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.translate(sx, sy);
    if (P.flip) ctx.scale(-1, 1);
    if (dead) {
      ctx.drawImage(F.dead, -56, -66, 112, 112);
    } else {
      const squash = P.moving ? 1 + Math.sin(P.walkT * 16) * 0.035 : 1;
      ctx.scale(2 - squash, squash);
      let spr;
      if (P.hurtT > 0) spr = F.hurt;
      else if (P.moving) spr = F.walk[Math.floor(P.walkT * 9) % 4];
      else if (P.blinkA > 0) spr = F.blink;
      else spr = F.idle[Math.sin(G.time * 2.2) > 0 ? 0 : 1];
      const bob = P.moving ? Math.abs(Math.sin(P.walkT * 9)) * 3.5 : Math.sin(G.time * 2.5) * 1.5;
      ctx.drawImage(spr, -56, -68 - bob, 112, 112);
      if (P.hurtT > 0) {
        ctx.globalAlpha = P.hurtT / 0.25;
        ctx.drawImage(Art.playerWhite, -56, -68, 112, 112);
      }
    }
    ctx.restore();
  }
  function drawJoystick() {
    if (!joy.on) return;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 44, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(joy.ox + joy.x * 40, joy.oy + joy.y * 40, 20, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ================= HUD ================= */
  function drawHUD() {
    const P = G.player;
    if (G.state === 'menu') return;
    // XP 条（圆润 + 小鱼图标 + 连击）
    const need = DATA.xpNeed(P.lv || 1);
    const xpk = U.clamp((P.xp || 0) / need, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(12,10,34,.78)';
    ctx.fillRect(0, 0, vw, 22);
    Art.rr(ctx, 6, 5, vw - 12, 12, 6); ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fill();
    if (xpk > 0.01) {
      const g = ctx.createLinearGradient(0, 0, vw, 0);
      g.addColorStop(0, '#4fc3f7'); g.addColorStop(1, '#8ff0e0');
      Art.rr(ctx, 6, 5, Math.max(8, (vw - 12) * xpk), 12, 6); ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      Art.rr(ctx, 6, 5, Math.max(8, (vw - 12) * xpk), 5, 3); ctx.fill();
    }
    ctx.drawImage(Art.items.gem2, vw - 34, 0, 26, 22);
    if (G.gemCombo >= 5 && G.gemComboT > 0) {
      const pop = 1 + Math.max(0, G.gemComboT - 0.85) * 1.6;
      ctx.translate(vw - 48, 36); ctx.scale(pop, pop);
      ctx.font = '700 15px "ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,14,40,.85)';
      ctx.strokeText('🐟 ×' + G.gemCombo, 0, 0);
      ctx.fillStyle = '#a8ecff';
      ctx.fillText('🐟 ×' + G.gemCombo, 0, 0);
    }
    ctx.restore();
    // 等级徽章
    ctx.save();
    ctx.fillStyle = '#ff8fb5';
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(vw - 34, 30, 21, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '900 19px "ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Lv' + (P.lv || 1), vw - 34, 31);
    ctx.restore();
    // 计时：总存活时长（跨轮累计）
    const inBossFight = G.bossWarn > 0 || (G.boss && !G.boss.dieDone);
    const tstr = U.fmtTime(G.time);
    ctx.save();
    ctx.font = '900 34px "ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(20,14,40,.85)';
    ctx.strokeText(tstr, vw / 2, 40);
    ctx.fillStyle = inBossFight ? '#ff6b81' : '#fff';
    if (inBossFight && Math.floor(G.time * 3) % 2 === 0) ctx.fillStyle = '#ffd34d';
    ctx.fillText(tstr, vw / 2, 40);
    ctx.restore();
    // 击杀 & 金币（图标 + 数字）
    ctx.save();
    ctx.font = '700 18px "ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,14,40,.85)';
    ctx.strokeText('' + G.kills, vw - 66, 30);
    ctx.fillStyle = '#ffe9c4';
    ctx.fillText('' + G.kills, vw - 66, 30);
    ctx.strokeText('' + G.gold, vw - 66, 62);
    ctx.fillStyle = '#ffd34d';
    ctx.fillText('' + G.gold, vw - 66, 62);
    ctx.textAlign = 'center';
    ctx.drawImage(Art.icons.paw, vw - 100 - 11, 19, 22, 22);
    ctx.drawImage(Art.items.coin, vw - 100 - 11, 51, 22, 22);
    // 轮次 / 批次指示
    const R2 = DATA.ROUNDS;
    const batchTxt = G.batch >= R2.batchCount ? '轮Boss战！' : '批次 ' + (G.batch + 1) + '/' + R2.batchCount;
    const mapTxt = curMap ? ' · ' + curMap.meta.emoji + curMap.meta.name : ' · 无尽街区';
    ctx.textAlign = 'right';
    ctx.font = '700 15px "ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
    ctx.strokeText('第 ' + G.round + ' 轮 · ' + batchTxt + mapTxt, vw - 66, 88);
    ctx.fillStyle = '#c9b8ff';
    ctx.fillText('第 ' + G.round + ' 轮 · ' + batchTxt + mapTxt, vw - 66, 88);
    ctx.restore();
    // 武器/被动栏（带冷却指示）；眩晕/缴械时武器栏点暗提示
    let ix = 12, iy = 30;
    for (const w of P.weapons) {
      const frac = w.cdMax > 0 ? U.clamp(w.t / w.cdMax, 0, 1) : 0;
      drawItemSlot(ix, iy, Art.icons[w.evolved ? WEAPONS[w.id].iconEvo : WEAPONS[w.id].icon], w.evolved ? 8 : w.lv, 8, w.evolved, frac);
      ix += 34;
    }
    if (P.stunT > 0 || P.disarmT > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(20,12,34,.5)';
      Art.rr(ctx, 8, 26, Math.max(1, P.weapons.length) * 34 + 4, 30, 8); ctx.fill();
      ctx.fillStyle = '#ff8fb5';
      ctx.font = '700 12px "ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(P.stunT > 0 ? '眩晕!' : '无法攻击', 12, 41);
      ctx.restore();
    }
    ix = 12; iy += 38;
    for (const p of P.passives) {
      drawItemSlot(ix, iy, Art.icons[PASSIVES[p.id].icon], p.lv, PASSIVES[p.id].maxLv, false);
      ix += 34;
    }
    // 猫爪印栏（跨轮累计、无上限；满 10 层金框微光）
    const affs = P.affixes || [];
    if (affs.length) {
      ix = 12; iy += 38;
      for (const af of affs) {
        drawStampChip(ix, iy, af);
        ix += 34;
      }
    }
    // 血条（猫头顶小药丸）
    const hx = w2sxA(P.x), hy = w2syA(P.y) - 50;
    ctx.save();
    ctx.fillStyle = 'rgba(20,12,34,.55)';
    Art.rr(ctx, hx - 25, hy, 50, 9, 4.5); ctx.fill();
    const hpk = U.clamp(P.hp / P.maxHp, 0, 1);
    if (hpk > 0.02) {
      ctx.fillStyle = hpk < 0.3 ? '#ff6b81' : hpk < 0.6 ? '#ffd166' : '#8fd982';
      Art.rr(ctx, hx - 23.5, hy + 1.5, Math.max(3, 47 * hpk), 6, 3); ctx.fill();
    }
    ctx.restore();
    // Boss 血条
    if (G.boss && !G.boss.dieDone && G.boss.state !== 'entry') {
      const b = G.boss;
      const bw = Math.min(520, vw * 0.6);
      ctx.save();
      ctx.fillStyle = 'rgba(20,12,34,.65)';
      Art.rr(ctx, vw / 2 - bw / 2, 74, bw, 18, 9); ctx.fill();
      const hpw = Math.max(0, (bw - 4) * Math.max(0, b.hp / b.maxHp));
      if (hpw > 0) {
        const g2 = ctx.createLinearGradient(vw / 2 - bw / 2, 0, vw / 2 + bw / 2, 0);
        g2.addColorStop(0, '#ff8ba0'); g2.addColorStop(1, '#f0506b');
        Art.rr(ctx, vw / 2 - bw / 2 + 2, 76, Math.max(6, hpw), 14, 7);
        ctx.fillStyle = g2; ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.25)';
        Art.rr(ctx, vw / 2 - bw / 2 + 2, 76, Math.max(6, hpw), 6, 3); ctx.fill();
      }
      ctx.font = '700 15px "ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,12,34,.8)';
      const bossTitle = '👑 鼠王·铁须' + (b.affixes && b.affixes.length ? '【' + affixNames(b) + '】' : '');
      ctx.strokeText(bossTitle, vw / 2, 72);
      ctx.fillStyle = '#ffd9e6';
      ctx.fillText(bossTitle, vw / 2, 72);
      ctx.restore();
    }
    // 鼠王降临警告：红屏脉动
    if (G.bossWarn > 0) {
      const a = 0.15 + Math.sin(G.realTime * 10) * 0.08;
      ctx.save();
      const g3 = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.25, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.55);
      g3.addColorStop(0, 'rgba(255,40,60,0)');
      g3.addColorStop(1, 'rgba(255,40,60,' + a.toFixed(3) + ')');
      ctx.fillStyle = g3; ctx.fillRect(0, 0, vw, vh);
      ctx.restore();
    }
    // 横幅提示（圆角药丸底）
    if (G.banner) {
      const k = Math.min(1, G.banner.t / 0.4);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.font = '900 24px "ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const y = 122;
      const tw = ctx.measureText(G.banner.txt).width;
      ctx.fillStyle = 'rgba(20,14,40,.55)';
      Art.rr(ctx, vw / 2 - tw / 2 - 18, y - 22, tw + 36, 44, 22); ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(20,14,40,.85)';
      ctx.strokeText(G.banner.txt, vw / 2, y);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(G.banner.txt, vw / 2, y);
      ctx.restore();
    }
    // 操作提示（前 20 秒）
    if (G.time < 18 && G.state === 'play') {
      ctx.save();
      ctx.globalAlpha = Math.min(1, 18 - G.time) * 0.8;
      ctx.font = '600 15px "ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#cfd0ff';
      ctx.fillText(IS_TOUCH ? '按住屏幕拖动＝摇杆移动 · 武器全自动' : 'WASD / 方向键移动 · 武器全自动 · P 暂停 · M 静音', vw / 2, vh - 26);
      ctx.restore();
    }
  }
  function drawItemSlot(x, y, icon, lv, max, isEvo, cdFrac) {
    ctx.save();
    ctx.fillStyle = 'rgba(16,13,38,.78)';
    Art.rr(ctx, x, y, 30, 30, 9); ctx.fill();
    if (isEvo) {
      ctx.strokeStyle = 'rgba(255,143,181,' + (0.7 + Math.sin(G.time * 5) * 0.3).toFixed(3) + ')';
      ctx.lineWidth = 2.5; Art.rr(ctx, x, y, 30, 30, 9); ctx.stroke();
    }
    if (cdFrac !== undefined && cdFrac > 0) ctx.globalAlpha = 0.45; // 冷却中图标变暗
    ctx.drawImage(icon, x + 3, y + 3, 24, 24);
    ctx.globalAlpha = 1;
    if (cdFrac !== undefined && cdFrac > 0) { // 冷却转圈
      ctx.beginPath();
      ctx.moveTo(x + 15, y + 15);
      ctx.arc(x + 15, y + 15, 15.5, -Math.PI / 2, -Math.PI / 2 + TAU * cdFrac);
      ctx.closePath();
      ctx.fillStyle = 'rgba(10,8,30,.55)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 15, y + 15, 15.5, -Math.PI / 2 + TAU * cdFrac, -Math.PI / 2 + TAU * Math.min(1, cdFrac + 0.06));
      ctx.strokeStyle = 'rgba(255,233,168,.8)'; ctx.lineWidth = 1.6; ctx.stroke();
    }
    for (let i = 0; i < Math.min(max, 8); i++) {
      ctx.fillStyle = i < lv ? '#ffd34d' : 'rgba(255,255,255,.18)';
      ctx.fillRect(x + 2 + i * 3.5, y + 25.5, 2.4, 3.2);
    }
    ctx.restore();
  }
  function drawStampChip(x, y, af) {
    const meta = STAMP_META[af.id];
    ctx.save();
    ctx.fillStyle = 'rgba(30,20,52,.85)';
    Art.rr(ctx, x, y, 30, 30, 9); ctx.fill();
    const hot = af.stacks >= 10; // 里程碑：×10 起金框呼吸
    ctx.strokeStyle = 'rgba(255,211,77,' + (hot ? (0.55 + Math.sin(G.time * 5) * 0.25).toFixed(3) : '0.35') + ')';
    ctx.lineWidth = 1.6;
    Art.rr(ctx, x, y, 30, 30, 9); ctx.stroke();
    ctx.drawImage(Art.icons[meta.icon], x + 4, y + 4, 22, 22);
    ctx.font = '900 10px "ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,14,40,.9)';
    ctx.strokeText('×' + af.stacks, x + 15, y + 25.5);
    ctx.fillStyle = '#ffd34d';
    ctx.fillText('×' + af.stacks, x + 15, y + 25.5);
    ctx.restore();
  }

  /* ================= 键盘全局 ================= */
  function handleKey(code) {
    if (code === 'KeyM') {
      Sfx.setMuted(!Sfx.isMuted());
      return;
    }
    if (G.state === 'levelup' && ['Digit1', 'Digit2', 'Digit3'].includes(code)) {
      chooseCard(Number(code.slice(-1)) - 1);
      return;
    }
    // 意见1/2（第三版）：-/= 调缩放、0 复位；对局中 1/2/3 直接设加速档（升级三选一时优先选卡）
    if (code === 'Minus' || code === 'NumpadSubtract') { cycleZoom(-1); return; }
    if (code === 'Equal' || code === 'NumpadAdd') { cycleZoom(1); return; }
    if (code === 'Digit0' || code === 'Numpad0') { setZoom(1); return; }
    if (G.state === 'play' && ['Digit1', 'Digit2', 'Digit3'].includes(code)) {
      setSpeed(Number(code.slice(-1)));
      return;
    }
    if (code === 'KeyP' || code === 'Escape') {
      if (G.state === 'play') pauseGame();
      else if (G.state === 'pause') resumeGame();
      return;
    }
    if (G.state === 'menu' && (code === 'Enter' || code === 'Space')) { startRun(); return; }
    if (DEV) {
      if (G.state !== 'play') return;
      if (code === 'KeyL') { // 秒升 1 级：按经验乘数（难度 xpGain × 动态节流 xpMul）折算差额
        const mul = DATA.DIFF.xpGain * ((G.roundMods && G.roundMods.xpMul) || 1);
        addXp((DATA.xpNeed(G.player.lv || 1) - (G.player.xp || 0)) / mul);
      }
      else if (code === 'KeyC') { G.chests.push({ x: G.player.x + 40, y: G.player.y, t: 0, taken: false }); }
      else if (code === 'KeyB') { G.bossSpawned = true; spawnBoss(); }
      else if (code === 'KeyH') { G.motherActive = true; G.motherWarnT = 0.01; } // 秒召老鼠妈妈（压轴测试）
      else if (code === 'KeyK') { for (const e of [...G.enemies]) if (!e.boss) killEnemy(e); }
      else if (code === 'KeyT') { G.time += 60; G.roundTime += 60; G.waveT += 60; }
      else if (code === 'KeyI') { G.player.hp = G.player.maxHp; }
      else if (code === 'KeyO') { damagePlayer(99999); }
      else if (code === 'KeyG') { // 随机 +1 层猫爪印（手测用）
        const id = U.pick(STAMP_ORDER);
        const af = G.player.affixes.find(a => a.id === id);
        if (af) af.stacks++;
        else G.player.affixes.push({ id, stacks: 1 });
        calcMods();
        banner('🐾 ' + STAMP_META[id].name + ' ×' + stampStacks(id) + '｜' + stampEffectText(id, stampStacks(id)), 2);
      }
      else if (code === 'KeyU') {
        for (const w of G.player.weapons) if (!w.evolved) w.lv = WEAPONS[w.id].maxLv;
        for (const w of G.player.weapons) {
          if (G.player.passives.length >= DATA.SLOTS.passive) break;
          const pid = WEAPONS[w.id].evoPassive;
          if (!G.player.passives.find(p => p.id === pid)) G.player.passives.push({ id: pid, lv: 1 });
        }
        calcMods();
      }
    }
  }

  /* ================= 流程控制 ================= */
  // 地图选择：主菜单卡片，记住上次选择
  G.mapId = U.storage.get('meow_map', MAPS.defaultId);
  if (!MAPS.get(G.mapId)) G.mapId = MAPS.defaultId;
  if (DEV && window.__DEV_MAP && (window.__DEV_MAP === 'endless' || MAPS.get(window.__DEV_MAP))) G.mapId = window.__DEV_MAP;
  function startRun() {
    Sfx.ensure();
    resetRun();
    MUI.setScreen(null);
    G.state = 'play';
    Sfx.bgmStart(G.mapId); // 意见5：每张地图一首 BGM
    const mName = curMap ? curMap.meta.emoji + curMap.meta.name + ' · ' : '';
    banner('🌙 第 1 轮 · ' + mName + '夜巡开始！击溃 4 个批次头目，讨伐鼠王！', 3);
  }
  function pauseGame() {
    G.state = 'pause';
    MUI.setScreen('pause');
  }
  function resumeGame() {
    G.state = 'play';
    MUI.setScreen(null);
  }
  function toMenu() {
    G.state = 'menu';
    Sfx.bgmStop();
    MUI.setScreen('menu');
  }
  // 小游戏版：把结算数据整理成 MUI.showResult 的展示结构（文案规则与 H5 版 result.js 一致）
  let lastResultData = null;
  function showResultPanel(data) {
    lastResultData = data;
    let title, sub;
    if (data.mother) { title = '🐭 老鼠妈妈已讨伐！'; sub = '喵都暂时安全了……但夜巡还长，鼠群仍会再来。'; }
    else if (data.win) { title = '🎉 收工大吉！'; sub = '第 ' + data.round + ' 轮平安归来，小鱼干满满，喵都为你骄傲！'; }
    else {
      title = '😿 大橘累倒了…';
      sub = data.diedToMother
        ? '在第 ' + data.round + ' 轮倒在了老鼠妈妈面前！她的全屏斩太狠了……再试一次吧！'
        : '在第 ' + data.round + ' 轮被鼠群击倒了！小鱼干被抢走了，再试一次吧！';
    }
    const W = DATA.WEAPONS, PS = DATA.PASSIVES, SM = DATA.STAMP_META;
    const buildRows = [{
      label: '武器',
      chips: data.weapons.map(w => ({ icon: Art.icons[w.evolved ? W[w.id].iconEvo : W[w.id].icon], badge: w.evolved ? '★' : '' + w.lv, kind: w.evolved ? 'evo' : 'w' }))
    }];
    if (data.passives.length) buildRows.push({ label: '被动', chips: data.passives.map(p2 => ({ icon: Art.icons[PS[p2.id].icon], badge: '' + p2.lv, kind: 'p' })) });
    if (data.affixes.length) buildRows.push({ label: '猫爪印', chips: data.affixes.map(a => ({ icon: Art.icons[SM[a.id].icon], badge: '×' + a.stacks, kind: 'stamp' })) });
    const stats = [
      ['' + data.round, '到达轮次'], [U.fmtTime(data.time), '本局时长'], ['' + data.lv, '等级'], ['' + data.kills, '打跑敌人'],
      ['' + data.gold, '金币'], [U.fmtNum(data.dmgTotal), '总伤害'], [U.fmtNum(data.dps), '平均 DPS'], [U.fmtNum(data.peakSec), '最高秒伤']
    ];
    let bestTxt = '最佳纪录 · 坚持 ' + U.fmtTime(data.best.time) + ' · 最远第 ' + (data.best.rounds || 1) + ' 轮';
    if (data.bestMother) bestTxt += ' · 老鼠妈妈最速 ' + U.fmtTime(data.bestMother);
    MUI.showResult({
      title, sub,
      motherLine: data.mother ? '⏱ 讨伐用时 ' + U.fmtTime(data.motherTTK || 0) : '',
      stats, buildRows, bestTxt, continueOffer: !!data.continueOffer,
      contentH: 300 + buildRows.length * 54 + stats.length * 30
    });
  }
  // 小游戏版：保存战报（wx 存相册；浏览器测试桩回退成下载）
  function saveReportImage() {
    if (!lastResultData) return;
    const card = Result.renderCard(lastResultData);
    if (typeof wx === 'undefined' || !wx.canvasToTempFilePath) {
      try {
        card.toBlob(b => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(b); a.download = 'meow-report.png';
          document.body.appendChild(a); a.click(); a.remove();
        });
      } catch (e) { /* 测试桩无 toBlob 时忽略 */ }
      return;
    }
    wx.canvasToTempFilePath({
      canvas: card,
      success: r => wx.saveImageToPhotosAlbum({
        filePath: r.tempFilePath,
        success: () => wx.showToast({ title: '战报已存相册 🐾', icon: 'none' }),
        fail: () => wx.showToast({ title: '未授权相册，保存失败', icon: 'none' })
      }),
      fail: () => wx.showToast({ title: '生成图片失败', icon: 'none' })
    });
  }
  function latestLogEntry() {
    try { return (CHANGELOG && CHANGELOG.entries && CHANGELOG.entries[0]) || null; } catch (e) { return null; }
  }
  const HELP_LINES = [
    '· 大橘要迎接无尽鼠潮：每轮 15 分钟、4 个批次，每批有头目压阵！',
    '· 打倒批次头目，下一批立刻来袭；讨伐鼠王·铁须就进入下一轮——难度节节攀升！',
    '· 第 3 轮讨伐鼠王后，压轴 Boss「老鼠妈妈」降临！打倒她即达成夜巡目标，之后可继续无尽模式！',
    '· 拖动屏幕＝摇杆移动，武器全自动攻击，专心走位！',
    '· 六张夜巡地图任选：老城夜市 / 樱花公园 / 港湾码头 / 雪山温泉 / 幽灵游乐园 / 无尽街区！',
    '· 楼房与水面走不了；草地、沙滩、深雪、落叶会拖慢脚步；🐾 猫道只有你能钻，鼠群进不来！',
    '· 怪物各有脾性：三花姐会蓄力突进、鸽子隔空吐羽毛、浣熊爱扑抢鱼干、蜗牛身后留黏液！',
    '· 打倒敌人捡小鱼干升级，每次 3 选 1 强化；除猫爪外最多 4 种武器，选好构筑！',
    '· 每 2 分钟有精英出没：半数掉宝箱（幸运锦鲤提高概率，否则掉金币），批次头目必掉宝箱！',
    '· 武器满级 + 对应被动，开宝箱触发进化；70 级解锁可无限叠加的猫爪印！',
    '· 右上角按钮：⏸ 暂停 · 🔍 缩放（4X=旧版大画面）· ⏩ 加速（最高 3X）· 🔊 静音'
  ];

  /* ================= 小游戏 UI 接线 ================= */
  function cycleSpeedButton() { setSpeed(SPD_LV[(SPD_LV.indexOf(gameSpeed) + 1) % SPD_LV.length]); }
  MUI.init({
    maps: MAPS.list,
    vw, vh,
    callbacks: {
      startRun: () => { Sfx.ensure(); Sfx.sfx.click(); startRun(); },
      selectMap: id => { Sfx.ensure(); Sfx.sfx.click(); G.mapId = id; U.storage.set('meow_map', id); },
      getMap: () => G.mapId,
      showHelp: () => { Sfx.ensure(); Sfx.sfx.click(); MUI.setScreen('help'); },
      showLog: () => { Sfx.ensure(); Sfx.sfx.click(); MUI.setScreen('log'); },
      closeOverlay: () => {
        Sfx.sfx.click();
        if (MUI.screen === 'log') { const l = latestLogEntry(); if (l) U.storage.set('meow_log_seen', l.version); }
        MUI.setScreen(G.state === 'menu' ? 'menu' : null);
      },
      hasNewLog: () => { const l = latestLogEntry(); return !!(l && l.version && U.storage.get('meow_log_seen', '') !== l.version); },
      changelog: () => { try { return CHANGELOG.entries || []; } catch (e) { return []; } },
      helpLines: () => HELP_LINES,
      resume: () => { Sfx.sfx.click(); resumeGame(); },
      restart: () => { Sfx.sfx.click(); startRun(); },
      quitToMenu: () => {
        Sfx.sfx.click();
        if (G.state === 'pause' && G.time > 0) { // 夜巡中途收工：进入与失败同一张结算（成功版）
          Sfx.bgmStop();
          MUI.setScreen(null);
          showResult(true);
          return;
        }
        toMenu();
      },
      toggleMute: () => { Sfx.ensure(); Sfx.setMuted(!Sfx.isMuted()); },
      muted: () => Sfx.isMuted(),
      pause: () => { if (G.state === 'play') pauseGame(); },
      cycleZoom: () => { Sfx.ensure(); Sfx.sfx.click(); cycleZoom(1); },
      cycleSpeed: () => { Sfx.ensure(); Sfx.sfx.click(); cycleSpeedButton(); },
      continueRun: () => {
        // 「继续夜巡」：讨伐老鼠妈妈后的成功结算 → 无缝续玩无限模式（一切保留）
        Sfx.sfx.click();
        MUI.clearOver();
        G.motherActive = false; G.mother = null;
        G.timeScale = 1; G.slowmoT = 0; G.flash = 0; G.motherFxT = 0;
        startRound(G.round + 1);
        G.state = 'play';
        Sfx.bgmStart(G.mapId);
      },
      again: () => { Sfx.sfx.click(); MUI.clearOver(); startRun(); },
      saveImg: () => { Sfx.sfx.click(); saveReportImage(); },
      toMenu: () => { Sfx.sfx.click(); MUI.clearOver(); toMenu(); }
    }
  });
  MUI.setScreen('menu'); // 小游戏版：初始即主菜单（H5 版是 HTML 默认态，这里要显式置入）
  if (typeof wx !== 'undefined' && wx.onHide) wx.onHide(() => { if (G.state === 'play') pauseGame(); });

  /* ================= 主循环 ================= */
  let lastT = performance.now();
  function loop(t) {
    requestAnimationFrame(loop);
    // 视口自愈：旋转/地址栏收展/分屏拖动在某些浏览器不发 resize 事件，每帧廉价比对一次
    if (window.innerWidth !== vw || window.innerHeight !== vh) resize();
    const realDt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    let dt = realDt;
    if (G.slowmoT > 0) { G.slowmoT -= realDt; if (G.slowmoT <= 0) G.timeScale = 1; }
    dt *= G.timeScale;
    G.realTime = t / 1000;
    if (G.state === 'play') {
      // 意见2：加速档把缩放后的 dt 拆成 ≤1/30s 的子步推进——3X 高速下移动/碰撞依旧逐帧稳定
      if (gameSpeed === 1) update(dt);
      else {
        let remain = dt * gameSpeed;
        while (remain > 1e-6) { const s2 = Math.min(remain, 1 / 30); update(s2); remain -= s2; }
      }
    }
    else if (G.state === 'dying') { updateDying(dt); updateParticlesOnly(dt); }
    if (G.state !== 'menu') render();
    else { renderMenuBg(); MUI.draw(ctx, G.realTime); } // 小游戏版：菜单内容画在夜空背景之上
    if (DEV && G.state !== 'menu') drawDevPanel();
  }
  // ?dev=1 性能小面板：实时观测震屏/猫砂区域/粒子/投射物/飘字/敌人/音效频率（中后期过载排查）
  function drawDevPanel() {
    setScreenXf();
    ctx.font = '11px Consolas,monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.fillText('shake ' + G.shake.toFixed(1) + '  zones ' + G.zones.length + '  parts ' + G.parts.length +
      '  projs ' + G.projs.length + '  dmgs ' + G.dmgs.length + '  enemies ' + G.enemies.length +
      '  waveT ' + Math.round(G.waveT) + '  sfx/s ' + Sfx.sfxRate(), 8, vh - 8);
  }
  function updateFx(dt) {
    for (const p of G.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.grav) p.vy += p.grav * dt; }
    for (let i = G.parts.length - 1; i >= 0; i--) if (G.parts[i].t >= G.parts[i].life) U.swapRemove(G.parts, i);
    for (const d of G.dmgs) d.t += dt;
    for (let i = G.dmgs.length - 1; i >= 0; i--) if (G.dmgs[i].t >= G.dmgs[i].life) U.swapRemove(G.dmgs, i);
  }
  function updateParticlesOnly(dt) {
    updateFx(dt);
    G.flash = Math.max(0, G.flash - dt);
    G.motherFxT = Math.max(0, G.motherFxT - dt);
    G.shake = Math.max(0, G.shake - dt * FX.shakeDecay);
  }
  // 菜单背景：渐变夜空 + 闪烁星星 + 月亮 + 云 + 城市剪影 + 路灯
  const stars = [];
  for (let i = 0; i < 110; i++) stars.push({ x: Math.random(), y: Math.random() * 0.62, r: U.rand(0.6, 1.8), ph: U.rand(0, TAU), sp: U.rand(0.5, 1.6) });
  let menuCam = 0;
  function renderMenuBg() {
    menuCam += 0.3;
    setScreenXf();
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#0d0e26');
    g.addColorStop(0.45, '#232050');
    g.addColorStop(0.75, '#3a2c5e');
    g.addColorStop(1, '#59395e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
    // 星星
    ctx.save();
    for (const s of stars) {
      const a = 0.35 + Math.sin(G.realTime * s.sp + s.ph) * 0.3;
      ctx.globalAlpha = Math.max(0.05, a);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s.x * vw, s.y * vh, s.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // 月亮
    ctx.drawImage(Art.sky.moon, vw - 250, 24, 200, 200);
    // 云
    const cl1 = ((menuCam * 0.35) % (vw + 500)) - 250;
    const cl2 = ((menuCam * 0.22 + 600) % (vw + 500)) - 250;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(Art.sky.cloud1, cl1, vh * 0.14, 300, 112);
    ctx.drawImage(Art.sky.cloud2, cl2, vh * 0.3, 240, 90);
    ctx.globalAlpha = 1;
    // 城市剪影（缓慢视差）
    const slH = 210, y0 = vh - slH - vh * 0.16;
    const off1 = -((menuCam * 0.5) % 1024);
    for (let x2 = off1 - 1024; x2 < vw + 1024; x2 += 1024) ctx.drawImage(Art.sky.skyline, x2, y0);
    // 地面
    const g2 = ctx.createLinearGradient(0, vh - vh * 0.16, 0, vh);
    g2.addColorStop(0, '#232441');
    g2.addColorStop(1, '#191a30');
    ctx.fillStyle = g2;
    ctx.fillRect(0, vh - vh * 0.16, vw, vh * 0.16);
    // 路灯洒光
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lx = ((menuCam * 0.5) % 400);
    for (let x3 = -lx; x3 < vw + 220; x3 += 400) ctx.drawImage(Art.glows.lamp, x3 - 110, vh - 160);
    ctx.restore();
    ctx.drawImage(vignette, 0, 0);
  }

  updateToggleBtns();
  if (DEV) window.__MS = { G, calcMods, DATA, getMods: () => mods, buildPool, hitEnemy, spawnEnemy,
    getZoom: () => ({ userZoom, zoom, worldW, worldH }), getSpeed: () => gameSpeed, addXp, MUI };
  requestAnimationFrame(loop);
})();
