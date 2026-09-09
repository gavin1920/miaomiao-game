/* 老枪批测之二：进球类型构成、点球转化、75分钟比分、风格对决、挖人阵容 */
const G = 'C:/Users/gavin/Desktop/Games/FM 2027 Matchday/game/js/';
require(G + 'data.js'); require(G + 'tactics.js'); require(G + 'engine.js');
const D = globalThis.GMD_DATA, T = globalThis.GMD_TACTICS, E = globalThis.GMD_ENGINE;
D.CLUBS.forEach(c => c.players.forEach((p, i) => { p.__uid = c.id + '-' + i; }));

const avg = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);

function mkTeam(club, over) {
  const avail = (over && over.remove && over.remove.length) ? club.players.filter(p => over.remove.indexOf(p.__uid) < 0) : club.players.slice();
  const tac = T.autoPickXI(club.style.formation, avail);
  tac.instr = T.tacticFromStyle(club.style).instr;
  const xi = {}; tac.slots.forEach(s => { if (s.playerId) xi[s.playerId] = 1; });
  const bench = avail.filter(p => !xi[p.__uid]).sort((a, b) => T.overallOf(b) - T.overallOf(a)).slice(0, 9).map(p => p.__uid);
  return { name: club.name, clubId: club.id, tactic: tac, squad: avail, benchUids: bench, ai: true };
}

/* ---------- A. 进球类型构成 & 75分钟比分状态 ---------- */
const N = 300;
let rs = 42;
const rnd = () => { rs |= 0; rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const typeOf = t => /（角球/.test(t) ? 'corner' : /（点球/.test(t) ? 'pen' : /（前场任意球/.test(t) ? 'fk' : /（打穿高位防线）|（身后球/.test(t) ? 'throughHigh' : /反击/.test(t) ? 'counter' : /（禁区内缺乏抢点目标）/.test(t) ? 'crossNoTarget' : 'open';
let goalTypes = {}, goalsFromCorner = 0, goalsTotal = 0, setPiece = 0;
let trail75NoLoss = 0, trail75 = 0, lead75Hold = 0, lead75 = 0;
let redMins = [];
for (let i = 0; i < N; i++) {
  let hi = Math.floor(rnd() * 20), ai = Math.floor(rnd() * 20);
  while (ai === hi) ai = Math.floor(rnd() * 20);
  const st = E.createMatch({ home: mkTeam(D.CLUBS[hi]), away: mkTeam(D.CLUBS[ai]), seed: 500000 + i * 17 });
  E.simulateToEnd(st);
  // 重建进球时间线 → 75 分钟比分
  let sc = [0, 0], s75 = null;
  st.events.forEach(ev => {
    if (ev.type === 'goal') {
      goalsTotal++;
      const tp = typeOf(ev.text);
      goalTypes[tp] = (goalTypes[tp] || 0) + 1;
      if (tp === 'corner' || tp === 'fk' || tp === 'pen') setPiece++;
      if (ev.min >= 75 && !s75) s75 = sc.slice();
      sc = ev.score;
    }
    if (ev.type === 'red') redMins.push(ev.min);
  });
  const g0 = st.score[0], g1 = st.score[1];
  if (s75) {
    const [x, y] = s75;
    if (x > y) { lead75++; if (g0 > g1) lead75Hold++; }
    if (y > x) { lead75++; if (g1 > g0) lead75Hold++; }
    if (x < y) { trail75++; if (g0 >= g1) trail75NoLoss++; }
    if (y < x) { trail75++; if (g1 >= g0) trail75NoLoss++; }
  }
}
console.log('[A] 进球类型构成（' + goalsTotal + ' 球）:');
Object.entries(goalTypes).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('   ', k, v, '(' + (v / goalsTotal * 100).toFixed(1) + '%)'));
console.log('    定位球(角球+任意球+点球)合计 =', (setPiece / goalsTotal * 100).toFixed(1) + '%');
console.log('[A] 75分钟领先方最终保住胜果: ' + (lead75Hold / Math.max(1, lead75) * 100).toFixed(1) + '% (样本' + lead75 + ')   75分钟落后方最终不输: ' + (trail75NoLoss / Math.max(1, trail75) * 100).toFixed(1) + '% (样本' + trail75 + ')');
redMins.sort((a, b) => a - b);
console.log('[A] 红牌分钟数分布:', redMins.join(','));

