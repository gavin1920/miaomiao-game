/* 实验C2补：红牌代价的配对对照 + RNG污染批量验证 */
'use strict';
const H = require('./harness.js');
const { ENG, mkTeam } = H;
const N = 300, seeds = []; for (let i = 0; i < N; i++) seeds.push(88000 + i * 7);

function run(nRed) {
  let gf = 0, ga = 0, w = 0, d = 0, l = 0, xg = 0, xga = 0, shots = 0;
  seeds.forEach(s => {
    const h = mkTeam('EVE', {}), a = mkTeam('WHU', {});
    const st = ENG.createMatch({ home: h, away: a, seed: s });
    if (nRed > 0) {
      const outs = st.teams[0].rt.filter(r => r.on && r.slot.zone !== 'GK').slice(0, nRed);
      outs.forEach(r => { r.on = false; r.stats.red = 1; st.stats[0].red++; });
    }
    ENG.simulateToEnd(st);
    gf += st.score[0]; ga += st.score[1]; xg += st.stats[0].xg; xga += st.stats[1].xg; shots += st.stats[0].shots;
    if (st.score[0] > st.score[1]) w++; else if (st.score[0] === st.score[1]) d++; else l++;
  });
  console.log('红牌' + nRed + '张 | 胜/平/负 ' + w + '/' + d + '/' + l + ' (' + (100 * w / N).toFixed(1) + '%) | 均分 ' + (gf / N).toFixed(2) + '-' + (ga / N).toFixed(2) + ' | 己方xG ' + (xg / N).toFixed(2) + ' 对方xG ' + (xga / N).toFixed(2) + ' | 己射门 ' + (shots / N).toFixed(1));
}
[0, 1, 2, 3, 4].forEach(run);

/* RNG 污染批量：同 seed，其中一方在第30分钟做一次"空战术调整"(UI 必然触发 pushFrame) */
let diffScore = 0, diffEvents = 0;
for (let i = 0; i < 100; i++) {
  const a = ENG.createMatch({ home: mkTeam('ARS', {}), away: mkTeam('LIV', {}), seed: 4000 + i });
  ENG.simulateToEnd(a);
  const b = ENG.createMatch({ home: mkTeam('ARS', {}), away: mkTeam('LIV', {}), seed: 4000 + i });
  while (!b.finished) {
    ENG.stepMinute(b);
    if (b.minute === 30 && !b.finished) ENG.patchTactic(b, 0, {});
  }
  if (JSON.stringify(a.score) !== JSON.stringify(b.score)) diffScore++;
  if (a.events.length !== b.events.length) diffEvents++;
}
console.log('RNG污染: 100场同seed，仅第30分钟多一次空 patchTactic → 比分不同 ' + diffScore + '%, 事件数不同 ' + diffEvents + '%');
