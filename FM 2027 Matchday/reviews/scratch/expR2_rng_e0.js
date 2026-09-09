/* R2 补充：纯净RNG测试 + E0校准 + 38轮sanity + focus对位专项 + line vs 反击对手 */
'use strict';
const H = require('./harness.js');
const { DATA, TAC, ENG, mkTeam, play, summarize } = H;
const N = 300;

/* === 纯净 RNG 测试 === */
let diff = 0, diff2 = 0;
for (let i = 0; i < 100; i++) {
  const a = play(mkTeam('ARS', {}), mkTeam('LIV', {}), 4000 + i);
  // b: 同 seed，期间做 5 次空 patchTactic（UI 噪声调用）
  const b = ENG.createMatch({ home: mkTeam('ARS', {}), away: mkTeam('LIV', {}), seed: 4000 + i });
  while (!b.finished) { ENG.stepMinute(b); if (b.minute % 15 === 0 && !b.finished) ENG.patchTactic(b, 0, {}); }
  if (JSON.stringify(a.score) !== JSON.stringify(b.score)) diff++;
  // c: 同 seed 用 viewRng 额外消耗 1000 次模拟"任意呈现噪声"
  const c = ENG.createMatch({ home: mkTeam('ARS', {}), away: mkTeam('LIV', {}), seed: 4000 + i });
  for (let k = 0; k < 1000; k++) c.viewRng();
  ENG.simulateToEnd(c);
  if (JSON.stringify(a.score) !== JSON.stringify(c.score)) diff2++;
}
console.log('纯净RNG: 空 patch x5 → 比分不同 ' + diff + '/100（应0）; viewRng 预烧1000次 → 不同 ' + diff2 + '/100（应0）');
// simRng 流独立性：pushFrame 后 simRng 消耗计数
const st = ENG.createMatch({ home: mkTeam('ARS', {}), away: mkTeam('LIV', {}), seed: 42 });
let simCnt = 0, viewCnt = 0;
const oS = st.rng, oV = st.viewRng;
st.rng = () => { simCnt++; return oS(); };
st.viewRng = () => { viewCnt++; return oV(); };
while (!st.finished) ENG.stepMinute(st);
console.log('流预算: simRng ' + simCnt + ' / viewRng ' + viewCnt + '（R1 时单流 8014 次，帧消耗应已迁移）');

/* === E0' 校准（官方战术 380 对 ×5）=== */
let goals = 0, shots = 0, sot = 0, passOk = 0, passAtt = 0, corners = 0, cornerGoals = 0, setPieceGoals = 0,
  fouls = 0, yell = 0, red = 0, big = 0, n = 0, homeW = 0, draw = 0, lateGoals = 0, totG = 0, counters = 0;
const clubs = DATA.CLUBS.map(c => c.id);
for (let k = 0; k < 5; k++) {
  clubs.forEach((h, i) => clubs.forEach((a, j) => {
    if (i === j) return;
    const st2 = play(mkTeam(h, {}), mkTeam(a, {}), 90000 + k * 1000 + i * 21 + j);
    const s0 = st2.stats[0], s1 = st2.stats[1];
    goals += st2.score[0] + st2.score[1]; totG += st2.score[0] + st2.score[1];
    shots += s0.shots + s1.shots; sot += s0.sot + s1.sot;
    passOk += s0.passOk + s1.passOk; passAtt += s0.passAtt + s1.passAtt;
    corners += s0.corners + s1.corners; fouls += s0.fouls + s1.fouls;
    yell += s0.yellow + s1.yellow; red += s0.red + s1.red;
    big += s0.bigChances + s1.bigChances; counters += s0.counters + s1.counters;
    cornerGoals += st2.insights.setPieceGoals[0] + st2.insights.setPieceGoals[1];
    st2.events.forEach(e => { if (e.type === 'goal' && e.min > 75) lateGoals++; });
    if (st2.score[0] > st2.score[1]) homeW++; else if (st2.score[0] === st2.score[1]) draw++;
    n++;
  }));
}
console.log('--- E0\' 官方战术 ' + n + ' 场 ---');
console.log('进球 ' + (goals / n).toFixed(2) + '(2.6-3.0) | 射门 ' + (shots / n).toFixed(1) + '(22-26) | 射正 ' + (sot / n).toFixed(1) + '(8-10) | 传球 ' + (100 * passOk / passAtt).toFixed(1) + '%');
console.log('角球 ' + (corners / n).toFixed(1) + ' | 角球+定位球进球占比 ' + (100 * cornerGoals / totG).toFixed(1) + '%(≤25) | 犯规 ' + (fouls / n).toFixed(1) + '(20-26) | 黄 ' + (yell / n).toFixed(2) + '(3-4.5合计) | 红 ' + (red / n).toFixed(3) + '(~0.18)');
console.log('绝佳机会 ' + (big / n).toFixed(2) + '(合计3-6?) | 反击 ' + (counters / n).toFixed(2) + ' | 75后进球占比 ' + (100 * lateGoals / totG).toFixed(1) + '%(≥20) | 主胜 ' + (100 * homeW / n).toFixed(1) + '%(≈44) 平 ' + (100 * draw / n).toFixed(1) + '%');
// MCI 控球个性
const pm = []; for (let i = 0; i < 60; i++) { const st3 = play(mkTeam('MCI', {}), mkTeam('NFO', {}), 77000 + i); pm.push(st3.poss[0] / (st3.poss[0] + st3.poss[1]) * 100); }
console.log('MCI vs NFO 平均控球 ' + (pm.reduce((a, b) => a + b, 0) / pm.length).toFixed(1) + '%（目标 58%+）');

