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
    /* ---- 意见2/3 新增精灵（像素规范：墨色描边 / 2 阶平涂 + 暗带 / 硬偏移落影） ---- */
    // 新集装箱配色：青 / 琥珀（集装箱堆场色彩交错用）
    S.contCyan = S.container('#3f9aa8'); S.contAmber = S.container('#c9883a');
    /* 老城钟楼（地标大建筑） */
    S.clockTower = bake2(180, 350, x => {
      // 硬偏移落影
      x.save(); x.globalAlpha = 0.3; x.fillStyle = '#0c0a18';
      rr(x, 48, 281, 180, 350, 10); x.fill(); x.restore();
      // 台基
      rr(x, 40, 268, 100, 74, 8); x.fillStyle = '#8a84a0'; x.fill();
      rr(x, 40, 314, 100, 28, 6); x.fillStyle = 'rgba(0,0,0,.18)'; x.fill();
      x.lineWidth = 3.6; x.strokeStyle = '#211b2c'; x.stroke();
      // 钟体
      rr(x, 54, 106, 72, 170, 8); x.fillStyle = '#a89cb4'; x.fill();
      rr(x, 54, 220, 72, 56, 6); x.fillStyle = 'rgba(0,0,0,.15)'; x.fill();
      x.lineWidth = 3.6; x.strokeStyle = '#211b2c'; x.stroke();
      // 拱窗
      for (const wy of [124, 236]) {
        x.beginPath(); x.moveTo(78, wy + 24); x.lineTo(78, wy + 12); x.arc(90, wy + 12, 12, Math.PI, 0); x.lineTo(102, wy + 24); x.closePath();
        x.fillStyle = '#332c3d'; x.fill(); x.lineWidth = 2.6; x.strokeStyle = '#211b2c'; x.stroke();
      }
      // 钟面
      circ(x, 90, 196, 25, '#f2ead2', '#211b2c', 3.4);
      x.strokeStyle = '#211b2c'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(90, 196); x.lineTo(90, 182); x.moveTo(90, 196); x.lineTo(101, 201); x.stroke();
      circ(x, 90, 196, 3, '#211b2c');
      // 瞭望层 + 大钟腔
      rr(x, 46, 60, 88, 48, 7); x.fillStyle = '#6a6480'; x.fill(); x.lineWidth = 3.6; x.strokeStyle = '#211b2c'; x.stroke();
      x.beginPath(); x.moveTo(66, 104); x.lineTo(66, 86); x.arc(90, 86, 24, Math.PI, 0); x.lineTo(114, 104); x.closePath();
      x.fillStyle = '#2c2636'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#211b2c'; x.stroke();
      circ(x, 90, 94, 10, '#e8b45c', '#a8782e', 2.6);
      // 尖顶
      x.beginPath(); x.moveTo(90, 8); x.lineTo(134, 62); x.lineTo(46, 62); x.closePath();
      x.fillStyle = '#c05a52'; x.fill(); x.lineWidth = 3.6; x.strokeStyle = '#211b2c'; x.stroke();
      x.fillStyle = 'rgba(255,255,255,.16)';
      x.beginPath(); x.moveTo(90, 8); x.lineTo(112, 62); x.lineTo(90, 62); x.closePath(); x.fill();
      // 尖顶小旗
      x.fillStyle = '#ffd34d';
      x.beginPath(); x.moveTo(90, 8); x.lineTo(114, 15); x.lineTo(90, 22); x.closePath(); x.fill();
      x.lineWidth = 2; x.strokeStyle = '#a8782e'; x.stroke();
    });
    /* 老城大牌坊（跨街门洞：两柱用 pillars 阻挡，中央通行） */
    S.paifang = bake2(300, 210, x => {
      shadow(x, 150, 202, 100, 9);
      // 四柱（明柱粗 + 边柱细）
      for (const [px, pw] of [[70, 22], [230, 22], [22, 14], [278, 14]]) {
        rr(x, px - pw / 2, 40, pw, 162, 4); x.fillStyle = '#b8443c'; x.fill();
        x.lineWidth = 3; x.strokeStyle = '#211b2c'; x.stroke();
      }
      // 柱础
      for (const px of [70, 230]) { rr(x, px - 16, 192, 32, 12, 3); x.fillStyle = '#5d5670'; x.fill(); x.lineWidth = 2.4; x.strokeStyle = '#211b2c'; x.stroke(); }
      // 额枋（红绿相间三层）
      rr(x, 12, 108, 276, 18, 4); x.fillStyle = '#2f5a46'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#211b2c'; x.stroke();
      rr(x, 30, 86, 240, 16, 4); x.fillStyle = '#c05a52'; x.fill(); x.stroke();
      rr(x, 46, 66, 208, 14, 4); x.fillStyle = '#2f5a46'; x.fill(); x.stroke();
      // 金字匾额
      rr(x, 116, 108, 68, 30, 4); x.fillStyle = '#2a2438'; x.fill(); x.lineWidth = 2.6; x.strokeStyle = '#211b2c'; x.stroke();
      rr(x, 120, 112, 60, 22, 3); x.fillStyle = '#ffd34d'; x.fill(); x.lineWidth = 2; x.stroke();
      x.fillStyle = '#b8443c'; x.font = '900 17px sans-serif'; x.textAlign = 'center'; x.fillText('老街', 150, 129);
      // 出檐（两端上翘）
      rr(x, 6, 44, 288, 16, 6); x.fillStyle = '#3a3450'; x.fill(); x.lineWidth = 3.2; x.strokeStyle = '#211b2c'; x.stroke();
      x.fillStyle = '#3a3450';
      x.beginPath(); x.moveTo(10, 52); x.quadraticCurveTo(2, 38, 18, 30); x.lineTo(30, 44); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(290, 52); x.quadraticCurveTo(298, 38, 282, 30); x.lineTo(270, 44); x.closePath(); x.fill();
      // 顶檐瓦垄
      rr(x, 22, 30, 256, 12, 5); x.fillStyle = '#2c2740'; x.fill(); x.lineWidth = 2.6; x.strokeStyle = '#211b2c'; x.stroke();
      x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = 2;
      x.beginPath();
      for (let gx = 40; gx < 260; gx += 24) { x.moveTo(gx, 32); x.lineTo(gx, 40); }
      x.stroke();
      // 檐角风铃
      for (const px of [34, 266]) circ(x, px, 54, 4, '#e8b45c', '#a8782e', 2);
    });
    /* 樱花神社拜殿（地标大建筑） */
    S.shrine = bake2(340, 250, x => {
      // 硬偏移落影
      x.save(); x.globalAlpha = 0.3; x.fillStyle = '#0c0a18'; rr(x, 28, 105, 340, 250, 10); x.fill(); x.restore();
      // 主体
      rr(x, 20, 92, 300, 148, 8); x.fillStyle = '#8a6a52'; x.fill();
      rr(x, 20, 176, 300, 64, 6); x.fillStyle = 'rgba(0,0,0,.18)'; x.fill();
      x.lineWidth = 3.6; x.strokeStyle = '#211b2c'; x.stroke();
      // 前列红柱
      for (const px of [46, 294]) {
        rr(x, px - 9, 118, 18, 122, 4); x.fillStyle = '#c04a40'; x.fill();
        x.lineWidth = 2.8; x.strokeStyle = '#211b2c'; x.stroke();
      }
      // 中门 + 参拜铃
      rr(x, 150, 152, 40, 88, 5); x.fillStyle = '#3a2c28'; x.fill(); x.lineWidth = 2.6; x.strokeStyle = '#211b2c'; x.stroke();
      x.strokeStyle = '#4a3826'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(170, 152); x.lineTo(170, 134); x.stroke();
      circ(x, 170, 127, 9, '#e8b45c', '#a8782e', 2.4);
      // 大屋顶
      x.beginPath(); x.moveTo(6, 98); x.quadraticCurveTo(26, 56, 170, 48); x.quadraticCurveTo(314, 56, 334, 98);
      x.quadraticCurveTo(296, 84, 170, 80); x.quadraticCurveTo(44, 84, 6, 98); x.closePath();
      x.fillStyle = '#4a4658'; x.fill(); x.lineWidth = 3.6; x.strokeStyle = '#211b2c'; x.stroke();
      x.fillStyle = 'rgba(255,255,255,.10)';
      x.beginPath(); x.moveTo(170, 48); x.quadraticCurveTo(240, 52, 280, 72); x.quadraticCurveTo(220, 66, 170, 66); x.closePath(); x.fill();
      // 正脊 + 千木
      rr(x, 108, 40, 124, 13, 4); x.fillStyle = '#3a3646'; x.fill(); x.lineWidth = 2.6; x.strokeStyle = '#211b2c'; x.stroke();
      x.strokeStyle = '#3a3646'; x.lineWidth = 7;
      x.beginPath(); x.moveTo(116, 44); x.lineTo(102, 20); x.moveTo(224, 44); x.lineTo(238, 20); x.stroke();
      // 檐下悬灯
      for (const lx of [70, 270]) {
        x.strokeStyle = '#4a3826'; x.lineWidth = 1.8; x.beginPath(); x.moveTo(lx, 100); x.lineTo(lx, 112); x.stroke();
        ell(x, lx, 121, 8, 10, '#e05548', '#8a2a26', 2);
      }
    });
    /* 港湾岸桥（龙门吊，地标：两腿 pillars 阻挡，门洞可穿行） */
    S.gantry = bake2(320, 340, x => {
      shadow(x, 160, 330, 116, 9);
      // 海侧 / 陆侧门架腿（±120，警示涂装）
      for (const lx of [40, 280]) {
        rr(x, lx - 13, 84, 26, 226, 5); x.fillStyle = '#3e5e80'; x.fill();
        x.lineWidth = 3.2; x.strokeStyle = '#22303e'; x.stroke();
        x.fillStyle = '#e8b45c'; x.fillRect(lx - 13, 286, 26, 8);
      }
      // 交叉斜撑
      x.strokeStyle = 'rgba(34,48,62,.5)'; x.lineWidth = 8;
      x.beginPath(); x.moveTo(53, 130); x.lineTo(267, 220); x.moveTo(267, 130); x.lineTo(53, 220); x.stroke();
      // 大梁 + 塔架拉杆
      rr(x, 16, 58, 288, 26, 6); x.fillStyle = '#46688c'; x.fill(); x.lineWidth = 3.4; x.strokeStyle = '#22303e'; x.stroke();
      x.strokeStyle = '#22303e'; x.lineWidth = 4;
      x.beginPath(); x.moveTo(40, 84); x.lineTo(160, 30); x.lineTo(280, 84); x.stroke();
      // 前小车 + 吊具
      rr(x, 146, 84, 36, 20, 4); x.fillStyle = '#33404e'; x.fill(); x.lineWidth = 2.6; x.strokeStyle = '#211b2c'; x.stroke();
      x.strokeStyle = '#33404e'; x.lineWidth = 2.6;
      x.beginPath(); x.moveTo(164, 104); x.lineTo(164, 236); x.stroke();
      rr(x, 146, 236, 36, 18, 3); x.fillStyle = '#c9883a'; x.fill(); x.lineWidth = 2.6; x.strokeStyle = '#211b2c'; x.stroke();
      // 爬梯 + 航标灯
      x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 2;
      x.beginPath();
      for (let ty = 100; ty < 288; ty += 14) { x.moveTo(46, ty); x.lineTo(58, ty); }
      x.stroke();
      circ(x, 300, 50, 5, '#ff6a5a', '#8a2a26', 2);
    });
    /* 远洋货轮（海上装饰大件：水已阻挡，无需碰撞） */
    S.cargoShip = bake2(460, 190, x => {
      shadow(x, 230, 178, 190, 8);
      // 船体
      x.beginPath();
      x.moveTo(14, 100); x.quadraticCurveTo(54, 68, 150, 64); x.lineTo(396, 64);
      x.quadraticCurveTo(446, 68, 452, 96); x.quadraticCurveTo(444, 132, 414, 142);
      x.lineTo(58, 142); x.quadraticCurveTo(22, 130, 14, 100); x.closePath();
      x.fillStyle = '#7a3a34'; x.fill(); x.lineWidth = 3.6; x.strokeStyle = '#2a1c20'; x.stroke();
      // 舷侧浅色带 + 吃水线
      rr(x, 26, 96, 412, 13, 4); x.fillStyle = '#d8d2c4'; x.fill();
      x.strokeStyle = 'rgba(42,28,32,.4)'; x.lineWidth = 2; x.stroke();
      x.strokeStyle = 'rgba(16,28,44,.55)'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(22, 122); x.lineTo(444, 122); x.stroke();
      // 上层建筑（艉楼）+ 驾驶窗 + 烟囱
      rr(x, 58, 26, 88, 38, 5); x.fillStyle = '#e8e2d4'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#2a1c20'; x.stroke();
      rr(x, 66, 32, 72, 10, 3); x.fillStyle = '#3e5a6e'; x.fill();
      rr(x, 128, 12, 28, 28, 5); x.fillStyle = '#c04a40'; x.fill(); x.lineWidth = 2.8; x.strokeStyle = '#2a1c20'; x.stroke();
      x.fillStyle = '#2a1c20'; x.fillRect(128, 20, 28, 7);
      // 甲板集装箱（两叠）
      const cc = ['#c05a52', '#4a7ab5', '#3f9aa8', '#c9883a', '#4f8f5e'];
      for (let i = 0; i < 7; i++) {
        rr(x, 186 + i * 32, 44, 30, 18, 3); x.fillStyle = cc[i % 5]; x.fill();
        x.lineWidth = 2; x.strokeStyle = '#2a1c20'; x.stroke();
      }
      rr(x, 202, 26, 30, 16, 3); x.fillStyle = cc[3]; x.fill(); x.lineWidth = 2; x.strokeStyle = '#2a1c20'; x.stroke();
      rr(x, 298, 26, 30, 16, 3); x.fillStyle = cc[1]; x.fill(); x.stroke();
      // 桅杆 + 船旗
      x.strokeStyle = '#2a1c20'; x.lineWidth = 2.6; x.beginPath(); x.moveTo(420, 62); x.lineTo(420, 26); x.stroke();
      x.fillStyle = '#ff8f9f'; x.beginPath(); x.moveTo(420, 26); x.lineTo(438, 31); x.lineTo(420, 36); x.closePath(); x.fill();
    });
    /* 储油罐（油罐区） */
    S.oilTank = bake2(180, 140, x => {
      shadow(x, 90, 132, 64, 8);
      rr(x, 20, 34, 140, 98, 9); x.fillStyle = '#cdd6de'; x.fill();
      rr(x, 20, 98, 140, 34, 8); x.fillStyle = 'rgba(0,0,0,.14)'; x.fill();
      x.lineWidth = 3.4; x.strokeStyle = '#454a56'; x.stroke();
      ell(x, 90, 36, 70, 17, '#dfe6ec', '#454a56', 3.2);
      rr(x, 62, 12, 13, 18, 3); x.fillStyle = '#8a93a0'; x.fill(); x.lineWidth = 2.4; x.strokeStyle = '#454a56'; x.stroke();
      // 环向拼缝 + 警示环带
      x.strokeStyle = 'rgba(69,74,86,.45)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(24, 64); x.lineTo(156, 64); x.moveTo(24, 88); x.lineTo(156, 88); x.stroke();
      x.fillStyle = '#e0a83c'; x.fillRect(24, 74, 132, 9);
      // 盘梯
      x.strokeStyle = '#454a56'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(158, 130); x.lineTo(172, 130); x.lineTo(172, 42); x.lineTo(148, 34); x.stroke();
      x.strokeStyle = 'rgba(69,74,86,.6)'; x.lineWidth = 2;
      x.beginPath();
      for (let ty = 46; ty < 128; ty += 12) { x.moveTo(166, ty); x.lineTo(176, ty); }
      x.stroke();
    });
    /* 雪顶凉亭（雪山庭园地标） */
    S.snowPavilion = bake2(210, 180, x => {
      shadow(x, 105, 172, 68, 8);
      for (const px of [44, 105, 166]) {
        rr(x, px - 8, 84, 16, 84, 4); x.fillStyle = '#7a7488'; x.fill();
        x.lineWidth = 2.8; x.strokeStyle = '#453244'; x.stroke();
      }
      rr(x, 26, 160, 158, 13, 5); x.fillStyle = '#8a84a0'; x.fill(); x.lineWidth = 2.8; x.strokeStyle = '#453244'; x.stroke();
      // 攒尖顶
      x.beginPath(); x.moveTo(105, 12); x.quadraticCurveTo(176, 56, 192, 98); x.lineTo(18, 98); x.quadraticCurveTo(34, 56, 105, 12); x.closePath();
      x.fillStyle = '#5d4a5e'; x.fill(); x.lineWidth = 3.4; x.strokeStyle = '#3a2c3e'; x.stroke();
      // 顶面积雪
      x.beginPath(); x.moveTo(105, 12); x.quadraticCurveTo(152, 34, 172, 66); x.quadraticCurveTo(128, 52, 105, 56); x.quadraticCurveTo(82, 52, 38, 66); x.quadraticCurveTo(58, 34, 105, 12); x.closePath();
      x.fillStyle = 'rgba(244,248,252,.95)'; x.fill();
      // 宝顶 + 风铃
      circ(x, 105, 12, 7, '#e8b45c', '#a8782e', 2.4);
      for (const px of [58, 152]) {
        x.strokeStyle = '#453244'; x.lineWidth = 2; x.beginPath(); x.moveTo(px, 98); x.lineTo(px, 112); x.stroke();
        ell(x, px, 117, 5, 6, '#e8b45c', '#a8782e', 2);
      }
    });
    /* 马戏团主帐篷（游乐园地标大帐篷） */
    S.bigTop = bake2(360, 290, x => {
      shadow(x, 180, 280, 132, 11);
      // 主体验（放射条纹大锥顶）
      x.beginPath(); x.moveTo(180, 16);
      x.quadraticCurveTo(296, 66, 320, 196); x.quadraticCurveTo(330, 244, 314, 254);
      x.quadraticCurveTo(180, 278, 46, 254); x.quadraticCurveTo(30, 244, 40, 196);
      x.quadraticCurveTo(64, 66, 180, 16); x.closePath();
      x.fillStyle = '#b8444e'; x.fill(); x.lineWidth = 4; x.strokeStyle = '#2c1c2e'; x.stroke();
      x.save(); x.clip();
      x.fillStyle = '#f2e8d8';
      for (let i = 0; i < 4; i++) {
        const bx = 66 + i * 64;
        x.beginPath(); x.moveTo(180, 16); x.lineTo(bx + 16, 272); x.lineTo(bx - 16, 272); x.closePath(); x.fill();
      }
      // 底口阴影
      x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(30, 238, 300, 40);
      x.restore();
      // 底边扇贝
      x.fillStyle = '#8a2e3a';
      for (let i = 0; i < 7; i++) {
        x.beginPath(); x.arc(64 + i * 39, 258, 12, 0, Math.PI); x.fill();
      }
      // 入口
      x.beginPath(); x.moveTo(154, 270); x.lineTo(160, 200); x.quadraticCurveTo(180, 186, 200, 200); x.lineTo(206, 270); x.closePath();
      x.fillStyle = '#241a26'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#2c1c2e'; x.stroke();
      // 尖顶旗
      x.strokeStyle = '#2c1c2e'; x.lineWidth = 3.4; x.beginPath(); x.moveTo(180, 16); x.lineTo(180, 4); x.stroke();
      x.fillStyle = '#ffd34d'; x.beginPath(); x.moveTo(180, 2); x.lineTo(206, 9); x.lineTo(180, 16); x.closePath(); x.fill();
      x.lineWidth = 2; x.strokeStyle = '#a8782e'; x.stroke();
      // 门口挂灯
      for (const lx of [136, 224]) circ(x, lx, 214, 4, '#ffe9a8', '#a8782e', 1.6);
    });
    /* ---- 意见2第二轮小件精灵 ---- */
    /* 叉车（堆场作业车） */
    S.forklift = bake2(96, 78, x => {
      shadow(x, 48, 70, 34, 6);
      // 货叉 + 门架
      x.fillStyle = '#3a4252'; x.fillRect(6, 30, 22, 6); x.fillRect(6, 44, 22, 6);
      x.strokeStyle = '#2c3340'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(28, 16); x.lineTo(28, 60); x.moveTo(38, 16); x.lineTo(38, 60); x.stroke();
      // 车身
      rr(x, 36, 24, 46, 38, 7); x.fillStyle = '#e8a83c'; x.fill();
      rr(x, 36, 46, 46, 16, 5); x.fillStyle = 'rgba(0,0,0,.18)'; x.fill();
      x.lineWidth = 3.2; x.strokeStyle = '#211b2c'; x.stroke();
      // 驾驶棚
      rr(x, 60, 8, 24, 22, 5); x.fillStyle = '#4a5568'; x.fill(); x.lineWidth = 2.8; x.strokeStyle = '#211b2c'; x.stroke();
      // 车轮
      for (const [wx, wy] of [[46, 62], [72, 62]]) circ(x, wx, wy, 7, '#2c2f3e', '#171a26', 2.4);
    });
    /* 集装箱拖挂车（堆场巷道作业） */
    S.contTruck = bake2(300, 116, x => {
      shadow(x, 150, 108, 118, 7);
      // 底盘
      rr(x, 14, 60, 268, 16, 4); x.fillStyle = '#33394a'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#211b2c'; x.stroke();
      // 车载集装箱
      rr(x, 24, 14, 190, 50, 5); x.fillStyle = '#4a7ab5'; x.fill();
      x.save(); rr(x, 24, 14, 190, 50, 5); x.clip();
      x.strokeStyle = 'rgba(255,255,255,.22)'; x.lineWidth = 3;
      for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo(32 + i * 15, 16); x.lineTo(32 + i * 15, 62); x.stroke(); }
      x.restore();
      rr(x, 24, 14, 190, 50, 5); x.lineWidth = 3.2; x.strokeStyle = '#211b2c'; x.stroke();
      // 车头
      rr(x, 232, 24, 54, 54, 8); x.fillStyle = '#c05a52'; x.fill();
      rr(x, 240, 30, 30, 22, 5); x.fillStyle = '#a8c4dc'; x.fill(); x.lineWidth = 2.6; x.strokeStyle = '#211b2c'; x.stroke();
      rr(x, 232, 60, 54, 18, 5); x.fillStyle = 'rgba(0,0,0,.18)'; x.fill();
      rr(x, 232, 24, 54, 54, 8); x.lineWidth = 3.2; x.strokeStyle = '#211b2c'; x.stroke();
      for (const wx of [58, 96, 134, 258]) { circ(x, wx, 82, 9, '#2c2f3e', '#171a26', 2.4); }
    });
    /* 雪人 */
    S.snowman = bake2(60, 74, x => {
      shadow(x, 30, 68, 22, 5);
      circ(x, 30, 48, 17, '#f6fafd', '#9db4d0', 3);
      circ(x, 30, 24, 12, '#f6fafd', '#9db4d0', 3);
      circ(x, 26, 21, 1.8, '#211b2c'); circ(x, 34, 21, 1.8, '#211b2c');
      x.fillStyle = '#e0864c'; x.beginPath(); x.moveTo(30, 24); x.lineTo(40, 27); x.lineTo(30, 29); x.closePath(); x.fill();
      // 红围巾 + 桶帽
      rr(x, 20, 33, 20, 6, 3); x.fillStyle = '#c94a5a'; x.fill(); x.lineWidth = 2; x.strokeStyle = '#7e2a36'; x.stroke();
      rr(x, 21, 8, 18, 10, 2); x.fillStyle = '#3a4252'; x.fill(); x.lineWidth = 2.2; x.strokeStyle = '#211b2c'; x.stroke();
      rr(x, 17, 16, 26, 4, 2); x.fill(); x.stroke();
      // 树枝手
      x.strokeStyle = '#7a5c3e'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(14, 40); x.lineTo(2, 32); x.moveTo(46, 40); x.lineTo(58, 32); x.stroke();
    });
    /* 晒衣架（温泉村） */
    S.laundry = bake2(150, 86, x => {
      shadow(x, 75, 80, 52, 5);
      for (const px of [18, 132]) {
        rr(x, px - 4, 14, 8, 66, 3); x.fillStyle = '#7a5c3e'; x.fill();
        x.lineWidth = 2.4; x.strokeStyle = '#54402c'; x.stroke();
        rr(x, px - 14, 10, 28, 6, 3); x.fill(); x.stroke();
      }
      x.strokeStyle = '#8a7460'; x.lineWidth = 2.4;
      x.beginPath(); x.moveTo(18, 22); x.quadraticCurveTo(75, 34, 132, 22); x.stroke();
      // 挂着的衣物
      const cloth = [['#ff9dc3', 38], ['#7de3e0', 66], ['#fff2d8', 94]];
      for (const [c, cxx] of cloth) {
        rr(x, cxx - 9, 24, 18, 26, 4); x.fillStyle = c; x.fill();
        x.lineWidth = 2.2; x.strokeStyle = 'rgba(60,40,70,.5)'; x.stroke();
      }
    });
    /* 电话亭 */
    S.phoneBooth = bake2(52, 88, x => {
      shadow(x, 26, 82, 18, 5);
      rr(x, 8, 8, 36, 74, 6); x.fillStyle = '#c94a5a'; x.fill();
      rr(x, 13, 16, 26, 44, 3); x.fillStyle = '#a8d8e8'; x.fill();
      x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 2.4;
      x.beginPath(); x.moveTo(17, 20); x.lineTo(17, 56); x.stroke();
      rr(x, 8, 8, 36, 74, 6); x.lineWidth = 3.2; x.strokeStyle = '#211b2c'; x.stroke();
      rr(x, 4, 2, 44, 10, 4); x.fillStyle = '#a83a48'; x.fill(); x.lineWidth = 2.6; x.stroke();
      rr(x, 12, 66, 28, 12, 3); x.fillStyle = '#8f2f3c'; x.fill(); x.lineWidth = 2; x.stroke();
    });
    /* 公交站牌 */
    S.busStop = bake2(64, 96, x => {
      shadow(x, 24, 90, 16, 4.5);
      rr(x, 20, 8, 8, 84, 3); x.fillStyle = '#4a5568'; x.fill();
      x.lineWidth = 2.4; x.strokeStyle = '#211b2c'; x.stroke();
      rr(x, 4, 4, 56, 30, 6); x.fillStyle = '#f2ead2'; x.fill();
      x.lineWidth = 2.8; x.strokeStyle = '#211b2c'; x.stroke();
      x.fillStyle = '#4a7ab5';
      for (let i = 0; i < 3; i++) rr(x, 10 + i * 17, 10, 11, 7, 2), x.fill();
      rr(x, 10, 22, 44, 6, 2); x.fillStyle = '#c9cdd8'; x.fill();
      circ(x, 24, 60, 5, '#4fb3b0', '#211b2c', 2);
    });
    /* 售票亭（游乐园） */
    S.ticket = bake2(72, 92, x => {
      shadow(x, 36, 86, 26, 5);
      rr(x, 12, 30, 48, 56, 6); x.fillStyle = '#e8b45c'; x.fill();
      rr(x, 12, 62, 48, 24, 4); x.fillStyle = 'rgba(0,0,0,.18)'; x.fill();
      x.lineWidth = 3.2; x.strokeStyle = '#211b2c'; x.stroke();
      rr(x, 20, 40, 32, 20, 4); x.fillStyle = '#3a2c3e'; x.fill(); x.lineWidth = 2.4; x.stroke();
      x.fillStyle = '#ffd34d'; x.font = '900 14px sans-serif'; x.textAlign = 'center'; x.fillText('券', 36, 55);
      // 尖顶小檐
      x.beginPath(); x.moveTo(36, 4); x.lineTo(64, 32); x.lineTo(8, 32); x.closePath();
      x.fillStyle = '#c94a5a'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#211b2c'; x.stroke();
      x.fillStyle = 'rgba(255,255,255,.2)';
      x.beginPath(); x.moveTo(36, 4); x.lineTo(50, 32); x.lineTo(36, 32); x.closePath(); x.fill();
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
        // 意见2第二轮：大水面游两尾锦鲤（ deterministic，烘焙进地砖）
        if (op.w * op.h > 60000) {
          for (let i = 0; i < 2; i++) {
            const kx = op.x + (0.28 + hs(op, 6, i) * 0.44) * op.w, ky = op.y + (0.3 + hs(op, 7, i) * 0.4) * op.h;
            x.save(); x.translate(kx, ky); x.rotate(hs(op, 8, i) * U.TAU);
            ell(x, 0, 0, 10, 5, i % 2 ? '#ff8f5a' : '#fff2e0');
            x.beginPath(); x.moveTo(-9, 0); x.lineTo(-15, -4.4); x.lineTo(-15, 4.4); x.closePath(); x.fill();
            x.restore();
          }
        }
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
      case 'bridge': {
        // 石桥面：石板 + 两侧矮护栏（贴地装饰，桥面可通行）
        fillGrad(x, op, '#7a7488', '#6e6880');
        const vert = op.h > op.w;
        x.strokeStyle = 'rgba(30,26,40,.5)'; x.lineWidth = 2;
        x.beginPath();
        if (vert) for (let gy = 18; gy < op.h; gy += 18) { x.moveTo(op.x, op.y + gy); x.lineTo(op.x + op.w, op.y + gy); }
        else for (let gx = 18; gx < op.w; gx += 18) { x.moveTo(op.x + gx, op.y); x.lineTo(op.x + gx, op.y + op.h); }
        x.stroke();
        x.fillStyle = '#8a84a0'; x.strokeStyle = '#453244'; x.lineWidth = 2.4;
        const bw = 10;
        if (vert) {
          rr(x, op.x, op.y, bw, op.h, 4); x.fill(); x.stroke();
          rr(x, op.x + op.w - bw, op.y, bw, op.h, 4); x.fill(); x.stroke();
        } else {
          rr(x, op.x, op.y, op.w, bw, 4); x.fill(); x.stroke();
          rr(x, op.x, op.y + op.h - bw, op.w, bw, 4); x.fill(); x.stroke();
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
      /* ---- 地面细节层（意见2第二轮）：只画细节不铺底色，可叠在任意地面上 ---- */
      case 'petals': // 落樱/花瓣地毯
      case 'leafpile': { // 落叶堆
        const pal = op.k === 'petals'
          ? ['rgba(255,196,220,.8)', 'rgba(255,224,238,.85)', 'rgba(240,154,184,.7)', 'rgba(255,255,255,.75)']
          : ['rgba(190,110,60,.75)', 'rgba(160,90,45,.75)', 'rgba(220,150,80,.65)', 'rgba(120,80,40,.6)'];
        const n = Math.round(op.w * op.h / 240);
        for (let i = 0; i < n; i++) {
          x.save(); x.translate(op.x + hs(op, 1, i) * op.w, op.y + hs(op, 2, i) * op.h);
          x.rotate(hs(op, 3, i) * U.TAU);
          ell(x, 0, 0, 4.6, 2.6, pal[(hs(op, 4, i) * pal.length) | 0]);
          x.restore();
        }
        break;
      }
      case 'snowdrift': { // 雪堆：亮面 + 背风暗面
        ell(x, op.x + op.w / 2, op.y + op.h / 2 + 3, op.w / 2, op.h / 2, 'rgba(150,170,205,.4)');
        ell(x, op.x + op.w / 2, op.y + op.h / 2 - 2, op.w / 2 - 3, op.h / 2 - 3, 'rgba(255,255,255,.92)');
        ell(x, op.x + op.w * 0.36, op.y + op.h * 0.3, op.w * 0.2, op.h * 0.16, 'rgba(255,255,255,.95)');
        break;
      }
      case 'footprint': { // 雪地脚印/爪印小径（两列交错）
        const n2 = Math.max(3, Math.round(op.h / 22));
        for (let i = 0; i < n2; i++) {
          const t2 = i / n2, side = i % 2 ? 1 : -1;
          const px = op.x + op.w / 2 + side * op.w * 0.22 + (hs(op, 1, i) - 0.5) * 4;
          const py = op.y + t2 * op.h + 6;
          ell(x, px, py, 3.4, 5, 'rgba(120,140,180,.55)');
        }
        break;
      }
      case 'oil': { // 油渍
        ell(x, op.x + op.w / 2, op.y + op.h / 2, op.w / 2, op.h / 2, 'rgba(20,22,34,.28)');
        ell(x, op.x + op.w * 0.42, op.y + op.h * 0.46, op.w * 0.26, op.h * 0.24, 'rgba(12,14,24,.34)');
        ell(x, op.x + op.w * 0.62, op.y + op.h * 0.6, op.w * 0.14, op.h * 0.12, 'rgba(255,255,255,.08)');
        break;
      }
      case 'tire': { // 轮胎印（双弧）
        x.strokeStyle = 'rgba(22,24,36,.4)'; x.lineWidth = 6;
        x.beginPath();
        x.moveTo(op.x, op.y + op.h * 0.3);
        x.quadraticCurveTo(op.x + op.w / 2, op.y + op.h * (0.3 + hs(op, 1, 1) * 0.5), op.x + op.w, op.y + op.h * 0.4);
        x.moveTo(op.x, op.y + op.h * 0.72);
        x.quadraticCurveTo(op.x + op.w / 2, op.y + op.h * (0.72 + hs(op, 2, 1) * 0.4), op.x + op.w, op.y + op.h * 0.8);
        x.stroke();
        break;
      }
      case 'grate': { // 排水格栅
        rr(x, op.x, op.y, op.w, op.h, 4); x.fillStyle = 'rgba(28,30,46,.8)'; x.fill();
        x.strokeStyle = 'rgba(120,126,150,.5)'; x.lineWidth = 2.4;
        x.beginPath();
        const vert = op.h > op.w;
        if (vert) for (let gy = 4; gy < op.h - 3; gy += 7) { x.moveTo(op.x + 3, op.y + gy); x.lineTo(op.x + op.w - 3, op.y + gy); }
        else for (let gx = 4; gx < op.w - 3; gx += 7) { x.moveTo(op.x + gx, op.y + 3); x.lineTo(op.x + gx, op.y + op.h - 3); }
        x.stroke();
        break;
      }
      case 'chalk': { // 游乐园地面彩绘（粉笔圆圈/彩点/箭头）
        const cols = ['rgba(255,157,195,.5)', 'rgba(125,227,224,.5)', 'rgba(255,211,77,.5)', 'rgba(201,167,255,.5)'];
        x.strokeStyle = cols[(hs(op, 1, 1) * 4) | 0]; x.lineWidth = 4;
        x.beginPath(); x.ellipse(op.x + op.w / 2, op.y + op.h / 2, op.w * 0.32, op.h * 0.32, hs(op, 2, 1), 0, U.TAU); x.stroke();
        for (let i = 0; i < 6; i++) {
          x.fillStyle = cols[(hs(op, 3, i) * 4) | 0];
          circ(x, op.x + hs(op, 4, i) * op.w, op.y + hs(op, 5, i) * op.h, 3.4, x.fillStyle);
        }
        break;
      }
      case 'crack': { // 地面裂缝
        x.strokeStyle = 'rgba(20,16,30,.4)'; x.lineWidth = 3;
        x.beginPath();
        let cx2 = op.x + op.w * 0.2, cy2 = op.y + op.h * 0.3;
        x.moveTo(cx2, cy2);
        for (let i = 0; i < 4; i++) {
          cx2 += (hs(op, 1, i) - 0.3) * op.w * 0.3; cy2 += (hs(op, 2, i) - 0.4) * op.h * 0.3;
          x.lineTo(cx2, cy2);
        }
        x.stroke();
        break;
      }
      case 'koi': { // 锦鲤（水面上）
        for (let i = 0; i < 3; i++) {
          const kx = op.x + (0.2 + hs(op, 1, i) * 0.6) * op.w, ky = op.y + (0.25 + hs(op, 2, i) * 0.5) * op.h;
          x.save(); x.translate(kx, ky); x.rotate(hs(op, 3, i) * U.TAU);
          ell(x, 0, 0, 9, 4.6, i % 2 ? '#ff8f5a' : '#fff2e0');
          x.beginPath(); x.moveTo(-8, 0); x.lineTo(-14, -4); x.lineTo(-14, 4); x.closePath(); x.fill();
          circ(x, 6, -1, 1.4, 'rgba(60,30,20,.6)');
          x.restore();
        }
        break;
      }
      case 'rope': { // 系船缆绳（下垂弧线）
        x.strokeStyle = 'rgba(90,74,54,.75)'; x.lineWidth = 3.4;
        x.beginPath();
        x.moveTo(op.x, op.y + op.h * 0.3);
        x.quadraticCurveTo(op.x + op.w / 2, op.y + op.h, op.x + op.w, op.y + op.h * 0.3);
        x.stroke();
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
    // 2 阶扁平（像素规范）：主体平涂 + 底部 1/4 暗带，不用渐变
    x.fillStyle = roof; x.fill();
    rr(x, bx, by + h * 0.72, w, h * 0.28 + 2, 4); x.fillStyle = 'rgba(0,0,0,.18)'; x.fill();
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
      // 意见2第二轮：瓦垄横线 + 檐口/脊面积雪（旅馆屋顶不再是灰矩形）
      x.strokeStyle = 'rgba(0,0,0,.16)'; x.lineWidth = 2;
      x.beginPath();
      for (let ty2 = 15; ty2 < h - 6; ty2 += 13) { x.moveTo(bx + 3, by + ty2); x.lineTo(bx + w - 3, by + ty2); }
      x.stroke();
      x.fillStyle = 'rgba(244,248,252,.95)';
      rr(x, bx + 2, by + 2, w - 4, 8, 4); x.fill();
      for (let i = 0; i < 4; i++) {
        ell(x, bx + 12 + R(6, i) * (w - 24), by + 12 + R(7, i) * Math.max(10, h * 0.42), 10 + R(8, i) * 12, 4.6, 'rgba(244,248,252,.88)');
      }
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
    /* ---- 地面细节层撒布器（意见2第二轮）：把覆盖式小 op 用哈希抖动批量铺进区域，
       全部烘焙进地砖，运行时零开销。需在该区域的遮挡物盖章之前调用（细节垫底） ---- */
    scatter(k, x0, y0, x1, y1, gap, sz) {
      for (let y = y0; y <= y1; y += gap) for (let x = x0; x <= x1; x += gap) {
        const jx = (U.hash2(x, y, 43) - 0.5) * gap * 0.6, jy = (U.hash2(y, x, 44) - 0.5) * gap * 0.6;
        this.fill(k, x + jx, y + jy, sz, sz * (0.55 + U.hash2(x, y, 45) * 0.8));
      }
    }
    flatScatter(key, x0, y0, x1, y1, gap, fw, fh) { // 贴地小件（井盖/水洼/落叶堆贴图）成片撒布
      for (let y = y0; y <= y1; y += gap) for (let x = x0; x <= x1; x += gap) {
        const h2 = U.hash2(x, y, 46);
        if (h2 < 0.35) continue; // 疏密不均
        const jx = (U.hash2(x, y, 47) - 0.5) * gap * 0.7, jy = (U.hash2(y, x, 48) - 0.5) * gap * 0.7;
        this.flat(key, x + jx, y + jy, fw, fh);
      }
    }
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
      // 修复:隐形墙——新增 solidRect(按精灵视觉占地盖矩形)与 solidOy(阻挡圆心沿脚底基线上移)，
      // 让碰撞贴住贴图：宽扁物件(车/摊/帐篷)不再向南伸出一片看不见的阻挡
      if (o.solidRect) this.stamp(x - o.solidRect[0] / 2, y + 6 - (o.solidOy || 0) - o.solidRect[1], o.solidRect[0], o.solidRect[1], T.BLOCK);
      if (o.solid) this.stampCirc(x, y - (o.solidOy || 0), o.solid === true ? 26 : o.solid, T.BLOCK);
      // 双柱阻挡（鸟居等门形装饰）：只在两根柱上放圆，门中央保持可穿行
      if (o.pillars) { const pr = o.pr || 16, poy = o.solidOy || 0; this.stampCirc(x - o.pillars, y - poy, pr, T.BLOCK); this.stampCirc(x + o.pillars, y - poy, pr, T.BLOCK); }
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
      const PIX = 4; // 像素化：地形 1/4 分辨率烘焙，绘制时最近邻拉伸
      c = document.createElement('canvas');
      c.width = TILE / PIX; c.height = TILE / PIX;
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.scale(1 / PIX, 1 / PIX);
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
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) ctx.drawImage(this.tile(tx, ty), tx * TILE - ox, ty * TILE - oy, TILE, TILE);
    }
    drawDecor(ctx, L, Tp, R2, B2, w2sx, w2sy) {
      for (const d of this.decor) {
        if (d.y < Tp - 320) continue;
        if (d.y > B2 + 80) break; // 已按 y 排序
        if (d.x < L - 220 || d.x > R2 + 220) continue;
        let s = typeof d.spr === 'string' ? S[d.spr] : d.spr;
        if (!s) continue;
        // 像素化：1/3 降采样缓存（每精灵一次），再最近邻拉伸回原尺寸
        if (!s.__pix || s.__pixK !== 3) {
          const t = document.createElement('canvas');
          t.width = Math.max(2, Math.round(s.width / 3)); t.height = Math.max(2, Math.round(s.height / 3));
          const tc = t.getContext('2d');
          tc.imageSmoothingEnabled = true;
          tc.drawImage(s, 0, 0, t.width, t.height);
          s.__pix = t; s.__pixK = 3;
        }
        s = s.__pix;
        const w2 = s.width * 3 / 2, h2 = s.height * 3 / 2;
        ctx.save();
        ctx.globalAlpha = d.alpha;
        const dw = w2, dh = h2; // 精灵已 1/3 化：×3 恢复世界尺寸，再 ÷2 对齐 2x 烘焙基准
        if (d.sx !== 1 || d.sy !== 1) {
          ctx.translate(w2sx(d.x), w2sy(d.y));
          ctx.scale(d.sx, d.sy);
          ctx.drawImage(s, -dw / 2, -dh + 6);
        } else ctx.drawImage(s, w2sx(d.x) - dw / 2, w2sy(d.y) - dh + 6);
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
      desc: '街区路网 · 夜市大街 · 钟楼广场',
      w: 7100, h: 5400, start: { x: 2400, y: 2325 },
      base: '#333754', catGround: '#3a3244', catGround2: '#332c3d',
      roofs: ['#6a7694', '#8a6a76', '#7a6c92', '#6a8a7e', '#8f7d64'],
      pv: { 0: '#3d4266', 1: '#23202f', 2: '#31584a', 3: '#d9a441' }
    });
    const bld = (...a) => m.bld(...a);
    // 基础沥青 + 路网（街道宽度不一、间距不均，像真实老城）
    m.fill('asphalt', 0, 0, m.w, m.h);
    // 意见2第二轮：再放大一档 → 南增两条横街、东增两条纵街，新街区按密度标准填满
    const H = [[500, 130], [1330, 110], [2250, 150], [3130, 110], [3540, 140], [4110, 130], [4800, 140]];
    const V = [[540, 120], [1580, 110], [2640, 130], [3680, 120], [4380, 100], [5150, 120], [6250, 120]];
    for (const [y, h2] of H) m.fill('road', 0, y, m.w, h2);
    for (const [x, w2] of V) m.fill('road', x, 0, w2, m.h);
    // 地面细节层先垫底（油渍/轮胎印/排水格栅/井盖/水洼，显形在露出的街道上，被街区的地面盖住）
    m.scatter('oil', 120, 120, 6980, 5280, 480, 120);
    m.scatter('tire', 120, 120, 6980, 5280, 660, 100);
    m.scatter('grate', 140, 140, 6960, 5260, 800, 46);
    m.flatScatter('manhole', 400, 400, 6800, 5100, 560, 44, 44);
    m.flatScatter('puddle', 300, 300, 6900, 5200, 700, 90, 50);
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
    m.spr('tree', 160, 380, { solid: 20, solidOy: 12 }); // 修复:行道树碰撞贴树干
    m.flat('puddle', 360, 130, 90, 50);
    // C2R1 商店排
    walk(660, 60, 920, 440);
    bld('shop', 700, 100, 240, 170, { pad: false, awn: '#e0678f' });
    bld('shop', 990, 100, 220, 170, { pad: false, awn: '#4fb3b0' });
    bld('shop', 1260, 100, 220, 170, { pad: false, awn: '#f0b13c' });
    m.spr('carPink', 780, 420, { solidRect: [100, 44], solidOy: 6 });
    m.spr('cone', 1050, 430);
    m.flat('puddle', 1280, 380, 90, 50);
    // C3R1 社区小公园
    walk(1690, 60, 950, 440);
    grass(1712, 82, 906, 396);
    m.water(2080, 170, 320, 170);
    m.spr('tree', 1820, 240, { solid: 24, solidOy: 16 });
    m.spr('tree', 2320, 420, { solid: 24, solidOy: 16 });
    m.spr('bush', 2450, 180);
    m.spr('bush', 1780, 420);
    m.spr('bench', 2000, 430);
    m.spr('bench', 2300, 120);
    // C4R1 停车场
    walk(2770, 60, 910, 440);
    m.fill('court', 2792, 82, 866, 396);
    m.ops.push({ k: 'parkline', x: 2830, y: 140, w: 700, h: 120, vert: true, gap: 88 });
    m.ops.push({ k: 'parkline', x: 2830, y: 330, w: 700, h: 120, vert: true, gap: 88 });
    m.spr('carCyan', 2920, 250, { solidRect: [100, 44], solidOy: 6 });
    m.spr('carAmber', 3090, 250, { solidRect: [100, 44], solidOy: 6 });
    m.spr('carPink', 3260, 430, { solidRect: [100, 44], solidOy: 6 });
    m.flat('puddle', 3420, 180, 90, 50);
    // C5R1 工地
    walk(3800, 60, 940, 440);
    bld('ware', 3850, 100, 280, 160, { pad: false });
    m.slow('sand', 3830, 300, 860, 170);
    m.slow('mud', 4200, 300, 300, 170);
    m.spr('boxes', 3960, 420, { solidRect: [60, 44], solidOy: 6 }); m.spr('boxes', 4520, 300, { solidRect: [60, 44], solidOy: 6 }); // 修复:货箱碰撞贴贴图
    m.spr('cone', 4100, 430); m.spr('cone', 4260, 360); m.spr('cone', 4620, 430);
    // 工地围挡（南沿，留口）——修复:围挡贴图 22px 但格子按 40px 封锁，上沿压出一条隐形墙；对齐 20px 网格
    m.block('fence', 3820, 480, 460, 20);
    m.block('fence', 4380, 480, 340, 20);
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
    m.spr('trash', 760, 1250); m.spr('bike', 1150, 1100); m.spr('boxes', 1320, 900, { solidRect: [60, 44], solidOy: 6 });
    m.flat('puddle', 900, 1050, 90, 50);
    m.spr('tree', 1480, 1230, { solid: 24, solidOy: 16 }); m.spr('bench', 1180, 1220);
    // C3R2 中央公园（草地减速 + 池塘 + 猫道）
    walk(1690, 630, 950, 700);
    grass(1712, 652, 906, 656);
    m.water(2020, 830, 340, 200);
    m.spr('tree', 1820, 760, { solid: 24, solidOy: 16 });
    m.spr('tree', 2200, 1230, { solid: 24, solidOy: 16 });
    m.spr('tree', 2500, 900, { solid: 24, solidOy: 16 });
    m.spr('tree', 1800, 1150, { solid: 24, solidOy: 16 });
    m.spr('bush', 2480, 1240); m.spr('bush', 1900, 950);
    m.spr('bench', 2300, 1290); m.spr('bench', 1900, 720);
    m.spr('potted', 2100, 700);
    // C4R2 中央广场（喷泉地标）
    walk(2770, 630, 910, 700);
    m.fill('court', 2792, 652, 866, 656);
    m.ops.push({ k: 'roundcourt', x: 3225, y: 980, r: 130 });
    m.spr('fountain', 3225, 990, { solidRect: [92, 86], solidOy: 22 }); // 修复:喷泉碰撞贴水池，广场南侧不再有隐形墙
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
    m.spr('boxes', 200, 1900, { solidRect: [60, 44], solidOy: 6 }); m.spr('boxes', 380, 2050, { solidRect: [60, 44], solidOy: 6 });
    m.spr('trash', 300, 2180);
    // C2R3 夜市广场
    walk(660, 1440, 920, 810);
    m.fill('court', 682, 1462, 876, 766);
    m.spr('stallPink', 780, 1600, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallCyan', 980, 1600, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallAmber', 880, 1830, { solidRect: [100, 40], solidOy: 6 });
    m.flat('stringLights', 700, 1660, 300, 56, { rot: 0.06 });
    m.flat('stringLights', 1010, 1660, 300, 56, { rot: -0.06 });
    m.lamp(780, 1540, 'lantern'); m.lamp(980, 1540, 'lantern'); m.lamp(880, 1760, 'lantern');
    m.spr('bench', 1300, 2000); m.spr('vending', 700, 2130, { solidRect: [44, 68], solidOy: 6 });
    // C3R3 商住楼
    walk(1690, 1440, 950, 810);
    bld('apt', 1720, 1480, 280, 200, { pad: false });
    bld('shop', 2050, 1480, 240, 180, { pad: false, awn: '#b79df0' });
    bld('house', 2050, 1720, 220, 150, { pad: false });
    m.spr('bike', 2450, 1520); m.spr('trash', 2500, 2160);
    m.spr('tree', 1800, 2050, { solid: 24, solidOy: 16 }); m.spr('bench', 2350, 2050);
    m.spr('potted', 2200, 2000); m.spr('bush', 2540, 1980);
    // C4R3 小神社
    walk(2770, 1440, 910, 810);
    m.fill('stone', 2792, 1462, 866, 766);
    m.spr('torii', 3225, 1680, { pillars: 38, solidOy: 8 });
    m.spr('stoneLantern', 3120, 1720, { solid: 16, solidOy: 8 }); m.spr('stoneLantern', 3330, 1720, { solid: 16, solidOy: 8 });
    m.spr('tree', 2900, 2000, { solid: 24, solidOy: 16 }); m.spr('tree', 3550, 2000, { solid: 24, solidOy: 16 });
    m.lamp(3120, 1700, 'lamp'); m.lamp(3330, 1700, 'lamp');
    // C5R3 便利店+住宅
    walk(3800, 1440, 940, 810);
    bld('shop', 3850, 1480, 260, 180, { pad: false, awn: '#4fb3b0' });
    bld('apt', 4160, 1480, 240, 200, { pad: false });
    m.spr('vending', 3950, 1740, { solidRect: [44, 68], solidOy: 6 });
    m.spr('carAmber', 4400, 2000, { solidRect: [100, 44], solidOy: 6 });
    m.flat('puddle', 4100, 2050, 90, 50);
    // C1R4 窄住宅
    walk(60, 2400, 480, 730);
    bld('house', 100, 2460, 190, 160, { pad: false });
    bld('house', 100, 2700, 190, 160, { pad: false });
    grass(310, 2460, 220, 660);
    m.spr('trash', 350, 3050);
    m.spr('tree', 430, 2600, { solid: 24, solidOy: 16 });
    // C2R4 菜市场
    walk(660, 2400, 920, 730);
    m.fill('court', 682, 2422, 876, 686);
    m.spr('stallCyan', 800, 2560, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallAmber', 1020, 2560, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallPink', 1240, 2560, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallCyan', 900, 2800, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallAmber', 1140, 2800, { solidRect: [100, 40], solidOy: 6 });
    m.spr('boxes', 1330, 3020, { solidRect: [60, 44], solidOy: 6 });
    m.lamp(800, 2500, 'lantern'); m.lamp(1240, 2500, 'lantern');
    // C3R4 街心花园（猫道穿园）
    walk(1690, 2400, 950, 730);
    grass(1712, 2422, 906, 686);
    m.fill('flower', 1900, 2560, 180, 140);
    m.fill('flower', 2260, 2700, 160, 120);
    m.fill('flower', 2450, 2850, 170, 120);
    m.spr('tree', 2050, 2900, { solid: 24, solidOy: 16 }); m.spr('tree', 2450, 2560, { solid: 24, solidOy: 16 });
    m.spr('stoneLantern', 1900, 2760, { solid: 15, solidOy: 8 }); m.spr('stoneLantern', 2520, 2740, { solid: 15, solidOy: 8 });
    m.lamp(1900, 2740, 'lamp'); m.lamp(2520, 2720, 'lamp');
    for (let i = 0; i < 4; i++) m.spr('bush', 1780 + i * 20, 2650 + i * 70);
    m.spr('bench', 2450, 2470); m.spr('potted', 2560, 3010);
    m.spr('bush', 1800, 2620); m.spr('bench', 2200, 3020);
    // C4R4 临街商铺（猫道穿两店之间）
    walk(2770, 2400, 910, 730);
    bld('shop', 2800, 2450, 240, 180, { pad: false, awn: '#e0678f' });
    bld('shop', 3090, 2450, 230, 180, { pad: false, awn: '#f0b13c' });
    bld('shop', 3360, 2450, 240, 180, { pad: false, awn: '#4fb3b0' });
    m.fill('court', 2792, 2680, 866, 420);
    m.spr('vending', 3300, 2900, { solidRect: [44, 68], solidOy: 6 });
    m.spr('cone', 2860, 2950);
    // C5R4 停车场
    walk(3800, 2400, 940, 730);
    m.fill('court', 3822, 2422, 896, 686);
    m.ops.push({ k: 'parkline', x: 3860, y: 2500, w: 800, h: 120, vert: true, gap: 96 });
    m.spr('carCyan', 3950, 2620, { solidRect: [100, 44], solidOy: 6 });
    m.spr('carPink', 4240, 2620, { solidRect: [100, 44], solidOy: 6 });
    m.spr('carAmber', 4530, 2620, { solidRect: [100, 44], solidOy: 6 });
    m.flat('puddle', 4000, 2900, 90, 50);
    m.spr('trash', 4600, 2950);
    // R5 南一排
    walk(60, 3240, 480, 300);
    bld('house', 100, 3290, 170, 150, { pad: false });
    bld('house', 310, 3290, 170, 150, { pad: false });
    walk(660, 3240, 920, 300);
    bld('ware', 700, 3280, 300, 180, { pad: false });
    m.spr('boxes', 1120, 3400, { solidRect: [60, 44], solidOy: 6 });
    walk(1690, 3240, 950, 300);
    bld('shop', 1730, 3290, 260, 170, { pad: false, awn: '#8fd982' });
    m.spr('vending', 2100, 3420, { solidRect: [44, 68], solidOy: 6 });
    walk(2770, 3240, 910, 300);
    m.fill('court', 2792, 3262, 866, 260);
    m.spr('bench', 3050, 3400); m.spr('tree', 3300, 3380, { solid: 24, solidOy: 16 });
    walk(3800, 3240, 940, 300);
    bld('apt', 3850, 3280, 240, 170, { pad: false });
    bld('house', 4140, 3280, 200, 150, { pad: false });
    /* ---- C6 东扩街区（意见2：新增区域填满，不留空地） ---- */
    // C6R1a 宠物街（猫咖主题小店）
    walk(4740, 60, 410, 440);
    bld('shop', 4770, 100, 160, 150, { pad: false, awn: '#e0678f' });
    bld('shop', 4950, 100, 160, 150, { pad: false, awn: '#b79df0' });
    m.spr('potted', 4800, 330); m.spr('potted', 5060, 330);
    m.spr('vending', 4990, 420, { solidRect: [44, 68], solidOy: 6 });
    m.spr('bike', 4820, 430);
    // C6R1b 钟楼广场（新地标：老城钟楼）
    walk(5270, 60, 370, 440);
    m.fill('court', 5292, 82, 326, 396);
    m.ops.push({ k: 'roundcourt', x: 5455, y: 300, r: 120 });
    m.spr('clockTower', 5455, 380, { sx: 1.5, sy: 1.2, solidRect: [195, 144], solidOy: 17 }); // 钟楼放大(约270×420)，碰撞贴台基
    m.spr('bench', 5330, 400); m.spr('bench', 5580, 400);
    m.spr('potted', 5330, 170); m.spr('potted', 5580, 170);
    m.lamp(5330, 160, 'lantern'); m.lamp(5580, 160, 'lantern');
    m.flat('puddle', 5400, 440, 90, 50);
    // C6R2a 建材市场
    walk(4740, 630, 410, 700);
    bld('ware', 4770, 680, 240, 170, { pad: false });
    m.slow('mud', 4770, 950, 350, 330);
    m.spr('carAmber', 4950, 810, { solidRect: [100, 44], solidOy: 6 });
    m.spr('boxes', 4850, 1250, { solidRect: [60, 44], solidOy: 6 });
    m.spr('boxes', 5060, 1110, { solidRect: [60, 44], solidOy: 6 });
    m.spr('cone', 4990, 960); m.spr('cone', 4880, 1090); m.spr('cone', 5090, 1260);
    // C6R2b 巷弄住宅
    walk(5270, 630, 370, 700);
    bld('house', 5300, 700, 150, 140, { pad: false });
    bld('house', 5480, 700, 140, 140, { pad: false });
    bld('house', 5300, 900, 150, 140, { pad: false });
    grass(5300, 1120, 300, 180);
    m.spr('tree', 5460, 1240, { solid: 24, solidOy: 16 });
    m.spr('bike', 5590, 1120); m.spr('trash', 5330, 1290);
    // C6R3a 停车分场
    walk(4740, 1440, 410, 810);
    m.fill('court', 4762, 1462, 366, 766);
    m.ops.push({ k: 'parkline', x: 4790, y: 1540, w: 310, h: 120, vert: true, gap: 88 });
    m.spr('carCyan', 4850, 1660, { solidRect: [100, 44], solidOy: 6 });
    m.spr('carPink', 5010, 1660, { solidRect: [100, 44], solidOy: 6 });
    m.spr('carAmber', 4850, 1960, { solidRect: [100, 44], solidOy: 6 });
    m.spr('cone', 5090, 1800);
    m.flat('puddle', 5010, 2090, 90, 50);
    // C6R3b 老当铺 + 仓库
    walk(5270, 1440, 370, 810);
    bld('shop', 5300, 1490, 180, 160, { pad: false, awn: '#f0b13c' });
    bld('ware', 5300, 1710, 280, 200, { pad: false });
    m.spr('boxes', 5430, 2170, { solidRect: [60, 44], solidOy: 6 });
    m.spr('trash', 5580, 2000); m.spr('bike', 5580, 1600);
    // C6R4a 美食排档
    walk(4740, 2400, 410, 730);
    m.fill('court', 4762, 2422, 366, 686);
    m.spr('stallAmber', 4860, 2590, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallCyan', 5040, 2590, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallPink', 4950, 2830, { solidRect: [100, 40], solidOy: 6 });
    m.flat('stringLights', 4790, 2650, 300, 56);
    m.lamp(4860, 2530, 'lantern'); m.lamp(5040, 2530, 'lantern');
    m.spr('bench', 4950, 3030); m.spr('trash', 5080, 2950);
    // C6R4b 汽修铺
    walk(5270, 2400, 370, 730);
    bld('ware', 5300, 2460, 260, 170, { pad: false });
    m.fill('court', 5292, 2700, 326, 400);
    m.spr('carAmber', 5400, 2910, { solidRect: [100, 44], solidOy: 6 });
    m.spr('cone', 5320, 2990); m.spr('cone', 5550, 2870);
    m.spr('boxes', 5570, 3050, { solidRect: [60, 44], solidOy: 6 });
    m.flat('puddle', 5450, 3050, 90, 50);
    // C6R5 骑楼杂货 + 街角绿地
    walk(4740, 3240, 410, 300);
    bld('shop', 4770, 3280, 170, 150, { pad: false, awn: '#4fb3b0' });
    bld('house', 4980, 3290, 140, 140, { pad: false });
    walk(5270, 3240, 370, 300);
    m.spr('vending', 5330, 3410, { solidRect: [44, 68], solidOy: 6 });
    m.spr('bench', 5450, 3460); m.spr('tree', 5560, 3390, { solid: 24, solidOy: 16 });
    /* ---- S1 南扩街区（意见2：夜市向南延伸一街） ---- */
    // C1S1 南路住宅
    walk(60, 3680, 480, 430);
    bld('house', 100, 3730, 190, 160, { pad: false });
    bld('house', 330, 3730, 170, 160, { pad: false });
    grass(100, 3950, 380, 130);
    m.spr('tree', 430, 4010, { solid: 24, solidOy: 16 });
    m.spr('trash', 360, 4060);
    // C2S1 夜市小吃广场
    walk(660, 3680, 920, 430);
    m.fill('court', 682, 3702, 876, 386);
    m.spr('stallPink', 800, 3840, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallCyan', 1020, 3840, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallAmber', 1240, 3840, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallCyan', 910, 4040, { solidRect: [100, 40], solidOy: 6 });
    m.flat('stringLights', 720, 3890, 380, 56);
    m.flat('stringLights', 1120, 3890, 380, 56);
    m.lamp(800, 3780, 'lantern'); m.lamp(1240, 3780, 'lantern');
    m.spr('trash', 1410, 4030);
    // C3S1 棋牌广场
    walk(1690, 3680, 950, 430);
    m.fill('court', 1712, 3702, 906, 386);
    m.ops.push({ k: 'roundcourt', x: 2165, y: 3900, r: 100 });
    m.spr('bench', 1960, 3990); m.spr('bench', 2380, 3990);
    m.spr('tree', 1830, 3830, { solid: 24, solidOy: 16 }); m.spr('tree', 2500, 3830, { solid: 24, solidOy: 16 });
    m.spr('potted', 2050, 3790); m.spr('potted', 2280, 3790);
    // C4S1 菜市南厅
    walk(2770, 3680, 910, 430);
    m.fill('court', 2792, 3702, 866, 386);
    m.spr('stallAmber', 2900, 3850, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallPink', 3120, 3850, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallCyan', 3340, 3850, { solidRect: [100, 40], solidOy: 6 });
    m.spr('boxes', 3530, 4000, { solidRect: [60, 44], solidOy: 6 });
    m.lamp(2900, 3780, 'lantern'); m.lamp(3340, 3780, 'lantern');
    // C5S1 公交场站
    walk(3800, 3680, 940, 430);
    m.fill('court', 3822, 3702, 896, 386);
    m.ops.push({ k: 'parkline', x: 3860, y: 3760, w: 760, h: 120, vert: true, gap: 96 });
    m.spr('carCyan', 3980, 3910, { solidRect: [100, 44], solidOy: 6 });
    m.spr('carAmber', 4280, 3910, { solidRect: [100, 44], solidOy: 6 });
    m.spr('carPink', 4580, 3910, { solidRect: [100, 44], solidOy: 6 });
    m.spr('cone', 3900, 4050);
    // C6S1 修车摊 + 街角小花园
    walk(4740, 3680, 410, 430);
    bld('ware', 4770, 3730, 240, 160, { pad: false });
    m.spr('carAmber', 4930, 4000, { solidRect: [100, 44], solidOy: 6 });
    m.spr('boxes', 5100, 4050, { solidRect: [60, 44], solidOy: 6 });
    walk(5270, 3680, 370, 430);
    grass(5292, 3702, 326, 386);
    m.spr('tree', 5400, 3860, { solid: 24, solidOy: 16 }); m.spr('tree', 5570, 4030, { solid: 24, solidOy: 16 });
    m.spr('bench', 5480, 3790); m.spr('bush', 5330, 4030);
    /* ---- C7 东二列（意见2第二轮：新增区域按密度标准填满） ---- */
    // C7R1a 花鸟市场
    walk(5740, 60, 460, 440);
    bld('shop', 5780, 100, 190, 160, { pad: false, awn: '#8fd982' });
    bld('shop', 6000, 100, 170, 160, { pad: false, awn: '#f0b13c' });
    m.fill('flower', 5790, 330, 170, 100); m.fill('flower', 6000, 330, 150, 100);
    m.spr('potted', 5800, 460); m.spr('potted', 5960, 460); m.spr('potted', 6120, 460);
    // C7R1b 停车满位的车场
    walk(6370, 60, 620, 440);
    m.fill('court', 6392, 82, 576, 396);
    m.ops.push({ k: 'parkline', x: 6430, y: 140, w: 480, h: 120, vert: true, gap: 96 });
    for (let i = 0; i < 5; i++) {
      m.spr(['carPink', 'carCyan', 'carAmber'][i % 3], 6500 + i * 100, 260, { solidRect: [100, 44], solidOy: 6 });
      m.spr(['carCyan', 'carAmber', 'carPink'][i % 3], 6500 + i * 100, 450, { solidRect: [100, 44], solidOy: 6 });
    }
    m.flat('puddle', 6900, 470, 90, 50);
    // C7R2a 电器城
    walk(5740, 630, 460, 700);
    bld('shop', 5780, 680, 260, 200, { pad: false, awn: '#4fb3b0' });
    m.spr('carAmber', 5900, 1000, { solidRect: [100, 44], solidOy: 6 });
    m.spr('boxes', 6080, 1240, { solidRect: [60, 44], solidOy: 6 });
    m.spr('bike', 5790, 1250);
    // C7R2b 粮油铺子
    walk(6370, 630, 620, 700);
    bld('ware', 6400, 680, 300, 190, { pad: false });
    bld('house', 6750, 700, 200, 160, { pad: false });
    m.slow('mud', 6400, 950, 560, 340);
    m.spr('boxes', 6500, 1280, { solidRect: [60, 44], solidOy: 6 });
    m.spr('cone', 6800, 1150); m.spr('trash', 6940, 950);
    // C7R3a 仓储院
    walk(5740, 1440, 460, 810);
    bld('ware', 5780, 1490, 340, 220, { pad: false });
    m.slow('net', 5780, 1800, 380, 240);
    m.spr('boxes', 5900, 2160, { solidRect: [60, 44], solidOy: 6 });
    m.spr('boxes', 6100, 2050, { solidRect: [60, 44], solidOy: 6 });
    // C7R3b 夜市延长
    walk(6370, 1440, 620, 810);
    m.fill('court', 6392, 1462, 576, 766);
    for (let i = 0; i < 3; i++) m.spr(['stallPink', 'stallCyan', 'stallAmber'][i % 3], 6500 + i * 180, 1640, { solidRect: [100, 40], solidOy: 6 });
    for (let i = 0; i < 2; i++) m.spr(['stallAmber', 'stallCyan'][i], 6600 + i * 220, 1900, { solidRect: [100, 40], solidOy: 6 });
    m.flat('stringLights', 6420, 1700, 520, 56);
    m.lamp(6500, 1580, 'lantern'); m.lamp(6860, 1580, 'lantern');
    m.spr('bench', 6700, 2150);
    // C7R4a 修车行
    walk(5740, 2400, 460, 730);
    bld('ware', 5780, 2460, 300, 180, { pad: false });
    m.spr('carAmber', 5920, 2800, { solidRect: [100, 44], solidOy: 6 });
    m.spr('carCyan', 5900, 3040, { solidRect: [100, 44], solidOy: 6 });
    m.spr('cone', 5800, 2900); m.spr('boxes', 6120, 3080, { solidRect: [60, 44], solidOy: 6 });
    // C7R4b 宠物医院
    walk(6370, 2400, 620, 730);
    bld('shop', 6400, 2460, 240, 180, { pad: false, awn: '#e0678f' });
    bld('house', 6700, 2470, 200, 160, { pad: false });
    grass(6400, 2720, 560, 380);
    m.spr('tree', 6560, 2900, { solid: 24, solidOy: 16 }); m.spr('tree', 6840, 3020, { solid: 24, solidOy: 16 });
    m.spr('bench', 6680, 2820);
    // C7R5 骑楼杂货
    walk(5740, 3240, 460, 300);
    bld('shop', 5780, 3280, 180, 150, { pad: false, awn: '#b79df0' });
    bld('house', 6000, 3290, 150, 140, { pad: false });
    walk(6370, 3240, 620, 300);
    m.spr('stallCyan', 6500, 3420, { solidRect: [100, 40], solidOy: 6 });
    m.spr('bench', 6720, 3430); m.spr('tree', 6900, 3380, { solid: 24, solidOy: 16 });
    // C7 S1 行：茶楼 + 街角绿地
    walk(5740, 3680, 460, 430);
    bld('shop', 5780, 3730, 240, 170, { pad: false, awn: '#e0678f' });
    m.spr('vending', 5960, 4020, { solidRect: [44, 68], solidOy: 6 });
    walk(6370, 3680, 620, 430);
    grass(6392, 3702, 576, 386);
    m.spr('tree', 6550, 3880, { solid: 24, solidOy: 16 }); m.spr('tree', 6800, 4030, { solid: 24, solidOy: 16 });
    m.spr('bench', 6680, 3800); m.spr('bush', 6440, 4020);
    /* ---- S2/S3 南扩二、三排（意见2第二轮：循环铺内容保证密度） ---- */
    const S2X = [[60, 480], [660, 920], [1690, 950], [2770, 910], [3800, 940], [4740, 410], [5270, 370], [5740, 460], [6370, 620]];
    for (let i = 0; i < S2X.length; i++) {
      const [sx2, sw2] = S2X[i];
      walk(sx2, 4300, sw2, 440);
      const kind = i % 3;
      if (kind === 0) { // 市集排
        m.fill('court', sx2 + 22, 4322, sw2 - 44, 396);
        for (let k2 = 0; k2 < Math.floor(sw2 / 240); k2++)
          m.spr(['stallPink', 'stallCyan', 'stallAmber'][k2 % 3], sx2 + 140 + k2 * 220, 4470, { solidRect: [100, 40], solidOy: 6 });
        m.flat('stringLights', sx2 + 40, 4530, Math.min(560, sw2 - 120), 56);
        m.lamp(sx2 + 140, 4400, 'lantern'); m.spr('trash', sx2 + sw2 - 70, 4680);
      } else if (kind === 1) { // 住宅排
        bld('house', sx2 + 40, 4360, 190, 160, { pad: false });
        bld('house', sx2 + 270, 4360, Math.min(190, sw2 - 330), 160, { pad: false });
        grass(sx2 + 40, 4580, sw2 - 80, 130);
        m.spr('tree', sx2 + 130, 4690, { solid: 24, solidOy: 16 });
        m.spr('trash', sx2 + sw2 - 70, 4700);
      } else { // 车场排
        m.fill('court', sx2 + 22, 4322, sw2 - 44, 396);
        m.ops.push({ k: 'parkline', x: sx2 + 60, y: 4390, w: sw2 - 140, h: 120, vert: true, gap: 96 });
        for (let k2 = 0; k2 < Math.min(4, Math.floor((sw2 - 200) / 230)) + 1; k2++)
          m.spr(['carCyan', 'carAmber', 'carPink'][k2 % 3], sx2 + 150 + k2 * 230, 4570, { solidRect: [100, 44], solidOy: 6 });
        m.spr('cone', sx2 + 60, 4700); m.spr('bike', sx2 + sw2 - 80, 4650);
      }
    }
    // S3 骑楼窄排（小店连排）
    for (let i = 0; i < S2X.length; i++) {
      const [sx2, sw2] = S2X[i];
      walk(sx2, 5000, sw2, 340);
      bld('shop', sx2 + 40, 5050, Math.min(220, sw2 - 160), 160, { pad: false, awn: AWNS[i % 5] });
      if (sw2 > 500) bld('house', sx2 + 300, 5060, 180, 150, { pad: false });
      m.spr('trash', sx2 + sw2 - 60, 5280);
      m.spr('vending', sx2 + sw2 - 130, 5160, { solidRect: [44, 68], solidOy: 6 });
    }
    /* ---- 猫道（只有猫能钻的缝隙） ---- */
    m.cat(920, 630, 44, 700);        // 公寓楼间缝 → 上下街
    m.spr('catArch', 942, 660); m.spr('pawSign', 942, 1300);
    m.cat(1660, 1180, 480, 44);      // 公园树篱洞 → 停车场
    m.spr('catArch', 2130, 1202); m.spr('pawSign', 1700, 1202);
    m.cat(3040, 2400, 40, 730);      // 两间店铺的夹缝——修复:西移对齐网格，猫道东沿不再踩到店铺贴图
    m.spr('catArch', 3065, 2440); m.spr('pawSign', 3065, 3090);
    m.cat(120, 1800, 440, 44);       // 仓库后墙根
    m.spr('catArch', 160, 1822); m.spr('pawSign', 520, 1822);
    /* ---- 夜市大街（H3）摊位与彩灯 ---- */
    for (const sx of [1800, 2050, 2300, 2900, 3150]) m.spr('stallAmber', sx, 2245, { solidRect: [100, 40], solidOy: 6 });
    for (const sx of [1900, 2150, 2400]) m.spr('stallCyan', sx, 2465, { solidRect: [100, 40], solidOy: 6 });
    m.flat('stringLights', 1700, 2330, 420, 56);
    m.flat('stringLights', 2140, 2330, 420, 56);
    m.flat('stringLights', 2820, 2330, 420, 56);
    for (const lx of [1800, 2300, 2900, 3400]) m.lamp(lx, 2260, 'lantern');
    for (const lx of [1900, 2400, 3000]) m.lamp(lx, 2450, 'lantern');
    // 大牌坊（新地标）：跨街立在夜市大街西口，放大到约 450 宽，只挡两柱、门洞通行
    m.spr('paifang', 1720, 2406, { sx: 1.5, sy: 1.5, pillars: 150, pr: 22, solidOy: 6 });
    m.lamp(1600, 2450, 'lantern'); m.lamp(1840, 2450, 'lantern');
    /* ---- 街道家具 ---- */
    // 意见2/3：灯柱=小圆形阻挡，贴住杆脚；新增街口补齐路灯
    for (const [lx, ly] of [[560, 480], [1560, 480], [2620, 480], [3660, 480], [4740, 480], [5140, 480],
      [560, 1310], [2620, 1310], [4360, 1310], [5140, 1310],
      [560, 2230], [1560, 2230], [3660, 2230], [5140, 2230],
      [560, 3110], [2620, 3110], [3660, 3110], [4360, 3110], [5140, 3110],
      [1560, 3520], [3660, 3520], [5140, 3520], [900, 4100], [2620, 4100], [4360, 4100]]) {
      m.spr('lamp', lx, ly, { solid: 8, solidOy: 4 }); m.lamp(lx, ly - 40, 'lamp');
    }
    // 斑马线 / 井盖 / 消火栓
    m.ops.push({ k: 'crosswalk', x: 560, y: 560, w: 80, h: 100 });
    m.ops.push({ k: 'crosswalk', x: 2700, y: 2300, w: 100, h: 80 });
    m.ops.push({ k: 'crosswalk', x: 1600, y: 1380, w: 80, h: 100 });
    m.ops.push({ k: 'crosswalk', x: 5150, y: 560, w: 100, h: 80 });
    m.ops.push({ k: 'crosswalk', x: 2200, y: 3540, w: 100, h: 80 });
    for (const [mx, my] of [[1000, 560], [2200, 1400], [3000, 2330], [1200, 3180], [3400, 560], [600, 2000],
      [4800, 560], [3400, 3610], [2000, 4180], [5450, 2330]]) {
      m.flat('manhole', mx, my, 44, 44);
    }
    for (const [hx, hy] of [[700, 520], [2700, 1380], [3800, 2230], [1700, 3170], [4780, 700], [5310, 2440]]) m.spr('hydrant', hx, hy, { solid: 9, solidOy: 4 }); // 意见3：消火栓不可穿
    // 意见2第二轮：街角家具成排（电话亭/公交站牌/贩卖机/自行车/垃圾桶/盆栽轮转摆放）
    const cornerKit = [['phoneBooth', 40, 60, 8], ['busStop', 20, 40, 10], ['vending', 44, 68, 8], ['trash', 0, 0, 0], ['bike', 0, 0, 0], ['potted', 0, 0, 0]];
    const corners = [[700, 470], [1720, 470], [2780, 470], [3820, 420], [4880, 470], [6420, 470],
      [700, 1300], [2780, 1300], [4880, 1300], [6420, 1300],
      [700, 2200], [3820, 2200], [4880, 2200], [6420, 2200],
      [700, 3100], [2780, 3100], [4880, 3100], [6420, 3100],
      [1720, 4060], [3820, 4750], [5950, 4750], [2780, 5290], [4880, 5290]];
    for (let i = 0; i < corners.length; i++) {
      const [k2, sw2, sh2, oy2] = cornerKit[i % cornerKit.length];
      m.spr(k2, corners[i][0], corners[i][1], sw2 ? { solidRect: [sw2, sh2], solidOy: oy2 } : {});
    }
    // 店门口霓虹招牌（灯柱小圆阻挡）
    const sign = Art.decor.sign;
    const neon = [['喵', 820, 290, 'neonPink'], ['拉面', 1100, 290, 'neonCyan'], ['魚', 1370, 290, 'neonPink'],
      ['OPEN', 1970, 1680, 'neonCyan'], ['猫咖', 2170, 1680, 'neonPink'], ['24H', 3980, 1680, 'neonCyan'],
      ['OPEN', 2920, 2650, 'neonPink'], ['拉面', 3205, 2650, 'neonCyan'], ['喵', 3480, 2650, 'neonPink'],
      ['魚', 1860, 3480, 'neonCyan'],
      ['猫咖', 4850, 290, 'neonPink'], ['OPEN', 5030, 290, 'neonCyan'], ['24H', 5390, 1690, 'neonCyan']];
    for (const [k, sx, sy, g] of neon) { m.spr(sign[k], sx, sy, { solid: 8, solidOy: 4 }); m.lamp(sx, sy - 46, g); }
    return m;
  }

  /* ---------- 🌸 樱花公园：草地减速、石径、池塘木桥、树林迷宫 ---------- */
  function sakura() {
    const m = new MB({
      id: 'sakura', name: '樱花公园', emoji: '🌸',
      desc: '满园樱花 · 樱花神社 · 池塘石桥',
      w: 6500, h: 5000, start: { x: 2200, y: 3180 },
      base: '#3a7a5c', catGround: '#5a4642', catGround2: '#4e3c38', slowMul: 0.55,
      pv: { 0: '#c9b8a8', 1: '#1c3a5f', 2: '#3f7057', 3: '#e8a0bc' }
    });
    // 全园草地（减速）→ 石径快走
    m.slow('grass', 0, 0, m.w, m.h);
    // 地面细节层（意见2第二轮）：落樱地毯 + 草皮斑块铺满全园，垫在路径/树木底下
    m.scatter('petals', 120, 120, 6380, 4880, 300, 110);
    m.flatScatter('puddle', 600, 600, 6200, 4700, 900, 90, 50);
    const clear = []; // 路径避让区（实心树不踩进路径）
    const stone = (x, y, w2, h2) => { m.stamp(x, y, w2, h2, 0); m.fill('stone', x, y, w2, h2); clear.push([x, y, w2, h2]); };
    const wood = (x, y, w2, h2) => { m.stamp(x, y, w2, h2, 0); m.fill('wood', x, y, w2, h2); clear.push([x, y, w2, h2]); };
    m.border('hedge', 60);
    // 入口广场 + 主径（意见2：广场向南延伸，鸟居改立南门正中）
    stone(1980, 3020, 440, 320);
    stone(1980, 3340, 440, 460);
    stone(2160, 700, 100, 2400);
    m.spr('torii', 2200, 3700, { pillars: 38, solidOy: 8 });
    m.spr('stoneLantern', 2080, 3620, { solid: 15, solidOy: 8 }); m.spr('stoneLantern', 2320, 3620, { solid: 15, solidOy: 8 });
    m.lamp(2200, 3660, 'lantern');
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
    /* ---- 东扩：樱花神社（大鸟居 + 拜殿）与放生池石桥（意见2地标） ---- */
    // 北岸滨径：接跨湖大桥北端 → 神社参道
    stone(3600, 340, 1180, 100);
    stone(4540, 440, 560, 680);        // 神社前庭
    m.spr('torii', 4790, 580, { sx: 2.2, sy: 2.0, pillars: 82, pr: 34, solidOy: 26 }); // 大鸟居再加码(约350宽)，柱距柱径随比例加大
    m.lamp(4790, 540, 'lantern');
    m.spr('shrine', 4800, 1080, { sx: 1.5, sy: 1.2, solidRect: [465, 216], solidOy: 7 }); // 拜殿放大(约510×300)，碰撞贴殿身
    m.spr('stoneLantern', 4620, 1140, { solid: 15, solidOy: 8 }); m.spr('stoneLantern', 4980, 1140, { solid: 15, solidOy: 8 });
    m.lamp(4620, 1120, 'lamp'); m.lamp(4980, 1120, 'lamp');
    m.spr('bench', 4620, 700); m.spr('bench', 4980, 700);
    // 放生池 + 石桥（意见2：池塘石桥）
    m.water(4380, 1560, 640, 400);
    stone(4660, 1120, 90, 440);        // 神社南阶引道
    m.stamp(4660, 1520, 90, 520, 0); m.fill('bridge', 4660, 1520, 90, 520);
    clear.push([4660, 1520, 90, 520]); // 树林避开石桥
    stone(4580, 2000, 250, 120);       // 南岸落地
    // 东山茶屋（意见2第二轮：东扩区内容，北岸滨径东延接入）
    stone(4780, 340, 1060, 100);
    stone(5620, 440, 90, 320);
    m.bld('house', 5460, 700, 320, 240, { padK: 'stone' });
    m.spr('stoneLantern', 5400, 1020, { solid: 15, solidOy: 8 }); m.spr('stoneLantern', 5820, 1020, { solid: 15, solidOy: 8 });
    m.lamp(5400, 1000, 'lamp'); m.lamp(5820, 1000, 'lamp');
    m.spr('bench', 5340, 520); m.spr('bench', 5940, 520);
    m.spr('stallAmber', 5860, 1240, { solidRect: [100, 40], solidOy: 6 });
    // 花祭市集（桥南草地）
    m.spr('stallPink', 4560, 3520, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallCyan', 4800, 3520, { solidRect: [100, 40], solidOy: 6 });
    m.lamp(4560, 3470, 'lantern'); m.lamp(4800, 3470, 'lantern');
    m.flat('picnic', 4700, 3800, 116, 92);
    // 支路到空地
    stone(1500, 2000, 340, 90);
    stone(2900, 1200, 260, 90);
    stone(3560, 1700, 90, 300);
    // 花坛（入口两侧）
    m.fill('flower', 2020, 3060, 150, 240);
    m.fill('flower', 2290, 3060, 130, 240);
    /* 树林（实心樱花树 = 迷宫墙；草地减速拖慢鼠群；自动避让路径）
       意见2第二轮：去方阵化——±40px 抖动错位、大小 0.85~1.15 随机、约三成格点空出疏密不均、
       林下偶有岩石，配合落樱地毯层打破网格感 */
    const grove = (x0, y0, x1, y1, step, kind) => {
      for (let gy = y0; gy <= y1; gy += step) for (let gx = x0; gx <= x1; gx += step) {
        if (U.hash2(gx, gy, 5) < 0.3) continue; // 疏密不均
        const jx = (U.hash2(gx, gy, 7) - 0.5) * 80, jy = (U.hash2(gy, gx, 8) - 0.5) * 80;
        const tx = gx + jx, ty = gy + jy;
        if (clear.some(c => tx > c[0] - 62 && tx < c[0] + c[2] + 62 && ty > c[1] - 62 && ty < c[1] + c[3] + 62)) continue;
        const key = U.hash2(tx, ty, 9) < 0.3 ? 'cherry2' : (kind || 'cherry');
        const sc = 0.85 + U.hash2(gx, gy, 10) * 0.3;
        m.spr(key, tx, ty, { sx: sc, sy: sc, solid: 30, solidOy: 24 }); // 修复:樱花树碰撞圆上移贴树干，树脚南沿不再多挡一条草地
        if (U.hash2(ty, tx, 11) < 0.05) m.spr('rock', tx + 52, ty + 34, { solid: 26, solidOy: 22 }); // 林间石块
      }
    };
    grove(200, 200, 1300, 780, 140);
    grove(200, 1900, 1300, 3000, 140);
    grove(3220, 1650, 4300, 2100, 130);
    grove(1560, 1900, 1980, 2500, 130);
    // 意见2第二轮：东扩/南扩樱林（合并成大片，配合疏密抖动不留方阵感）
    grove(4400, 2200, 6380, 3850, 145);
    grove(5300, 250, 6380, 1350, 145);
    grove(200, 3100, 1300, 4850, 140);
    grove(1500, 4150, 3250, 4900, 150);
    clear.push([4460, 2200, 44, 940]); // 树林避开桥南猫道
    clear.push([4430, 3380, 700, 560]); // 树林避开花祭市集空地
    clear.push([5300, 400, 700, 900]);  // 树林避开东山茶屋庭院
    clear.push([3950, 4180, 1400, 720]); // 树林避开南野餐草坪
    // 零散树
    for (const [tx, ty] of [[1420, 1000], [2980, 1000], [1450, 1500], [2960, 1500], [1000, 1700], [3400, 2600], [2600, 2700], [1800, 2850],
      [3400, 220], [4050, 220], [4450, 1300], [4880, 1300], [3700, 2550], [4300, 2600], [3600, 3050], [2900, 3200]]) {
      m.spr('cherry', tx, ty, { solid: 30, solidOy: 24 });
    }
    // 中央草坪补密度（意见2第二轮：错落树/花丛/灌木，避开石径与池塘）
    for (const [tx2, ty2] of [[2500, 600], [2800, 750], [1700, 620], [1980, 520], [3020, 620], [2600, 1700], [2900, 1780], [1700, 1780], [2450, 1850], [3050, 1250], [1350, 1150], [1350, 1750]]) {
      m.spr(U.hash2(tx2, ty2, 15) < 0.3 ? 'cherry2' : 'cherry', tx2, ty2, { solid: 30, solidOy: 24 });
    }
    for (const [bx2, by2] of [[2300, 700], [2750, 1650], [1850, 1700], [2200, 1780], [3100, 700], [1350, 1450]]) m.spr('bush', bx2, by2);
    m.fill('flower', 2350, 1660, 150, 100); m.fill('flower', 1550, 700, 130, 90); m.fill('flower', 2900, 600, 140, 90);
    /* 猫道：树篱间兽径 */
    m.cat(400, 800, 44, 1800);
    m.spr('catArch', 422, 840); m.spr('pawSign', 422, 2560);
    m.cat(1300, 2450, 680, 44);
    m.spr('pawSign', 1340, 2472); m.spr('catArch', 1940, 2472);
    m.cat(3700, 1560, 44, 840);
    m.spr('catArch', 3722, 1600); m.spr('pawSign', 3722, 2360);
    m.cat(4460, 2200, 44, 940);      // 桥南樱林兽径（石桥南岸 → 花祭市集）
    m.spr('catArch', 4482, 2260); m.spr('pawSign', 4482, 3080);
    /* 南扩：花祭草坪（意见2） */
    m.water(3060, 3560, 460, 260);   // 南池塘（水面不可过）
    m.spr('stoneLantern', 2980, 3500, { solid: 15, solidOy: 8 }); m.spr('stoneLantern', 3600, 3500, { solid: 15, solidOy: 8 });
    m.lamp(2980, 3480, 'lamp'); m.lamp(3600, 3480, 'lamp');
    m.fill('flower', 2560, 3120, 180, 140);
    m.fill('flower', 3140, 3400, 200, 130);
    m.spr('bench', 1650, 3380); m.spr('bench', 2900, 3450);
    m.spr('cherry', 2450, 3300, { solid: 30, solidOy: 24 });
    m.spr('cherry2', 3350, 3360, { solid: 30, solidOy: 24 });
    m.flat('picnic', 1300, 3300, 116, 92);
    /* ---- 南拓野餐草坪 + 池塘（意见2第二轮填充） ---- */
    stone(2160, 3800, 100, 1100);      // 主径南延贯通新南区
    stone(1300, 4300, 1900, 90);       // 野餐区横径
    m.water(3400, 4200, 520, 320);     // 南池塘（水面不可过）
    stone(3300, 4100, 720, 80);        // 池塘北岸
    wood(3560, 4140, 90, 260);         // 探水木栈道
    stone(3200, 4060, 1500, 80);       // 野餐草坪连络径
    for (const [px2, py2] of [[4150, 4350], [4500, 4520], [4850, 4330], [4300, 4720], [4650, 4800]]) m.flat('picnic', px2, py2, 116, 92);
    m.spr('stallPink', 4050, 4250, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallAmber', 5250, 4280, { solidRect: [100, 40], solidOy: 6 });
    m.spr('bench', 4200, 4240); m.spr('bench', 5050, 4560); m.spr('bench', 4450, 4860);
    m.spr('trash', 4700, 4620); m.spr('potted', 4000, 4480); m.spr('potted', 5350, 4520);
    m.lamp(4150, 4300, 'lantern'); m.lamp(5100, 4300, 'lantern');
    /* 家具 */
    m.spr('stallPink', 2060, 3260, { solidRect: [100, 40], solidOy: 6 }); // 修复:摊位碰撞改矩形贴贴图，门前不再有隐形阻挡
    for (const [bx, by] of [[1700, 1700], [2700, 1700], [1600, 950], [2760, 950], [2300, 1700]]) m.spr('bench', bx, by);
    for (const [lx, ly] of [[2120, 1200], [2300, 1500], [2120, 2000], [2300, 2400], [2120, 2800], [830, 1200], [830, 2000], [2940, 1000], [2940, 1500]]) {
      m.spr('stoneLantern', lx, ly, { solid: 15, solidOy: 8 });
      m.lamp(lx, ly - 20, 'lamp');
    }
    for (const [px, py] of [[1600, 2050], [2960, 1260], [900, 2600], [3600, 1850]]) m.flat('picnic', px, py, 116, 92);
    for (const [bx, by] of [[1880, 1250], [2500, 1350], [1500, 2400], [3100, 2400]]) m.spr('bush', bx, by);
    m.spr('potted', 2140, 3200); m.spr('potted', 2270, 3200);
    return m;
  }

  /* ---------- ⚓ 港湾码头：集装箱堆场迷宫、岸桥货轮、鱼市沙滩 ---------- */
  function harbor() {
    const m = new MB({
      id: 'harbor', name: '港湾码头', emoji: '⚓',
      desc: '集装箱堆场 · 岸桥货轮 · 鱼市沙滩',
      w: 6400, h: 4800, start: { x: 1600, y: 2260 },
      base: '#4a4f76', catGround: '#6e5a3e', catGround2: '#5f4c34',
      roofs: ['#6a7694', '#8f7d64'],
      pv: { 0: '#5a5f74', 1: '#1c3a5f', 2: '#a8946e', 3: '#d9a441' }
    });
    m.fill('court', 0, 0, m.w, m.h);
    // 地面细节层先垫底（油渍/轮胎印/格栅/井盖/水洼，显形在露出的码头地面上，被海/地块盖住）
    m.scatter('oil', 120, 120, 6280, 4680, 540, 100);
    m.scatter('tire', 120, 120, 6280, 4680, 650, 100);
    m.scatter('grate', 140, 140, 6260, 4660, 780, 46);
    m.flatScatter('manhole', 300, 300, 6100, 4400, 640, 44, 44);
    m.flatScatter('puddle', 220, 220, 6200, 4500, 560, 90, 50);
    // 海湾：东为外海、南为锚地（意见2：图幅放大，海域停大货轮）
    m.water(4250, 0, 2150, 4800);
    m.water(0, 3800, 4250, 1000);
    // 北/西围栏（东/南是海）
    m.block('fence', 0, 0, m.w, 50);
    m.block('fence', 0, 0, 50, m.h);
    // 沙滩（南水线上，减速）
    m.slow('sand', 550, 3600, 3700, 200);
    const pier = (x, y, w2, h2) => { m.stamp(x, y, w2, h2, 0); m.fill('wood', x, y, w2, h2); };
    // 栈桥（意见3：泊位向东延伸，停靠岸桥与货轮）
    pier(4100, 950, 1300, 120);    // 东一泊位（三台岸桥）
    pier(4900, 1070, 120, 520);    // 东一引桥
    pier(4100, 2350, 900, 120);    // 东二泊位
    pier(3300, 3590, 120, 720);    // 南码头
    pier(1200, 3590, 110, 460);    // 西小码头
    // 猫跳板 → 渔船（木质窄板，北端接栈桥）
    m.cat(4930, 1590, 56, 420, { c: '#7a5c3c', c2: '#684c30' });
    m.spr('catArch', 4946, 1610); m.spr('pawSign', 4952, 1950);
    m.spr('boat', 4958, 2070);
    m.cat(4400, 2470, 56, 420, { c: '#7a5c3c', c2: '#684c30' });
    m.spr('catArch', 4416, 2490); m.spr('pawSign', 4422, 2840);
    m.spr('boat', 4428, 2960);
    /* ---- 西北：仓库 + 油罐区（意见2地标：油罐区） ---- */
    m.bld('ware', 200, 180, 620, 340, { padK: 'court' });
    m.bld('ware', 200, 580, 420, 260, { padK: 'court' });
    m.slow('net', 700, 560, 500, 300);
    // 油罐区：五座储油罐（罐体碰撞贴罐壁），西护墙与仓库分隔
    for (const [tx, ty] of [[1430, 320], [1650, 320], [1430, 560], [1650, 560], [1430, 800]]) {
      m.spr('oilTank', tx, ty, { solidRect: [150, 100], solidOy: 6 });
    }
    m.block('wall', 1290, 180, 20, 700);
    m.spr('cone', 1790, 430); m.spr('cone', 1830, 710);
    m.spr('boxes', 1930, 870, { solidRect: [60, 44], solidOy: 6 });
    m.spr('trash', 2100, 880);
    /* ---- 北：岸桥 + 货车场 + 灯塔岩 ---- */
    // 岸桥（龙门吊 ×3 加大版，意见2/3地标：门洞可穿行，仅两腿小圆阻挡，碰撞贴柱脚）
    for (const gx of [4300, 4750, 5200]) m.spr('gantry', gx, 1060, { sx: 1.6, sy: 1.2, pillars: 192, pr: 30, solidOy: 24 });
    // 远洋货轮（加长版海上装饰大件；水域本身不可通行）
    m.spr('cargoShip', 5600, 1900, { sx: 1.55, sy: 1.2 });
    m.spr('cargoShip', 5750, 4200, { sx: 0.9, sy: 0.9 });
    m.spr('boat', 4600, 3300); m.spr('boat', 5300, 2900);
    // 北部货车场：车位 + 成排车辆 + 集卡 + 杂物
    m.ops.push({ k: 'parkline', x: 2150, y: 220, w: 900, h: 120, vert: true, gap: 96 });
    m.ops.push({ k: 'parkline', x: 2150, y: 400, w: 900, h: 120, vert: true, gap: 96 });
    for (let i = 0; i < 4; i++) {
      m.spr(['carAmber', 'carCyan', 'carPink'][i % 3], 2250 + i * 230, 400, { solidRect: [100, 44], solidOy: 6 });
      m.spr(['carCyan', 'carPink', 'carAmber'][i % 3], 2250 + i * 230, 580, { solidRect: [100, 44], solidOy: 6 });
    }
    for (let i = 0; i < 3; i++) m.spr('contTruck', 2280 + i * 340, 790, { solidRect: [250, 60], solidOy: 10 });
    m.spr('boxes', 2150, 900, { solidRect: [60, 44], solidOy: 6 });
    m.spr('boxes', 2350, 930, { solidRect: [60, 44], solidOy: 6 });
    m.spr('boxes', 3200, 760, { solidRect: [60, 44], solidOy: 6 });
    m.spr('cone', 3100, 520); m.spr('cone', 3160, 800);
    m.spr('forklift', 3560, 640, { solidRect: [64, 44], solidOy: 10 });
    // 灯塔岩（东北角：礁盘不可通行）
    m.ops.push({ k: 'roundrock', x: 3950, y: 330, r: 150 });
    m.stampCirc(3950, 330, 150, T.BLOCK);
    m.spr('rock', 3860, 420, { solid: 34, solidOy: 26 }); m.spr('rock', 4060, 260, { solid: 34, solidOy: 26 });
    m.spr('light', 3950, 400, { solid: 60 });
    m.lamp(3950, 300, 'lamp');
    /* ---- 意见3：集装箱堆场（9 个紧贴实心街区排成网格，块间 140~152px 巷道） ----
       cont: 盖章矩形 [x-70, y-60, 140, 60]（相邻盖章重叠没关系，都是 BLOCK）；
       yard: 横向间距 133 = 车身可见宽（边贴边 1px 叠压，拼成实心色块）、纵向行距 54 = 车身
       可见高（前排压住后排 2px，出堆叠层次）；catMid=true 时块中留 40px 猫缝 */
    const cont = (x, y, key) => { m.stamp(x - 70, y - 60, 140, 60, 1); m.spr(key, x, y); };
    const CCOL = ['contRed', 'contBlue', 'contGreen', 'contRust', 'contCyan', 'contAmber'];
    const yard = (x0, y0, rows, catMid, off) => {
      for (let r = 0; r < rows; r++) for (let c = 0; c < 6; c++) {
        const cx = x0 + 75 + c * 133 + (catMid && c >= 3 ? 40 : 0);
        cont(cx, y0 + 60 + r * 54, CCOL[(off + c * 2 + r * 3) % 6]);
      }
      if (catMid) {
        m.cat(x0 + 410, y0, 40, rows * 54);
        m.spr('catArch', x0 + 430, y0 + 30); m.spr('pawSign', x0 + 430, y0 + rows * 54 - 26);
      }
    };
    // 三排堆场街区（排间 140~152px 巷道；x0 取 9(mod 20) 使首末盖章都与格心对齐）
    yard(709, 1300, 3, true, 0);   // A
    yard(1687, 1300, 3, true, 2);  // B
    yard(2665, 1300, 3, false, 4); // C
    yard(709, 1620, 3, false, 3);  // D
    yard(1687, 1620, 3, true, 5);  // E
    yard(2665, 1620, 3, false, 1); // F
    yard(709, 1940, 3, false, 2);  // G
    yard(1687, 1940, 3, false, 4); // H
    yard(2665, 1940, 3, false, 0); // I
    // 块边双层/三层堆（不新增阻挡，纯高度层次）
    m.spr('contGreen', 770, 1330, { sy: 1.5 }); m.spr('contRust', 1440, 1296, { sy: 2 });
    m.spr('contAmber', 1750, 1330, { sy: 1.5 }); m.spr('contCyan', 2420, 1296, { sy: 2 });
    m.spr('contBlue', 2730, 1330, { sy: 1.5 }); m.spr('contRed', 3380, 1460, { sy: 1.5 });
    m.spr('contCyan', 770, 1780, { sy: 1.5 }); m.spr('contGreen', 3380, 1780, { sy: 2 });
    m.spr('contRed', 1750, 1650, { sy: 2 }); m.spr('contAmber', 2730, 1780, { sy: 1.5 });
    m.spr('contBlue', 770, 2100, { sy: 1.5 }); m.spr('contGreen', 1750, 2100, { sy: 1.5 }); m.spr('contRust', 2730, 2100, { sy: 2 });
    // 巷道作业车辆（叉车进竖巷、集卡进横巷）
    m.spr('forklift', 1617, 1544, { solidRect: [64, 44], solidOy: 10 });
    m.spr('forklift', 2595, 1864, { solidRect: [64, 44], solidOy: 10 });
    m.spr('forklift', 1617, 2050, { solidRect: [64, 44], solidOy: 10 });
    m.spr('contTruck', 1617, 1544, { solidRect: [250, 60], solidOy: 10 });
    m.spr('contTruck', 2595, 1864, { solidRect: [250, 60], solidOy: 10 });
    // 岸线：一排集装箱待装船
    for (let i = 0; i < 14; i++) cont(4110, 1560 + i * 60, CCOL[(i * 5) % 6]);
    m.spr('forklift', 3860, 1700, { solidRect: [64, 44], solidOy: 10 });
    m.spr('forklift', 3860, 2060, { solidRect: [64, 44], solidOy: 10 });
    /* ---- 鱼市（摊位群 + 灯串） ---- */
    m.spr('stallCyan', 1650, 2520, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallAmber', 1850, 2520, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallPink', 2050, 2520, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallCyan', 2250, 2520, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallAmber', 1750, 2760, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallPink', 1950, 2760, { solidRect: [100, 40], solidOy: 6 });
    m.spr('boxes', 2250, 2880, { solidRect: [60, 44], solidOy: 6 });
    m.spr('boxes', 1560, 2880, { solidRect: [60, 44], solidOy: 6 });
    m.flat('stringLights', 1580, 2580, 760, 56);
    m.lamp(1650, 2460, 'lantern'); m.lamp(2250, 2460, 'lantern');
    m.lamp(1750, 2700, 'lantern'); m.lamp(1950, 2700, 'lantern');
    // 鱼市南排 + 海滨步道杂物（意见2第二轮加密）
    m.spr('stallAmber', 1650, 2980, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallCyan', 1900, 2980, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallPink', 2150, 2980, { solidRect: [100, 40], solidOy: 6 });
    m.spr('boxes', 700, 3350, { solidRect: [60, 44], solidOy: 6 });
    m.spr('boxes', 860, 3420, { solidRect: [60, 44], solidOy: 6 });
    m.spr('boxes', 2950, 3380, { solidRect: [60, 44], solidOy: 6 });
    m.spr('cone', 780, 3450); m.spr('cone', 3050, 3430); m.spr('trash', 1750, 3380);
    m.spr('lamp', 1100, 3420, { solid: 8, solidOy: 4 }); m.lamp(1100, 3380, 'lamp');
    m.spr('lamp', 2300, 3420, { solid: 8, solidOy: 4 }); m.lamp(2300, 3380, 'lamp');
    // 码头广场（出生点开阔地带）
    m.ops.push({ k: 'roundcourt', x: 1600, y: 2320, r: 130 });
    m.spr('bench', 1420, 2330); m.spr('bench', 1780, 2330);
    m.spr('boxes', 1200, 2300, { solidRect: [60, 44], solidOy: 6 });
    m.spr('boxes', 2000, 2300, { solidRect: [60, 44], solidOy: 6 });
    m.spr('trash', 1350, 2470);
    m.spr('bike', 1520, 2560);
    m.spr('cone', 1950, 2420); m.spr('cone', 1300, 2350);
    /* ---- 西墙根：晒网场与杂物（网具可通行减速） ---- */
    m.slow('net', 150, 1200, 400, 320);
    m.spr('boxes', 250, 1650, { solidRect: [60, 44], solidOy: 6 });
    m.spr('boxes', 420, 1900, { solidRect: [60, 44], solidOy: 6 });
    m.spr('trash', 350, 1750); m.spr('bike', 300, 1000);
    m.spr('forklift', 450, 2350, { solidRect: [64, 44], solidOy: 10 });
    /* ---- 滨海步道：系船柱缆绳 + 拖岸渔船（船体不可穿） ---- */
    for (let bx = 700; bx <= 3100; bx += 300) m.spr('bollard', bx, 3560, { solid: 12, solidOy: 6 });
    for (let bx = 700; bx < 3100; bx += 300) m.fill('rope', bx + 14, 3470, 272, 90);
    m.spr('boat', 1300, 3700, { solidRect: [130, 50], solidOy: 6 });
    m.spr('boat', 2200, 3720, { solidRect: [130, 50], solidOy: 6 });
    m.slow('net', 1650, 3630, 380, 140);
    m.spr('cone', 2450, 3660); m.spr('trash', 2600, 3700);
    // 岸线系船柱
    for (let by = 1150; by <= 3350; by += 440) m.spr('bollard', 4210, by, { solid: 12, solidOy: 6 });
    // 路灯（灯柱=小圆形阻挡）
    for (const [lx, ly] of [[900, 1210], [2670, 1210], [3990, 1210], [900, 2280], [2670, 2280], [3990, 2280],
      [3660, 1560], [3660, 2060], [1300, 3420], [2900, 3420], [700, 930], [2100, 930]]) {
      m.spr('lamp', lx, ly, { solid: 8, solidOy: 4 }); m.lamp(lx, ly - 40, 'lamp');
    }
    return m;
  }

  /* ---------- ♨️ 雪山温泉：深雪减速、石径、温泉蒸汽、竹林猫道 ---------- */
  function onsen() {
    const m = new MB({
      id: 'onsen', name: '雪山温泉', emoji: '♨️',
      desc: '深雪没爪 · 汤坂街市 · 雪见庭园',
      w: 6400, h: 5400, start: { x: 2100, y: 3400 }, // 门洞正中太贴柱，出生在门前参道开阔处
      base: '#d8e2f0', catGround: '#6a5a44', catGround2: '#5d4e3a', slowMul: 0.5,
      roofs: ['#7c6a74', '#68808e'],
      pv: { 0: '#7a8496', 1: '#575263', 2: '#dfe7f2', 3: '#c98a4a' }
    });
    m.slow('snow', 0, 0, m.w, m.h); // 全图深雪（减速），石径/木台快走
    // 地面细节层先垫底（雪堆/脚印/冰面，被石径盖住，只显形在雪原上）
    m.scatter('snowdrift', 140, 140, 6260, 5260, 350, 110);
    m.scatter('footprint', 2400, 2200, 3100, 3100, 330, 60);
    const stone = (x, y, w2, h2) => { m.stamp(x, y, w2, h2, 0); m.fill('stone', x, y, w2, h2); };
    m.border('rockwall', 60);
    // 入口 + 参道（意见2第二轮：参道继续南延，汤坂街扩成二丁目小村）
    stone(1800, 3260, 600, 280);
    stone(2050, 700, 110, 2600);
    stone(2050, 3540, 110, 1760);
    stone(1500, 3620, 1200, 90);      // 汤坂街主路
    stone(1500, 4280, 1200, 90);      // 汤坂街二丁目
    m.spr('torii', 2100, 3300, { pillars: 38, solidOy: 8 }); // 鸟居=门：只挡两柱(±38px)，中央可穿行，勿用 solid 挡门心
    m.spr('torii', 2100, 4160, { sx: 1.5, sy: 1.5, pillars: 56, pr: 24, solidOy: 18 }); // 外大鸟居：柱距柱径随比例放大，碰撞圆贴柱脚
    m.lamp(2100, 3260, 'lantern');
    m.lamp(2100, 4120, 'lantern');
    // 汤坂街（门前小村）：汤卖店 / 小吃摊 / 红灯笼
    m.bld('shop', 1560, 3740, 260, 180, { pad: false, awn: '#e0678f' });
    m.bld('shop', 2380, 3740, 260, 180, { pad: false, awn: '#4fb3b0' });
    m.bld('shop', 1560, 4400, 260, 180, { pad: false, awn: '#f0b13c' });
    m.bld('shop', 2380, 4400, 260, 180, { pad: false, awn: '#8fd982' });
    m.spr('stallAmber', 1930, 4020, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallCyan', 1930, 4680, { solidRect: [100, 40], solidOy: 6 });
    m.spr('redLantern', 1560, 3700, { solid: 9, solidOy: 5 }); m.lamp(1560, 3655, 'lantern');
    m.spr('redLantern', 2640, 3700, { solid: 9, solidOy: 5 }); m.lamp(2640, 3655, 'lantern');
    m.spr('redLantern', 1560, 4360, { solid: 9, solidOy: 5 }); m.lamp(1560, 4315, 'lantern');
    m.spr('redLantern', 2640, 4360, { solid: 9, solidOy: 5 }); m.lamp(2640, 4315, 'lantern');
    m.flat('laundry', 2440, 4620, 150, 86);   // 晒衣架
    m.flat('laundry', 1720, 4020, 150, 86);
    m.spr('snowman', 1280, 4560, { solid: 14, solidOy: 6 }); // 雪人
    m.spr('snowman', 2900, 4080, { solid: 14, solidOy: 6 });
    m.spr('snowman', 3050, 4880, { solid: 14, solidOy: 6 });
    m.spr('pineSnow', 1200, 3900, { solid: 20, solidOy: 16 });
    m.spr('pineSnow', 3000, 3660, { solid: 20, solidOy: 16 });
    // 竹篱笆围出的小院（意见2第二轮：院门留口）
    m.block('fence', 2650, 4740, 340, 20);
    m.block('fence', 2650, 4740, 20, 260);
    m.block('fence', 2970, 4740, 20, 260);
    m.block('fence', 2650, 4980, 180, 20);
    m.block('fence', 2930, 4980, 60, 20);
    m.spr('bench', 2820, 4860); m.spr('potted', 2720, 4900); m.spr('potted', 2920, 4880);
    m.spr('boxes', 1420, 4820, { solidRect: [60, 44], solidOy: 6 }); // 木柴堆
    m.spr('boxes', 1490, 4860, { solidRect: [60, 44], solidOy: 6 });
    // 横径 / 东径 / 西径
    stone(600, 1900, 3000, 100);
    stone(3200, 700, 100, 1300);
    stone(900, 1100, 100, 900);
    // 温泉旅馆主楼 + 东别馆（意见2地标：主楼加大）
    m.bld('inn', 1460, 280, 820, 360, { padK: 'stone' });
    m.bld('inn', 2380, 320, 400, 300, { padK: 'stone' });
    stone(1460, 640, 1320, 90);
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
    /* ---- 东扩：雪见庭园（意见2地标：雪顶凉亭 + 露天新汤） ---- */
    stone(3920, 200, 110, 1800);       // 湖东岸径（北接雪原、南接横径东延）
    stone(4030, 660, 700, 90);         // 凉亭引道
    m.spr('snowPavilion', 4600, 900, { solidRect: [170, 100], solidOy: 6 }); // 凉亭碰撞贴台基
    m.onsen(4260, 1340, 260, 170);     // 露天新汤（蒸汽）
    m.spr('stoneLantern', 4460, 800, { solid: 15, solidOy: 8 }); m.spr('stoneLantern', 4740, 800, { solid: 15, solidOy: 8 });
    m.lamp(4460, 780, 'lamp'); m.lamp(4740, 780, 'lamp');
    m.spr('pineSnow', 4180, 940, { solid: 20, solidOy: 16 });
    m.spr('pineSnow', 4950, 1000, { solid: 20, solidOy: 16 });
    m.spr('rockSnow', 4200, 500, { solid: 26, solidOy: 18 });
    m.spr('rockSnow', 4900, 1600, { solid: 26, solidOy: 18 });
    // 横径东延（贯通到东扩区）
    stone(3600, 1900, 1440, 100);
    // 竹林（实心；意见2第二轮：抖动/疏密/大小随机，去方阵感）
    const bambooGrove = (x0, y0, x1, y1) => {
      for (let gy = y0; gy <= y1; gy += 105) for (let gx = x0; gx <= x1; gx += 105) {
        if (U.hash2(gx, gy, 30) < 0.22) continue; // 疏密不均
        const jx = (U.hash2(gx, gy, 11) - 0.5) * 68, jy = (U.hash2(gy, gx, 12) - 0.5) * 68;
        const bs = 0.9 + U.hash2(gx, gy, 13) * 0.2;
        m.spr('bamboo', gx + jx, gy + jy, { sx: bs, sy: bs, solid: 20, solidOy: 14 }); // 修复:竹林阻挡圆上移，脚下不再多挡一条看不见的雪地
      }
    };
    bambooGrove(3420, 2100, 4080, 3380);
    bambooGrove(160, 2250, 820, 3400);
    // 意见2：东扩竹林（雪见庭园以南）与西侧竹林南延（填满新增区域）
    bambooGrove(4100, 2100, 4980, 3380);
    bambooGrove(160, 3480, 820, 5180);
    // 意见2第二轮：新汤池群（露天汤手）
    m.onsen(1300, 2150, 200, 140);
    m.onsen(2600, 2900, 240, 160);
    // 雪松群（成群错落，点缀雪原）
    const pineCluster = (cx, cy, n) => {
      for (let i = 0; i < n; i++) {
        const px2 = cx + (U.hash2(cx, cy + i, 31) - 0.5) * 420, py2 = cy + (U.hash2(cy, cx + i, 32) - 0.5) * 300;
        const ps = 0.9 + U.hash2(px2, py2, 33) * 0.25;
        m.spr('pineSnow', px2, py2, { sx: ps, sy: ps, solid: 20, solidOy: 16 });
      }
    };
    pineCluster(1220, 900, 5);
    pineCluster(2650, 900, 5);
    pineCluster(1750, 2500, 5);
    pineCluster(4600, 1700, 5);
    pineCluster(1100, 4700, 5);
    pineCluster(2400, 4950, 4);
    // 脚印小径（意见2第二轮：雪地细节）
    for (const [fx2, fy2] of [[2230, 900], [2230, 1500], [2230, 2500], [2230, 3000], [1600, 2060], [2600, 2060]]) {
      m.fill('footprint', fx2, fy2, 44, 220);
    }
    m.fill('ice', 2450, 2650, 160, 90); m.fill('ice', 1750, 1250, 140, 80); // 冰面补丁
    /* 猫道：竹林兽径 */
    m.cat(3700, 1960, 44, 1420);
    m.spr('catArch', 3722, 2000); m.spr('pawSign', 3722, 3340);
    m.cat(500, 1960, 44, 2180);      // 西侧兽径南延至新增南区
    m.spr('pawSign', 522, 2000); m.spr('catArch', 522, 3360); m.spr('pawSign', 522, 4080);
    m.cat(4500, 2000, 44, 1380);     // 东扩竹林兽径（接横径东延）
    m.spr('catArch', 4522, 2060); m.spr('pawSign', 4522, 3300);
    /* ---- 南扩：汤坂街两侧雪原（意见2填充，不留空地） ---- */
    m.water(1200, 3860, 480, 280);   // 冰池（水面不可过）
    m.spr('rockSnow', 1140, 3820, { solid: 26, solidOy: 18 }); m.spr('rockSnow', 1740, 4140, { solid: 26, solidOy: 18 });
    m.spr('pineSnow', 900, 3700, { solid: 20, solidOy: 16 });
    m.spr('pineSnow', 3450, 4140, { solid: 20, solidOy: 16 });
    m.spr('rock', 3400, 3700, { solid: 26, solidOy: 18 });
    m.spr('rockSnow', 3800, 3960, { solid: 26, solidOy: 18 });
    m.spr('snowPavilion', 3200, 3860, { solidRect: [170, 100], solidOy: 6 }); // 南面第二座雪顶凉亭
    m.spr('stoneLantern', 3060, 3800, { solid: 15, solidOy: 8 }); m.lamp(3060, 3780, 'lamp');
    // 岩石与雪松
    for (const [rx, ry] of [[2350, 950], [2750, 1150], [2550, 2650], [900, 2550], [1150, 2750], [3150, 1950], [1350, 1000], [2900, 2100]]) {
      m.spr('rock', rx, ry, { solid: 26, solidOy: 18 });
    }
    for (const [rx, ry] of [[1300, 300], [2900, 400], [700, 800], [4050, 1550], [1500, 2200], [2450, 3050], [1050, 3050], [4000, 1900]]) {
      m.spr('rockSnow', rx, ry, { solid: 26, solidOy: 18 });
    }
    for (const [px, py] of [[500, 400], [1000, 300], [1750, 1100], [2950, 1550], [820, 1500], [2600, 1750], [1200, 2300], [2000, 2650], [3350, 2350], [1550, 3200], [3000, 3200], [2900, 1550]]) {
      m.spr('pineSnow', px, py, { solid: 20, solidOy: 16 }); // 修复:雪松碰撞贴树干，消除南向隐形格
    }
    // 红灯笼参道（灯柱=小圆形阻挡）
    for (const ly of [900, 1300, 1700, 2100, 2500, 2900]) {
      m.spr('redLantern', 2170, ly, { solid: 9, solidOy: 5 });
      m.lamp(2170, ly - 45, 'lantern');
    }
    for (const lx of [1560, 2140]) { m.spr('redLantern', lx, 660, { solid: 9, solidOy: 5 }); m.lamp(lx, 615, 'lantern'); }
    for (const [sx, sy] of [[2020, 1080], [2200, 1080], [2560, 2480], [970, 2660]]) {
      m.spr('stoneLantern', sx, sy, { solid: 15, solidOy: 8 });
      m.lamp(sx, sy - 20, 'lamp');
    }
    return m;
  }

  /* ---------- 🎡 幽灵游乐园：旋转木马、过山车轨道（猫能钻过）、马戏帐篷 ---------- */
  function carnival() {
    const m = new MB({
      id: 'carnival', name: '幽灵游乐园', emoji: '🎡',
      desc: '废弃乐园 · 马戏主场 · 过山车环线',
      w: 6900, h: 5100, start: { x: 2300, y: 3180 },
      base: '#544b68', catGround: '#463d52', catGround2: '#3e3650',
      roofs: ['#7e6e96', '#8a6a76'],
      pv: { 0: '#4a4160', 1: '#2c2438', 2: '#6a5340', 3: '#d9a441' }
    });
    m.fill('plazaWarm', 0, 0, m.w, m.h);
    // 地面细节层先垫底（地面彩绘/落叶堆/裂缝，只显形在露出的空地上，被树篱边界盖住）
    m.scatter('chalk', 120, 120, 6780, 4980, 340, 110);
    m.scatter('leafpile', 120, 120, 6780, 4980, 390, 90);
    m.scatter('crack', 140, 140, 6760, 4960, 560, 130);
    m.border('hedgeDark', 60);
    const court = (x, y, w2, h2) => m.fill('court', x, y, w2, h2);
    // 入口广场 + 大道
    court(1900, 3000, 800, 340);
    court(2050, 700, 500, 2340);
    m.spr('stallAmber', 2050, 3220, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallCyan', 2550, 3220, { solidRect: [100, 40], solidOy: 6 });
    m.flat('stringLights', 1980, 3060, 320, 56);
    m.flat('stringLights', 2300, 3060, 320, 56);
    // 旋转木马（地标）
    m.ops.push({ k: 'roundcourt', x: 2300, y: 1560, r: 150 });
    m.spr('carousel', 2300, 1620, { solidRect: [216, 88], solidOy: 24 }); // 修复:木马碰撞改矩形贴底盘，南侧广场不再被圆碰撞封掉一大片
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
    // 修复:轨道宽 64px 但按 20px 格封锁成 80px，两侧各多出一条隐形墙；厚度与端点全部对齐 20px 网格
    const track = (x, y, w2, h2) => m.block('track', x, y, w2, h2);
    track(1200, 600, 2400, 60);
    track(3600, 600, 60, 1600);
    track(2760, 2200, 900, 60);   // 修复:东段轨道从站台东侧起始，不再被站台贴图盖住末端形成隐形墙
    track(1200, 1400, 60, 860);
    track(1200, 2200, 720, 60);   // 修复:西段轨道在站台以西收头，末端不再藏进站台底下
    /* ---- 东扩：马戏团主场 + 木马大厅（意见2地标） ---- */
    court(3860, 600, 1440, 1180);      // 环内广场
    // 过山车东环（意见2：更长的轨道，西侧留 200px 入口）
    track(3800, 540, 1560, 60);
    track(5300, 540, 60, 1300);
    track(4000, 1780, 1360, 60);
    m.cat(4420, 1740, 120, 140);       // 南轨涵洞（猫道，两端接通）
    m.spr('catArch', 4480, 1900); m.spr('pawSign', 4480, 1700);
    // 大马戏团主帐篷（地标：放大到约 520×420）
    m.spr('bigTop', 4500, 1180, { sx: 1.45, sy: 1.45, solidRect: [435, 261], solidOy: 14 });
    m.lamp(4330, 1300, 'lantern'); m.lamp(4670, 1300, 'lantern');
    // 旋转木马大厅（地标：放大到约 440 直径）
    m.ops.push({ k: 'roundcourt', x: 4980, y: 1480, r: 190 });
    m.spr('carousel', 4980, 1560, { sx: 1.7, sy: 1.7, solidRect: [367, 150], solidOy: 40 }); // 碰撞随缩放贴底盘
    m.lamp(4840, 1300, 'lantern'); m.lamp(5120, 1300, 'lantern');
    // 场内摊贩与彩灯
    m.spr('popcorn', 4150, 900, { solidRect: [56, 38], solidOy: 6 });
    m.spr('balloonCart', 4150, 1500, { solidRect: [60, 40], solidOy: 6 });
    m.flat('stringLights', 3950, 780, 420, 56);
    m.flat('stringLights', 4700, 780, 420, 56);
    for (let i = 0; i < 3; i++) m.spr(['stallPink', 'stallCyan', 'stallAmber'][i % 3], 4050 + i * 200, 660, { solidRect: [100, 40], solidOy: 6 });
    m.spr('ticket', 5150, 700, { solidRect: [52, 60], solidOy: 10 });
    for (let i = 0; i < 2; i++) { m.spr('bench', 3990, 1250 + i * 160); m.spr('bench', 5210, 1250 + i * 160); }
    m.spr('trash', 4250, 1700); m.spr('cone', 5200, 900); m.spr('cone', 3900, 1000);
    m.spr('trash', 3990, 1700); m.flat('puddle', 5200, 1700, 90, 50);
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
    m.spr('balloonCart', 2620, 1200, { solidRect: [60, 40], solidOy: 6 });
    m.spr('popcorn', 2620, 1500, { solidRect: [56, 38], solidOy: 6 }); // 修复:售卖车碰撞改矩形贴贴图
    m.spr('stallPink', 2620, 1900, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallCyan', 2620, 2060, { solidRect: [100, 40], solidOy: 6 });
    m.lamp(2620, 1140, 'lantern'); m.lamp(2620, 1440, 'lantern');
    // 碰碰车场（围栏开一口，能进去打；南移避开过山车南轨）——修复:围栏对齐 20px 网格，栏杆外不再有隐形格
    m.block('fence', 1200, 2320, 400, 20);
    m.block('fence', 1200, 2600, 130, 20);
    m.block('fence', 1470, 2600, 130, 20);
    m.block('fence', 1200, 2320, 20, 300);
    m.block('fence', 1580, 2320, 20, 300);
    court(1222, 2342, 356, 256);
    m.spr('carPink', 1320, 2500, { sx: 0.55, sy: 0.55 });
    m.spr('carCyan', 1480, 2440, { sx: 0.55, sy: 0.55 });
    // 破喷泉（岩石堆）——修复:岩石盘此前只画不挡（看得走过不去的反向问题），补上实际阻挡
    m.ops.push({ k: 'roundrock', x: 2300, y: 2560, r: 60 });
    m.stampCirc(2300, 2560, 60, T.BLOCK);
    m.spr('rock', 2300, 2590, { solid: 30, solidOy: 20 });
    // 马戏帐篷阵（实心 + 帐篷缝猫道）
    m.spr('tentRed', 4000, 2600, { solidRect: [128, 86], solidOy: 6 });
    m.spr('tentPurple', 4230, 2860, { solidRect: [128, 86], solidOy: 6 });
    m.spr('tentTeal', 4020, 3060, { solidRect: [128, 86], solidOy: 6 });
    m.cat(4100, 2380, 44, 1760);     // 帐篷阵兽径（南延贯通新增南区）
    m.spr('catArch', 4122, 2420); m.spr('pawSign', 4122, 3280); m.spr('pawSign', 4122, 3680);
    // 帐篷阵以西补些内容（气球车/摊位/灯），避免东侧空旷
    m.spr('balloonCart', 3620, 2980, { solidRect: [60, 40], solidOy: 6 });
    m.spr('stallAmber', 3660, 2560, { solidRect: [100, 40], solidOy: 6 });
    m.spr('lamp', 3560, 2740, { solid: 8, solidOy: 4 }); m.lamp(3560, 2700, 'lantern');
    m.spr('trash', 3900, 3200);
    m.spr('cone', 3560, 2900);
    m.flat('puddle', 3780, 2880, 90, 50);
    // 轨道沿线补点彩灯与杂物（原有区域加密）
    m.flat('stringLights', 1300, 700, 420, 56);
    m.flat('stringLights', 2400, 700, 420, 56);
    m.spr('trash', 1700, 900); m.spr('cone', 3000, 800);
    m.spr('balloonCart', 3200, 1950, { solidRect: [60, 40], solidOy: 6 });
    m.slow('leaves', 2600, 1200, 320, 220);
    /* ---- 南扩：入口大街延长 + 南市集（意见2填充） ---- */
    court(2050, 3340, 500, 560);       // 大道南延
    m.flat('stringLights', 2080, 3420, 440, 56);
    m.spr('stallPink', 1700, 3560, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallAmber', 2900, 3560, { solidRect: [100, 40], solidOy: 6 });
    m.spr('balloonCart', 1850, 3760, { solidRect: [60, 40], solidOy: 6 });
    m.spr('popcorn', 2750, 3760, { solidRect: [56, 38], solidOy: 6 });
    m.spr('lamp', 2040, 3560, { solid: 8, solidOy: 4 }); m.lamp(2040, 3520, 'lamp');
    m.spr('lamp', 2560, 3560, { solid: 8, solidOy: 4 }); m.lamp(2560, 3520, 'lamp');
    // 南侧破旧帐篷二连
    m.spr('tentPurple', 3950, 3620, { solidRect: [128, 86], solidOy: 6 });
    m.spr('tentTeal', 4300, 3660, { solidRect: [128, 86], solidOy: 6 });
    m.spr('trash', 4150, 3820); m.spr('cone', 3800, 3700);
    m.flat('puddle', 4450, 3800, 90, 50);
    // 西南落叶市集
    m.slow('leaves', 300, 3450, 1100, 450);
    m.spr('stallCyan', 700, 3700, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallAmber', 1000, 3700, { solidRect: [100, 40], solidOy: 6 });
    m.spr('bike', 1250, 3800); m.flat('puddle', 500, 3800, 90, 50);
    m.spr('trash', 1450, 3550); m.spr('cone', 550, 3600);
    /* ---- 东二列：停车场 + 游艺街 + 座椅草坪（意见2第二轮填充） ---- */
    court(5560, 300, 1240, 1400);
    for (let r2 = 0; r2 < 2; r2++) {
      m.ops.push({ k: 'parkline', x: 5620, y: 420 + r2 * 260, w: 1060, h: 120, vert: true, gap: 96 });
      for (let i = 0; i < 8; i++) m.spr(['carPink', 'carCyan', 'carAmber'][i % 3], 5700 + i * 130, 540 + r2 * 260, { solidRect: [100, 44], solidOy: 6 });
    }
    m.spr('vending', 5640, 1600, { solidRect: [44, 68], solidOy: 6 });
    m.spr('trash', 6600, 1620);
    for (let i = 0; i < 5; i++) m.spr(['stallPink', 'stallCyan', 'stallAmber'][i % 3], 5650 + i * 230, 1900, { solidRect: [100, 40], solidOy: 6 });
    m.flat('stringLights', 5600, 1960, 1100, 56);
    m.spr('ticket', 5620, 2160, { solidRect: [52, 60], solidOy: 10 });
    m.spr('popcorn', 5900, 2170, { solidRect: [56, 38], solidOy: 6 });
    m.spr('balloonCart', 6150, 2170, { solidRect: [60, 40], solidOy: 6 });
    for (let i = 0; i < 4; i++) { m.spr('lamp', 5700 + i * 300, 2400, { solid: 8, solidOy: 4 }); m.lamp(5700 + i * 300, 2360, 'lamp'); }
    m.spr('trash', 6600, 1950); m.spr('cone', 6600, 2300);
    court(5560, 2600, 1240, 1200);
    m.flat('stringLights', 5650, 2700, 1000, 56);
    for (let i = 0; i < 3; i++) { m.spr('bench', 5800 + i * 300, 2820); m.spr('bench', 5800 + i * 300, 2970); }
    m.spr('balloonCart', 6100, 3300, { solidRect: [60, 40], solidOy: 6 });
    m.spr('ticket', 6350, 3460, { solidRect: [52, 60], solidOy: 10 });
    m.spr('trash', 5800, 3600); m.spr('cone', 6400, 3060);
    m.flat('puddle', 5900, 3550, 90, 50);
    /* ---- 南二排：摊位街延长 + 帐篷营（意见2第二轮填充） ---- */
    court(2050, 3900, 500, 1050);      // 大道再南延至新边界
    m.flat('stringLights', 2080, 4180, 440, 56);
    m.spr('stallPink', 1750, 4310, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallCyan', 1750, 4530, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallAmber', 2850, 4310, { solidRect: [100, 40], solidOy: 6 });
    m.spr('stallCyan', 2850, 4530, { solidRect: [100, 40], solidOy: 6 });
    m.spr('ticket', 1900, 4750, { solidRect: [52, 60], solidOy: 10 });
    m.spr('balloonCart', 2800, 4750, { solidRect: [60, 40], solidOy: 6 });
    m.spr('lamp', 2040, 4310, { solid: 8, solidOy: 4 }); m.lamp(2040, 4270, 'lamp');
    m.spr('lamp', 2560, 4310, { solid: 8, solidOy: 4 }); m.lamp(2560, 4270, 'lamp');
    m.slow('leaves', 300, 4150, 1000, 700);
    m.spr('tentPurple', 500, 4400, { solidRect: [128, 86], solidOy: 6 });
    m.spr('tentRed', 900, 4700, { solidRect: [128, 86], solidOy: 6 });
    m.spr('trash', 1300, 4400); m.spr('cone', 600, 4800);
    court(3900, 4200, 1300, 700);      // 东南马戏中场
    m.spr('tentTeal', 4300, 4520, { solidRect: [128, 86], solidOy: 6 });
    m.spr('tentPurple', 4750, 4620, { solidRect: [128, 86], solidOy: 6 });
    m.spr('popcorn', 5100, 4520, { solidRect: [56, 38], solidOy: 6 });
    m.spr('trash', 5000, 4740); m.spr('cone', 4050, 4700);
    m.flat('stringLights', 3950, 4300, 1200, 56);
    // 摩天轮底座 + 支柱（远景装饰感）
    m.ops.push({ k: 'roundcourt', x: 700, y: 2600, r: 120 });
    m.spr('bollard', 640, 2600); m.spr('bollard', 760, 2600);
    m.spr('balloonCart', 700, 2760, { solidRect: [60, 40], solidOy: 6 });
    // 路灯与彩灯（灯柱=小圆形阻挡）
    for (const ly of [1000, 1500, 2000, 2500, 2900, 3400]) {
      m.spr('lamp', 2090, ly, { solid: 8, solidOy: 4 }); m.lamp(2090, ly - 40, 'lamp');
      m.spr('lamp', 2510, ly + 200, { solid: 8, solidOy: 4 }); m.lamp(2510, ly + 160, 'lamp');
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
    T, CELL, sprites: S, list: [endless, ...list], defaultId: 'oldtown', // sprites: 供工具读取精灵视觉尺寸
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
