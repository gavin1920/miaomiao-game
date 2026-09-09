/* 实验二：单场观感细节 + 战术敏感性 + 评分分布 */
var GAME = 'C:/Users/gavin/Desktop/Games/FM 2027 Matchday/game/';
require(GAME + 'js/data.js');
require(GAME + 'js/tactics.js');
require(GAME + 'js/engine.js');
var D = globalThis.GMD_DATA, T = globalThis.GMD_TACTICS, E = globalThis.GMD_ENGINE;

function buildTeams(opponentId, myInstr) {
  var signed = [];
  ['EVE', 'WHU', 'AVL', 'BHA'].forEach(function (cid) {
    var c = D.findClub(cid);
    c.players.slice(0, 5).forEach(function (p) { signed.push(p); });
  });
  signed = signed.slice(0, 17);
  var myTactic = T.autoPickXI('4-2-3-1', signed);
  myTactic.instr = myInstr || T.tacticFromStyle({ formation: '4-2-3-1', mentality: 3, pass: 1, tempo: 1, line: 2, press: 1, pressZone: 1, attWidth: 1, defWidth: 1, focus: 'balanced', counter: 1, gegen: 0, timeWaste: 0, gkDist: 0, overlap: 1, offside: 0, tackling: 1 }).instr;
  var oppClub = D.findClub(opponentId);
  var avail = oppClub.players.filter(function (p) { return signed.indexOf(p) < 0; });
  var otac = T.autoPickXI(oppClub.style.formation, avail);
  otac.instr = T.tacticFromStyle(oppClub.style).instr;
  return {
    home: { name: '梦想联', clubId: null, tactic: myTactic, squad: signed, benchUids: [], ai: false },
    away: { name: oppClub.name, clubId: oppClub.id, tactic: otac, squad: avail, benchUids: [], ai: true }
  };
}
function run(cfg, seed) {
  var m = E.createMatch({ home: cfg.home, away: cfg.away, seed: seed });
  while (!m.finished) E.stepMinute(m);
  return m;
}

/* A. 同档次对手（WHU）下控球/胜率是否正常 */
var w = 0, n = 60, poss = 0, gf = 0, ga = 0;
for (var i = 0; i < n; i++) {
  var m = run(buildTeams('WHU'), 5000 + i * 13);
  if (m.score[0] > m.score[1]) w++;
  poss += m.poss[0] / (m.poss[0] + m.poss[1]);
  gf += m.score[0]; ga += m.score[1];
}
console.log('[A] vs 西汉姆(同档): 胜率 ' + Math.round(w / n * 100) + '%  场均控球 ' + Math.round(poss / n * 100) + '%  进失球 ' + (gf / n).toFixed(2) + '/' + (ga / n).toFixed(2));

/* B. 进球时间分布 & 开场死亡时间 */
var buckets = {}, firstGoalMin = [];
for (var i = 0; i < 200; i++) {
  var opp = ['LIV', 'MCI', 'EVE', 'NFO', 'WHU'][i % 5];
  var m = run(buildTeams(opp), 9000 + i * 31);
  var goals = m.events.filter(function (e) { return e.type === 'goal'; });
  if (goals.length) firstGoalMin.push(goals[0].min);
  goals.forEach(function (g) { var b = Math.floor(g.min / 15); buckets[b] = (buckets[b] || 0) + 1; });
}
console.log('[B] 进球时段分布(每15分钟): ' + Object.keys(buckets).sort().map(function (k) { return (k * 15) + '-' + (k * 15 + 14) + '分钟:' + buckets[k] + '球'; }).join('  '));
var fg = firstGoalMin.slice().sort(function (a, b) { return a - b; });
console.log('    首球时间: 中位 ' + fg[Math.floor(fg.length / 2)] + "'  无进球场次 " + (200 - fg.length) + '/200  最晚首球 ' + fg[fg.length - 1] + "'");

