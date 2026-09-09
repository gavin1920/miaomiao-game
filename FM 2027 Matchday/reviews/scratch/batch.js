/* 阿乐的批测：200 场模拟，测事件密度 / 等待 / 文案重复 / 真实性 */
var GAME = 'C:/Users/gavin/Desktop/Games/FM 2027 Matchday/game/';
require(GAME + 'js/data.js');
require(GAME + 'js/tactics.js');
require(GAME + 'js/engine.js');
var D = globalThis.GMD_DATA, T = globalThis.GMD_TACTICS, E = globalThis.GMD_ENGINE;

/* 模拟阿乐第一局：中产玩法，从几支中游队挖 17 人，4-2-3-1 均衡开局（app.js 选中对手后的默认战术） */
function buildTeams(opponentId) {
  var signed = [];
  ['EVE', 'WHU', 'AVL', 'BHA'].forEach(function (cid) {
    var c = D.findClub(cid);
    c.players.slice(0, 5).forEach(function (p) { signed.push(p); });
  });
  signed = signed.slice(0, 17);
  var myTactic = T.autoPickXI('4-2-3-1', signed);
  myTactic.instr = T.tacticFromStyle({ formation: '4-2-3-1', mentality: 3, pass: 1, tempo: 1, line: 2, press: 1, pressZone: 1, attWidth: 1, defWidth: 1, focus: 'balanced', counter: 1, gegen: 0, timeWaste: 0, gkDist: 0, overlap: 1, offside: 0, tackling: 1 }).instr;
  var oppClub = D.findClub(opponentId);
  var avail = oppClub.players.filter(function (p) { return signed.indexOf(p) < 0; });
  var otac = T.autoPickXI(oppClub.style.formation, avail);
  otac.instr = T.tacticFromStyle(oppClub.style).instr;
  return {
    home: { name: '梦想联', clubId: null, tactic: myTactic, squad: signed, benchUids: [], ai: false },
    away: { name: oppClub.name, clubId: oppClub.id, tactic: otac, squad: avail, benchUids: [], ai: true }
  };
}

var N = 200;
var opps = ['LIV', 'MCI', 'EVE', 'NFO', 'WHU'];
var tot = { goals: 0, shots: 0, sot: 0, xg: 0, corners: 0, fouls: 0, yellow: 0, red: 0, off: 0, minutes: 0 };
var results = { h: 0, d: 0, a: 0 };
var myGoals = 0, oppGoals = 0, myShots = 0, oppShots = 0, myXg = 0, oppXg = 0, myBig = 0, oppBig = 0, myCounters = 0, oppCounters = 0;
var possArr = [];
var typeCounts = {};
var textGlobal = {};        // 文案全局重复
var notableGaps = [];       // 两条"值得看"事件之间的分钟间隔
var quietPerMatch = [];     // 每场最长干看间隔
var scoreDist = {};

var NOTABLE = { goal: 1, save: 1, miss: 1, yellow: 1, red: 1, pen: 1, sub: 1 };

for (var i = 0; i < N; i++) {
  var opp = opps[i % opps.length];
  var cfg = buildTeams(opp);
  var seed = 1000 + i * 7919;
  var m = E.createMatch({ home: cfg.home, away: cfg.away, seed: seed });
  var seenTexts = {};
  var lastNotable = 0;
  var maxGapThis = 0;
  var prevEvents = 0;
  while (!m.finished) {
    prevEvents = m.events.length;
    E.stepMinute(m);
    for (var k = prevEvents; k < m.events.length; k++) {
      var ev = m.events[k];
      typeCounts[ev.type] = (typeCounts[ev.type] || 0) + 1;
      textGlobal[ev.text] = (textGlobal[ev.text] || 0) + 1;
      if (NOTABLE[ev.type]) {
        var gap = ev.min - lastNotable;
        if (lastNotable >= 0 && ev.min > 0) notableGaps.push(gap);
        if (gap > maxGapThis && lastNotable >= 0) maxGapThis = gap;
        lastNotable = ev.min;
      }
    }
  }
  // 终场 whistle 也算事件
  var endGap = m.minute - lastNotable;
  if (endGap > maxGapThis) maxGapThis = endGap;
  quietPerMatch.push(maxGapThis);
  tot.goals += m.score[0] + m.score[1];
  myGoals += m.score[0]; oppGoals += m.score[1];
  tot.minutes += m.minute;
  var s0 = m.stats[0], s1 = m.stats[1];
  tot.shots += s0.shots + s1.shots; myShots += s0.shots; oppShots += s1.shots;
  tot.sot += s0.sot + s1.sot;
  tot.xg += s0.xg + s1.xg; myXg += s0.xg; oppXg += s1.xg;
  myBig += s0.bigChances; oppBig += s1.bigChances;
  myCounters += s0.counters; oppCounters += s1.counters;
  tot.corners += s0.corners + s1.corners;
  tot.fouls += s0.fouls + s1.fouls;
  tot.yellow += s0.yellow + s1.yellow;
  tot.red += s0.red + s1.red;
  tot.off += s0.offsides + s1.offsides;
  var p0 = (m.poss[0] + m.poss[1]) ? m.poss[0] / (m.poss[0] + m.poss[1]) : 0.5;
  possArr.push(p0);
  if (m.score[0] > m.score[1]) results.h++; else if (m.score[0] < m.score[1]) results.a++; else results.d++;
  var sk = m.score[0] + '-' + m.score[1];
  scoreDist[sk] = (scoreDist[sk] || 0) + 1;
}

