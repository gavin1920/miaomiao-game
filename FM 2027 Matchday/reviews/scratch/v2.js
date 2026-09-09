/* 实验四（修正版）：__uid 正确分配后重跑核心指标 */
var GAME = 'C:/Users/gavin/Desktop/Games/FM 2027 Matchday/game/';
require(GAME + 'js/data.js');
require(GAME + 'js/tactics.js');
require(GAME + 'js/engine.js');
var D = globalThis.GMD_DATA, T = globalThis.GMD_TACTICS, E = globalThis.GMD_ENGINE;
/* 关键：app.js init() 里会给每个球员分配 __uid，测试必须复刻 */
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
function buildTeams(opponentId, instr) {
  var signed = mySquad();
  var myTactic = T.autoPickXI('4-2-3-1', signed);
  myTactic.instr = instr || baseInstr();
  var oppClub = D.findClub(opponentId);
  var avail = oppClub.players.filter(function (p) { return signed.indexOf(p) < 0; });
  var otac = T.autoPickXI(oppClub.style.formation, avail);
  otac.instr = T.tacticFromStyle(oppClub.style).instr;
  return {
    home: { name: '梦想联', clubId: null, tactic: myTactic, squad: signed, benchUids: [], ai: false },
    away: { name: oppClub.name, clubId: oppClub.id, tactic: otac, squad: avail, benchUids: [], ai: true }
  };
}
function clubTeam(clubId) {
  var c = D.findClub(clubId);
  var t = T.autoPickXI(c.style.formation, c.players);
  t.instr = T.tacticFromStyle(c.style).instr;
  return { name: c.name, clubId: c.id, tactic: t, squad: c.players, benchUids: [], ai: true };
}
function run(cfg, seed) {
  var m = E.createMatch({ home: cfg.home, away: cfg.away, seed: seed });
  while (!m.finished) E.stepMinute(m);
  return m;
}

/* 0. 我的 XI 强度 */
var signed = mySquad();
var myT = T.autoPickXI('4-2-3-1', signed);
var ovrs = myT.slots.map(function (sl) { var p = signed.filter(function (x) { return x.__uid === sl.playerId; })[0]; return p ? T.overallOf(p) : 0; });
console.log('[0] 我的首发 XI overall: ' + ovrs.join(',') + '  均值 ' + (ovrs.reduce(function (a, b) { return a + b; }, 0) / 11).toFixed(1));
var whuA = D.findClub('WHU').players;
var wT = T.autoPickXI(D.findClub('WHU').style.formation, whuA);
var wOvrs = wT.slots.map(function (sl) { var p = whuA.filter(function (x) { return x.__uid === sl.playerId; })[0]; return p ? T.overallOf(p) : 0; });
console.log('    WHU(全队) XI 均值 ' + (wOvrs.reduce(function (a, b) { return a + b; }, 0) / 11).toFixed(1));

/* 1. 玩家中产阵容 vs 同档/强队 胜率（默认均衡战术, 主场） */
['WHU', 'EVE', 'NFO', 'LIV'].forEach(function (opp) {
  var w = 0, d = 0, gf = 0, ga = 0, poss = 0, n = 80;
  for (var i = 0; i < n; i++) {
    var m = run(buildTeams(opp), 100000 + i * 37);
    if (m.score[0] > m.score[1]) w++; else if (m.score[0] === m.score[1]) d++;
    gf += m.score[0]; ga += m.score[1];
    poss += m.poss[0] / (m.poss[0] + m.poss[1]);
  }
  console.log('[1] 我(主) vs ' + opp + ': 胜 ' + Math.round(w / n * 100) + '% 平 ' + Math.round(d / n * 100) + '% 负 ' + Math.round((n - w - d) / n * 100) + '%  进失 ' + (gf / n).toFixed(2) + '-' + (ga / n).toFixed(2) + '  控球 ' + Math.round(poss / n * 100) + '%');
});

/* 2. AI vs AI 20 队循环抽样：场均总进球是否达到基线 2.6-3.0 */
var pairs = [['ARS', 'CHE'], ['MCI', 'LIV'], ['TOT', 'MUN'], ['NEW', 'AVL'], ['EVE', 'WHU'], ['BRE', 'FUL'], ['NFO', 'BOU'], ['CRY', 'WOL'], ['SOU', 'LEE'], ['BHA', 'SUN']];
var tg = 0, ts = 0, n2 = 0;
pairs.forEach(function (pr) {
  [0, 1].forEach(function (swap) {
    var h = swap ? pr[1] : pr[0], a = swap ? pr[0] : pr[1];
    for (var i = 0; i < 10; i++) {
      var m = run({ home: clubTeam(h), away: clubTeam(a) }, 200000 + n2 * 7);
      tg += m.score[0] + m.score[1];
      ts += m.stats[0].shots + m.stats[1].shots;
      n2++;
    }
  });
});
console.log('[2] AI vs AI 抽样 ' + n2 + ' 场: 场均总进球 ' + (tg / n2).toFixed(2) + '（基线 2.6-3.0）  总射门 ' + (ts / n2).toFixed(1) + '（基线 22-26）');

