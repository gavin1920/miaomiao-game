/* R2 复审实验2：刷新续打的确定性重放 + patchTactic({}) 惰性 + 节奏数据 */
var GAME = 'C:/Users/gavin/Desktop/Games/FM 2027 Matchday/game/';
require(GAME + 'js/data.js');
require(GAME + 'js/tactics.js');
require(GAME + 'js/engine.js');
var D = globalThis.GMD_DATA, T = globalThis.GMD_TACTICS, E = globalThis.GMD_ENGINE;
D.CLUBS.forEach(function (c) { c.players.forEach(function (p, i) { p.__uid = c.id + '-' + i; }); });

var signed = [];
['EVE', 'WHU', 'AVL', 'BHA', 'NFO', 'CPA', 'FUL', 'BRE'].forEach(function (cid) {
  D.findClub(cid).players.forEach(function (p) { signed.push(p); });
});
signed.sort(function (a, b) { return T.overallOf(b) - T.overallOf(a); });
var need = { GK: 2, DF: 6, MF: 5, FW: 4 }, picked = [], spentV = 0;
signed.forEach(function (p) {
  var k = D.posClass(p.pos);
  if (need[k] > 0 && spentV + p.val <= 600) { picked.push(p); spentV += p.val; need[k]--; }
});
var tac = T.autoPickXI('4-2-3-1', picked);
tac.instr = T.emptyTactic('4-2-3-1').instr;
var benchUids = (function () {
  var xi = {}; tac.slots.forEach(function (s) { if (s.playerId) xi[s.playerId] = 1; });
  return picked.filter(function (p) { return !xi[p.__uid]; }).sort(function (a, b) { return T.overallOf(b) - T.overallOf(a); }).slice(0, 9).map(function (p) { return p.__uid; });
})();
function makeMatch(seed) {
  var c = D.findClub('MCI');
  var ot = T.autoPickXI(c.style.formation, c.players);
  ot.instr = T.tacticFromStyle(c.style).instr;
  return E.createMatch({
    home: { name: '梦想联', tactic: tac, squad: picked, benchUids: benchUids, ai: false },
    away: { name: '曼城', clubId: 'MCI', tactic: ot, squad: c.players, ai: true },
    seed: seed
  });
}
function sig(m) {
  return JSON.stringify({
    score: m.score,
    minute: m.minute, half: m.half,
    stats: m.stats,
    poss: m.poss,
    rat: m.teams.map(function (t) { return Math.round(t.rt.reduce(function (s, r) { return s + r.rating; }, 0) * 100); }),
    ev: m.events.map(function (e) { return e.min + '|' + e.type + '|' + e.text; })
  });
}

/* ===== 场景A：无 HT 换人的确定性（sub@18 + patch@25） ===== */
var SEED = 88888;
var logA = [];
var live = makeMatch(SEED);
var done18 = false, done25 = false, seenHT = false;
while (!live.finished) {
  var prevHalf = live.half;
  E.stepMinute(live);
  if (!done18 && live.minute === 18) {
    var outP = live.teams[0].rt.filter(function (r) { return r.on && r.slot.zone === 'MF'; })[0];
    var inP = live.teams[0].rt.filter(function (r) { return !r.on && !r.used; })[0];
    if (outP && inP) { E.substitute(live, 0, outP.uid, inP.uid); logA.push({ min: 18, type: 'sub', out: outP.uid, inn: inP.uid }); }
    done18 = true;
  }
  if (!done25 && live.minute === 25) {
    E.patchTactic(live, 0, { mentality: 4 });
    logA.push({ min: 25, type: 'patch', patch: { mentality: 4 } });
    done25 = true;
  }
  if (prevHalf === 1 && live.half === 2) seenHT = true;
}
/* 复刻 app.replayTo */
function replayTo(seed, minute, actionLog) {
  var st = makeMatch(seed);
  var acts = (actionLog || []).slice().sort(function (a, b) { return a.min - b.min; });
  var ai = 0;
  for (var m = 0; m < minute && !st.finished; m++) {
    E.stepMinute(st);
    while (ai < acts.length && acts[ai].min <= st.minute) {
      var act = acts[ai++];
      if (act.type === 'sub') E.substitute(st, 0, act.out, act.inn);
      else if (act.type === 'patch') E.patchTactic(st, 0, act.patch);
    }
  }
  return st;
}
var repA = replayTo(SEED, live.minute, logA);
console.log('[A] 无HT换人重放: ' + (sig(live) === sig(repA) ? '✅ 完全一致' : '❌ 不一致!'));

