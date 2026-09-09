/* R2 复审实验：硬线胜率 + 共识验收抽查 + 重放确定性 + 球探逻辑 */
var GAME = 'C:/Users/gavin/Desktop/Games/FM 2027 Matchday/game/';
require(GAME + 'js/data.js');
require(GAME + 'js/tactics.js');
require(GAME + 'js/engine.js');
var D = globalThis.GMD_DATA, T = globalThis.GMD_TACTICS, E = globalThis.GMD_ENGINE;
D.CLUBS.forEach(function (c) { c.players.forEach(function (p, i) { p.__uid = c.id + '-' + i; }); });

/* ===== 复刻 app.js scoutRecommend（官方球探逻辑） ===== */
function scoutRecommend(budget, signedRef) {
  function spent() { return signedRef.list.reduce(function (s, uid) { var p = uidPlayer(uid); return s + (p ? p.val : 0); }, 0); }
  function uidPlayer(uid) { var r = null; D.CLUBS.forEach(function (c) { c.players.forEach(function (p) { if (p.__uid === uid) r = p; }); }); return r; }
  function squadCounts() { var n = { GK: 0, DF: 0, MF: 0, FW: 0 }; signedRef.list.map(uidPlayer).forEach(function (p) { if (p) n[D.posClass(p.pos)]++; }); return n; }
  function clubAvailable(cid) { return D.findClub(cid).players.filter(function (p) { return signedRef.list.indexOf(p.__uid) < 0; }); }
  var targets = { GK: 2, DF: 5, MF: 4, FW: 2 };
  var have = squadCounts();
  var pool = [];
  D.CLUBS.forEach(function (c) { c.players.forEach(function (p) { if (signedRef.list.indexOf(p.__uid) >= 0) return; pool.push({ p: p, cls: D.posClass(p.pos) }); }); });
  function trySign(p) {
    if (spent() + p.val > budget) return false;
    var cid = p.__uid.split('-')[0];
    if (clubAvailable(cid).length - 1 < 13) return false;
    signedRef.list.push(p.__uid);
    return true;
  }
  ['GK', 'DF', 'MF', 'FW'].forEach(function (cls) {
    var need = targets[cls] - have[cls];
    if (need <= 0) return;
    var cands = pool.filter(function (x) { return x.cls === cls; })
      .sort(function (a, b) { return (T.overallOf(b.p) - b.p.val * 0.25) - (T.overallOf(a.p) - a.p.val * 0.25); });
    for (var i = 0; i < cands.length && need > 0; i++) {
      var remainingAfter = targets.GK - have.GK + targets.DF - have.DF + targets.MF - have.MF + targets.FW - have.FW - 1;
      if (spent() + cands[i].p.val > budget - remainingAfter * 15) continue;
      if (trySign(cands[i].p)) { need--; have[cls]++; }
    }
  });
  var total = signedRef.list.length;
  var rest = pool.filter(function (x) { return signedRef.list.indexOf(x.p.__uid) < 0 && have[x.cls] < (x.cls === 'GK' ? 2 : 6); })
    .sort(function (a, b) {
      var w = function (x) { return T.overallOf(x.p) - x.p.val * 0.2 + (6 - Math.min(6, have[x.cls])) * 3; };
      return w(b) - w(a);
    });
  for (var i = 0; i < rest.length && total < 18; i++) {
    if (trySign(rest[i].p)) { total++; have[rest[i].cls]++; }
  }
  return signedRef.list;
}

/* 官方空战术（emptyTactic 默认 instr，新玩家现状） */
function officialTactic(signed, formation) {
  var t = T.autoPickXI(formation || '4-2-3-1', signed);
  t.instr = T.emptyTactic(formation || '4-2-3-1').instr; /* 新存档现状：counter=0 的默认 */
  return t;
}
function benchOf(signed, tac) {
  var xi = {}; tac.slots.forEach(function (s) { if (s.playerId) xi[s.playerId] = 1; });
  return signed.filter(function (p) { return !xi[p.__uid]; }).sort(function (a, b) { return T.overallOf(b) - T.overallOf(a); }).slice(0, 9).map(function (p) { return p.__uid; });
}
function playerTeam(signed, tac) {
  return { name: '梦想联', clubId: null, tactic: tac, squad: signed, benchUids: benchOf(signed, tac), ai: false };
}
function clubTeam(clubId, signed) {
  var c = D.findClub(clubId);
  var t = T.autoPickXI(c.style.formation, c.players);
  t.instr = T.tacticFromStyle(c.style).instr;
  var fw = c.players.filter(function (p) { return D.posClass(p.pos) === 'FW'; }).length;
  if (fw < 2) { t.instr.mentality = Math.max(0, t.instr.mentality - 1); t.instr.line = Math.max(0, t.instr.line - 1); }
  var avail = signed ? c.players.filter(function (p) { return signed.indexOf(p) < 0; }) : c.players;
  return { name: c.name, clubId: c.id, tactic: t, squad: avail, benchUids: null, ai: true };
}
function run(cfg, seed) { var m = E.createMatch({ home: cfg.home, away: cfg.away, seed: seed }); while (!m.finished) E.stepMinute(m); return m; }