/* C. 单场文案多样性：一场比赛里 解说feed 有多少条是重复的 */
var repMatches = 0, worstDup = 0;
for (var i = 0; i < 50; i++) {
  var opp = ['LIV', 'MCI', 'EVE', 'NFO', 'WHU'][i % 5];
  var m = run(buildTeams(opp), 20000 + i * 7);
  var cnt = {}, feedTypes = { goal: 1, save: 1, miss: 1, yellow: 1, red: 1, pen: 1, info: 1, offside: 1, foul: 1, sub: 1 };
  var dupThis = 0, total = 0;
  m.events.forEach(function (e) {
    if (!feedTypes[e.type]) return;
    total++; cnt[e.text] = (cnt[e.text] || 0) + 1;
  });
  Object.keys(cnt).forEach(function (k) { if (cnt[k] > 1) dupThis += cnt[k] - 1; });
  if (dupThis > 0) repMatches++;
  if (dupThis > worstDup) worstDup = dupThis;
}
console.log('[C] 单场重复文案: 50 场中 ' + repMatches + ' 场出现同句重复，最糟一场重复 ' + worstDup + ' 句');

/* D. 战术敏感性玩家实测：同一阵容 vs 利物浦，4 种极端战术各 60 场 */
function batchInstr(instr, oppId, tag) {
  var g = 0, ga = 0, wcnt = 0, nn = 60;
  for (var i = 0; i < nn; i++) {
    var cfg = buildTeams(oppId, Object.assign({}, baseInstr(), instr));
    var m = run(cfg, 30000 + i * 17 + tag.length * 101);
    g += m.score[0]; ga += m.score[1];
    if (m.score[0] > m.score[1]) wcnt++;
  }
  console.log('    ' + tag + ': 场均进 ' + (g / nn).toFixed(2) + ' 失 ' + (ga / nn).toFixed(2) + ' 胜率 ' + Math.round(wcnt / nn * 100) + '%');
}
function baseInstr() {
  return T.tacticFromStyle({ formation: '4-2-3-1', mentality: 3, pass: 1, tempo: 1, line: 2, press: 1, pressZone: 1, attWidth: 1, defWidth: 1, focus: 'balanced', counter: 1, gegen: 0, timeWaste: 0, gkDist: 0, overlap: 1, offside: 0, tackling: 1 }).instr;
}
console.log('[D] 战术敏感性 vs 利物浦（同阵容只换指令）:');
batchInstr({ mentality: 0, line: 0, press: 0 }, 'LIV', '全场摆大巴(心态0/防线低/松抢)');
batchInstr({ mentality: 3, line: 2, press: 1 }, 'LIV', '均衡默认        ');
batchInstr({ mentality: 6, line: 4, press: 3, pressZone: 2, gegen: 1 }, 'LIV', '疯抢高压(心态6/极高线/疯抢)');
batchInstr({ mentality: 1, line: 1, counter: 1 }, 'LIV', '低位防反        ');

/* E. 评分分布：球员评分会不会全挤在 6.5 */
var allR = [], motm = [];
for (var i = 0; i < 100; i++) {
  var opp = ['LIV', 'MCI', 'EVE', 'NFO', 'WHU'][i % 5];
  var m = run(buildTeams(opp), 40000 + i * 3);
  E.playerMatchStats(m, 0).forEach(function (r) { allR.push(r.rating); });
  var rows = [E.playerMatchStats(m, 0), E.playerMatchStats(m, 1)];
  motm.push(Math.max(rows[0][0] ? Math.max.apply(null, rows[0].map(function (r) { return r.rating; })) : 0, Math.max.apply(null, rows[1].map(function (r) { return r.rating; }))));
}
allR.sort(function (a, b) { return a - b; });
function pct(p) { return allR[Math.floor(allR.length * p)]; }
console.log('[E] 我队球员评分: P5=' + pct(0.05) + ' P25=' + pct(0.25) + ' 中位=' + pct(0.5) + ' P75=' + pct(0.75) + ' P95=' + pct(0.95) + '  MOTM 均值 ' + (motm.reduce(function (a, b) { return a + b; }, 0) / motm.length).toFixed(2) + ' 最高 ' + Math.max.apply(null, motm));

/* F. 射手集中度：哈兰德这类球星会不会一场独进 */
var haland = 0, hGames = 0;
for (var i = 0; i < 100; i++) {
  var cfg = buildTeams('MCI');
  var m = run(cfg, 50000 + i);
  var rows = E.playerMatchStats(m, 1);
  var h = rows.filter(function (r) { return r.name === '埃尔林·哈兰德'; })[0];
  if (h) { hGames++; haland += h.stats.goals; }
}
console.log('[F] 哈兰德(对手时) 场均进球 ' + (haland / hGames).toFixed(2));