/* 3. MCI vs NFO 复测（正确 uid） */
var mciW = 0, nfoW = 0, dr = 0, n3 = 80, mciG = 0, nfoG = 0;
for (var i = 0; i < n3; i++) {
  var m = run({ home: clubTeam('MCI'), away: clubTeam('NFO') }, 300000 + i * 3);
  if (m.score[0] > m.score[1]) mciW++; else if (m.score[0] < m.score[1]) nfoW++; else dr++;
  mciG += m.score[0]; nfoG += m.score[1];
}
console.log('[3] MCI(主) vs NFO(客) ' + n3 + ' 场: MCI胜 ' + mciW + ' 平 ' + dr + ' NFO胜 ' + nfoW + '  进球 ' + (mciG / n3).toFixed(2) + '-' + (nfoG / n3).toFixed(2));

/* 4. 摆大巴是不是版本答案：我的中产队 用 5-4-1 大巴+防反 vs 强敌 */
function busInstr() {
  var i = baseInstr();
  i.mentality = 1; i.line = 1; i.press = 1; i.counter = 1; i.defWidth = 0; i.tempo = 0;
  return i;
}
['LIV', 'MCI', 'ARS'].forEach(function (opp) {
  var w = 0, d = 0, gf = 0, ga = 0, n4 = 80;
  for (var i = 0; i < n4; i++) {
    var cfg = buildTeams(opp, busInstr());
    cfg.home.tactic = globalThis.GMD_TACTICS.autoPickXI('5-4-1', cfg.home.squad);
    cfg.home.tactic.instr = busInstr();
    var m = run(cfg, 400000 + i * 13);
    if (m.score[0] > m.score[1]) w++; else if (m.score[0] === m.score[1]) d++;
    gf += m.score[0]; ga += m.score[1];
  }
  console.log('[4] 我 5-4-1 大巴 vs ' + opp + ': 胜 ' + Math.round(w / n4 * 100) + '% 平 ' + Math.round(d / n4 * 100) + '%  进失 ' + (gf / n4).toFixed(2) + '-' + (ga / n4).toFixed(2));
});

/* 5. 事件密度重测（正确阵容） */
var typeCounts = {}, gaps = [], quietList = [], goalMin = [], firstGoal = [];
for (var i = 0; i < 200; i++) {
  var opp = ['LIV', 'MCI', 'EVE', 'NFO', 'WHU'][i % 5];
  var cfg = buildTeams(opp);
  var m = E.createMatch({ home: cfg.home, away: cfg.away, seed: 500000 + i * 41 });
  var lastN = 0, maxGap = 0, prev = 0;
  var NOTABLE = { goal: 1, save: 1, miss: 1, yellow: 1, red: 1, pen: 1, sub: 1 };
  while (!m.finished) {
    prev = m.events.length;
    E.stepMinute(m);
    for (var k = prev; k < m.events.length; k++) {
      var ev = m.events[k];
      typeCounts[ev.type] = (typeCounts[ev.type] || 0) + 1;
      if (NOTABLE[ev.type]) { gaps.push(ev.min - lastN); if (ev.min - lastN > maxGap) maxGap = ev.min - lastN; lastN = ev.min; }
      if (ev.type === 'goal') { goalMin.push(ev.min); }
    }
  }
  if (m.minute - lastN > maxGap) maxGap = m.minute - lastN;
  quietList.push(maxGap);
  var gl = m.events.filter(function (e) { return e.type === 'goal'; });
  if (gl.length) firstGoal.push(gl[0].min);
}
var NOTABLEn = gaps.length;
console.log('[5] 事件统计: 每场值得看的(进/扑/失/牌/换人) ' + (NOTABLEn / 200).toFixed(1) + ' 条');
console.log('    平均间隔 ' + (gaps.reduce(function (a, b) { return a + b; }, 0) / NOTABLEn).toFixed(1) + " 分钟, 最长干看均值 " + (quietList.reduce(function (a, b) { return a + b; }, 0) / 200).toFixed(1) + " 分钟, 最惨一场 " + Math.max.apply(null, quietList) + " 分钟");
console.log('    每场事件: ' + Object.keys(typeCounts).sort(function (a, b) { return typeCounts[b] - typeCounts[a]; }).map(function (t) { return t + ' ' + (typeCounts[t] / 200).toFixed(1); }).join(' / '));
var fg2 = firstGoal.slice().sort(function (a, b) { return a - b; });
console.log('    首球中位 ' + fg2[Math.floor(fg2.length / 2)] + "'  0-0场次 " + (200 - firstGoal.length) + '/200');

/* 6. 哈兰德进球 */
var hg = 0, hn = 0;
for (var i = 0; i < 100; i++) {
  var cfg = buildTeams('MCI');
  var m = run(cfg, 600000 + i);
  E.playerMatchStats(m, 1).forEach(function (r) { if (r.name === '埃尔林·哈兰德') { hg += r.stats.goals; hn++; } });
}
console.log('[6] 哈兰德场均 ' + (hg / Math.max(1, hn)).toFixed(2) + ' 球（' + hn + ' 场）');
