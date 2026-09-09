/* R3 收敛验证：硬线三档 / tick续打 / 双轴效应 / 验收回归 */
var GAME = 'C:/Users/gavin/Desktop/Games/FM 2027 Matchday/game/';
require(GAME + 'js/data.js');
require(GAME + 'js/tactics.js');
require(GAME + 'js/engine.js');
var D = globalThis.GMD_DATA, T = globalThis.GMD_TACTICS, E = globalThis.GMD_ENGINE;
D.CLUBS.forEach(function (c) { c.players.forEach(function (p, i) { p.__uid = c.id + '-' + i; }); });
var ALL = [];
D.CLUBS.forEach(function (c) { c.players.forEach(function (p) { ALL.push(p); }); });

/* 复刻官方 scoutRecommend（主排 0.12 / 补强 0.2） */
function scout(budget) {
  var list = [];
  function spent() { return list.reduce(function (s, u) { return s + ALL.filter(function (p) { return p.__uid === u; })[0].val; }, 0); }
  function cnt() { var n = { GK: 0, DF: 0, MF: 0, FW: 0 }; list.forEach(function (u) { n[D.posClass(ALL.filter(function (p) { return p.__uid === u; })[0].pos)]++; }); return n; }
  function clubAvail(cid) { return D.findClub(cid).players.filter(function (p) { return list.indexOf(p.__uid) < 0; }); }
  var targets = { GK: 2, DF: 5, MF: 4, FW: 2 }, have = cnt(), pool = [];
  ALL.forEach(function (p) { if (list.indexOf(p.__uid) < 0) pool.push({ p: p, cls: D.posClass(p.pos) }); });
  function trySign(p) {
    if (spent() + p.val > budget) return false;
    if (clubAvail(p.__uid.split('-')[0]).length - 1 < 13) return false;
    list.push(p.__uid); return true;
  }
  ['GK', 'DF', 'MF', 'FW'].forEach(function (cls) {
    var need = targets[cls] - have[cls];
    if (need <= 0) return;
    var cands = pool.filter(function (x) { return x.cls === cls; })
      .sort(function (a, b) { return (T.overallOf(b.p) - b.p.val * 0.12) - (T.overallOf(a.p) - a.p.val * 0.12); });
    for (var i = 0; i < cands.length && need > 0; i++) {
      var rem = targets.GK - have.GK + targets.DF - have.DF + targets.MF - have.MF + targets.FW - have.FW - 1;
      if (spent() + cands[i].p.val > budget - rem * 15) continue;
      if (trySign(cands[i].p)) { need--; have[cls]++; }
    }
  });
  var total = list.length;
  var rest = pool.filter(function (x) { return list.indexOf(x.p.__uid) < 0 && have[x.cls] < (x.cls === 'GK' ? 2 : 6); })
    .sort(function (a, b) { return (T.overallOf(b.p) - b.p.val * 0.2) - (T.overallOf(a.p) - a.p.val * 0.2); });
  for (var i = 0; i < rest.length && total < 18; i++) { if (trySign(rest[i].p)) { total++; have[rest[i].cls]++; } }
  return list.map(function (u) { return ALL.filter(function (p) { return p.__uid === u; })[0]; });
}
function playerTeam(signed, instr) {
  var tac = T.autoPickXI('4-2-3-1', signed);
  tac.instr = instr || T.emptyTactic('4-2-3-1').instr;
  var xi = {}; tac.slots.forEach(function (s) { if (s.playerId) xi[s.playerId] = 1; });
  var bench = signed.filter(function (p) { return !xi[p.__uid]; }).sort(function (a, b) { return T.overallOf(b) - T.overallOf(a); }).slice(0, 9).map(function (p) { return p.__uid; });
  return { name: '梦想联', clubId: null, tactic: tac, squad: signed, benchUids: bench, ai: false };
}
function clubTeam(clubId, signed) {
  var c = D.findClub(clubId);
  var t = T.autoPickXI(c.style.formation, c.players);
  t.instr = T.tacticFromStyle(c.style).instr;
  var fw = c.players.filter(function (p) { return D.posClass(p.pos) === 'FW'; }).length;
  if (fw < 2) { t.instr.mentality = Math.max(0, t.instr.mentality - 1); t.instr.attPush = Math.max(0, t.instr.attPush - 1); t.instr.line = Math.max(0, t.instr.line - 1); }
  return { name: c.name, clubId: c.id, tactic: t, squad: c.players, benchUids: null, ai: true };
}
function run(cfg, seed) { var m = E.createMatch({ home: cfg.home, away: cfg.away, seed: seed }); while (!m.finished) E.stepMinute(m); return m; }

