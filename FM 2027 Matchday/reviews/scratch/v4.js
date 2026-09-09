/* 实验七：难度梯度真相 + 单场文案重复 + 替补席影响 */
var GAME = 'C:/Users/gavin/Desktop/Games/FM 2027 Matchday/game/';
require(GAME + 'js/data.js');
require(GAME + 'js/tactics.js');
require(GAME + 'js/engine.js');
var D = globalThis.GMD_DATA, T = globalThis.GMD_TACTICS, E = globalThis.GMD_ENGINE;
D.CLUBS.forEach(function (c) { c.players.forEach(function (p, i) { p.__uid = c.id + '-' + i; }); });

function baseInstr() {
  return T.tacticFromStyle({ formation: '4-2-3-1', mentality: 3, pass: 1, tempo: 1, line: 2, press: 1, pressZone: 1, attWidth: 1, defWidth: 1, focus: 'balanced', counter: 1, gegen: 0, timeWaste: 0, gkDist: 0, overlap: 1, offside: 0, tackling: 1 }).instr;
}
/* 按预算自动组队（模拟玩家行为：性价比优先） */
function signedFor(budget) {
  var pool = [];
  D.CLUBS.forEach(function (c) { if (['MCI', 'LIV', 'ARS', 'CHE'].indexOf(c.id) < 0) c.players.forEach(function (p) { pool.push(p); }); });
  pool.sort(function (a, b) { return (T.overallOf(b) / Math.max(1, b.val)) - (T.overallOf(a) / Math.max(1, a.val)); });
  var need = { GK: 2, DF: 6, MF: 5, FW: 4 }, signed = [], spent = 0;
  pool.forEach(function (p) {
    var k = D.posClass(p.pos);
    if (need[k] > 0 && spent + p.val <= budget) { signed.push(p); spent += p.val; need[k]--; }
  });
  return signed;
}
function benchFor(signed, tactic) {
  var xi = {}; tactic.slots.forEach(function (s) { if (s.playerId) xi[s.playerId] = 1; });
  return signed.filter(function (p) { return !xi[p.__uid]; }).sort(function (a, b) { return T.overallOf(b) - T.overallOf(a); }).slice(0, 9).map(function (p) { return p.__uid; });
}
function teamFor(budget, oppId, instr) {
  var signed = signedFor(budget);
  var tac = T.autoPickXI('4-2-3-1', signed);
  tac.instr = instr || baseInstr();
  var oppClub = D.findClub(oppId);
  var avail = oppClub.players.filter(function (p) { return signed.indexOf(p) < 0; });
  var otac = T.autoPickXI(oppClub.style.formation, avail);
  otac.instr = T.tacticFromStyle(oppClub.style).instr;
  return {
    home: { name: '我', clubId: null, tactic: tac, squad: signed, benchUids: benchFor(signed, tac), ai: false },
    away: { name: oppClub.name, clubId: oppId, tactic: otac, squad: avail, benchUids: null, ai: true }
  };
}
function run(cfg, seed) { var m = E.createMatch({ home: cfg.home, away: cfg.away, seed: seed }); while (!m.finished) E.stepMinute(m); return m; }

/* A. 预算难度梯度：€450M / €600M / €800M vs 曼城/利物浦 */
[450, 600, 800].forEach(function (b) {
  ['MCI', 'LIV'].forEach(function (opp) {
    var w = 0, d = 0, gf = 0, ga = 0, n = 60;
    for (var i = 0; i < n; i++) {
      var m = run(teamFor(b, opp), 800000 + i * 17 + b);
      if (m.score[0] > m.score[1]) w++; else if (m.score[0] === m.score[1]) d++;
      gf += m.score[0]; ga += m.score[1];
    }
    console.log('[A] €' + b + 'M vs ' + opp + ': 胜 ' + Math.round(w / n * 100) + '% 平 ' + Math.round(d / n * 100) + '% 负 ' + Math.round((n - w - d) / n * 100) + '%  进失 ' + (gf / n).toFixed(2) + '-' + (ga / n).toFixed(2));
  });
});