/* ---------- B. 曼城 vs 伯恩利 风格对决（各 60 场互换主客） ---------- */
let mciPoss = [], mciShots = [], mciXg = [], burPoss = [], burXg = [], mciGoals = 0, burGoals = 0, cnt = 0;
for (let i = 0; i < 60; i++) {
  [[D.findClub('MCI'), D.findClub('BUR')], [D.findClub('BUR'), D.findClub('MCI')]].forEach(pair => {
    const st = E.createMatch({ home: mkTeam(pair[0]), away: mkTeam(pair[1]), seed: 880000 + i * 31 + (pair[0].id === 'MCI' ? 0 : 1) });
    E.simulateToEnd(st);
    const p0 = st.poss[0] / Math.max(1, st.poss[0] + st.poss[1]);
    if (pair[0].id === 'MCI') { mciPoss.push(p0); mciShots.push(st.stats[0].shots); mciXg.push(st.stats[0].xg); burXg.push(st.stats[1].xg); mciGoals += st.score[0]; burGoals += st.score[1]; }
    else { mciPoss.push(1 - p0); mciShots.push(st.stats[1].shots); mciXg.push(st.stats[1].xg); burXg.push(st.stats[0].xg); mciGoals += st.score[1]; burGoals += st.score[0]; }
    burPoss.push(1 - mciPoss[mciPoss.length - 1]);
    cnt++;
  });
}
console.log('[B] 曼城 vs 伯恩利 ' + cnt + ' 场: 曼城控球 ' + (avg(mciPoss) * 100).toFixed(1) + '%  射门 ' + avg(mciShots).toFixed(1) + '  xG ' + avg(mciXg).toFixed(2) + ' vs 伯恩利 xG ' + avg(burXg).toFixed(2) + '  进球 ' + mciGoals + '-' + burGoals);
console.log('    (真实世界：曼城对保级队控球常 70%+，xG 差 1.5+)');

/* ---------- C. 挖空伯恩利两名中锋后的 AI 阵容 ---------- */
const bur = D.findClub('BUR');
const stTargets = bur.players.filter(p => /ST/.test(p.pos));
console.log('[C] 伯恩利可被挖的中锋:', stTargets.map(p => p.name + '(' + p.pos + ')').join('、'));
const removed = stTargets.map(p => p.__uid);
const avail2 = bur.players.filter(p => removed.indexOf(p.__uid) < 0);
const tac2 = T.autoPickXI(bur.style.formation, avail2);
const slotsStr = tac2.slots.map(s => {
  const p = avail2.filter(x => x.__uid === s.playerId)[0];
  return s.code + ':' + (p ? p.name + '[fit' + Math.round(T.slotFit(p, s, s.role) * 100) + '%]' : '空');
}).join(' ');
console.log('[C] 挖空后伯恩利 4-2-3-1 自动首发: ' + slotsStr);
console.log('[C] 剩余人数=' + avail2.length + '，替补=' + (avail2.length - 11));

/* ---------- D. 点球转化专项 ---------- */
let penTotal = 0, penGoal = 0;
for (let i = 0; i < 800; i++) {
  let hi = Math.floor(rnd() * 20), ai = Math.floor(rnd() * 20);
  while (ai === hi) ai = Math.floor(rnd() * 20);
  const st = E.createMatch({ home: mkTeam(D.CLUBS[hi]), away: mkTeam(D.CLUBS[ai]), seed: 660000 + i * 7 });
  E.simulateToEnd(st);
  st.events.forEach(ev => { if (ev.type === 'pen') penTotal++; if (ev.type === 'goal' && /（点球）/.test(ev.text)) penGoal++; });
}
console.log('[D] 点球判罚 ' + penTotal + ' 次，进球 ' + penGoal + '，转化率 ' + (penGoal / penTotal * 100).toFixed(1) + '%  (真实英超约 76-78%)');
