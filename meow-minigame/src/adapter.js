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
