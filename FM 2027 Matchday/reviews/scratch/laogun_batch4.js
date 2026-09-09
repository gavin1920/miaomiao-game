/* 老枪批测四（R2）：干净的75分钟比分状态 + 红牌时机 + 反击/绝杀质量 */
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
let rs = 777;
const rnd = () => { rs |= 0; rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const N = 500;
let lead75 = 0, lead75Win = 0, lead75Draw = 0, trail75 = 0, trail75NoLoss = 0, trail75Win = 0;
let counterShots = 0, counterGoals = 0, counterXg = 0;
let redEarly = 0, redTotal = 0, pens = 0, penGoals = 0;
let winAt85 = 0, deciders = 0;
for (let i = 0; i < N; i++) {
  let hi = Math.floor(rnd() * 20), ai = Math.floor(rnd() * 20);
  while (ai === hi) ai = Math.floor(rnd() * 20);
  const st = E.createMatch({ home: mkTeam(D.CLUBS[hi]), away: mkTeam(D.CLUBS[ai]), seed: 410000 + i * 19 });
  E.simulateToEnd(st);
  // 时间线重建：75分钟时比分（以 min<75 的进球为准）
  let s75 = [0, 0];
  const goals = [];
  st.events.forEach(ev => {
    if (ev.type === 'goal') {
      if (ev.min < 75) s75 = ev.score;
      goals.push(ev);
      if (/反击/.test(ev.text)) counterGoals++;
    }
    if (ev.type === 'counter') counterShots++;
    if (ev.type === 'red') { redTotal++; if (ev.min < 25) redEarly++; }
    if (ev.type === 'pen') pens++;
    if (ev.type === 'goal' && /（点球）/.test(ev.text)) penGoals++;
  });
  const g0 = st.score[0], g1 = st.score[1];
  if (s75[0] > s75[1]) { lead75++; if (g0 > g1) lead75Win++; else if (g0 === g1) lead75Draw++; }
  if (s75[1] > s75[0]) { lead75++; if (g1 > g0) lead75Win++; else if (g0 === g1) lead75Draw++; }
  if (s75[0] < s75[1]) { trail75++; if (g0 >= g1) trail75NoLoss++; if (g0 > g1) trail75Win++; }
  if (s75[1] < s75[0]) { trail75++; if (g1 >= g0) trail75NoLoss++; if (g1 > g0) trail75Win++; }
  if (g0 !== g1 && goals.length) { deciders++; const last = goals[goals.length - 1]; if (last.min >= 85) winAt85++; }
}
console.log('[75分状态] 领先样本', lead75, '→ 最终胜', (lead75Win / lead75 * 100).toFixed(1) + '%', '最终平', (lead75Draw / lead75 * 100).toFixed(1) + '%', '（真实：85-88%胜/8-10%平）');
console.log('[75分状态] 落后样本', trail75, '→ 最终不败', (trail75NoLoss / trail75 * 100).toFixed(1) + '%', '最终逆转胜', (trail75Win / trail75 * 100).toFixed(1) + '%', '（真实：不败10-15%）');
console.log('[反击] 每场', (counterShots / N).toFixed(2), '次，进球/场', (counterGoals / N).toFixed(3));
console.log('[红牌] 共', redTotal, '张，', (redTotal / N).toFixed(3), '/场；25分钟前直红', redEarly, '张');
console.log('[点球] ', pens, '判罚，转化', (penGoals / pens * 100).toFixed(1) + '%');
console.log('[绝杀] 非平局', deciders, '场，制胜球≥85分钟', winAt85, '(' + (winAt85 / deciders * 100).toFixed(1) + '%)');
