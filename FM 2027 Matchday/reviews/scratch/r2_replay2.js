/* R2 复审实验3：定位 B7 重放偏差根因——state.minute 与 stepMinute 调用数的错位 */
var GAME = 'C:/Users/gavin/Desktop/Games/FM 2027 Matchday/game/';
require(GAME + 'js/data.js');
require(GAME + 'js/tactics.js');
require(GAME + 'js/engine.js');
var D = globalThis.GMD_DATA, T = globalThis.GMD_TACTICS, E = globalThis.GMD_ENGINE;
D.CLUBS.forEach(function (c) { c.players.forEach(function (p, i) { p.__uid = c.id + '-' + i; }); });

var picked = [];
(function () {
  var pool = [];
  ['EVE', 'WHU', 'AVL', 'BHA', 'NFO', 'CPA', 'FUL', 'BRE'].forEach(function (cid) { D.findClub(cid).players.forEach(function (p) { pool.push(p); }); });
  pool.sort(function (a, b) { return T.overallOf(b) - T.overallOf(a); });
  var need = { GK: 2, DF: 6, MF: 5, FW: 4 }, sp = 0;
  pool.forEach(function (p) { var k = D.posClass(p.pos); if (need[k] > 0 && sp + p.val <= 600) { picked.push(p); sp += p.val; need[k]--; } });
})();
var tac = T.autoPickXI('4-2-3-1', picked);
tac.instr = T.emptyTactic('4-2-3-1').instr;
var benchUids = (function () { var xi = {}; tac.slots.forEach(function (s) { if (s.playerId) xi[s.playerId] = 1; }); return picked.filter(function (p) { return !xi[p.__uid]; }).sort(function (a, b) { return T.overallOf(b) - T.overallOf(a); }).slice(0, 9).map(function (p) { return p.__uid; }); })();
function makeMatch(seed) {
  var c = D.findClub('MCI');
  var ot = T.autoPickXI(c.style.formation, c.players);
  ot.instr = T.tacticFromStyle(c.style).instr;
  return E.createMatch({ home: { name: '梦想联', tactic: tac, squad: picked, benchUids: benchUids, ai: false }, away: { name: '曼城', clubId: 'MCI', tactic: ot, squad: c.players, ai: true }, seed: seed });
}
function sig(m) {
  return JSON.stringify({ score: m.score, calls: m.__calls, stats: m.stats, poss: m.poss, ev: m.events.map(function (e) { return e.min + '|' + e.type + '|' + e.text; }) });
}
function step(st) { st.__calls = (st.__calls || 0) + 1; E.stepMinute(st); }
/* 修正版重放：按调用数重放（保存 tickCount 而不是 state.minute） */
function replayCalls(seed, calls, actionLog) {
  var st = makeMatch(seed);
  var acts = (actionLog || []).slice().sort(function (a, b) { return a.tick - b.tick; });
  var ai = 0;
  for (var m = 0; m < calls && !st.finished; m++) {
    step(st);
    while (ai < acts.length && acts[ai].tick <= st.__calls) {
      var act = acts[ai++];
      if (act.type === 'sub') E.substitute(st, 0, act.out, act.inn);
      else if (act.type === 'patch') E.patchTactic(st, 0, act.patch);
    }
  }
  return st;
}

var SEED = 88888;
/* 场景1：中途换人+改战术（第二半场 60'） */
var log1 = [], live1 = makeMatch(SEED), done60 = false;
while (!live1.finished) {
  step(live1);
  if (!done60 && live1.minute === 60 && live1.half === 2) {
    var o = live1.teams[0].rt.filter(function (r) { return r.on && r.slot.zone === 'MF'; })[0];
    var i = live1.teams[0].rt.filter(function (r) { return !r.on && !r.used; })[0];
    if (o && i) { E.substitute(live1, 0, o.uid, i.uid); log1.push({ tick: live1.__calls, min: 60, type: 'sub', out: o.uid, inn: i.uid }); }
    E.patchTactic(live1, 0, { mentality: 5 });
    log1.push({ tick: live1.__calls, min: 60, type: 'patch', patch: { mentality: 5 } });
    done60 = true;
  }
}
var rep1 = replayCalls(SEED, live1.__calls, log1);
console.log('[1] 60\'换人+改心态, 按调用数重放: ' + (sig(live1) === sig(rep1) ? '✅ 完全一致（时间线本身是确定的）' : '❌ 仍不一致'));

/* 场景2：HT 换人（tick 记账） */
var log2 = [], live2 = makeMatch(SEED), htDone = false;
while (!live2.finished) {
  var ph = live2.half;
  step(live2);
  if (ph === 1 && live2.half === 2 && !htDone) {
    var o2 = live2.teams[0].rt.filter(function (r) { return r.on && r.slot.zone === 'MF'; })[0];
    var i2 = live2.teams[0].rt.filter(function (r) { return !r.on && !r.used; })[0];
    if (o2 && i2) { E.substitute(live2, 0, o2.uid, i2.uid); log2.push({ tick: live2.__calls, min: live2.minute, type: 'sub', out: o2.uid, inn: i2.uid }); }
    htDone = true;
  }
}
var rep2 = replayCalls(SEED, live2.__calls, log2);
console.log('[2] HT换人, 按调用数重放: ' + (sig(live2) === sig(rep2) ? '✅ 完全一致（HT换人也能精确续打）' : '❌ 仍不一致'));

/* 场景3：用 app 现状（存 state.minute=45 在HT）会回到哪 */
var svMinute = 45; /* HT 时 state.minute */
var probe = makeMatch(SEED);
for (var m = 0; m < svMinute; m++) step(probe);
console.log('[3] app现状 replayTo(45) 在HT存档时到达: half=' + probe.half + ' minute=' + probe.minute + ' → ' + (probe.half === 1 ? '❌ 回到上半场45\'（未打补时），续打会重放45+X并再次弹半场弹窗' : 'ok'));