function r1(v) { return Math.round(v * 10) / 10; }
console.log('==== 场均（' + N + ' 场，对手轮换 ' + opps.join('/') + '）====');
console.log('总进球 ' + r1(tot.goals / N) + '（基线 2.6-3.0）  我进 ' + r1(myGoals / N) + ' vs 对手进 ' + r1(oppGoals / N));
console.log('总射门 ' + r1(tot.shots / N) + '（基线 22-26）  我 ' + r1(myShots / N) + ' vs ' + r1(oppShots / N));
console.log('总射正 ' + r1(tot.sot / N) + '（基线 8-10）  xG总 ' + r1(tot.xg / N) + '（实际进球 ' + r1(tot.goals / N) + '）');
console.log('绝佳机会 我 ' + r1(myBig / N) + ' vs ' + r1(oppBig / N) + '   反击 我 ' + r1(myCounters / N) + ' vs ' + r1(oppCounters / N));
console.log('角球 ' + r1(tot.corners / N) + '（基线 6-14 两队合计，单队3-7）  犯规 ' + r1(tot.fouls / N) + '（基线 20-26 合计）  黄牌 ' + r1(tot.yellow / N) + '（基线 6-9 合计）  红牌 ' + r1(tot.red / N) + '  越位 ' + r1(tot.off / N));
console.log('平均分钟数 ' + r1(tot.minutes / N));
var hw = 0; possArr.forEach(function (p) { hw += p; });
console.log('我方平均控球 ' + Math.round(hw / N * 100) + '%');
console.log('战绩 我胜 ' + results.h + ' / 平 ' + results.d + ' / 负 ' + results.a);
var topScores = Object.keys(scoreDist).map(function (k) { return [k, scoreDist[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
console.log('高频比分: ' + topScores.map(function (x) { return x[0] + '×' + x[1]; }).join('  '));

console.log('\n==== 事件密度（干看度）====');
var totalEv = 0; Object.keys(typeCounts).forEach(function (t) { totalEv += typeCounts[t]; });
console.log('每场事件总数 ' + r1(totalEv / N) + '，其中解说可见类型:');
Object.keys(typeCounts).sort(function (a, b) { return typeCounts[b] - typeCounts[a]; }).forEach(function (t) {
  console.log('  ' + t + ': ' + r1(typeCounts[t] / N) + ' 条/场');
});
var avgGap = notableGaps.reduce(function (a, b) { return a + b; }, 0) / notableGaps.length;
var sorted = notableGaps.slice().sort(function (a, b) { return a - b; });
var p90 = sorted[Math.floor(sorted.length * 0.9)];
var avgQuiet = quietPerMatch.reduce(function (a, b) { return a + b; }, 0) / N;
var worstQuiet = Math.max.apply(null, quietPerMatch);
console.log('值得看的事件（进/扑/射失/牌/换人）平均间隔 ' + r1(avgGap) + ' 分钟，P90 间隔 ' + p90 + ' 分钟');
console.log('每场最长干看 ' + r1(avgQuiet) + ' 分钟（全场最糟的一次 ' + worstQuiet + ' 分钟）');
console.log('真实等待换算: 干看 x 分钟 = 2×速度 ' + r1(avgQuiet * 0.75) + ' 秒 / 1×速度 ' + r1(avgQuiet * 1.5) + ' 秒');

console.log('\n==== 文案重复度 ====');
var entries = Object.keys(textGlobal).map(function (k) { return [k, textGlobal[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
var once = entries.filter(function (e) { return e[1] === 1; }).length;
console.log('不同文案总数 ' + entries.length + '，200 场只出现 1 次的 ' + once);
console.log('最高频文案 Top8:');
entries.slice(0, 8).forEach(function (e) { console.log('  ' + e[1] + ' 次: ' + e[0]); });
