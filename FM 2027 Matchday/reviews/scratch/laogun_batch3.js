/* 老枪批测之三：模拟联赛表（个性）+ 解说文案重复度 */
const G = 'C:/Users/gavin/Desktop/Games/FM 2027 Matchday/game/js/';
require(G + 'data.js'); require(G + 'tactics.js'); require(G + 'engine.js');
const D = globalThis.GMD_DATA, T = globalThis.GMD_TACTICS, E = globalThis.GMD_ENGINE;
D.CLUBS.forEach(c => c.players.forEach((p, i) => { p.__uid = c.id + '-' + i; }));

function mkTeam(club) {
  const avail = club.players.slice();
  const tac = T.autoPickXI(club.style.formation, avail);
  tac.instr = T.tacticFromStyle(club.style).instr;
  const xi = {}; tac.slots.forEach(s => { if (s.playerId) xi[s.playerId] = 1; });
  const bench = avail.filter(p => !xi[p.__uid]).sort((a, b) => T.overallOf(b) - T.overallOf(a)).slice(0, 9).map(p => p.__uid);
  return { name: club.name, clubId: club.id, tactic: tac, squad: avail, benchUids: bench, ai: true };
}
let rs = 999;
const rnd = () => { rs |= 0; rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/* 联赛制：20 队双循环 38 轮 = 380 场 */
const table = {};
D.CLUBS.forEach(c => table[c.id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, poss: 0, n: 0, xg: 0 });
const texts = {};
let goalTextN = 0;
for (let hi = 0; hi < 20; hi++) for (let ai = 0; ai < 20; ai++) {
  if (hi === ai) continue;
  const st = E.createMatch({ home: mkTeam(D.CLUBS[hi]), away: mkTeam(D.CLUBS[ai]), seed: 300000 + hi * 100 + ai });
  E.simulateToEnd(st);
  const g0 = st.score[0], g1 = st.score[1];
  const p0 = st.poss[0] / Math.max(1, st.poss[0] + st.poss[1]);
  const th = table[D.CLUBS[hi].id], ta = table[D.CLUBS[ai].id];
  th.n++; ta.n++;
  th.gf += g0; th.ga += g1; ta.gf += g1; ta.ga += g0;
  th.poss += p0; ta.poss += (1 - p0);
  th.xg += st.stats[0].xg; ta.xg += st.stats[1].xg;
  if (g0 > g1) { th.w++; th.p += 3; ta.l++; } else if (g0 < g1) { ta.w++; ta.p += 3; th.l++; } else { th.d++; ta.d++; th.p++; ta.p++; }
  st.events.forEach(ev => { if (ev.type === 'goal') { goalTextN++; const raw = ev.text.replace(/\d+-\d+/, 'X').replace(/（.*?）/, ''); texts[raw] = (texts[raw] || 0) + 1; } });
}
console.log('=== 模拟英超38轮积分榜（双循环380场） ===');
Object.entries(table).map(([id, r]) => ({ id, ...r, ppg: r.p / r.n, gd: r.gf - r.ga }))
  .sort((a, b) => b.p - a.p || (b.gf - b.ga) - (a.gf - a.ga))
  .forEach((r, i) => console.log(String(i + 1).padStart(2), r.id, '分' + r.p, '胜' + r.w + '平' + r.d + '负' + r.l, '进' + (r.gf / r.n).toFixed(2) + '失' + (r.ga / r.n).toFixed(2), 'xG' + (r.xg / r.n).toFixed(2), '控球' + (r.poss / r.n * 100).toFixed(1) + '%'));
console.log('\n=== 解说文案重复度 ===');
const uniq = Object.keys(texts).length;
console.log('进球事件', goalTextN, '条，去重后', uniq, '种模板位（含球员名/助攻名变化）');
const top = Object.entries(texts).sort((a, b) => b[1] - a[1]).slice(0, 5);
top.forEach(([k, v]) => console.log('  ', v, '次:', k));