/* B. 单场文案重复（同句在一次比赛里出现多次） */
var repMatches = 0, worst = 0, dupTotal = 0, feedTotal = 0;
for (var i = 0; i < 60; i++) {
  var opp = ['MCI', 'LIV', 'EVE', 'NFO', 'WHU', 'CPA'][i % 6];
  var m = run(teamFor(600, opp), 900000 + i * 23);
  var cnt = {}, F = { goal: 1, save: 1, miss: 1, yellow: 1, red: 1, pen: 1, info: 1, offside: 1, foul: 1, sub: 1 };
  m.events.forEach(function (e) { if (F[e.type]) { feedTotal++; cnt[e.text] = (cnt[e.text] || 0) + 1; } });
  var dup = 0;
  Object.keys(cnt).forEach(function (k) { if (cnt[k] > 1) dup += cnt[k] - 1; });
  dupTotal += dup;
  if (dup > 0) repMatches++;
  if (dup > worst) worst = dup;
}
console.log('[B] 60 场中 ' + repMatches + ' 场出现同句重复解说，场均重复 ' + (dupTotal / 60).toFixed(1) + ' 句，最糟一场 ' + worst + ' 句（解说总条数均值 ' + (feedTotal / 60).toFixed(0) + '）');

/* C. 真实等待换算 */
var mins = [], stoppage = [];
for (var i = 0; i < 60; i++) {
  var opp = ['MCI', 'LIV', 'EVE', 'NFO', 'WHU', 'CPA'][i % 6];
  var m = run(teamFor(600, opp), 950000 + i * 29);
  mins.push(m.minute);
}
var avgMin = mins.reduce(function (a, b) { return a + b; }, 0) / mins.length;
console.log('[C] 场均 ' + avgMin.toFixed(1) + ' 分钟 → 1×=' + (avgMin * 1.5 / 60).toFixed(1) + ' 分钟  2×(默认)=' + (avgMin * 0.75) + ' 秒  4×=' + (avgMin * 0.375) + ' 秒  极速12×=' + (avgMin * 0.125) + ' 秒');

/* D. 我的球队能不能被挖空墙脚：买光曼城主力后打曼城（游戏卖点验证） */
var mci = D.findClub('MCI');
var steals = mci.players.slice().sort(function (a, b) { return b.val - a.val; }).slice(0, 6);
var budgetLeft = 800 - steals.reduce(function (s, p) { return s + p.val; }, 0);
var pool = [];
['EVE', 'WHU', 'AVL', 'BHA', 'CPA', 'FUL', 'BRE'].forEach(function (cid) { D.findClub(cid).players.forEach(function (p) { pool.push(p); }); });
pool.sort(function (a, b) { return T.overallOf(b) - T.overallOf(a); });
var need = { GK: 2 - steals.filter(function (p) { return p.pos.split(',')[0] === 'GK'; }).length, DF: 6, MF: 5, FW: 4 - steals.filter(function (p) { return p.pos.split(',')[0] === 'FW'; }).length };
var signed = steals.slice(), spent = steals.reduce(function (s, p) { return s + p.val; }, 0);
pool.forEach(function (p) {
  var k = D.posClass(p.pos);
  if (need[k] > 0 && spent + p.val <= 800) { signed.push(p); spent += p.val; need[k]--; }
});
var tac = T.autoPickXI('4-2-3-1', signed);
tac.instr = baseInstr();
var mciAvail = mci.players.filter(function (p) { return signed.indexOf(p) < 0; });
var otac = T.autoPickXI(mci.style.formation, mciAvail);
otac.instr = T.tacticFromStyle(mci.style).instr;
var w = 0, n = 60, gf = 0, ga = 0;
for (var i = 0; i < n; i++) {
  var m = E.createMatch({
    home: { name: '我', tactic: tac, squad: signed, benchUids: benchFor(signed, tac), ai: false },
    away: { name: '曼城', tactic: otac, squad: mciAvail, benchUids: null, ai: true },
    seed: 990000 + i * 7
  });
  while (!m.finished) E.stepMinute(m);
  if (m.score[0] > m.score[1]) w++;
  gf += m.score[0]; ga += m.score[1];
}
console.log('[D] 挖走曼城6大主力后(花€800M) vs 残阵曼城: 胜率 ' + Math.round(w / n * 100) + '%  进失 ' + (gf / n).toFixed(2) + '-' + (ga / n).toFixed(2));
