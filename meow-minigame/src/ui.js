/* 喵都幸存者 · 小游戏版 Canvas UI 层
   H5 版的菜单/三选一/宝箱/暂停/结算/帮助/更新日志都是 HTML 覆盖层，小游戏没有 DOM——
   这里用同一套绘本风格在主画布上重建全部界面。
   设计约定：本层只做「呈现 + 命中」，业务状态全部在 main（fork）里；
   main 在每帧渲染末尾调用 MUI.draw()，触摸事件先经 MUI.touch()（界面吃掉就不给摇杆）。 */
'use strict';
const MUI = (() => {
  const FONT = '"Fusion Pixel","ZCOOL KuaiLe","Microsoft YaHei",sans-serif'; // 像素字体由 adapter wx.loadFont 注册
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
    /* 长文案自动缩字（如「📷 保存战报」在窄按钮上会溢出）：逐号缩小到按钮内宽为止 */
    let btnFs = bh * 0.48;
    const btnMaxW = bw - 14;
    while (btnFs > 10 && x.measureText(label).width > btnMaxW) {
      btnFs -= 1;
      x.font = '700 ' + Math.round(btnFs) + 'px ' + FONT;
    }
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
    x.imageSmoothingEnabled = true; // 4x 烘焙猫平滑缩放（绘本风非像素精灵；最近邻会锯齿糊）
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
    /* 顶部按钮组起点：默认 16%h；真机时避让微信胶囊（__CAPSULE 已是虚拟坐标） */
    const capTop = (typeof __CAPSULE !== 'undefined' && __CAPSULE) ? __CAPSULE.bottom + r2 + 8 : 0;
    const hudTop = Math.max(vh * 0.16, capTop);
    const defs = [
      { icon: '⏸', fn: cb.pause, dy: hudTop },
      { icon: '🔍', sub: zoomLv, fn: cb.cycleZoom, dy: hudTop + (r2 + 6) },
      { icon: '⏩', sub: speedLv, fn: cb.cycleSpeed, dy: hudTop + (r2 + 6) * 2 },
      { icon: cb.muted() ? '🔇' : '🔊', fn: cb.toggleMute, dy: hudTop + (r2 + 6) * 3 }
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
