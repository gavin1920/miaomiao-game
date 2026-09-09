/*
 * art_pixel.js —— 像素素材适配层（M4）
 * 在原版 art.js 之后加载：异步读取 pixel-assets/ 的 PNG，把 Art 的
 * 角色/敌人/弹幕/道具/图标字段替换为像素精灵；保留原版的
 * 光晕/天空/闪电等代码绘制部分。drawImage 一律不平滑。
 */
(function () {
  'use strict';
  if (typeof Art === 'undefined') { document.title = 'AP:no Art'; return; }

  const MANIFEST_URL = 'pixel-assets/manifest.json';

  // 把一张小图按整数倍 scale 烘焙到 canvas
  function bake(img, scale, dw, dh) {
    const c = document.createElement('canvas');
    c.width = dw || img.width * scale;
    c.height = dh || img.height * scale;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  // 整体白闪剪影（受击用）
  function whiteOf(c) {
    const w = document.createElement('canvas');
    w.width = c.width; w.height = c.height;
    const x = w.getContext('2d');
    x.drawImage(c, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#fff6e0';
    x.fillRect(0, 0, w.width, w.height);
    return w;
  }

  const load = (src) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(src));
    im.src = src;
  });

  document.title = 'AP:fetching';
  const manifestPromise = window.PIXEL_MANIFEST
    ? Promise.resolve(window.PIXEL_MANIFEST)
    : fetch(MANIFEST_URL).then((r) => r.json());
  manifestPromise.then(async (M) => {
    document.title = 'AP:stage-manifest';
    document.title = 'AP:manifest-ok';
    const cache = {};
    const get = async (p) => (cache[p] || (cache[p] = await load('pixel-assets/' + p)));

    async function frame(p, scale) {
      const img = await get(p);
      return bake(img, scale);
    }

    /* ---- 主角：48 网格 → 96 画布（原引擎按 112 槽位绘制，居中偏移在替换时吸收） ---- */
    const PS = 2; // 网格→画布倍率
    const pf = M.player;
    const idle = await Promise.all(pf.idle.map((p) => frame(p, PS)));
    const blink = await Promise.all(pf.blink.map((p) => frame(p, PS)));
    const walk = await Promise.all(pf.walk.map((p) => frame(p, PS)));
    const hurt = await Promise.all(pf.hurt.map((p) => frame(p, PS)));
    const dead = await Promise.all(pf.dead.map((p) => frame(p, PS)));
    const dash = pf.dash ? await Promise.all(pf.dash.map((p) => frame(p, PS))) : [];
    // 原版 idle 2 帧（第 2 帧天然眨眼间隔）；blink 与原版 playerFrames 同构为单帧（drawPlayer 直接 drawImage）
    Art.playerFrames = {
      idle: [idle[0], idle[1] || idle[0]],
      blink: blink[0],
      walk: walk,
      hurt: hurt[0],
      dead: dead[0],
      dash: dash,
    };
    console.log('[art_pixel] playerFrames idle width =', Art.playerFrames.idle[0].width, 'frames:', idle.length, walk.length);
    Art.menuCatBlink = blink[0] ? bake(blink[0], 10) : idle[0];
    const menu1 = idle[0], menu2 = pf.menu ? await frame(pf.menu[1], PS) : idle[0];
    Art.menuCat = [menu1, menu2];
    Art.playerWhite = whiteOf(idle[0]);

    document.title = 'AP:stage-player-done';
    /* ---- 敌人 ---- */
    for (const [type, def] of Object.entries(M.enemies)) {
      const scale = def.scale;
      const walk = await Promise.all(def.walk.map((p) => frame(p, scale)));
      const set = { walk, idle: walk };
      if (def.blink) set.blink = await Promise.all(def.blink.map((p) => frame(p, scale)));
      if (def.attack) set.attack = await Promise.all(def.attack.map((p) => frame(p, scale)));
      if (def.tele) set.tele = await frame(def.tele, scale);
      if (def.dead) set.dead = await frame(def.dead, scale);
      Art.E[type] = set;
      // EW：整体白闪剪影（按 walk 帧索引对齐的数组）
      Art.EW[type] = walk.map(whiteOf);
    }

    /* ---- 弹幕 ---- */
    Art.projs = Art.projs || {};
    for (const [k, paths] of Object.entries(M.projs || {})) {
      if (Array.isArray(paths)) Art.projs[k] = await Promise.all(paths.map((p) => frame(p, 2)));
      else Art.projs[k] = await frame(paths, 2);
    }
    if (M.slash) Art.slash = await frame(M.slash, 2);

    /* ---- 道具/图标 ---- */
    Art.items = Art.items || {};
    for (const [k, p] of Object.entries(M.items || {})) Art.items[k] = await frame(p, 2);
    Art.icons = Art.icons || {};
    for (const [k, p] of Object.entries(M.icons || {})) Art.icons[k] = await frame(p, 2);
    const pawFallback = await (async () => { const p = M.icons && M.icons.paw ? await get(M.icons.paw) : null; return p ? bake(p, 2) : canvas2(112, 112); })();
    function canvas2(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    Art.icons = new Proxy(Art.icons, { get(t, k) { if (k in t) return t[k]; return t[k] = pawFallback; } });

    /* ---- 地物 ---- */
    Art.decor = Art.decor || {};
    for (const [k, p] of Object.entries(M.decor || {})) Art.decor[k] = await frame(p, 2);

    /* ---- 王冠（精英） ---- */
    if (M.eliteCrown) Art.eliteCrown = await frame(M.eliteCrown, 2);

    document.title = 'AP:stage-before-sky moon=' + (M.sky ? 'hasSky' : 'noSky');
    /* ---- 像素天空（月/云/天际线） ---- */
    if (M.sky) {
      Art.sky = Art.sky || {};
      for (const [k, def] of Object.entries(M.sky)) {
        const img = await get(def.path);
        Art.sky[k] = bake(img, 1, def.w, def.h);
      }
    }

    /* ---- 全局：像素渲染 ---- */
    const cv = document.getElementById('game');
    if (cv) {
      const ctx = cv.getContext('2d');
      const noSmooth = () => { ctx.imageSmoothingEnabled = false; };
      noSmooth();
      new MutationObserver(noSmooth).observe(cv, { attributes: true });
      window.addEventListener('resize', noSmooth);
    }
    document.documentElement.classList.add('pixel-ready');
    document.documentElement.dataset.pixelMode = 'sprite';
    document.title = '喵都幸存者 Meow Survivors';
    window.dispatchEvent(new CustomEvent('pixel-assets-ready'));
  }).catch((err) => {
    /* 兜底:file:// 下 fetch 会被浏览器拦下,或素材缺失——回退原版矢量美术,游戏照常开局 */
    console.error('[art_pixel] 素材加载失败，回退原版矢量美术：', err);
    document.documentElement.classList.add('pixel-ready');
    document.documentElement.dataset.pixelMode = 'fallback';
    document.title = '喵都幸存者 Meow Survivors';
    window.dispatchEvent(new CustomEvent('pixel-assets-ready'));
  });
})();
