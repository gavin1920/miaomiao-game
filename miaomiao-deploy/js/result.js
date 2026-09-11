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

  /* 大橘横幅：结算面板顶部的 #over-cat（index.html 新增画布）。
     成功（含讨伐老鼠妈妈）= 站姿 idle[0]，失败 = 躺平 dead；上下浮动交给 CSS catbob 动画 */
  function drawOverCat(d) {
    const cv = $('over-cat');
    if (!cv || !Art.playerFrames) return;
    const cat = d.win ? Art.playerFrames.idle[0] : Art.playerFrames.dead;
    if (!cat) return;
    cv.width = cat.width; cv.height = cat.height; // 画布贴帧原生尺寸，CSS 显示 96px，像素不糊
    const x = cv.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, cv.width, cv.height);
    x.drawImage(cat, 0, 0);
  }

  /* 数据格小图标：每格配一枚已有像素图标（像素模式读 manifest 键 / 原版矢量回退读 art.js 键） */
  const STAT_ICONS = {
    'st-round': ['paw', 'paw'],         // 到达轮次 · 爪印足迹
    'st-time': ['alarm', 'clock'],      // 本局时长 · 小闹钟
    'st-lv': ['bell', 'bell'],          // 等级 · 铃铛
    'st-kill': ['claw', 'claw'],        // 打跑敌人 · 猫爪
    'st-gold': ['coin', 'coin'],        // 金币
    'st-dmg': ['dmg', 'stampDmg'],      // 总伤害 · 锐爪印
    'st-dps': ['zap', 'zap'],           // 平均 DPS · 静电
    'st-peak': ['crit', 'stampCrit']    // 最高秒伤 · 会心印
  };
  function statIcon(id, keys) {
    const box = $(id);
    if (!box) return;
    let c = box.querySelector('canvas.sico');
    if (!c) {
      c = document.createElement('canvas');
      c.className = 'sico';
      box.insertBefore(c, box.firstChild);
    }
    const icon = Art.icons && (Art.icons[keys[0]] || Art.icons[keys[1]]);
    if (!icon) return;
    c.width = 44; c.height = 44;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.clearRect(0, 0, 44, 44);
    x.drawImage(icon, 0, 0, 44, 44);
  }

  function open(d) {
    last = d;
    drawOverCat(d);
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
    for (const [id, keys] of Object.entries(STAT_ICONS)) statIcon(id, keys);
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
    $('lb-rank-line').hidden = true; // 排行榜提交成功后由 showLbRank 填入（ leaderboard.js 异步回来）
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
    fillRR(x, bx - w, by, w, 34, 17, bg, '#453244', 3);
    x.fillStyle = fg || '#fff';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(txt, bx - w / 2, by + 18);
  }
  function drawChip(x, cx, cy, icon, badgeTxt, kind) {
    const S = 78;
    const stamp = kind === 'stamp', evo = kind === 'evo';
    x.save();
    if (evo) { x.shadowColor = 'rgba(224,86,86,.85)'; x.shadowBlur = 18; }
    const g = x.createLinearGradient(0, cy, 0, cy + S);
    g.addColorStop(0, stamp ? '#fff6df' : '#fffdf6');
    g.addColorStop(1, stamp ? '#ffe9bd' : '#ffefd6');
    fillRR(x, cx, cy, S, S, 20, g, '#453244', 4); // VI v2.2：chip 描边统一墨线
    x.restore();
    x.drawImage(icon, cx + 10, cy + 9, 60, 60);
    if (badgeTxt != null) {
      const bg = stamp ? '#f0b13c' : evo ? '#e05656' : '#ff8fb5';
      const fg = stamp ? '#453244' : '#fff6e0';
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

    /* ---- 面板底 + 猫耳 + 大橘（VI v2.2：蛋壳渐变 + 墨线 + 内奶白描边） ---- */
    fillRR(x, panelX + 6, panelTop + 18, panelW, panelH, 36, 'rgba(30,20,30,.32)');
    const pg = x.createLinearGradient(0, panelTop, 0, panelBot);
    pg.addColorStop(0, '#fffdf6'); pg.addColorStop(1, '#f2e8d8');
    fillRR(x, panelX, panelTop, panelW, panelH, 34, pg, '#453244', 6);
    x.save();
    x.strokeStyle = '#fff6e0'; x.lineWidth = 4;
    Art.rr(x, panelX + 8, panelTop + 8, panelW - 16, panelH - 16, 27); x.stroke();
    x.restore();
    // 猫耳
    for (const side of [-1, 1]) {
      x.save();
      x.translate(side < 0 ? panelX + 148 : panelX + panelW - 148, panelTop - 4);
      x.rotate(side < 0 ? -0.42 : Math.PI * 0.63);
      fillRR(x, -22, -22, 44, 44, 14, '#f2e8d8', '#453244', 5);
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
    x.fillStyle = d.mother ? '#a44fc9' : d.win ? '#e05656' : '#453244';
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
      const cg = x.createLinearGradient(0, cy, 0, cy + cellH);
      cg.addColorStop(0, '#fffdf6'); cg.addColorStop(1, '#ffefd6');
      fillRR(x, cx, cy, cellW, cellH, 22, cg, '#453244', 3);
      x.textAlign = 'center';
      x.font = '900 40px ' + FONT;
      x.fillStyle = '#e05656';
      x.fillText(st[0], cx + cellW / 2, cy + 42);
      x.font = '400 22px ' + FONT;
      x.fillStyle = '#96806f';
      x.fillText(st[1], cx + cellW / 2, cy + 84);
    });
    y += 242 + 26;
    // 构筑清单
    const bg2 = x.createLinearGradient(0, y, 0, y + buildH);
    bg2.addColorStop(0, '#fffdf6'); bg2.addColorStop(1, '#fff6e0');
    fillRR(x, innerX, y, innerW, buildH, 22, bg2, '#453244', 3);
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

  /* 云端排行榜提交回执（lb 提交是异步的：面板先出，名次回来再点亮这一行。
     小游戏版不执行本函数——那边的名次走 MUI.setLbLine，见 tools_transform.py 的改写） */
  function showLbRank(rank) {
    const el = $('lb-rank-line');
    if (!el || !rank) return;
    el.textContent = '🏆 恭喜上榜：云端第 ' + rank + ' 名！';
    el.hidden = false;
  }

  return { open, saveImage, renderCard, showLbRank };
})();
