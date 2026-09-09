/* R4 敏感性矩阵核验：按专家配对口径（EVE主 vs WHU客，N=200/轴）复测关键轴
   用法：node reviews/scratch/sensitivity_r4.js */
'use strict';
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..', '..', 'game');
['data.js', 'tactics.js', 'engine.js'].forEach(f => eval(fs.readFileSync(path.join(G, 'js', f), 'utf8')));
const DATA = globalThis.GMD_DATA, TAC = globalThis.GMD_TACTICS, ENG = globalThis.GMD_ENGINE;
DATA.CLUBS.forEach(c => c.players.forEach((p, i) => { p.__uid = c.id + '-' + i; }));
function mkTeam(clubId, over) {
  const c = DATA.findClub(clubId);
  const t2 = TAC.autoPickXI(c.style.formation, c.players);
  t2.instr = TAC.tacticFromStyle(c.style).instr;
  Object.assign(t2.instr, over || {});
  return { name: c.name, clubId: c.id, tactic: t2, squad: c.players, ai: true };
}
function rep(aOver, bOver, seedBase, N) {
  let w = 0, gd = 0, ga = 0, gf = 0;
  for (let i = 0; i < N; i++) {
    const st = ENG.createMatch({ home: mkTeam('EVE', aOver), away: mkTeam('WHU', bOver), seed: seedBase + i });
    ENG.simulateToEnd(st);
    if (st.score[0] > st.score[1]) w++;
    gd += st.score[0] - st.score[1];
    ga += st.score[1]; gf += st.score[0];
  }
  return { w: w / N, gd: gd / N, ga: ga / N, gf: gf / N };
}
const N = 200, BASE = 91000;
const base = rep(null, null, BASE, N);
console.log(`基线 EVE(3/3官方) vs WHU: 胜率 ${Math.round(base.w * 100)}% GD ${base.gd.toFixed(2)} GF ${base.gf.toFixed(2)} GA ${base.ga.toFixed(2)}`);
function axis(name, over, metric) {
  const r = rep(over, null, BASE, N);
  const d = metric === 'gd' ? r.gd - base.gd : r.ga - base.ga;
  const mark = Math.abs(d) > 0.05 ? (d > 0 ? '↑' : '↓') : '≈';
  console.log(`  ${name.padEnd(22)} GD ${r.gd >= 0 ? '+' : ''}${r.gd.toFixed(2)} (Δ${d >= 0 ? '+' : ''}${d.toFixed(2)}) ${mark}  GA ${r.ga.toFixed(2)}`);
  return d;
}
console.log('\n=== 攻防双轴 ===');
const dAtt = axis('attPush 6', { attPush: 6 }, 'gd');
const attGa = rep({ attPush: 6 }, null, BASE, N).ga - base.ga;
console.log(`  attPush6 GA差 ${attGa >= 0 ? '+' : ''}${attGa.toFixed(2)} ${attGa >= 0.15 ? '✔门槛过' : '✘门槛未过'}`);
const dDef = axis('defBlock 6 + att1', { attPush: 1, defBlock: 6, line: 0 }, 'gd');
axis('defBlock 0', { defBlock: 0 }, 'gd');
console.log('\n=== 收益面轴（目标：高档↑低档↓，无倒挂无支配）===');
axis('press 3', { press: 3 }, 'gd');
const p0 = axis('press 0', { press: 0 }, 'gd');
axis('tempo 3', { tempo: 3 }, 'gd');
axis('tempo 0', { tempo: 0 }, 'gd');
axis('tackling 2', { tackling: 2 }, 'gd');
const t0 = axis('tackling 0', { tackling: 0 }, 'gd');
axis('counter', { counter: 1 }, 'gd');
axis('gegen(配合press2)', { gegen: 1 }, 'gd');
axis('focus 左', { focus: 'left' }, 'gd');
axis('focus 中', { focus: 'middle' }, 'gd');
axis('focus 右', { focus: 'right' }, 'gd');
axis('focus 两翼', { focus: 'flanks' }, 'gd');
axis('line 4', { line: 4 }, 'gd');
axis('line 0', { line: 0 }, 'gd');

console.log('\n=== 支配 stack（WHU 压满 vs EVE官方）===');
const stackRes = (over, oppOver) => {
  let w = 0, gd = 0;
  for (let i = 0; i < N; i++) {
    const st = ENG.createMatch({ home: mkTeam('WHU', over), away: mkTeam('EVE', oppOver), seed: 88000 + i });
    ENG.simulateToEnd(st);
    if (st.score[0] > st.score[1]) w++;
    gd += st.score[0] - st.score[1];
  }
  return { w: w / N, gd: gd / N };
};
const whuBase = stackRes(null, null);
const stacks = {
  '攻6/松散/慢/短传/counter/gegen': { attPush: 6, press: 0, tempo: 0, pass: 0, counter: 1, gegen: 1 },
  '全压满(att6/press3/tem3/tac2/cou/geg)': { attPush: 6, press: 3, pressZone: 2, tempo: 3, tackling: 2, counter: 1, gegen: 1 }
};
for (const [name, over] of Object.entries(stacks)) {
  const r = stackRes(over, null);
  const dw = r.w - whuBase.w, dgd = r.gd - whuBase.gd;
  console.log(`  ${name}: 胜率 ${Math.round(r.w * 100)}% (Δ${Math.round(dw * 100)}pp) GD ${r.gd.toFixed(2)} (Δ${dgd >= 0 ? '+' : ''}${dgd.toFixed(2)}) ${dgd <= 0.15 ? '✔' : '✘'}`);
}
console.log(`  （WHU官方基线：胜率 ${Math.round(whuBase.w * 100)}% GD ${whuBase.gd.toFixed(2)}）`);