/* ===== [H] 硬线 ===== */
console.log('==== [H] 硬线：三档球探 vs 豪门（主场, 默认战术, 各100场） ====');
var xis = {};
[450, 600, 800].forEach(function (b) {
  var signed = scout(b);
  var tac = T.autoPickXI('4-2-3-1', signed);
  var ovrs = tac.slots.map(function (sl) { var p = signed.filter(function (x) { return x.__uid === sl.playerId; })[0]; return p ? T.overallOf(p) : 0; });
  xis[b] = (ovrs.reduce(function (a, x) { return a + x; }, 0) / 11);
  ['MCI', 'LIV'].forEach(function (opp) {
    var w = 0, d = 0, gf = 0, ga = 0, n = 100;
    for (var i = 0; i < n; i++) {
      var m = run({ home: playerTeam(signed), away: clubTeam(opp, signed) }, 9000000 + b * 977 + i * 41 + opp.charCodeAt(1));
      if (m.score[0] > m.score[1]) w++; else if (m.score[0] === m.score[1]) d++;
      gf += m.score[0]; ga += m.score[1];
    }
    console.log('  €' + b + 'M vs ' + opp + ': 胜 ' + w + '% 平 ' + d + '% 负 ' + (100 - w - d) + '%  进失 ' + (gf / n).toFixed(2) + '-' + (ga / n).toFixed(2));
  });
});
console.log('  三档 XI 均值: 450=' + xis[450].toFixed(1) + '  600=' + xis[600].toFixed(1) + '  800=' + xis[800].toFixed(1) + (xis[450] < xis[600] && xis[600] <= xis[800] + 0.01 ? ' （拉开✅）' : ' （仍平行❌）'));

/* ===== [R] tick 续打确定性 ===== */
function makeMatch(seed, signed) {
  var c = D.findClub('MCI');
  var ot = T.autoPickXI(c.style.formation, c.players);
  ot.instr = T.tacticFromStyle(c.style).instr;
  return E.createMatch({ home: playerTeam(signed), away: { name: '曼城', clubId: 'MCI', tactic: ot, squad: c.players, ai: true }, seed: seed });
}
function sig(m) {
  return JSON.stringify({ score: m.score, minute: m.minute, half: m.half, stats: m.stats, poss: m.poss,
    rat: m.teams.map(function (t) { return Math.round(t.rt.reduce(function (s, r) { return s + r.rating; }, 0) * 10); }),
    ev: m.events.map(function (e) { return e.min + '|' + e.type + '|' + e.text; }) });
}
function replayTo(seed, tickN, actionLog, signed) { /* 复刻 app.js R3 版 */
  var st = makeMatch(seed, signed);
  var acts = (actionLog || []).slice().sort(function (a, b) { return (a.tick || 0) - (b.tick || 0); });
  var ai = 0;
  for (var t = 1; t <= tickN && !st.finished; t++) {
    E.stepMinute(st);
    while (ai < acts.length && (acts[ai].tick || 0) <= t) {
      var act = acts[ai++];
      if (act.type === 'sub') E.substitute(st, 0, act.out, act.inn);
      else if (act.type === 'patch') E.patchTactic(st, 0, act.patch);
    }
  }
  return st;
}
var S3 = scout(600);
var SEED = 424242;
/* 场景1: 18'换人 + 25'改攻压 + 50'暂停刷新 → 续打到完 */
var log1 = [], live1 = makeMatch(SEED, S3), tc = 0, d18 = false, d25 = false, d50 = false, savedTick = 0, savedState = null;
while (!live1.finished) {
  tc++; E.stepMinute(live1);
  if (!d18 && live1.minute === 18 && live1.half === 1) {
    var o = live1.teams[0].rt.filter(function (r) { return r.on && r.slot.zone === 'MF'; })[0];
    var i2 = live1.teams[0].rt.filter(function (r) { return !r.on && !r.used; })[0];
    if (o && i2) { E.substitute(live1, 0, o.uid, i2.uid); log1.push({ tick: tc, type: 'sub', out: o.uid, inn: i2.uid }); }
    d18 = true;
  }
  if (!d25 && live1.minute === 25) { E.patchTactic(live1, 0, { attPush: 5 }); log1.push({ tick: tc, type: 'patch', patch: { attPush: 5 } }); d25 = true; }
  if (!d50 && live1.minute === 50 && live1.half === 2) { savedTick = tc; savedState = sig(live1); d50 = true; }
}
var rep1 = replayTo(SEED, savedTick, log1, S3);
var repFull = replayTo(SEED, live1.__tc || 999, log1, S3);
/* 完整重放：重算 tick 总数 */
var totalTicks = 0; (function () { var m2 = makeMatch(SEED, S3); while (!m2.finished) { totalTicks++; E.stepMinute(m2); } })();
var repFinal = replayTo(SEED, totalTicks, log1, S3);
console.log('==== [R] tick 续打 ====');
console.log('  50\'存档续打(到50\'): ' + (sig(live1) === replayTo(SEED, totalTicks, log1, S3) || savedState === JSON.parse(JSON.stringify(sig(rep1))) ? '' : '') + (savedState === sig(rep1) ? '✅ 中断点状态一致' : '❌ 中断点不一致'));
console.log('  全程重放(含18\'换人/25\'攻压): ' + (sig(live1) === sig(repFinal) ? '✅ 最终状态一致' : '❌ 最终状态不一致'));
/* 场景2: HT 换人 */
var log2 = [], live2 = makeMatch(SEED, S3), htDone = false, tc2 = 0;
while (!live2.finished) {
  tc2++; var ph = live2.half; E.stepMinute(live2);
  if (ph === 1 && live2.half === 2 && !htDone) {
    var o3 = live2.teams[0].rt.filter(function (r) { return r.on && r.slot.zone === 'MF'; })[0];
    var i3 = live2.teams[0].rt.filter(function (r) { return !r.on && !r.used; })[0];
    if (o3 && i3) { E.substitute(live2, 0, o3.uid, i3.uid); log2.push({ tick: tc2, type: 'sub', out: o3.uid, inn: i3.uid }); }
    htDone = true;
  }
}
var rep2 = replayTo(SEED, tc2, log2, S3);
console.log('  HT换人后全程重放: ' + (sig(live2) === sig(rep2) ? '✅ 完全一致（R2 的漂移已修）' : '❌ 仍漂移'));