/* ===== [H] 硬线：€600M 官方球探阵容 vs 满员曼城主场胜率 ≤15% ===== */
console.log('==== [H] 玩家硬线（官方球探阵容+默认战术, 主场） ====');
[450, 600, 800].forEach(function (b) {
  var ref = { list: [] };
  scoutRecommend(b, ref);
  var signed = ref.list.map(function (u) { return D.CLUBS.reduce(function (a, c) { return a.concat(c.players); }, []).filter(function (p) { return p.__uid === u; })[0]; });
  var tac = officialTactic(signed);
  var ovrs = tac.slots.map(function (sl) { var p = signed.filter(function (x) { return x.__uid === sl.playerId; })[0]; return p ? T.overallOf(p) : 0; });
  var xiAvg = (ovrs.reduce(function (a, b2) { return a + b2; }, 0) / 11).toFixed(1);
  ['MCI', 'LIV', 'NFO'].forEach(function (opp) {
    var w = 0, d = 0, gf = 0, ga = 0, poss = 0, n = 100;
    for (var i = 0; i < n; i++) {
      var m = run({ home: playerTeam(signed, tac), away: clubTeam(opp, signed) }, 3000000 + b * 1000 + i * 37 + opp.charCodeAt(0) * 7);
      if (m.score[0] > m.score[1]) w++; else if (m.score[0] === m.score[1]) d++;
      gf += m.score[0]; ga += m.score[1];
      poss += m.poss[0] / (m.poss[0] + m.poss[1]);
    }
    console.log('  €' + b + 'M(' + ref.list.length + '人,XI均值' + xiAvg + ') vs ' + opp + ': 胜 ' + w + '% 平 ' + d + '% 负 ' + (100 - w - d) + '%  进失 ' + (gf / n).toFixed(2) + '-' + (ga / n).toFixed(2) + '  控球 ' + Math.round(poss / n * 100) + '%');
  });
});