/* ===== 场景B：HT 换人后的重放（app 会把 HT 动作记成 min=45） ===== */
var logB = [];
var liveB = makeMatch(SEED);
var htDone = false;
var htMin = -1, stop1 = -1;
while (!liveB.finished) {
  var ph = liveB.half;
  E.stepMinute(liveB);
  if (ph === 1 && liveB.half === 2 && !htDone) {
    htMin = liveB.minute; /* 应为 45（引擎回拨） */
    var o2 = liveB.teams[0].rt.filter(function (r) { return r.on && r.slot.zone === 'MF'; })[0];
    var i2 = liveB.teams[0].rt.filter(function (r) { return !r.on && !r.used; })[0];
    if (o2 && i2) { E.substitute(liveB, 0, o2.uid, i2.uid); logB.push({ min: liveB.minute, type: 'sub', out: o2.uid, inn: i2.uid }); }
    htDone = true;
  }
}
var repB = replayTo(SEED, liveB.minute, logB);
console.log('[B] HT换人重放: HT时引擎分钟=' + htMin + ' 上半场补时=' + liveB.stoppage1 + ' → ' + (sig(liveB) === sig(repB) ? '✅ 完全一致' : '❌ 不一致（刷新后续打比分/事件漂移）'));
if (sig(liveB) !== sig(repB)) {
  console.log('    live: ' + liveB.score.join('-') + ' @' + liveB.minute + "'  rep: " + repB.score.join('-') + ' @' + repB.minute + "'");
  var ea = liveB.events.filter(function (e) { return e.type === 'goal'; }).map(function (e) { return e.min + "'" + e.text.slice(0, 18); });
  var eb = repB.events.filter(function (e) { return e.type === 'goal'; }).map(function (e) { return e.min + "'" + e.text.slice(0, 18); });
  console.log('    live进球: ' + ea.join(' / '));
  console.log('    rep 进球: ' + eb.join(' / '));
}

/* ===== 场景C：min=45 的歧义（在 HT 存档，replayTo(45) 会回到哪） ===== */
var probe = replayTo(SEED, 45, []);
console.log('[C] 存档 minute=45 时 replayTo(45) 到达: half=' + probe.half + ' minute=' + probe.minute + '（1=上半场未打补时 → 续打会重放45+X并再次弹HT）');

/* ===== 场景D：patchTactic({}) 惰性（共识 A12） ===== */
var p1 = makeMatch(SEED), p2 = makeMatch(SEED);
while (!p1.finished) E.stepMinute(p1);
while (!p2.finished) { E.stepMinute(p2); E.patchTactic(p2, 0, {}); E.patchTactic(p2, 1, {}); if (Math.random) { /* noop */ } }
console.log('[D] 空 patch 200+次/场: ' + (sig(p1) === sig(p2) ? '✅ 不影响比分（RNG 分离）' : '❌ 比分被 UI 调用污染'));

/* ===== 场景E：substitute 推帧是否污染仿真 ===== */
var q1 = makeMatch(SEED), q2 = makeMatch(SEED);
var logE = [];
while (!q1.finished) {
  E.stepMinute(q1);
  if (q1.minute === 60 && !logE.length) {
    var o3 = q1.teams[0].rt.filter(function (r) { return r.on && r.slot.zone === 'MF'; })[0];
    var i3 = q1.teams[0].rt.filter(function (r) { return !r.on && !r.used; })[0];
    if (o3 && i3) { E.substitute(q1, 0, o3.uid, i3.uid); logE.push({ min: 60, type: 'sub', out: o3.uid, inn: i3.uid }); }
  }
}
var q2r = replayTo(SEED, q1.minute, logE);
console.log('[E] substitute 推帧走 viewRng: ' + (sig(q1) === sig(q2r) ? '✅ 换人可重放' : '❌ 换人不可重放'));

/* ===== [T] 节奏/时长数据 ===== */
var mins = [], notables = 0, matches = 80, stopp = [];
for (var i = 0; i < matches; i++) {
  var m = makeMatch(8000000 + i * 17);
  var NB = { goal: 1, save: 1, miss: 1, pen: 1, red: 1, yellow: 1, sub: 1 };
  while (!m.finished) {
    var before = m.events.length;
    E.stepMinute(m);
    for (var kk = before; kk < m.events.length; kk++) if (NB[m.events[kk].type]) notables++;
  }
  mins.push(m.minute); stopp.push(m.stoppage);
}
var avg = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
console.log('[T] 场均 ' + avg(mins).toFixed(1) + ' 分钟（含上下半场补时），2×=' + (avg(mins) * 0.75) + 's 极速=' + (avg(mins) * 0.125) + 's');
console.log('    值得看事件 ' + (notables / matches).toFixed(1) + ' 条/场；智能节奏开启时被放慢的 tick ≈ ' + (notables * 2) + ' 个（每个1.5s）');
console.log('    极速+智能节奏 实际耗时 ≈ ' + ((avg(mins) - notables * 2) * 0.125 + notables * 2 * 1.5).toFixed(0) + 's vs 极速无智能 ' + (avg(mins) * 0.125).toFixed(0) + 's');
