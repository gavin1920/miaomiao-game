/* 喵都幸存者 · 平台适配层 v3.1（微信小游戏 → 浏览器 DOM/BOM 语义）
   ─────────────────────────────────────────────────────────
   H5 本体只依赖这些浏览器能力，逐项桥接：
   · document.createElement('canvas') → wx.createCanvas()（首次即屏幕画布，全部关平滑=像素风）
   · window/innerWidth/devicePixelRatio/location/navigator → 「虚拟视口」：
     纵向恒为 720（设计基准短边），横向按真机长宽比折算——游戏在熟悉的 720p
     坐标系里作画，适配层把这块虚拟画布等比贴到物理屏（docs/手机端UI规格方案.md v3）。
     视口对象可变：jsbridge 晚就绪/真机信息变化时原位重算，游戏逐帧自愈检查自动跟进。
   · AudioContext → wx.createWebAudioContext（缺声道的旧基础库自动静音兜底）
   · localStorage → wx.setStorageSync / getStorageSync
   · fetch（猫叫采样/像素清单）→ FileSystemManager.readFile（读代码包内文件）
   · Image → wx.createImage（像素精灵加载）
   · CustomEvent/dispatchEvent → 像素素材就绪事件（__PIXEL_GATE 启动门）
   · wx.loadFont → 内置 Fusion Pixel 像素字体子集
   · canvas.addEventListener('touch*') → wx.onTouchStart/Move/End/Cancel（坐标映射到虚拟视口）
   在浏览器里跑测试时：真实 DOM 都在，本文件只补一层 wx→canvas 的触摸桥，
   所有 wx.* 调用由 test/wx-stub.js 提供（?wx=1 可强制走真实分支）。
*/
'use strict';
(() => {
  const IN_WX = typeof wx !== 'undefined' && typeof wx.createCanvas === 'function';
  const g = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;
  /* 全局挂载防弹化：部分宿主把 window/document 等定义为只读 getter，直接赋值会 TypeError
     （开发者工具实测踩雷）。先普通赋值，失败再 defineProperty；彻底锁死时返回 false，
     由调用方的兜底逻辑处理。 */
  const defGlobal = (key, value) => {
    try {
      g[key] = value;
      if (g[key] === value) return true;
    } catch (e) { /* 只读 getter，走 defineProperty */ }
    try {
      Object.defineProperty(g, key, { value, configurable: true, writable: true });
      return true;
    } catch (e) { return false; }
  };

  /* ---------- 画布：注册表式 addEventListener + 统一分发 + 强制像素采样 ---------- */
  function patchCanvas(c) {
    if (!c || c.__patched) return c;
    const ls = {};
    /* 事件注册表必须保证成功（触摸桥无条件调 _dispatch，失败=输入全失效），单独前置 */
    c.__patched = true;
    c._dispatch = (t, e) => { for (const f of ls[t] || []) f(e); };
    c.addEventListener = (t, f) => { (ls[t] = ls[t] || []).push(f); };
    c.removeEventListener = (t, f) => { ls[t] = (ls[t] || []).filter(x => x !== f); };
    try { if (!c.style) c.style = {}; } catch (e) { /* 只读 style 宿主：跳过 */ }
    /* 像素风关键：所有上下文默认关平滑（地形 1/4 烘焙 ×4 放大、像素精灵放大全靠它）。
       游戏代码此后仍可自行改写该属性；路径抗锯齿不受此开关影响。
       注意：个别宿主的 canvas 方法不可覆写——getContext 覆写单独 try/catch，
       失败就保留原 getContext（游戏自身在 init/resize 里也会设 imageSmoothingEnabled=false）。 */
    try {
      const origGet = c.getContext;
      if (typeof origGet === 'function' && !c.__ctxPatched) {
        c.getContext = function (...a) {
          const x = origGet.apply(this, a);
          try { if (x && 'imageSmoothingEnabled' in x) x.imageSmoothingEnabled = false; } catch (e) { /* noop */ }
          return x;
        };
      }
    } catch (e) { /* 保底：保留原 getContext */ }
    return c;
  }

  let screenCanvas = null;
  function getScreenCanvas() {
    if (screenCanvas) return screenCanvas;
    screenCanvas = patchCanvas(IN_WX ? wx.createCanvas() : document.getElementById('game'));
    return screenCanvas;
  }

  /* ---------- 物理视口（真实值）+ 虚拟视口（v3） ----------
     虚拟视口 = 可变对象：jsbridge 晚就绪/系统信息晚到时重算，getter 与游戏逐帧自愈
     检查都引用同一对象，自动收敛。 */
  const real = { w: 0, h: 0, dpr: 0 };
  const view = { vw: 1280, vh: 720, dpr: 2, kx: 1, ky: 1 };
  const VH = 720; // 虚拟纵向恒 720（=设计基准短边；横屏锁定前提，改竖屏需重新推导）

  function readSys() {
    try {
      if (IN_WX && wx.getWindowInfo) { const s = wx.getWindowInfo(); if (s && s.windowWidth) { real.w = s.windowWidth; real.h = s.windowHeight; real.dpr = s.pixelRatio || 2; return true; } }
      if (IN_WX && wx.getSystemInfoSync) { const s = wx.getSystemInfoSync(); if (s && s.windowWidth) { real.w = s.windowWidth; real.h = s.windowHeight; real.dpr = s.pixelRatio || 2; return true; } }
      if (!IN_WX && typeof window !== 'undefined') { real.w = window.innerWidth; real.h = window.innerHeight; real.dpr = window.devicePixelRatio || 1; return true; }
    } catch (e) { /* 下次重试 */ }
    return false;
  }

  function computeVirtual() {
    if (!readSys()) return false;
    real.w = Math.max(1, real.w); real.h = Math.max(1, real.h);
    view.vh = VH;
    view.vw = Math.round(VH * (real.w / real.h));
    view.dpr = (real.w * Math.min(2, real.dpr || 2)) / view.vw;
    view.kx = view.vw / real.w;
    view.ky = view.vh / real.h;
    return true;
  }
  computeVirtual();
  /* sys 晚就绪重试：启动极早期 jsbridge 可能未就绪（实测 2-3 条 getSystemInfo fail 报错），
     每 500ms 重读一次，成功即重算虚拟视口并原位更新（getter/触摸映射全部自动跟进） */
  let sysTries = 0;
  const sysTimer = setInterval(() => {
    sysTries++;
    if (readSys()) {
      computeVirtual();
      clearInterval(sysTimer);
    } else if (sysTries >= 40) {
      clearInterval(sysTimer);
    }
  }, 500);

  /* ---------- 小游戏环境：补齐 window / document ---------- */
  if (IN_WX) {
    const storageShim = {
      getItem(k) { try { const v = wx.getStorageSync(k); return v === '' || v == null ? null : String(v); } catch (e) { return null; } },
      setItem(k, v) { try { wx.setStorageSync(k, String(v)); } catch (e) { /* 容量满等 */ } },
      removeItem(k) { try { wx.removeStorageSync(k); } catch (e) {} }
    };
    const dummy = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      appendChild() {}, addEventListener() {}, setAttribute() {} });
    defGlobal('document', {
      __meowDoc: true,
      createElement(tag) {
        const fn = tag === 'canvas' ? () => patchCanvas(wx.createCanvas()) : dummy;
        fn.__stub = true;
        return fn();
      },
      getElementById() { return null; },
      addEventListener() {},
      documentElement: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {} },
      body: Object.assign(dummy(), { classList: { add() {}, remove() {} } }),
      hidden: false,
      fonts: null,
      title: ''
    });
    /* window 桩：视口三件套全部虚拟值（getter 引用 view，重算自动生效）；
       事件派发真实现（像素素材就绪事件靠它） */
    const winListeners = {};
    const win = {
      __meowStub: true,
      get innerWidth() { return view.vw; },
      get innerHeight() { return view.vh; },
      get devicePixelRatio() { return view.dpr; },
      navigator: { userAgent: 'wechat-minigame' },
      location: { search: '', href: 'game://minigame' },
      ontouchstart: null, // 让 H5 的 'ontouchstart' in window 判定为触屏
      addEventListener(t, f) { (winListeners[t] = winListeners[t] || []).push(f); },
      removeEventListener(t, f) { winListeners[t] = (winListeners[t] || []).filter(x => x !== f); },
      dispatchEvent(ev) {
        try { (winListeners[ev.type] || []).slice().forEach(f => f(ev)); } catch (e) { /* 单个监听失败不影响其他 */ }
        return true;
      },
      setTimeout, clearTimeout, setInterval, clearInterval
    };
    if (wx.createWebAudioContext) {
      // audio.js 里 `new AC()`：构造器形式直接返回上下文实例
      win.AudioContext = function () { return wx.createWebAudioContext(); };
    }
    // 本体全部走 window.* / 裸全局，统一挂到 GameGlobal
    defGlobal('localStorage', storageShim);
    defGlobal('window', win);
    defGlobal('navigator', win.navigator);
    /* location 绝不能普通赋值：浏览器宿主上 g.location = obj 等于发起页面导航
       （实测：页面被导航到 "[object Object]"）。只走 defineProperty，失败就保留宿主原生
       location（游戏仅读 search/href，真实浏览器下本来就好用）。 */
    try {
      Object.defineProperty(g, 'location', { value: win.location, configurable: true, writable: true });
    } catch (e) { /* 保留宿主 location */ }
    /* window 桩装不上（开发者工具把 window 锁成真实页面 window）时，
       把真实 window 的视口三件套重定义为 getter（指向 view，重算自动生效）——
       否则游戏会读到整个页面的 innerWidth，画布被等比放大后 1:1 裁切（实测踩雷）。 */
    if (!(window && window.__meowStub)) {
      const pin = t => {
        try {
          Object.defineProperty(t, 'innerWidth', { get: () => view.vw, configurable: true });
          Object.defineProperty(t, 'innerHeight', { get: () => view.vh, configurable: true });
          Object.defineProperty(t, 'devicePixelRatio', { get: () => view.dpr, configurable: true });
        } catch (e) { /* 锁死则放弃 */ }
      };
      try { pin(g.window); } catch (e) {}
      try { if (typeof window !== 'undefined') pin(window); } catch (e) {}
    }
    if (typeof performance === 'undefined' || !performance.now) {
      defGlobal('performance', { now: () => Date.now() });
    }
    if (typeof requestAnimationFrame === 'undefined') {
      defGlobal('requestAnimationFrame', f => setTimeout(() => f(performance.now()), 16));
    }
    /* Event/CustomEvent 桩：仅在宿主没有原生实现时才装（覆盖原生会让 art_pixel 的
       window.dispatchEvent(new CustomEvent(...)) 抛 TypeError，像素管线被误判失败回退） */
    if (typeof Event === 'undefined') defGlobal('Event', function (type) { this.type = type; });
    if (typeof CustomEvent === 'undefined') {
      defGlobal('CustomEvent', function (type, opts) { this.type = type; this.detail = opts && opts.detail; });
    }
    /* 安全 title 写入器：art_pixel（复制品经 sync 脱敏后）经此写 document.title——
       锁死宿主（开发者工具嵌入式页面 title 只读）上静默忽略，不再炸像素管线 */
    defGlobal('__setDocTitle', v => { try { document.title = String(v); } catch (e) { /* 只读宿主忽略 */ } });
    /* 像素素材就绪门：fork 版 main.js 保留与 H5 一致的 __PIXEL_GATE 启动门；
       5s 兜底防素材异常卡启动（art_pixel 失败路径也会派发就绪事件）。
       gate 同时挂 win 与 GameGlobal：真机 window===win，开发者工具 window 被锁则走 pin 路径。
       __PIXEL_GATE_RESOLVE 供 art_pixel 复制品（sync 脱敏）直接 resolve，绕开事件系统差异。 */
    const pixelGate = new Promise(res => {
      try { win.addEventListener('pixel-assets-ready', () => res()); } catch (e) {}
      defGlobal('__PIXEL_GATE_RESOLVE', () => res());
      setTimeout(res, 5000);
    });
    win.__PIXEL_GATE = pixelGate;
    defGlobal('__PIXEL_GATE', pixelGate);
    /* 像素字体：内置 Fusion Pixel 子集。wx.loadFont 注册后返回字体家族名——
       tools_font.py 已把子集字体的家族名统一改写为 "Fusion Pixel"，与游戏内
       所有 '"Fusion Pixel",...' 字体栈精确命中（勿单独改动家族名，改请同步 tools_font.py） */
    try {
      if (wx.loadFont) wx.loadFont('assets/fonts/meow-pixel.ttf');
    } catch (e) { /* 字体失败回退系统字体 */ }
    /* 微信胶囊按钮（物理pt）→ 虚拟坐标，供 HUD 避让（随视口重算自动更新） */
    try {
      if (wx.getMenuButtonBoundingClientRect) {
        const c = wx.getMenuButtonBoundingClientRect();
        if (c && c.width) {
          defGlobal('__CAPSULE', {
            get left() { return c.left * view.kx; },
            get right() { return c.right * view.kx; },
            get top() { return c.top * view.ky; },
            get bottom() { return c.bottom * view.ky; },
            get width() { return c.width * view.kx; },
            get height() { return c.height * view.ky; }
          });
        }
      }
    } catch (e) { /* noop */ }
    /* 猫叫采样 fetch（ArrayBuffer）+ 像素清单 fetch（json）→ 读代码包内文件 */
    const utf8 = buf => {
      try { return new TextDecoder('utf-8').decode(buf); } catch (e) { /* 手动解码兜底 */ }
      const a = new Uint8Array(buf);
      let s = '';
      for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
      try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
    };
    if (typeof fetch !== 'function' && wx.getFileSystemManager) {
      g.fetch = url => new Promise(resolve => {
        const p = String(url).replace(/^https?:\/\/[^/]+\//, '');
        const fsm = wx.getFileSystemManager();
        const tryRead = paths => {
          if (!paths.length) {
            resolve({ ok: false, arrayBuffer: () => Promise.resolve(null), json: () => Promise.reject(new Error('404')) });
            return;
          }
          fsm.readFile({
            path: paths[0],
            success: r => resolve({
              ok: true,
              arrayBuffer: () => Promise.resolve(r.data),
              json: () => Promise.resolve(JSON.parse(utf8(r.data)))
            }),
            fail: () => tryRead(paths.slice(1))
          });
        };
        tryRead([p, '/' + p]);
      });
    }
    /* 像素精灵加载：new Image() → wx.createImage（Image.src 支持代码包相对路径） */
    if (typeof Image === 'undefined' && wx.createImage) {
      defGlobal('Image', function () { return wx.createImage(); });
    }
  }

  /* ---------- 触摸桥：wx.onTouch* → 画布 touch 事件（物理pt → 虚拟px 映射） ---------- */
  const sc = getScreenCanvas();
  if (typeof wx !== 'undefined' && wx.onTouchStart) {
    const mapT = t => ({ ...t, clientX: t.clientX * view.kx, clientY: t.clientY * view.ky });
    const wrap = res => ({
      changedTouches: (res.changedTouches || []).map(mapT),
      touches: (res.touches || []).map(mapT),
      preventDefault() {}
    });
    wx.onTouchStart(res => sc._dispatch('touchstart', wrap(res)));
    wx.onTouchMove(res => sc._dispatch('touchmove', wrap(res)));
    wx.onTouchEnd(res => sc._dispatch('touchend', wrap(res)));
    if (wx.onTouchCancel) wx.onTouchCancel(res => sc._dispatch('touchcancel', wrap(res)));
  }

  /* ---------- 供入口/测试使用 ---------- */
  g.__platform = {
    IN_WX,
    screenCanvas: () => getScreenCanvas(),
    sys: real,
    virtual: view
  };

  /* ---------- 启动错误自诊断：未捕获异常定期画到屏幕上（体验反馈可截图回报） ----------
     角标仅 develop 环境可见；体验版/正式版只在发生致命启动错误时显示首行友好提示。 */
  try {
    const bootErrs = [];
    const trap = e => { try { bootErrs.push(String((e && (e.message + '\n' + e.stack)) || e).slice(0, 300)); } catch (x) { /* noop */ } };
    try { if (wx.onError) wx.onError(trap); } catch (e) { /* noop */ }
    try { if (typeof g.onError === 'function') { const o = g.onError; g.onError = e => { o(e); trap(e); }; } } catch (e) { /* noop */ }
    try { if (typeof g.onError !== 'function') defGlobal('onError', e => trap(e)); } catch (e) { /* noop */ }
    /* 体验版/正式版不向用户暴露原始 stack：非 develop 环境只显示首行友好提示 */
    let badgeOn = false;
    let showStack = false;
    try {
      const mpInfo = (wx.getAccountInfoSync && wx.getAccountInfoSync().miniProgram) || null;
      const env = mpInfo ? mpInfo.envVersion : 'develop';
      badgeOn = env === 'develop';
      showStack = env === 'develop';
    } catch (e) { badgeOn = false; showStack = false; }
    setInterval(() => {
      try {
        const cv2 = getScreenCanvas();
        const x2 = cv2.getContext('2d');
        if (badgeOn) {
          /* 角标：v3 视口自检（版本号 + 虚拟视口 + 实际 backing），仅 develop 环境可见 */
          x2.save();
          x2.fillStyle = 'rgba(0,255,0,.85)';
          x2.font = '16px monospace';
          x2.textBaseline = 'top';
          x2.fillText('V3 ' + view.vw + 'x' + view.vh + ' dpr=' + view.dpr.toFixed(3) + ' backing=' + cv2.width + 'x' + cv2.height, 8, 6);
          x2.restore();
        }
        if (!bootErrs.length) return;
        x2.save();
        x2.fillStyle = '#000'; x2.fillRect(0, 0, cv2.width, cv2.height);
        x2.fillStyle = '#ff6b81'; x2.font = '28px monospace'; x2.textBaseline = 'top';
        x2.fillText('BOOT ERROR (x' + bootErrs.length + ')', 20, 20);
        x2.fillStyle = '#fff'; x2.font = '22px monospace';
        bootErrs.slice(0, 3).forEach((m, i) => {
          const shown = showStack ? m : m.split('\n')[0] + '\n(反馈时请附本截图)';
          for (let j = 0; j * 46 < shown.length && j < 5; j++) {
            x2.fillText(shown.slice(j * 46, j * 46 + 46), 20, 70 + i * 240 + j * 30);
          }
        });
        x2.restore();
      } catch (e) { /* noop */ }
    }, 1500);
  } catch (e) { /* noop */ }
})();
