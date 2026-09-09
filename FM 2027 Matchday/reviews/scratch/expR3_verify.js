/* R3 收敛核验：敏感性核心轴 / 双轴门槛 / 大巴转正 / 支配stack / 红牌 / RNG */
'use strict';
const H = require('./harness.js');
const { ENG, TAC, mkTeam, play, summarize } = H;
const N = 250;
const seeds = []; for (let i = 0; i < N; i++) seeds.push(1000 + i * 37);
const BASE = TAC.emptyTactic('4-2-3-1').instr;
console.log('BASE instr keys:', JSON.stringify(BASE));
function runSet(hInstr, aInstr) {
  const out = [];
  for (let i = 0; i < N; i++) out.push(play(mkTeam('EVE', { instr: hInstr }), mkTeam('WHU', { instr: aInstr }), seeds[i]));
  return out;
}
function paired(baseM, vM) {
  let dGd = 0, dGf = 0, dGa = 0, wB = 0, wV = 0; const arr = [];
  for (let i = 0; i < baseM.length; i++) {
    const gdb = baseM[i].score[0] - baseM[i].score[1], gdv = vM[i].score[0] - vM[i].score[1];
    dGd += gdv - gdb; dGf += vM[i].score[0] - baseM[i].score[0]; dGa += vM[i].score[1] - baseM[i].score[1]; arr.push(gdv - gdb);
    if (gdb > 0) wB++; if (gdv > 0) wV++;
  }
  const n = baseM.length, mean = dGd / n;
  const sd = Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
  return { dGd: mean, ci: 1.96 * sd / Math.sqrt(n), dGf: dGf / n, dGa: dGa / n, wB: 100 * wB / n, wV: 100 * wV / n };
}
const baseM = runSet(BASE, BASE);
const sB = summarize(baseM, 0);
console.log('R3基准 EVE vs WHU 中性双轴(3/3): 胜率 ' + sB.winPct + '% ' + sB.gf + '-' + sB.ga + ' 控球 ' + sB.poss + '%');
const variants = [
  ['attPush 0', { attPush: 0 }], ['attPush 6', { attPush: 6 }],
  ['defBlock 0', { defBlock: 0 }], ['defBlock 6', { defBlock: 6 }],
  ['双满 6/6', { attPush: 6, defBlock: 6 }],
  ['press 0', { press: 0 }], ['press 3', { press: 3 }],
  ['tempo 0', { tempo: 0 }], ['tempo 3', { tempo: 3 }],
  ['tackling 0', { tackling: 0 }], ['tackling 2', { tackling: 2 }],
  ['pass 0', { pass: 0 }], ['pass 4', { pass: 4 }],
  ['counter 1', { counter: 1 }], ['gegen 1', { gegen: 1 }], ['counter+gegen', { counter: 1, gegen: 1 }],
  ['focus 左', { focus: 'left' }], ['focus 中', { focus: 'middle' }], ['focus 右', { focus: 'right' }], ['focus 两翼', { focus: 'flanks' }],
  ['line 0', { line: 0 }], ['line 4', { line: 4 }],
  ['gkDist 1', { gkDist: 1 }], ['offside 1', { offside: 1 }],
];
console.log('变量 | 胜率%(基→变) | ΔGD±CI | ΔGF | ΔGA');
variants.forEach(([name, mut]) => {
  const vM = runSet(Object.assign({}, BASE, mut), BASE);
  const d = paired(baseM, vM);
  console.log(name + ' | ' + d.wB.toFixed(1) + '→' + d.wV.toFixed(1) + ' | ' + (d.dGd >= 0 ? '+' : '') + d.dGd.toFixed(3) + (Math.abs(d.dGd) > d.ci ? '*' : ' ') + '±' + d.ci.toFixed(2) + ' | ' + (d.dGf >= 0 ? '+' : '') + d.dGf.toFixed(2) + ' | ' + (d.dGa >= 0 ? '+' : '') + d.dGa.toFixed(2));
});
// 双轴门槛正式版：attPush 6 的 GA 差（持球进攻方 GA = 失球）
const ap6 = runSet(Object.assign({}, BASE, { attPush: 6 }), BASE);
const s6 = summarize(ap6, 0);
console.log('\n双轴门槛: attPush6 GA ' + s6.ga + ' vs 基准 ' + sB.ga + ' → GA差 ' + (s6.ga - sB.ga).toFixed(2) + '（门槛≥+0.15）| GF差 ' + (s6.gf - sB.gf).toFixed(2));

