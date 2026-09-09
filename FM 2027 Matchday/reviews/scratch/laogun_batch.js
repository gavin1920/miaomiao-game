/* 老枪的批测：真实俱乐部官方 style 战术，随机对阵 AI vs AI，统计与 epl_baseline.csv 对比 */
const G = 'C:/Users/gavin/Desktop/Games/FM 2027 Matchday/game/js/';
require(G + 'data.js'); require(G + 'tactics.js'); require(G + 'engine.js');
const D = globalThis.GMD_DATA, T = globalThis.GMD_TACTICS, E = globalThis.GMD_ENGINE;

D.CLUBS.forEach(c => c.players.forEach((p, i) => { p.__uid = c.id + '-' + i; }));

const N = parseInt(process.argv[2] || '400', 10);
let rs = 123456789;
const rnd = () => { rs |= 0; rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function mkTeam(club) {
  const avail = club.players.slice();
  const tac = T.autoPickXI(club.style.formation, avail);
  tac.instr = T.tacticFromStyle(club.style).instr;
  const xi = {}; tac.slots.forEach(s => { if (s.playerId) xi[s.playerId] = 1; });
  const bench = avail.filter(p => !xi[p.__uid]).sort((a, b) => T.overallOf(b) - T.overallOf(a)).slice(0, 9).map(p => p.__uid);
  return { name: club.name, clubId: club.id, tactic: tac, squad: avail, benchUids: bench, ai: true };
}

const clubs = D.CLUBS;
const sum = {}, perClub = {};
const push = (o, k, v) => { (o[k] = o[k] || []).push(v); };

let totalPlayers = 0;
clubs.forEach(c => totalPlayers += c.players.length);

let hW = 0, aW = 0, dr = 0;
let goalsH = [], goalsA = [], goalsTot = [];
let goalMins = [], deciderMins = [], pens = 0, reds = 0;
let htTrailWin = 0, htTrail = 0, htTrailDraw = 0;
let trail75NoLoss = 0, trail75 = 0;
let subCounts = [], stoppages = [], matchMin = [];
let penScored = 0;

for (let i = 0; i < N; i++) {
  let hi = Math.floor(rnd() * 20), ai = Math.floor(rnd() * 20);
  while (ai === hi) ai = Math.floor(rnd() * 20);
  const home = clubs[hi], away = clubs[ai];
  const st = E.createMatch({ home: mkTeam(home), away: mkTeam(away), seed: 700000 + i * 13 });
  E.simulateToEnd(st);

  const g0 = st.score[0], g1 = st.score[1];
  goalsH.push(g0); goalsA.push(g1); goalsTot.push(g0 + g1);
  if (g0 > g1) hW++; else if (g0 < g1) aW++; else dr++;

  const s0 = st.stats[0], s1 = st.stats[1];
  const poss0 = st.poss[0] + st.poss[1] ? st.poss[0] / (st.poss[0] + st.poss[1]) : 0.5;
  push(perClub, home.id, { poss: poss0, gf: g0, ga: g1, sh: s0.shots, pa: s0.passAtt ? s0.passOk / s0.passAtt : 0, xg: s0.xg });
  push(perClub, away.id, { poss: 1 - poss0, gf: g1, ga: g0, sh: s1.shots, pa: s1.passAtt ? s1.passOk / s1.passAtt : 0, xg: s1.xg });

  [s0, s1].forEach(s => {
    push(sum, 'shots', s.shots); push(sum, 'sot', s.sot); push(sum, 'xg', s.xg);
    push(sum, 'corners', s.corners); push(sum, 'fouls', s.fouls);
    push(sum, 'offsides', s.offsides); push(sum, 'bigChances', s.bigChances);
    push(sum, 'passAcc', s.passAtt ? s.passOk / s.passAtt * 100 : 0);
    push(sum, 'passAtt', s.passAtt);
  });
  push(sum, 'yellow', s0.yellow + s1.yellow);
  reds += s0.red + s1.red;

  let penEv = 0, htScore = null;
  const goalEv = [];
  st.events.forEach(ev => {
    if (ev.type === 'pen') penEv++;
    if (ev.type === 'goal' && /（点球）/.test(ev.text)) penScored++;
    if (ev.type === 'goal') goalEv.push(ev);
    if (ev.type === 'ht') htScore = ev.text.match(/(\d+)-(\d+)/);
  });
  pens += penEv;

  goalEv.forEach(ev => goalMins.push(ev.min));
  if (g0 !== g1 && goalEv.length) deciderMins.push(goalEv[goalEv.length - 1].min);

  if (htScore) {
    const h = +htScore[1], a = +htScore[2];
    if (h !== a) {
      htTrail++;
      const trailSideHome = h < a;
      const finalTrailWon = trailSideHome ? g0 > g1 : g1 > g0;
      const finalDraw = g0 === g1;
      if (finalTrailWon) htTrailWin++; else if (finalDraw) htTrailDraw++;
    }
  }
  let sc = [0, 0], s75 = null;
  for (const ev of st.events) {
    if (ev.type === 'goal') { if (ev.min >= 75 && !s75) s75 = sc.slice(); sc = ev.score; }
  }
  if (s75) {
    const [x, y] = s75;
    if (x < y) { trail75++; if (g0 >= g1) trail75NoLoss++; }
    if (y < x) { trail75++; if (g1 >= g0) trail75NoLoss++; }
  }
  st.teams.forEach(t => subCounts.push(t.subsUsed));
  stoppages.push(st.stoppage);
  matchMin.push(st.minute);
}

const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => { const m = avg(a); return Math.sqrt(avg(a.map(v => (v - m) * (v - m)))); };
const show = (k) => console.log(k.padEnd(12), 'avg=' + avg(sum[k]).toFixed(2), 'sd=' + sd(sum[k]).toFixed(2));

console.log('球员总数 =', totalPlayers, ' 场次 =', N);
console.log('主胜 ' + (hW / N * 100).toFixed(1) + '%  平 ' + (dr / N * 100).toFixed(1) + '%  客胜 ' + (aW / N * 100).toFixed(1) + '%');
console.log('--- 每队每场 ---');
['shots', 'sot', 'xg', 'corners', 'fouls', 'offsides', 'bigChances', 'passAcc', 'passAtt'].forEach(show);
console.log('--- 全场 ---');
console.log('总进球 avg=' + avg(goalsTot).toFixed(2) + '  主队=' + avg(goalsH).toFixed(2) + '  客队=' + avg(goalsA).toFixed(2));
show('yellow');
console.log('点球判罚/场=' + (pens / N).toFixed(3), '点球进球/场=' + (penScored / N).toFixed(3), '红牌/场=' + (reds / N).toFixed(3));
console.log('替补/队=' + avg(subCounts).toFixed(2), '补时=' + avg(stoppages).toFixed(2), '结束分钟=' + avg(matchMin).toFixed(1));
const b = [0, 0, 0, 0, 0, 0];
goalMins.forEach(m => { b[Math.min(5, Math.floor(m / 15))]++; });
console.log('进球时间占比(%) =', b.map(v => (v / goalMins.length * 100).toFixed(1)).join('/'), '  [0-15/16-30/31-45/46-60/61-75/76-90+]');
console.log('80+分钟进球占比=' + (goalMins.filter(m => m >= 80).length / goalMins.length * 100).toFixed(1) + '%');
console.log('90+分钟进球占比=' + (goalMins.filter(m => m > 90).length / goalMins.length * 100).toFixed(1) + '%');
console.log('制胜球≥85分钟 场次占比=' + (deciderMins.filter(m => m >= 85).length / N * 100).toFixed(1) + '%');
console.log('HT落后 最终赢=' + (htTrailWin / Math.max(1, htTrail) * 100).toFixed(1) + '%  最终不败=' + ((htTrailWin + htTrailDraw) / Math.max(1, htTrail) * 100).toFixed(1) + '%  (样本' + htTrail + ')');
console.log('75分钟落后 最终不输=' + (trail75NoLoss / Math.max(1, trail75) * 100).toFixed(1) + '%  (样本' + trail75 + ')');
console.log('xG总量/场=' + (avg(sum['xg']) * 2).toFixed(2), 'vs 实际进球/场=' + avg(goalsTot).toFixed(2), '偏差=' + (avg(goalsTot) - avg(sum['xg']) * 2).toFixed(2));

console.log('\n=== 各队平均控球/进球/射门（批测） vs 阵容强度 ===');
const strengths = {};
clubs.forEach(c => {
  const top = c.players.map(p => T.overallOf(p)).sort((a, b2) => b2 - a).slice(0, 14);
  strengths[c.id] = Math.round(avg(top));
});
const possRows = clubs.map(c => {
  const arr = perClub[c.id] || [];
  return { id: c.id, poss: avg(arr.map(x => x.poss)) * 100, str: strengths[c.id], gf: avg(arr.map(x => x.gf)), sh: avg(arr.map(x => x.sh)), pa: avg(arr.map(x => x.pa)) * 100, n: arr.length };
}).sort((a, b2) => b2.poss - a.poss);
possRows.forEach(r2 => console.log(r2.id.padEnd(4), 'poss=' + r2.poss.toFixed(1) + '%', 'str=' + r2.str, 'gf=' + r2.gf.toFixed(2), 'shots=' + r2.sh.toFixed(1), 'passAcc=' + r2.pa.toFixed(1), 'n=' + r2.n));
const xs = possRows.map(r2 => r2.str), ys = possRows.map(r2 => r2.poss);
const mx = avg(xs), my = avg(ys);
const cov = avg(xs.map((x, i2) => (x - mx) * (ys[i2] - my)));
console.log('控球率 vs 阵容强度 Pearson r =', (cov / (sd(xs) * sd(ys))).toFixed(3), '(基线 0.3-1.0)');

console.log('\n=== style 重复检查 ===');
const seen = {};
clubs.forEach(c => { const key = JSON.stringify(Object.assign({}, c.style, { formation: c.style.formation })); (seen[key] = seen[key] || []).push(c.id); });
Object.entries(seen).forEach(([k, v]) => { if (v.length > 1) console.log('重复style:', v.join(',')); });
const dup = Object.values(seen).filter(v => v.length > 1).length;
console.log('重复组数 =', dup);

// 进球分布（泊松形状检查）
const dist = {};
goalsTot.forEach(g => dist[g] = (dist[g] || 0) + 1);
console.log('\n总进球分布:', Object.keys(dist).sort((a, b2) => a - b2).map(k => k + ':' + (dist[k] / N * 100).toFixed(0) + '%').join(' '));