/* ===== [X] 双轴效应 ===== */
function gdWith(attPush, defBlock, oppId, n) {
  var gf = 0, ga = 0;
  var signed = scout(600);
  for (var i = 0; i < n; i++) {
    var t = T.autoPickXI('4-2-3-1', signed);
    t.instr = T.emptyTactic('4-2-3-1').instr;
    t.instr.attPush = attPush; t.instr.defBlock = defBlock;
    var m = E.createMatch({ home: playerTeam(signed, t.instr), away: clubTeam(oppId, signed), seed: 7000000 + i * 13 + attPush * 5 + defBlock });
    while (!m.finished) E.stepMinute(m);
    gf += m.score[0]; ga += m.score[1];
  }
  return (gf / n).toFixed(2) + '-' + (ga / n).toFixed(2);
}
console.log('==== [X] 双轴效应 vs LIV（各60场, 进-失） ====');
console.log('  均/均: ' + gdWith(3, 3, 'LIV', 60) + '   攻6/防0: ' + gdWith(6, 0, 'LIV', 60) + '   攻0/防6: ' + gdWith(0, 6, 'LIV', 60) + '   攻6/防6(超轴): ' + gdWith(6, 6, 'LIV', 60));

/* ===== [A] 验收回归（AI vs AI 156场） ===== */
var pairs = [['ARS', 'CHE'], ['MCI', 'LIV'], ['MCI', 'NFO'], ['EVE', 'WHU'], ['NEW', 'AVL'], ['BRE', 'FUL']];
var tg = 0, reds = 0, pens = 0, penG = 0, late = 0, allG = 0, big = 0, n2 = 0;
pairs.forEach(function (pr) {
  [0, 1].forEach(function (sw) {
    var h = sw ? pr[1] : pr[0], a = sw ? pr[0] : pr[1];
    for (var i = 0; i < 13; i++, n2++) {
      var m = run({ home: clubTeam(h), away: clubTeam(a) }, 9500000 + n2 * 7);
      tg += m.score[0] + m.score[1];
      reds += m.stats[0].red + m.stats[1].red;
      big += m.stats[0].bigChances + m.stats[1].bigChances;
      m.events.forEach(function (e) {
        if (e.type === 'pen') pens++;
        if (e.type === 'goal') { allG++; if (e.min >= 76) late++; if (e.shotType === 'pen') penG++; }
      });
    }
  });
});
console.log('==== [A] 验收回归 ====');
console.log('  总进球 ' + (tg / n2).toFixed(2) + '（2.6-3.0）  绝佳机会 ' + (big / 2 / n2).toFixed(2) + '/队  红牌 ' + (reds / n2).toFixed(3) + '/场');
console.log('  点球 ' + pens + ' 个转 ' + penG + ' 球（转化 ' + Math.round(penG / Math.max(1, pens) * 100) + '%，目标70-80）  76'+ "' 后进球 " + (late / Math.max(1, allG) * 100).toFixed(1) + '%（≥20）');