/* === 38 轮 sanity（官方双循环，模拟积分榜）=== */
const table = {};
clubs.forEach(id => table[id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
let hw = 0, nn = 0;
clubs.forEach((h, i) => clubs.forEach((a, j) => {
  if (i === j) return;
  const st4 = play(mkTeam(h, {}), mkTeam(a, {}), 550000 + i * 50 + j);
  table[h].p++; table[a].p++;
  table[h].gf += st4.score[0]; table[h].ga += st4.score[1];
  table[a].gf += st4.score[1]; table[a].ga += st4.score[0];
  if (st4.score[0] > st4.score[1]) { table[h].w++; table[a].l++; table[h].pts += 3; hw++; }
  else if (st4.score[0] < st4.score[1]) { table[a].w++; table[h].l++; table[a].pts += 3; }
  else { table[h].d++; table[a].d++; table[h].pts++; table[a].pts++; }
  nn++;
}));
const rows = Object.keys(table).map(id => ({ id, ...table[id] })).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga));
console.log('38轮官方模拟: 榜首 ' + rows[0].id + ' ' + rows[0].pts + '分(80±8) | 榜尾 ' + rows[19].id + ' ' + rows[19].pts + '分(<28) | 主胜 ' + (100 * hw / nn).toFixed(1) + '%(≈44)');
console.log('前6: ' + rows.slice(0, 6).map(r => r.id + ':' + r.pts).join(' ') + ' ... 后3: ' + rows.slice(-3).map(r => r.id + ':' + r.pts).join(' '));

/* === focus 对位专项：打对方弱侧（左路防守差）=== */
const seedsF = []; for (let i = 0; i < N; i++) seedsF.push(66000 + i * 13);
// 用 EVE（其左路防守明显弱：米科连科 74 vs 右侧加纳/奥布莱恩 76-80+皮克福德）改用 WHU 左路迪乌夫/斯卡莱斯 70/66 弱
const baseF = [], focL = [], focR = [];
seedsF.forEach(s => {
  baseF.push(play(mkTeam('ARS', {}), mkTeam('WHU', {}), s));
  focL.push(play(mkTeam('ARS', { instr: { focus: 'left' } }), mkTeam('WHU', {}), s));
  focR.push(play(mkTeam('ARS', { instr: { focus: 'right' } }), mkTeam('WHU', {}), s));
});
const sB0 = summarize(baseF, 0), sL = summarize(focL, 0), sR = summarize(focR, 0);
console.log('focus对位(ARS vs WHU左弱): balanced ' + sB0.gf + '-' + sB0.ga + ' | 左 ' + sL.gf + '-' + sL.ga + ' (ΔGD ' + ((sL.gf - sL.ga) - (sB0.gf - sB0.ga)).toFixed(2) + ') | 右 ' + sR.gf + '-' + sR.ga + ' (ΔGD ' + ((sR.gf - sR.ga) - (sB0.gf - sB0.ga)).toFixed(2) + ')');

/* === line vs 反击对手复测 === */
const seedsL = []; for (let i = 0; i < N; i++) seedsL.push(7000 + i * 13);
const awayL = Object.assign({}, TAC.emptyTactic('4-2-3-1').instr, { counter: 1, mentality: 6, tempo: 2, line: 4, pressZone: 2 });
function runL(hInstr) {
  const out = [];
  seedsL.forEach(s => out.push(play(mkTeam('EVE', { instr: hInstr }), mkTeam('NEW', { instr: awayL }), s)));
  return out;
}
const bL = runL(TAC.emptyTactic('4-2-3-1').instr);
['line 0', 'line 4'].forEach((nm, idx) => {
  const v = runL(Object.assign({}, TAC.emptyTactic('4-2-3-1').instr, { line: idx === 0 ? 0 : 4 }));
  const sV = summarize(v, 0), sB2 = summarize(bL, 0);
  console.log('vs反击手 ' + nm + ': ' + sV.winPct + '%胜 ' + sV.gf + '-' + sV.ga + ' 被反击 ' + sV.countersConc + ' (基准 ' + sB2.winPct + '% ' + sB2.gf + '-' + sB2.ga + ' 被反 ' + sB2.countersConc + ')');
});
