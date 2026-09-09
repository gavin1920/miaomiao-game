/* ============================================================
 * FM 2027 Matchday - 球场渲染（呈现层，独立于仿真核）
 * 引擎每分钟输出 frame（22 名球员坐标+球坐标），本层做插值动画。
 * 共识 B2：射门/进球时球飞向球门 + 进球闪光 + 进球方 token 高亮；
 * 球员点显示姓氏；所有演出只消费 viewRng 产出的事件，不触碰仿真。
 * ============================================================ */
(function (global) {
  'use strict';

  var cv = null, ctx = null;
  var cur = { players: {}, ball: { x: 50, y: 50 } };
  var target = { players: {}, ball: { x: 50, y: 50 } };
  var meta = {};   /* uid -> {side, code, name, zone} */
  var colors = { home: '#e63946', away: '#f1faee' };
  var running = false, idleFrames = 0;

  /* 演出状态 */
  var animQueue = [];   /* 待播放的射门/进球飞行 */
  var anim = null;      /* {t0,dur,fromX,fromY,gx,gy,kind,uid} */
  var goalFlash = 0;    /* 进球闪光结束时间戳 */
  var goalTextUntil = 0, goalTextTeam = 0;
  var highlight = { uid: null, until: 0 };

  function init(canvas, homeColor, awayColor) {
    cv = canvas;
    ctx = cv.getContext('2d');
    colors.home = homeColor || colors.home;
    colors.away = awayColor || colors.away;
    cur = { players: {}, ball: { x: 50, y: 50 } };
    target = { players: {}, ball: { x: 50, y: 50 } };
    meta = {};
    animQueue = []; anim = null; goalFlash = 0; highlight = { uid: null, until: 0 };
    wake();
  }

  function applyFrame(frame) {
    var liveUids = {};
    frame.players.forEach(function (p) {
      liveUids[p.uid] = 1;
      target.players[p.uid] = { x: p.x, y: p.y };
      if (!cur.players[p.uid]) cur.players[p.uid] = { x: p.x, y: p.y };
      meta[p.uid] = { side: p.side, code: p.code, name: p.name, zone: p.zone };
    });
    /* 修剪本帧已消失的球员（换下/红牌），防止幽灵点残留 */
    Object.keys(target.players).forEach(function (uid) {
      if (!liveUids[uid]) {
        delete target.players[uid];
        delete cur.players[uid];
        delete meta[uid];
      }
    });
    target.ball = { x: frame.ball.x, y: frame.ball.y };
    if (frame.events && frame.events.length) playEvents(frame.events);
    wake();
  }

  /* 射门/进球演出：球从当前位置飞向球门（共识 B2 三件套之一） */
  function playEvents(events) {
    events.forEach(function (ev) {
      if (ev.kind !== 'shot' && ev.kind !== 'goal') return;
      animQueue.push(ev);
      if (animQueue.length > 3) animQueue.splice(0, animQueue.length - 3); /* 防积压 */
    });
    wake();
  }

  /* 画面收敛后停止重绘省电；新帧到来时唤醒 */
  function wake() {
    idleFrames = 0;
    if (!running && cv) { running = true; requestAnimationFrame(loop); }
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 2.2); }

  function loop() {
    if (!running || !cv) { running = false; return; }
    var now = performance.now();
    /* 演出调度：飞行中占用球，结束后触发闪光/高亮 */
    if (!anim && animQueue.length) {
      var ev = animQueue.shift();
      anim = { t0: now, dur: ev.kind === 'goal' ? 750 : 600, fromX: cur.ball.x, fromY: cur.ball.y, gx: ev.gx, gy: ev.gy, kind: ev.kind, uid: ev.uid, team: ev.team };
    }
    if (anim) {
      var t = Math.min(1, (now - anim.t0) / anim.dur);
      var e = easeOut(t);
      cur.ball.x = lerp(anim.fromX, anim.gx, e);
      cur.ball.y = lerp(anim.fromY, anim.gy, e);
      target.ball.x = cur.ball.x; target.ball.y = cur.ball.y; /* 飞行期间锁住普通插值 */
      if (t >= 1) {
        if (anim.kind === 'goal') {
          goalFlash = now + 900;
          goalTextUntil = now + 1100;
          goalTextTeam = anim.team;
          highlight = { uid: anim.uid, until: now + 1600 };
        }
        anim = null;
      }
    } else {
      var maxD = 0;
      Object.keys(target.players).forEach(function (uid) {
        if (!cur.players[uid]) cur.players[uid] = { x: target.players[uid].x, y: target.players[uid].y };
        var c = cur.players[uid], t2 = target.players[uid];
        c.x = lerp(c.x, t2.x, 0.08); c.y = lerp(c.y, t2.y, 0.08);
        maxD = Math.max(maxD, Math.abs(c.x - t2.x), Math.abs(c.y - t2.y));
      });
      cur.ball.x = lerp(cur.ball.x, target.ball.x, 0.12);
      cur.ball.y = lerp(cur.ball.y, target.ball.y, 0.12);
      maxD = Math.max(maxD, Math.abs(cur.ball.x - target.ball.x), Math.abs(cur.ball.y - target.ball.y));
    }
    draw(now);
    var animating = anim || now < goalFlash || animQueue.length > 0;
    if (!animating && maxD < 0.05 && ++idleFrames > 90) { running = false; return; }
    requestAnimationFrame(loop);
  }

  function draw(now) {
    var W = cv.width, H = cv.height;
    var pad = 18;
    var fx = function (x) { return pad + (x / 100) * (W - pad * 2); };
    var fy = function (y) { return pad + (y / 100) * (H - pad * 2); };
    /* 草皮 */
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1e7a34'); g.addColorStop(1, '#156228');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    /* 条纹 */
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    var stripes = 10;
    for (var i = 0; i < stripes; i += 2) {
      ctx.fillRect(pad + (W - pad * 2) * i / stripes, pad, (W - pad * 2) / stripes, H - pad * 2);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(fx(0), fy(0), fx(100) - fx(0), fy(100) - fy(0));
    ctx.beginPath(); ctx.moveTo(fx(50), fy(0)); ctx.lineTo(fx(50), fy(100)); ctx.stroke();
    ctx.beginPath(); ctx.arc(fx(50), fy(50), (W - pad * 2) * 0.09, 0, Math.PI * 2); ctx.stroke();
    /* 禁区 */
    [[0, 1], [100, -1]].forEach(function (e) {
      var gx = e[0], dir = e[1];
      var boxW = 16.5 / 105 * 100, boxH = 40.3 / 68 * 100;
      ctx.strokeRect(fx(gx), fy(50 - boxH / 2), dir * (boxW / 100) * (W - pad * 2), (boxH / 100) * (H - pad * 2));
      var smallW = 5.5 / 105 * 100;
      ctx.strokeRect(fx(gx), fy(50 - boxH / 3.4), dir * (smallW / 100) * (W - pad * 2), (boxH / 1.7 / 100) * (H - pad * 2));
    });
    /* 球员 */
    Object.keys(cur.players).forEach(function (uid) {
      var p = cur.players[uid], m = meta[uid];
      if (!m) return;
      var x = fx(p.x), y = fy(p.y);
      var col = m.side === 0 ? colors.home : colors.away;
      /* 进球方高亮环（共识 B2） */
      if (highlight.uid === uid && now < highlight.until) {
        var pulse = 12 + Math.sin(now / 90) * 2.5;
        ctx.beginPath(); ctx.arc(x, y, pulse, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(244,185,66,.95)'; ctx.lineWidth = 2.5; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText((m.code || '').slice(0, 3), x, y);
      /* 姓名下方显示（共识 B2：认得出哈兰德在哪） */
      var surname = (m.name || '').split('·').pop();
      if (surname.length > 4) surname = surname.slice(0, 4);
      if (surname && surname !== m.code) {
        ctx.font = '8px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 3;
        ctx.fillText(surname, x, y + 16);
        ctx.shadowBlur = 0;
      }
      if (m.zone === 'GK') {
        ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,215,0,0.9)'; ctx.stroke();
      }
    });
    /* 球 */
    var bx = fx(cur.ball.x), by = fy(cur.ball.y);
    ctx.beginPath(); ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.stroke();
    /* 进球闪光 + GOAL 字样 */
    if (now < goalFlash) {
      var a = (goalFlash - now) / 900;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.28 * a).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
      var gxp = goalTextTeam === 0 ? fx(96) : fx(4);
      var rg = ctx.createRadialGradient(gxp, fy(50), 4, gxp, fy(50), 120);
      rg.addColorStop(0, 'rgba(255,230,120,' + (0.75 * a).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(255,230,120,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(gxp - 120, fy(50) - 120, 240, 240);
    }
    if (now < goalTextUntil) {
      var ta = Math.min(1, (goalTextUntil - now) / 400);
      ctx.font = 'bold 42px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(244,185,66,' + ta.toFixed(3) + ')';
      ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 12;
      ctx.fillText('GOAL!', W / 2, H / 2 - 10);
      ctx.shadowBlur = 0;
    }
  }

  global.GMD_PITCH = {
    init: init,
    applyFrame: applyFrame,
    /* 测试用：当前画布上的球员数 */
    _debugPlayerCount: function () { return Object.keys(cur.players).length; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
