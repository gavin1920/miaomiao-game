/* R2 实验A'：战术敏感性矩阵复测（同 R1 口径：EVE vs WHU 中性4-2-3-1，N=300 配对） */
'use strict';
const H = require('./harness.js');
const { TAC, mkTeam, play, summarize } = H;
const BASE = TAC.emptyTactic('4-2-3-1').instr;
const N = 300;
const seeds = []; for (let i = 0; i < N; i++) seeds.push(1000 + i * 37);
function runSet(hInstr, aInstr) {
  const out = [];
  for (let i = 0; i < N; i++) out.push(play(mkTeam('EVE', { instr: hInstr }), mkTeam('WHU', { instr: aInstr }), seeds[i]));
  return out;
}
function paired(baseM, vM) {
  let dGd = 0, dGf = 0, dGa = 0, wB = 0, wV = 0; const arr = [];
  for (let i = 0; i < baseM.length; i++) {
    const gdb = baseM[i].score[0] - baseM[i].score[1], gdv = vM[i].score[0] - vM[i].score[1];
    const gfB = baseM[i].score[0], gfV = vM[i].score[0], gaB = baseM[i].score[1], gaV = vM[i].score[1];
    dGd += gdv - gdb; dGf += gfV - gfB; dGa += gaV - gaB; arr.push(gdv - gdb);
    if (gdb > 0) wB++; if (gdv > 0) wV++;
  }
  const n = baseM.length, mean = dGd / n;
  const sd = Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
  return { dGd: mean, ci: 1.96 * sd / Math.sqrt(n), dGf: dGf / n, dGa: dGa / n, wB: 100 * wB / n, wV: 100 * wV / n };
}
const baseM = runSet(BASE, BASE);
const sB = summarize(baseM, 0);
console.log('R2基准 EVE vs WHU 中性: 胜率 ' + sB.winPct + '% ' + sB.gf + '-' + sB.ga + ' xG ' + sB.xg + '-' + sB.xga + ' 射门 ' + sB.shots + ' 控球 ' + sB.poss + '%');
console.log('');
const variants = [
  ['mentality 0', { mentality: 0 }], ['mentality 2', { mentality: 2 }], ['mentality 4', { mentality: 4 }], ['mentality 6', { mentality: 6 }],
  ['line 0', { line: 0 }], ['line 1', { line: 1 }], ['line 3', { line: 3 }], ['line 4', { line: 4 }],
  ['press 0', { press: 0 }], ['press 3', { press: 3 }],
  ['pressZone 0', { pressZone: 0 }], ['pressZone 2', { pressZone: 2 }],
  ['tempo 0', { tempo: 0 }], ['tempo 3', { tempo: 3 }],
  ['pass 0', { pass: 0 }], ['pass 4', { pass: 4 }],
  ['attWidth 0', { attWidth: 0 }], ['attWidth 2', { attWidth: 2 }],
  ['defWidth 0', { defWidth: 0 }], ['defWidth 2', { defWidth: 2 }],
  ['focus 左', { focus: 'left' }], ['focus 中', { focus: 'middle' }], ['focus 两翼', { focus: 'flanks' }],
  ['overlap 0', { overlap: 0 }], ['overlap 2', { overlap: 2 }],
  ['tackling 0', { tackling: 0 }], ['tackling 2', { tackling: 2 }],
  ['gkDist 1', { gkDist: 1 }],
  ['counter 1', { counter: 1 }], ['gegen 1', { gegen: 1 }],
  ['offside 1', { offside: 1 }], ['timeWaste 1', { timeWaste: 1 }],
];
console.log('变量 | 胜率%(基→变) | ΔGD±CI | ΔGF | ΔGA | 变体GF-GA | 控球%');
variants.forEach(([name, mut]) => {
  const vM = runSet(Object.assign({}, BASE, mut), BASE);
  const sV = summarize(vM, 0);
  const d = paired(baseM, vM);
  console.log(name + ' | ' + d.wB.toFixed(1) + '→' + d.wV.toFixed(1) + ' | ' + (d.dGd >= 0 ? '+' : '') + d.dGd.toFixed(3) + (Math.abs(d.dGd) > d.ci ? '*' : ' ') + '±' + d.ci.toFixed(2) + ' | ' + (d.dGf >= 0 ? '+' : '') + d.dGf.toFixed(2) + ' | ' + (d.dGa >= 0 ? '+' : '') + d.dGa.toFixed(2) + ' | ' + sV.gf + '-' + sV.ga + ' | ' + sV.poss);
});
// 双轴硬门槛专测：mentality 0↔6 的 GF/GA 绝对差
const lo = runSet(Object.assign({}, BASE, { mentality: 0 }), BASE);
const hi = runSet(Object.assign({}, BASE, { mentality: 6 }), BASE);
const sLo = summarize(lo, 0), sHi = summarize(hi, 0);
console.log('');
console.log('双轴硬门槛: ment0 GF ' + sLo.gf + ' GA ' + sLo.ga + ' | ment6 GF ' + sHi.gf + ' GA ' + sHi.ga + ' → GA差 ' + (sHi.ga - sLo.ga).toFixed(2) + ' (门槛≥+0.15), GF差 ' + (sHi.gf - sLo.gf).toFixed(2));