/* ===== [A] 共识验收抽查（AI vs AI 200场） ===== */
console.log('==== [A] 引擎验收抽查（AI vs AI） ====');
var pairs = [['ARS', 'CHE'], ['MCI', 'LIV'], ['MCI', 'NFO'], ['EVE', 'WHU'], ['NEW', 'AVL'], ['BRE', 'FUL'], ['TOT', 'MUN'], ['CPA', 'BOU']];
var tg = 0, ts = 0, cornerGoals = 0, setPieceGoals = 0, big0 = 0, big1 = 0, off0 = 0, off1 = 0, pens = 0, penGoals = 0, lateGoals = 0, allGoals = 0, reds = 0, yellows = 0, n2 = 0, z = 0, fgA = [];
var textUsed = {}, dupMatches = 0, dupWorst = 0;
for (var i = 0; i < pairs.length; i++) {
  for (var sw = 0; sw < 2; sw++) {
    var h = sw ? pairs[i][1] : pairs[i][0], a = sw ? pairs[i][0] : pairs[i][1];
    for (var k = 0; k < 13; k++, n2++) {
      var m = run({ home: clubTeam(h), away: clubTeam(a) }, 4000000 + n2 * 13);
      var s0 = m.stats[0], s1 = m.stats[1];
      tg += m.score[0] + m.score[1]; ts += s0.shots + s1.shots;
      big0 += s0.bigChances; big1 += s1.bigChances;
      off0 += s0.offsides; off1 += s1.offsides;
      reds += s0.red + s1.red; yellows += s0.yellow + s1.yellow;
      var evs = m.events;
      evs.forEach(function (e) {
        if (e.type === 'goal') {
          allGoals++;
          if (e.text.indexOf('角球') >= 0 || e.text.indexOf('传中') >= 0 || e.text.indexOf('头') >= 0) { /* 粗分 */
          }
        }
        if (e.type === 'pen') pens++;
      });
      // 角球/定位球进球：用 insights
      cornerGoals += 0; // 下面用 insights 统计
      // 进球分钟
      var goals = evs.filter(function (e) { return e.type === 'goal'; });
      goals.forEach(function (g) { if (g.min >= 76) lateGoals++; });
      if (goals.length) fgA.push(goals[0].min);
      // 同句重复
      var cnt = {};
      evs.forEach(function (e) { if (['goal', 'save', 'miss', 'yellow', 'red', 'pen', 'info', 'offside', 'sub'].indexOf(e.type) >= 0) cnt[e.text] = (cnt[e.text] || 0) + 1; });
      var dup = 0; Object.keys(cnt).forEach(function (kk) { if (cnt[kk] > 1) dup += cnt[kk] - 1; });
      if (dup > 0) dupMatches++;
      if (dup > dupWorst) dupWorst = dup;
      if (s0.shots + s1.shots === 0) z++;
    }
  }
}
// 角球/定位球进球占比：重跑一小批专门用 insights
var spGoals = 0, spAll = 0;
for (var i = 0; i < 104; i++) {
  var pr = pairs[i % pairs.length];
  var m = run({ home: clubTeam(pr[0]), away: clubTeam(pr[1]) }, 5000000 + i * 7);
  spGoals += m.insights.setPieceGoals[0] + m.insights.setPieceGoals[1];
  spAll += m.score[0] + m.score[1];
}
console.log('  场均总进球 ' + (tg / n2).toFixed(2) + '（目标 2.6-3.0）  总射门 ' + (ts / n2).toFixed(1) + '（22-26）  0-0场 ' + z + '/' + n2);
console.log('  绝佳机会/队 ' + ((big0 + big1) / 2 / n2).toFixed(2) + '（目标 1.5-3）  越位/队 ' + ((off0 + off1) / 2 / n2).toFixed(2) + '（目标~1.8）');
console.log('  黄牌/场 ' + (yellows / n2).toFixed(2) + '（3-4.5）  红牌/场 ' + (reds / n2).toFixed(3) + '（~0.18）');
console.log('  定位球进球占比 ' + (spGoals / Math.max(1, spAll) * 100).toFixed(1) + '%（目标 ≤25%，角球去水）');
console.log('  76分钟后进球占比 ' + (lateGoals / Math.max(1, allGoals) * 100).toFixed(1) + '%（目标 ≥20%）');
var fgs = fgA.slice().sort(function (x, y) { return x - y; });
console.log('  首球中位 ' + fgs[Math.floor(fgs.length / 2)] + "'  无进球场 " + (n2 - fgA.length) + '/' + n2);
console.log('  同句重复: ' + dupMatches + '/' + n2 + ' 场有重复，最糟 ' + dupWorst + ' 句（B8 冷却验证）');

/* ===== [P] 控球个性 ===== */
function possOf(homeId, awayId, n) {
  var hp = 0;
  for (var i = 0; i < n; i++) {
    var m = run({ home: clubTeam(homeId), away: clubTeam(awayId) }, 6000000 + i * 3);
    hp += m.poss[0] / (m.poss[0] + m.poss[1]);
  }
  return Math.round(hp / n * 100);
}
console.log('  MCI 主场控球 ' + possOf('MCI', 'EVE', 60) + '%/' + possOf('MCI', 'NFO', 60) + '%（目标 ≥58%）  NFO 主场控球 ' + possOf('NFO', 'EVE', 60) + '%（目标 ≤48%）');

/* ===== [R] 评分方差 ===== */
var hatMax = 0, motmMax = 0, motmAvg = 0, mn = 0;
for (var i = 0; i < 300; i++) {
  var pr = pairs[i % pairs.length];
  var m = run({ home: clubTeam(pr[0]), away: clubTeam(pr[1]) }, 7000000 + i * 11);
  [0, 1].forEach(function (sd) {
    E.playerMatchStats(m, sd).forEach(function (r) {
      if (r.stats.goals >= 3 && r.rating > hatMax) hatMax = r.rating;
    });
    var rows = E.playerMatchStats(m, sd);
    if (rows.length) { var mx = Math.max.apply(null, rows.map(function (r) { return r.rating; })); if (mx > motmMax) motmMax = mx; motmAvg += mx; mn++; }
  });
}
console.log('  帽子戏法最高评分 ' + hatMax + '（目标 ≥9.5）  MOTM 最高 ' + motmMax + ' 均值 ' + (motmAvg / mn).toFixed(2));
