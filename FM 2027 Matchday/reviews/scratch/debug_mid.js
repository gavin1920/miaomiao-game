/* 实验五：为什么控球被压到 22% 地板？拆解 compile 参数 */
var GAME = 'C:/Users/gavin/Desktop/Games/FM 2027 Matchday/game/';
require(GAME + 'js/data.js');
require(GAME + 'js/tactics.js');
require(GAME + 'js/engine.js');
var D = globalThis.GMD_DATA, T = globalThis.GMD_TACTICS, E = globalThis.GMD_ENGINE;
D.CLUBS.forEach(function (c) { c.players.forEach(function (p, i) { p.__uid = c.id + '-' + i; }); });

function baseInstr() {
  return T.tacticFromStyle({ formation: '4-2-3-1', mentality: 3, pass: 1, tempo: 1, line: 2, press: 1, pressZone: 1, attWidth: 1, defWidth: 1, focus: 'balanced', counter: 1, gegen: 0, timeWaste: 0, gkDist: 0, overlap: 1, offside: 0, tackling: 1 }).instr;
}
function mySquad() {
  var signed = [];
  ['EVE', 'WHU', 'AVL', 'BHA'].forEach(function (cid) {
    var c = D.findClub(cid);
    c.players.slice(0, 5).forEach(function (p) { signed.push(p); });
  });
  return signed.slice(0, 17);
}
var signed = mySquad();
var myT = T.autoPickXI('4-2-3-1', signed);
myT.instr = baseInstr();

['WHU', 'NFO', 'LIV'].forEach(function (oppId) {
  var club = D.findClub(oppId);
  console.log('---- ' + oppId + ' style: formation=' + club.style.formation + ' tempo=' + club.style.tempo + ' press=' + club.style.press + ' mentality=' + club.style.mentality);
  var avail = club.players.filter(function (p) { return signed.indexOf(p) < 0; });
  var ot = T.autoPickXI(club.style.formation, avail);
  ot.instr = T.tacticFromStyle(club.style).instr;
  var m = E.createMatch({
    home: { name: '我', clubId: null, tactic: myT, squad: signed, benchUids: [], ai: false },
    away: { name: club.name, clubId: oppId, tactic: ot, squad: avail, benchUids: [], ai: true },
    seed: 7
  });
  E.stepMinute(m);
  var c0 = E.compileTeam(m, 0), c1 = E.compileTeam(m, 1);
  console.log('  我 : mid=' + c0.mid.toFixed(1) + ' tempoF=' + c0.tempoF + ' → 战力 ' + (c0.mid * c0.tempoF).toFixed(1) + '  def=' + c0.def.toFixed(1) + ' att=' + c0.att.toFixed(1));
  console.log('  对手: mid=' + c1.mid.toFixed(1) + ' tempoF=' + c1.tempoF + ' → 战力 ' + (c1.mid * c1.tempoF).toFixed(1) + '  def=' + c1.def.toFixed(1) + ' att=' + c1.att.toFixed(1));
  console.log('  pA(我控球概率)=' + (0.5 + (c0.mid * c0.tempoF - c1.mid * c1.tempoF) * 0.008 + 2.2 * 0.004).toFixed(3));
  /* 中场人员明细 */
  function zoneStr(c) {
    return Object.keys(c.byZone).map(function (z) { return z + ':' + c.byZone[z].length; }).join(' ');
  }
  console.log('  我 byZone ' + zoneStr(c0) + ' | 对手 byZone ' + zoneStr(c1));
  console.log('  对手中场: ' + c1.midPool.map(function (r) { return r.p.name + '(' + r.p.a[2] + '/' + r.p.a[3] + '/' + r.p.a[5] + '/' + r.p.a[4] + ')'; }).join(' '));
  console.log('  我中场: ' + c0.midPool.map(function (r) { return r.p.name + '(' + r.p.a[2] + '/' + r.p.a[3] + '/' + r.p.a[5] + '/' + r.p.a[4] + ')'; }).join(' '));
});
