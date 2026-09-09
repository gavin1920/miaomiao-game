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
  // 猫耳（模块级：本体/死亡立绘共用；pal = 调色板覆盖，欢呼小猫换毛色用）
  function catEar(x, bx, by, ax, flip, pal) {
    pal = pal || CAT;
    x.beginPath();
    x.moveTo(bx[0], bx[1]); x.lineTo(ax[0], ax[1]); x.lineTo(bx[2], bx[3]);
    x.closePath();
    x.fillStyle = pal.headTop; x.fill();
    x.lineWidth = 4; x.strokeStyle = '#6b4436'; x.stroke();
    x.beginPath();
    x.moveTo(bx[0] + (flip ? 1 : 3), by[0] + 2); x.lineTo(ax[0] + (flip ? 1.5 : 1), ax[1] + 7); x.lineTo(bx[2] - 3, by[0] + 3);
    x.closePath(); x.fillStyle = pal.earIn; x.fill();
  }
  // o: {legF, legB, bob, br(呼吸0/1), tail(0/1), face:'normal'|'blink'|'hurt', dead, cat(调色板覆盖：换毛色画欢呼小猫)}
  function drawCat(x, o) {
    const C = o.cat || CAT; // 毛色调色板：不传用大橘本尊配色
    const tail = o.tail || 0;
    const bob = o.bob || 0;
    const br = o.br || 0;
    x.save();
    x.translate(0, bob);
    if (o.dead) { drawCatDead(x); x.restore(); return; }
    /* 尾巴（最底层）：双层描边 + 环纹 + 深色尾尖 */
    const tailDraw = (cp, end, tip) => {
      strokePath(x, c => { c.moveTo(26, 64); c.quadraticCurveTo(cp[0], cp[1], end[0], end[1]); }, C.out, 13);
      strokePath(x, c => { c.moveTo(26, 64); c.quadraticCurveTo(cp[0], cp[1], end[0], end[1]); }, C.furBot, 9);
      // 环纹
      strokePath(x, c => { c.moveTo(cp[0] * 0.55 + 13, cp[1] * 0.55 + 32); c.lineTo(cp[0] * 0.5 + 11, cp[1] * 0.5 + 40); }, C.stripe, 8);
      circ(x, tip[0], tip[1], 5.6, C.stripe, C.out, 2.4);
      shine(x, tip[0] - 1.6, tip[1] - 1.8, 2, 1.3, -0.5);
    };
    if (tail === 0) tailDraw([4, 52], [6, 30], [7, 27]);
    else tailDraw([-2, 62], [-4, 44], [-5, 41]);
    /* 后腿 */
    blob(x, ellPath(34 + (o.legB || 0), 80, 8.5, 7.5), lg(x, 0, 72, 0, 88, [[0, C.headBot], [1, C.furBot]]), { ow: 3.5 });
    /* 身体：渐变 + 双描边 */
    blob(x, ellPath(47, 62, 26, 21 + br * 0.8),
      lg(x, 0, 40, 0, 84, [[0, C.furTop], [0.55, C.furMid || '#ffb970'], [1, C.furBot]]), { ow: 4 });
    /* 肚皮（柔边） */
    x.save();
    ell(x, 50, 69, 15, 12.5, rg(x, 50, 66, 3, 17, [[0, C.cream], [0.75, '#fff0d6'], [1, 'rgba(255,240,214,0)']]));
    x.restore();
    /* 背部条纹 */
    x.save(); x.globalAlpha = 0.9;
    strokePath(x, c => { c.moveTo(32, 46); c.quadraticCurveTo(36, 52, 32, 58); }, C.stripe, 5);
    strokePath(x, c => { c.moveTo(44, 42); c.quadraticCurveTo(48, 49, 44, 56); }, C.stripe, 5);
    x.restore();
    /* 前腿（走路抬起时露爪垫） */
    const fLeg = 62 + (o.legF || 0);
    blob(x, ellPath(fLeg, 81, 8, 7.5), lg(x, 0, 73, 0, 89, [[0, C.headBot], [1, C.furBot]]), { ow: 3.5 });
    if (o.legF < -2) { // 抬起的爪爪
      circ(x, fLeg - 2.4, 84.5, 1.5, C.earIn); circ(x, fLeg + 1.6, 85, 1.5, C.earIn); circ(x, fLeg, 82.6, 1.8, C.earIn);
    }
    /* 项圈 + 铃铛（脖子处） */
    x.save();
    x.beginPath(); x.ellipse(60, 56, 21, 15, 0, Math.PI * 0.18, Math.PI * 0.86);
    x.lineWidth = 7.5; x.strokeStyle = C.collar; x.stroke();
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
      catEar(x, [46, 22, 62, 16], [0], [36, 8], false, C);
      catEar(x, [78, 20, 92, 15], [0], [96, 10], true, C);
    } else {
      catEar(x, [45, 22, 61, 15], [0], [40, 2], false, C);
      catEar(x, [75, 20, 91, 14], [0], [88, 3], true, C);
    }
    // 头：渐变 + 双描边 + 脸侧绒毛
    blob(x, circPath(64, hy, 26), rg(x, 58, hy - 8, 6, 34, [[0, C.headTop], [0.7, C.headBot], [1, C.headShade || '#ef8f45']]), { ow: 4 });
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
    strokePath(x, c => { c.moveTo(58, hy - 24); c.lineTo(58, hy - 17); }, C.stripe, 4);
    strokePath(x, c => { c.moveTo(65, hy - 26); c.lineTo(65, hy - 18); }, C.stripe, 4);
    strokePath(x, c => { c.moveTo(72, hy - 24); c.lineTo(72, hy - 17); }, C.stripe, 4);
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
    x.closePath(); x.fillStyle = C.nose; x.fill();
    x.lineWidth = 2; x.strokeStyle = C.out; x.stroke();
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

  /* ================= 欢呼小猫（宝箱大奖/金币头奖庆祝演出用） =================
     同一套 drawCat 画法换毛色烘焙：每只 2 帧（蹲 / 跳，弹跳+抬爪+换尾），
     演出层只做 drawImage 帧轮播 + 相位蹦跳，绝不每帧重绘 drawCat。 */
  const CHEER_PALS = [
    null, // 大橘本尊（默认配色）
    { furTop: '#e8edf7', furBot: '#aeb9d6', headTop: '#eef2fb', headBot: '#b7c2dd', furMid: '#c9d2e6', headShade: '#a9b4d0', stripe: '#93a0c0', collar: '#5f8fe0' }, // 蓝灰
    { furTop: '#9a8f8a', furBot: '#5f5551', headTop: '#a99d97', headBot: '#6b605b', furMid: '#7d726d', headShade: '#5c524e', stripe: '#4e4541', collar: '#ffd34d' }, // 烟灰
    { furTop: '#fffdf6', furBot: '#e8ddc8', headTop: '#fffef9', headBot: '#efe6d4', furMid: '#f3ecdc', headShade: '#ddd0b8', stripe: '#d9c9a8', collar: '#7dc46a' }, // 雪白
    { furTop: '#f7e3c0', furBot: '#c9a26b', headTop: '#f9e8ca', headBot: '#cfae7c', furMid: '#dcbf92', headShade: '#b8945f', stripe: '#a97f4b', collar: '#e05f9f' }, // 奶茶
    { furTop: '#d8ccf5', furBot: '#a291d9', headTop: '#e0d6f8', headBot: '#ab9ade', furMid: '#bdb0e6', headShade: '#9887cc', stripe: '#8a79c2', collar: '#e0705f' }  // 香芋
  ].map(p => p ? Object.assign({}, CAT, p) : CAT);
  const CHEER_CATS = CHEER_PALS.map(pal => [0, 1].map(f => bake2(112, 112, x => drawCat(x, {
    cat: pal, br: 0, tail: f, bob: f ? -7 : 0, legF: f ? -7 : 0, legB: f ? -2 : 0
  }))));

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
    cheer: CHEER_CATS,
    E, EW, EB, EH,
    items, projs, slash, icons, decor, glows, eliteCrown,
    sky, drawLightning
  };
})();
