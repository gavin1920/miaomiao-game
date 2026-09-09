/* 实验六（v3）：正确 uid + 合理阵容（2GK/6DF/5MF/4FW 性价比引援），重跑所有关键指标 */
var GAME = 'C:/Users/gavin/Desktop/Games/FM 2027 Matchday/game/';
require(GAME + 'js/data.js');
require(GAME + 'js/tactics.js');
require(GAME + 'js/engine.js');
var D = globalThis.GMD_DATA, T = globalThis.GMD_TACTICS, E = globalThis.GMD_ENGINE;
D.CLUBS.forEach(function (c) { c.players.forEach(function (p, i) { p.__uid = c.id + '-' + i; }); });
console.log('俱乐部 id: ' + D.CLUBS.map(function (c) { return c.id; }).join(','));

function baseInstr() {
  return T.tacticFromStyle({ formation: '4-2-3-1', mentality: 3, pass: 1, tempo: 1, line: 2, press: 1, pressZone: 1, attWidth: 1, defWidth: 1, focus: 'balanced', counter: 1, gegen: 0, timeWaste: 0, gkDist: 0, overlap: 1, offside: 0, tackling: 1 }).instr;
}
/* 性价比引援：中游队里按 overall 挑，满足 2GK/6DF/5MF/4FW、预算 600M */
function buildSigned() {
  var pool = [];
  ['EVE', 'WHU', 'AVL', 'BHA', 'NFO', 'CPA', 'FUL', 'BRE'].forEach(function (cid) {
    D.findClub(cid).players.forEach(function (p) { pool.push(p); });
  });
  pool.sort(function (a, b) { return T.overallOf(b) - T.overallOf(a); });
  var need = { GK: 2, DF: 6, MF: 5, FW: 4 }, signed = [], spent = 0;
  pool.forEach(function (p) {
    var k = D.posClass(p.pos);
    if (need[k] > 0 && spent + p.val <= 600) { signed.push(p); spent += p.val; need[k]--; }
  });
  return signed;
}
var SIGNED = buildSigned();
function buildTeams(opponentId, instr, formation) {
  var myTactic = T.autoPickXI(formation || '4-2-3-1', SIGNED);
  myTactic.instr = instr || baseInstr();
  var oppClub = D.findClub(opponentId);
  var avail = oppClub.players.filter(function (p) { return SIGNED.indexOf(p) < 0; });
  var otac = T.autoPickXI(oppClub.style.formation, avail);
  otac.instr = T.tacticFromStyle(oppClub.style).instr;
  return {
    home: { name: '梦想联', clubId: null, tactic: myTactic, squad: SIGNED, benchUids: [], ai: false },
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
var spent = SIGNED.reduce(function (s, p) { return s + p.val; }, 0);
console.log('[0] 我的阵容 ' + SIGNED.length + ' 人 花费 €' + spent + 'M');
var myT = T.autoPickXI('4-2-3-1', SIGNED);
var ovrs = myT.slots.map(function (sl) { var p = SIGNED.filter(function (x) { return x.__uid === sl.playerId; })[0]; return sl.code + ':' + (p ? p.name + '(' + T.overallOf(p) + ')' : '空'); });
console.log('    首发: ' + ovrs.join(' '));

/* 1. 胜率 vs 各档对手（默认均衡战术、主场） */
['WHU', 'EVE', 'NFO', 'MCI', 'LIV'].forEach(function (opp) {
  var w = 0, d = 0, gf = 0, ga = 0, poss = 0, n = 80;
  for (var i = 0; i < n; i++) {
    var m = run(buildTeams(opp), 100000 + i * 37);
    if (m.score[0] > m.score[1]) w++; else if (m.score[0] === m.score[1]) d++;
    gf += m.score[0]; ga += m.score[1];
    poss += m.poss[0] / (m.poss[0] + m.poss[1]);
  }
  console.log('[1] vs ' + opp + ': 胜 ' + Math.round(w / n * 100) + '% 平 ' + Math.round(d / n * 100) + '% 负 ' + Math.round((n - w - d) / n * 100) + '%  进失 ' + (gf / n).toFixed(2) + '-' + (ga / n).toFixed(2) + '  控球 ' + Math.round(poss / n * 100) + '%');
});

/* 2. AI vs AI 抽样：场均总进球 */
var pairs = [['ARS', 'CHE'], ['MCI', 'LIV'], ['MCI', 'NFO'], ['EVE', 'WHU'], ['NEW', 'AVL'], ['BRE', 'FUL']];
var tg = 0, ts = 0, n2 = 0;
pairs.forEach(function (pr) {
  [0, 1].forEach(function (swap) {
    var h = swap ? pr[1] : pr[0], a = swap ? pr[0] : pr[1];
    for (var i = 0; i < 12; i++) {
      var m = run({ home: clubTeam(h), away: clubTeam(a) }, 200000 + n2 * 7);
      tg += m.score[0] + m.score[1]; ts += m.stats[0].shots + m.stats[1].shots; n2++;
    }
  });
});
console.log('[2] AI vs AI ' + n2 + ' 场: 场均总进球 ' + (tg / n2).toFixed(2) + '（基线 2.6-3.0）  总射门 ' + (ts / n2).toFixed(1) + '（基线 22-26）');

/* 3. 大巴是不是版本答案 */
function busInstr() {
  var i = baseInstr();
  i.mentality = 1; i.line = 1; i.press = 1; i.counter = 1; i.defWidth = 0; i.tempo = 0;
  return i;
}
['LIV', 'MCI'].forEach(function (opp) {
  var w = 0, d = 0, gf = 0, ga = 0, n4 = 80;
  for (var i = 0; i < n4; i++) {
    var cfg = buildTeams(opp, busInstr(), '5-4-1');
    var m = run(cfg, 400000 + i * 13);
    if (m.score[0] > m.score[1]) w++; else if (m.score[0] === m.score[1]) d++;
    gf += m.score[0]; ga += m.score[1];
  }
  console.log('[3] 5-4-1大巴 vs ' + opp + ': 胜 ' + Math.round(w / n4 * 100) + '% 平 ' + Math.round(d / n4 * 100) + '%  进失 ' + (gf / n4).toFixed(2) + '-' + (ga / n4).toFixed(2));
});

/* 4. 事件密度 + 干看 + 文案重复（150 场） */
var typeCounts = {}, gaps = [], quietList = [], firstGoal = [], textGlobal = {}, zeroShotGames = 0;
var NOTABLE = { goal: 1, save: 1, miss: 1, yellow: 1, red: 1, pen: 1, sub: 1 };
for (var i = 0; i < 150; i++) {
  var opp = ['LIV', 'MCI', 'EVE', 'NFO', 'WHU', 'CPA'][i % 6];
  var cfg = buildTeams(opp);
  var m = E.createMatch({ home: cfg.home, away: cfg.away, seed: 500000 + i * 41 });
  var lastN = 0, maxGap = 0, prev = 0;
  while (!m.finished) {
    prev = m.events.length;
    E.stepMinute(m);
    for (var k = prev; k < m.events.length; k++) {
      var ev = m.events[k];
      typeCounts[ev.type] = (typeCounts[ev.type] || 0) + 1;
      textGlobal[ev.text] = (textGlobal[ev.text] || 0) + 1;
      if (NOTABLE[ev.type]) { gaps.push(ev.min - lastN); if (ev.min - lastN > maxGap) maxGap = ev.min - lastN; lastN = ev.min; }
    }
  }
  if (m.minute - lastN > maxGap) maxGap = m.minute - lastN;
  quietList.push(maxGap);
  var gl = m.events.filter(function (e) { return e.type === 'goal'; });
  if (gl.length) firstGoal.push(gl[0].min);
  if (m.stats[0].shots + m.stats[1].shots === 0) zeroShotGames++;
}
console.log('[4] 每场值得看事件 ' + (gaps.length / 150).toFixed(1) + ' 条  平均间隔 ' + (gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length).toFixed(1) + ' 分钟  单场最长干看均值 ' + (quietList.reduce(function (a, b) { return a + b; }, 0) / 150).toFixed(1) + ' 分钟  最惨 ' + Math.max.apply(null, quietList) + ' 分钟');
console.log('    类型分布: ' + Object.keys(typeCounts).sort(function (a, b) { return typeCounts[b] - typeCounts[a]; }).map(function (t) { return t + ' ' + (typeCounts[t] / 150).toFixed(1); }).join(' / '));
var fg3 = firstGoal.slice().sort(function (a, b) { return a - b; });
console.log('    首球中位 ' + fg3[Math.floor(fg3.length / 2)] + "'  0-0 场次 " + (150 - firstGoal.length) + '/150  全场零射门 ' + zeroShotGames + ' 场');
var entries = Object.keys(textGlobal).map(function (k) { return [k, textGlobal[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
console.log('    高频文案 Top5: ' + entries.slice(0, 5).map(function (e) { return e[1] + '×「' + e[0].slice(0, 26) + '…」'; }).join(' | '));

/* 5. 评分分布 */
var allR = [];
for (var i = 0; i < 80; i++) {
  var opp = ['LIV', 'MCI', 'EVE', 'NFO', 'WHU', 'CPA'][i % 6];
  var m = run(buildTeams(opp), 600000 + i * 3);
  E.playerMatchStats(m, 0).forEach(function (r) { allR.push(r.rating); });
}
allR.sort(function (a, b) { return a - b; });
console.log('[5] 我队球员评分 P5=' + allR[Math.floor(allR.length * 0.05)] + ' P50=' + allR[Math.floor(allR.length * 0.5)] + ' P95=' + allR[Math.floor(allR.length * 0.95)]);
