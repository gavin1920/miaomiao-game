/* 实验A2：对"反击+速度型"对手时 line / mentality / pressZone / offside 的敏感性 */
'use strict';
const H = require('./harness.js');
const { TAC, mkTeam, play, summarize } = H;
const BASE = TAC.emptyTactic('4-2-3-1').instr;
const N = 300;
const seeds = []; for (let i = 0; i < N; i++) seeds.push(7000 + i * 13);

// 对手：中游队(NEW) 但开反击、极快节奏、全力进攻、极高防线? 不——对手是"反击型"：心态6会把cp推高
const awayInstr = Object.assign({}, BASE, { counter: 1, mentality: 6, tempo: 3, line: 4, pressZone: 2 });
// 再给对手塞快马:NEW 有埃兰加 92 速/戈登 90。用 NEW。

function runSet(hInstr) {
  const out = [];
  for (let i = 0; i < N; i++) {
    out.push(play(mkTeam('EVE', { instr: hInstr }), mkTeam('NEW', { instr: awayInstr }), seeds[i]));
  }
  return out;
}
const baseM = runSet(BASE);
const sB = summarize(baseM, 0);
console.log('基准: EVE(中性) vs NEW(反击: ment6/counter/tempo3/line4/pressZone2), N=' + N);
console.log('主队基准: 胜率 ' + sB.winPct + '% ' + sB.gf + '-' + sB.ga + ' xG ' + sB.xg + '-' + sB.xga + ' 被反击 ' + sB.countersConc);
console.log('');
const variants = [
  ['line 0', { line: 0 }], ['line 1', { line: 1 }], ['line 3', { line: 3 }], ['line 4', { line: 4 }],
  ['mentality 0', { mentality: 0 }], ['mentality 2', { mentality: 2 }], ['mentality 6', { mentality: 6 }],
  ['pressZone 0', { pressZone: 0 }], ['pressZone 2', { pressZone: 2 }],
  ['offside 1', { offside: 1 }], ['defWidth 0', { defWidth: 0 }], ['defWidth 2', { defWidth: 2 }],
  ['gkDist 1', { gkDist: 1 }], ['counter 1', { counter: 1 }],
];
function paired(baseM, vM) {
  let d = 0, wB = 0, wV = 0; const arr = [];
  for (let i = 0; i < baseM.length; i++) {
    const gdb = baseM[i].score[0] - baseM[i].score[1], gdv = vM[i].score[0] - vM[i].score[1];
    d += gdv - gdb; arr.push(gdv - gdb);
    if (gdb > 0) wB++; if (gdv > 0) wV++;
  }
  const n = baseM.length, mean = d / n;
  const sd = Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
  return { dGd: mean, ci: 1.96 * sd / Math.sqrt(n), wB: 100 * wB / n, wV: 100 * wV / n };
}
console.log('变量 | 胜率%(基→变) | Δ净胜(±95CI) | 变体GF-GA | 我被反击/场 | 我反击/场');
variants.forEach(([name, mut]) => {
  const vM = runSet(Object.assign({}, BASE, mut));
  const sV = summarize(vM, 0);
  const d = paired(baseM, vM);
  console.log(name + ' | ' + d.wB.toFixed(1) + '→' + d.wV.toFixed(1) + ' | ' + (d.dGd >= 0 ? '+' : '') + d.dGd.toFixed(3) + (Math.abs(d.dGd) > d.ci ? '*' : ' ') + '±' + d.ci.toFixed(2) + ' | ' + sV.gf + '-' + sV.ga + ' | ' + sV.countersConc + ' | ' + sV.counters);
});