/* 大巴转正：BUR 双轴大巴 vs MCI */
console.log('\n=== 大巴转正 ===');
const BUS3 = { formation: '5-4-1', instr: { attPush: 0, defBlock: 6, line: 0, press: 1, pressZone: 0, tempo: 0, pass: 1, attWidth: 1, defWidth: 0, focus: 'balanced', overlap: 0, tackling: 1, gkDist: 0, counter: 1, gegen: 0, timeWaste: 1, offside: 0 } };
function rep(label, homeDef, awayDef, sb) {
  const ss = []; for (let i = 0; i < N; i++) ss.push(sb + i * 41);
  const ms = [];
  for (let i = 0; i < N; i++) ms.push(play(mkTeam(homeDef.club, homeDef), mkTeam(awayDef.club, awayDef), ss[i]));
  const s = summarize(ms, 0);
  console.log(label + ' | 胜/平/负 ' + s.w + '/' + s.d + '/' + s.l + ' (' + s.winPct + '%) 不败 ' + (100 * (s.w + s.d) / N).toFixed(1) + '% | ' + s.gf + '-' + s.ga + ' | xG ' + s.xg + '-' + s.xga);
}
rep('BUR官方 vs MCI官方', { club: 'BUR' }, { club: 'MCI' }, 31000);
rep('BUR双轴大巴(att0/block6) vs MCI官方', { club: 'BUR', formation: BUS3.formation, instr: BUS3.instr }, { club: 'MCI' }, 31000);

/* 支配 stack */
console.log('\n=== 支配 stack ===');
rep('WHU官方 vs EVE官方', { club: 'WHU' }, { club: 'EVE' }, 32000);
const STACK = { instr: { attPush: 6, defBlock: 2, line: 1, press: 3, pressZone: 2, tempo: 3, pass: 0, attWidth: 1, defWidth: 1, focus: 'balanced', overlap: 1, tackling: 2, gkDist: 0, counter: 1, gegen: 1, timeWaste: 0, offside: 0 } };
rep('WHU R3压满stack vs EVE官方', { club: 'WHU', instr: STACK.instr }, { club: 'EVE' }, 32000);
const STACK2 = { instr: { attPush: 6, defBlock: 0, press: 0, pressZone: 0, tempo: 0, pass: 0, attWidth: 1, defWidth: 1, focus: 'balanced', overlap: 1, tackling: 0, gkDist: 0, counter: 1, gegen: 1, timeWaste: 0, offside: 0 } };
rep('WHU 反向stack(att6/def0/松散/慢) vs EVE官方', { club: 'WHU', instr: STACK2.instr }, { club: 'EVE' }, 32000);

/* 红牌 */
console.log('\n=== 红牌对照 ===');
const seedsC = []; for (let i = 0; i < N; i++) seedsC.push(88000 + i * 7);
function redRun(nRed) {
  let w = 0, d = 0, l = 0, ga = 0, xga = 0;
  seedsC.forEach(s => {
    const st = ENG.createMatch({ home: mkTeam('EVE', {}), away: mkTeam('WHU', {}), seed: s });
    if (nRed > 0) {
      const outs = st.teams[0].rt.filter(r => r.on && r.slot.zone !== 'GK').slice(0, nRed);
      outs.forEach(r => { r.on = false; r.stats.red = 1; st.stats[0].red++; });
    }
    ENG.simulateToEnd(st);
    ga += st.score[1]; xga += st.stats[1].xg;
    if (st.score[0] > st.score[1]) w++; else if (st.score[0] === st.score[1]) d++; else l++;
  });
  console.log('红牌' + nRed + ' | 胜率 ' + (100 * w / N).toFixed(1) + '% | 失球 ' + (ga / N).toFixed(2) + ' 对方xG ' + (xga / N).toFixed(2));
}
[0, 1, 2].forEach(redRun);

/* RNG */
let diff = 0;
for (let i = 0; i < 60; i++) {
  const a = play(mkTeam('ARS', {}), mkTeam('LIV', {}), 4000 + i);
  const b = ENG.createMatch({ home: mkTeam('ARS', {}), away: mkTeam('LIV', {}), seed: 4000 + i });
  let t = 0;
  while (!b.finished) { ENG.stepMinute(b); t++; if (t % 10 === 0 && !b.finished) { var ii=b.teams[0].tactic.instr; ENG.patchTactic(b,0,{attPush:ii.attPush,defBlock:ii.defBlock}); } }
  if (JSON.stringify(a.score) !== JSON.stringify(b.score)) diff++;
}
console.log('\nRNG: 同seed + 每10分钟一次"等效"patch(attPush:3，值未变但非空patch会推帧) → 比分不同 ' + diff + '/60');
console.log('注: patch 值相同但 changed=true 会推帧（viewRng），不应影响比分——此项应=0');
