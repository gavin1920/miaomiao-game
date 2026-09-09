/* 实验A：战术敏感性矩阵 —— 单指令隔离 + 配对种子 */
'use strict';
const H = require('./harness.js');
const { TAC, ENG, mkTeam, play, summarize } = H;

const BASE = TAC.emptyTactic('4-2-3-1').instr; // 中性基准
const HOME_CLUB = 'EVE', AWAY_CLUB = 'WHU';     // 实力相近中游队
const N = 300;
const seeds = []; for (let i = 0; i < N; i++) seeds.push(1000 + i * 37);

function runSet(homeInstr, awayInstr) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const h = mkTeam(HOME_CLUB, { instr: homeInstr });
    const a = mkTeam(AWAY_CLUB, { instr: awayInstr });
    out.push(play(h, a, seeds[i]));
  }
  return out;
}
function pairedDiff(baseM, varM) {
  // 配对差：主队净胜球差 / 进球差 / 失球差 + 胜率差
  let dGd = 0, dGf = 0, dGa = 0, wB = 0, wV = 0;
  const arr = [];
  for (let i = 0; i < baseM.length; i++) {
    const b = baseM[i], v = varM[i];
    const gdb = b.score[0] - b.score[1], gdv = v.score[0] - v.score[1];
    dGd += gdv - gdb; dGf += v.score[0] - b.score[0]; dGa += v.score[1] - b.score[1];
    arr.push(gdv - gdb);
    if (gdb > 0) wB++; if (gdv > 0) wV++;
  }
  const n = baseM.length, mean = dGd / n;
  const sd = Math.sqrt(arr.reduce((s, x) => s + (x - mean) * (x - mean), 0) / n);
  return { dGd: mean, se: sd / Math.sqrt(n), dGf: dGf / n, dGa: dGa / n, wB: 100 * wB / n, wV: 100 * wV / n };
}

const variants = [
  ['mentality 0 (全力防守)', { mentality: 0 }],
  ['mentality 2 (谨慎)', { mentality: 2 }],
  ['mentality 4 (积极)', { mentality: 4 }],
  ['mentality 6 (全力进攻)', { mentality: 6 }],
  ['line 0 (很低)', { line: 0 }],
  ['line 1 (低)', { line: 1 }],
  ['line 3 (高)', { line: 3 }],
  ['line 4 (极高)', { line: 4 }],
  ['press 0 (松散)', { press: 0 }],
  ['press 3 (疯狂)', { press: 3 }],
  ['pressZone 0 (本方半场)', { pressZone: 0 }],
  ['pressZone 2 (对方半场)', { pressZone: 2 }],
  ['tempo 0 (慢)', { tempo: 0 }],
  ['tempo 3 (极快)', { tempo: 3 }],
  ['pass 0 (极短传)', { pass: 0 }],
  ['pass 4 (长传冲吊)', { pass: 4 }],
  ['attWidth 0 (窄)', { attWidth: 0 }],
  ['attWidth 2 (宽)', { attWidth: 2 }],
  ['defWidth 0 (收缩)', { defWidth: 0 }],
  ['defWidth 2 (拉开)', { defWidth: 2 }],
  ['focus 左路', { focus: 'left' }],
  ['focus 中路', { focus: 'middle' }],
  ['focus 两翼', { focus: 'flanks' }],
  ['overlap 0 (不套上)', { overlap: 0 }],
  ['overlap 2 (频繁)', { overlap: 2 }],
  ['tackling 0 (温和)', { tackling: 0 }],
  ['tackling 2 (凶狠)', { tackling: 2 }],
  ['gkDist 1 (门将长传)', { gkDist: 1 }],
  ['counter 1 (反击开)', { counter: 1 }],
  ['gegen 1 (反抢开)', { gegen: 1 }],
  ['offside 1 (越位陷阱)', { offside: 1 }],
  ['timeWaste 1 (拖延)', { timeWaste: 1 }],
];

console.log('基准: EVE(主) vs WHU(客) 双方中性 4-2-3-1, N=' + N + ' 配对种子');
const baseM = runSet(BASE, BASE);
const sB = summarize(baseM, 0);
console.log('基准主队: 胜率 ' + sB.winPct + '% 均分 ' + sB.gf + '-' + sB.ga + ' xG ' + sB.xg + '-' + sB.xga +
  ' 射门 ' + sB.shots + ' 控球 ' + sB.poss + '% 反击 ' + sB.counters + '/被反击 ' + sB.countersConc);
console.log('');
console.log('变量 | 胜率%(基→变) | Δ净胜/场(±95CI) | Δ进球 | Δ失球 | 变体 GF-GA | xG | 被反击/场 | 控球%');
variants.forEach(([name, mut]) => {
  const vM = runSet(Object.assign({}, BASE, mut), BASE);
  const sV = summarize(vM, 0);
  const d = pairedDiff(baseM, vM);
  const ci = (1.96 * d.se).toFixed(2);
  const sig = Math.abs(d.dGd) > 1.96 * d.se ? '*' : ' ';
  console.log(
    name + ' | ' + d.wB.toFixed(1) + '→' + d.wV.toFixed(1) +
    ' | ' + (d.dGd >= 0 ? '+' : '') + d.dGd.toFixed(3) + sig + '±' + ci +
    ' | ' + (d.dGf >= 0 ? '+' : '') + d.dGf.toFixed(2) +
    ' | ' + (d.dGa >= 0 ? '+' : '') + d.dGa.toFixed(2) +
    ' | ' + sV.gf + '-' + sV.ga +
    ' | ' + sV.xg + ' | ' + sV.countersConc +
    ' | ' + sV.poss
  );
});
