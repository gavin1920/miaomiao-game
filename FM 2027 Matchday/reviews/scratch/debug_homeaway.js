/* 实验三：为什么主队（玩家）胜率崩了？XI 强度对比 + 主客场偏差检验 */
var GAME = 'C:/Users/gavin/Desktop/Games/FM 2027 Matchday/game/';
require(GAME + 'js/data.js');
require(GAME + 'js/tactics.js');
require(GAME + 'js/engine.js');
var D = globalThis.GMD_DATA, T = globalThis.GMD_TACTICS, E = globalThis.GMD_ENGINE;

function mySquad() {
  var signed = [];
  ['EVE', 'WHU', 'AVL', 'BHA'].forEach(function (cid) {
    var c = D.findClub(cid);
    c.players.slice(0, 5).forEach(function (p) { signed.push(p); });
  });
  return signed.slice(0, 17);
}
function baseInstr() {
  return T.tacticFromStyle({ formation: '4-2-3-1', mentality: 3, pass: 1, tempo: 1, line: 2, press: 1, pressZone: 1, attWidth: 1, defWidth: 1, focus: 'balanced', counter: 1, gegen: 0, timeWaste: 0, gkDist: 0, overlap: 1, offside: 0, tackling: 1 }).instr;
}
function xiOvr(tactic, squad) {
  return tactic.slots.map(function (sl) {
    var p = squad.filter(function (x) { return x.__uid === sl.playerId; })[0];
    return sl.code + ':' + (p ? p.name.split('·').pop() + '(' + T.overallOf(p) + ')' : '空');
  });
}

var signed = mySquad();
var myT = T.autoPickXI('4-2-3-1', signed);
myT.instr = baseInstr();
var whu = D.findClub('WHU');
var whuAvail = whu.players.filter(function (p) { return signed.indexOf(p) < 0; });
var wT = T.autoPickXI(whu.style.formation, whuAvail);
wT.instr = T.tacticFromStyle(whu.style).instr;
console.log('我的首发: ' + xiOvr(myT, signed).join(' '));
var myOvrs = myT.slots.map(function (sl) { var p = signed.filter(function (x) { return x.__uid === sl.playerId; })[0]; return p ? T.overallOf(p) : 0; });
console.log('我 XI 平均 overall: ' + (myOvrs.reduce(function (a, b) { return a + b; }, 0) / 11).toFixed(1));
console.log('WHU首发: ' + xiOvr(wT, whuAvail).join(' '));
var wOvrs = wT.slots.map(function (sl) { var p = whuAvail.filter(function (x) { return x.__uid === sl.playerId; })[0]; return p ? T.overallOf(p) : 0; });
console.log('WHU XI 平均 overall: ' + (wOvrs.reduce(function (a, b) { return a + b; }, 0) / 11).toFixed(1));

/* 编译参数对比：一场比赛的双方 compile */
function buildHome(squad, tactic, name) { return { name: name, clubId: null, tactic: tactic, squad: squad, benchUids: [], ai: false }; }
var m = E.createMatch({ home: buildHome(signed, myT, '我'), away: { name: '西汉姆', clubId: 'WHU', tactic: wT, squad: whuAvail, benchUids: [], ai: true }, seed: 42 });
E.stepMinute(m);
var c0 = E.compileTeam(m, 0), c1 = E.compileTeam(m, 1);
console.log('compile 我: def=' + c0.def.toFixed(1) + ' mid=' + c0.mid.toFixed(1) + ' att=' + c0.att.toFixed(1) + ' pressI=' + c0.pressI.toFixed(2) + ' lineX=' + c0.lineX.toFixed(0));
console.log('compile WHU: def=' + c1.def.toFixed(1) + ' mid=' + c1.mid.toFixed(1) + ' att=' + c1.att.toFixed(1) + ' pressI=' + c1.pressI.toFixed(2) + ' lineX=' + c1.lineX.toFixed(0));

/* 主客场偏差：同一对 AI 互打，只换主客 */
function clubTeam(clubId) {
  var c = D.findClub(clubId);
  var t = T.autoPickXI(c.style.formation, c.players);
  t.instr = T.tacticFromStyle(c.style).instr;
  return { name: c.name, clubId: c.id, tactic: t, squad: c.players, benchUids: [], ai: true };
}
function series(homeId, awayId, n) {
  var hw = 0, aw = 0, d = 0, hg = 0, ag = 0, hp = 0;
  for (var i = 0; i < n; i++) {
    var mm = E.createMatch({ home: clubTeam(homeId), away: clubTeam(awayId), seed: 70000 + i * 11 });
    while (!mm.finished) E.stepMinute(mm);
    hg += mm.score[0]; ag += mm.score[1];
    hp += mm.poss[0] / (mm.poss[0] + mm.poss[1]);
    if (mm.score[0] > mm.score[1]) hw++; else if (mm.score[0] < mm.score[1]) aw++; else d++;
  }
  console.log('  ' + homeId + '(主) vs ' + awayId + '(客): 主胜 ' + hw + ' 平 ' + d + ' 客胜 ' + aw + '  进球 ' + (hg / n).toFixed(2) + '-' + (ag / n).toFixed(2) + '  主控球 ' + Math.round(hp / n * 100) + '%');
}
console.log('主客场偏差检验（AI vs AI 各 60 场）:');
series('EVE', 'WHU', 60);
series('WHU', 'EVE', 60);
series('MCI', 'NFO', 60);
series('NFO', 'MCI', 60);

/* 哈兰德调试 */
var mci = clubTeam('MCI');
var mn = E.createMatch({ home: buildHome(signed, myT, '我'), away: mci, seed: 99 });
while (!mn.finished) E.stepMinute(mn);
console.log('MCI 球员名样例: ' + E.playerMatchStats(mn, 1).slice(0, 5).map(function (r) { return r.name; }).join(' | '));
