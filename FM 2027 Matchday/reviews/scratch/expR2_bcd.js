/* R2 实验 B/C/D：大巴转正 / 支配策略 / 红牌对照 / RNG污染 / AI开关 */
'use strict';
const H = require('./harness.js');
const { ENG, mkTeam, play, summarize } = H;
const N = 300;
function seedsOf(k) { const s = []; for (let i = 0; i < N; i++) s.push(k + i * 41); return s; }

function rep(label, homeDef, awayDef, seedBase) {
  const seeds = seedsOf(seedBase);
  const ms = [];
  for (let i = 0; i < N; i++) ms.push(play(mkTeam(homeDef.club, homeDef), mkTeam(awayDef.club, awayDef), seeds[i]));
  const s = summarize(ms, 0);
  console.log(label + ' | 胜/平/负 ' + s.w + '/' + s.d + '/' + s.l + ' (' + s.winPct + '%) 不败率 ' + (100 * (s.w + s.d) / N).toFixed(1) + '% | ' + s.gf + '-' + s.ga + ' | xG ' + s.xg + '-' + s.xga + ' | 反击 ' + s.counters + '/' + s.countersConc);
  return s;
}
const BUS = { formation: '5-4-1', instr: { mentality: 0, line: 0, press: 0, pressZone: 0, tempo: 0, pass: 1, attWidth: 1, defWidth: 0, focus: 'balanced', overlap: 0, tackling: 0, gkDist: 0, counter: 1, gegen: 0, timeWaste: 1, offside: 0 } };
const STD = { instr: { mentality: 3, line: 2, press: 1, pressZone: 1, tempo: 1, pass: 1, attWidth: 1, defWidth: 1, focus: 'balanced', overlap: 1, tackling: 1, gkDist: 0, counter: 0, gegen: 0, timeWaste: 0, offside: 0 } };
const META = { instr: { mentality: 6, line: 4, press: 0, pressZone: 0, tempo: 0, pass: 0, attWidth: 1, defWidth: 1, focus: 'balanced', overlap: 1, tackling: 0, gkDist: 0, counter: 1, gegen: 1, timeWaste: 0, offside: 0 } };
const METAr1 = { instr: { mentality: 6, line: 4, press: 2, pressZone: 2, tempo: 3, pass: 1, attWidth: 1, defWidth: 1, focus: 'balanced', overlap: 1, tackling: 1, gkDist: 0, counter: 1, gegen: 1, timeWaste: 0, offside: 0 } };

console.log('=== B: 大巴转正检验 ===');
rep('B1 BUR官方 vs MCI官方(主)', { club: 'BUR' }, { club: 'MCI' }, 31000);
rep('B2 BUR大巴 vs MCI官方', { club: 'BUR', formation: BUS.formation, instr: BUS.instr }, { club: 'MCI' }, 31000);
rep('B3 WHU官方 vs MCI官方', { club: 'WHU' }, { club: 'MCI' }, 31500);
console.log('=== B4: 支配策略复测 ===');
rep('B4.1 WHU官方 vs EVE官方', { club: 'WHU', instr: STD.instr }, { club: 'EVE' }, 32000);
rep('B4.2 WHU全攻+反击(R1式META) vs EVE官方', { club: 'WHU', instr: METAr1.instr }, { club: 'EVE' }, 32000);
rep('B4.3 WHU R2最优解(全攻+松散+短传+反击+反抢) vs EVE官方', { club: 'WHU', instr: META.instr }, { club: 'EVE' }, 32000);
rep('B4.4 EVE官方 vs WHU R2最优解(镜像)', { club: 'EVE' }, { club: 'WHU', instr: META.instr }, 32500);
rep('B4.5 MCI官方 vs WHU官方', { club: 'MCI' }, { club: 'WHU', instr: STD.instr }, 33000);
rep('B4.6 MCI官方 vs BUR官方', { club: 'MCI' }, { club: 'BUR' }, 33500);

/* C: 红牌配对对照 */
console.log('=== C: 红牌对照 (EVE主 vs WHU客) ===');
const seedsC = seedsOf(88000);
function redRun(nRed) {
  let gf = 0, ga = 0, w = 0, d = 0, l = 0, xga = 0;
  seedsC.forEach(s => {
    const h = mkTeam('EVE', {}), a = mkTeam('WHU', {});
    const st = ENG.createMatch({ home: h, away: a, seed: s });
    if (nRed > 0) {
      const outs = st.teams[0].rt.filter(r => r.on && r.slot.zone !== 'GK').slice(0, nRed);
      outs.forEach(r => { r.on = false; r.stats.red = 1; st.stats[0].red++; });
    }
    ENG.simulateToEnd(st);
    gf += st.score[0]; ga += st.score[1]; xga += st.stats[1].xg;
    if (st.score[0] > st.score[1]) w++; else if (st.score[0] === st.score[1]) d++; else l++;
  });
  console.log('红牌' + nRed + '张 | 胜/平/负 ' + w + '/' + d + '/' + l + ' (' + (100 * w / N).toFixed(1) + '%) | ' + (gf / N).toFixed(2) + '-' + (ga / N).toFixed(2) + ' | 对方xG ' + (xga / N).toFixed(2));
}
[0, 1, 2, 4].forEach(redRun);

/* C-RNG: 空patch + 换人 推帧不应改比分 */
let diff = 0;
for (let i = 0; i < 100; i++) {
  const a = play(mkTeam('ARS', {}), mkTeam('LIV', {}), 4000 + i);
  const b = ENG.createMatch({ home: mkTeam('ARS', {}), away: mkTeam('LIV', {}), seed: 4000 + i });
  let doneSub = false;
  while (!b.finished) {
    ENG.stepMinute(b);
    if (b.minute === 30 && !b.finished) ENG.patchTactic(b, 0, {});
    if (b.minute === 60 && !doneSub && !b.finished) {
      const out = b.teams[0].rt.find(r => r.on && r.slot.zone === 'MF');
      const inn = b.teams[0].rt.find(r => !r.on && !r.used);
      if (out && inn) { ENG.substitute(b, 0, out.uid, inn.uid); doneSub = true; }
    }
  }
  if (JSON.stringify(a.score) !== JSON.stringify(b.score)) diff++;
}
console.log('RNG复测: 100场同seed + 第30\'空patch + 第60\'换人(推帧) → 比分不同 ' + diff + ' 场（应为0）');

/* D: AI 开关对照 */
console.log('=== D: AI 复测 ===');
function d1(aiOn) {
  const seeds = seedsOf(61000);
  let trail60 = 0, comeW = 0, comeD = 0;
  seeds.forEach(s => {
    const st = ENG.createMatch({ home: mkTeam('WHU', { ai: false }), away: mkTeam('BUR', { ai: aiOn }), seed: s });
    ENG.simulateToEnd(st);
    let s60 = [0, 0];
    st.events.forEach(e => { if (e.type === 'goal' && e.min <= 60 && e.score) s60 = e.score.slice(); });
    if (s60[1] < s60[0]) { trail60++; const fin = st.score[1] - st.score[0]; if (fin > 0) comeW++; else if (fin === 0) comeD++; }
  });
  console.log('D1 BUR ai=' + (aiOn ? 'ON' : 'OFF') + ' | 60‘落后 ' + trail60 + ' 场 | 翻盘胜 ' + (100 * comeW / trail60).toFixed(1) + '% 追平 ' + (100 * comeD / trail60).toFixed(1) + '% 合计 ' + (100 * (comeW + comeD) / trail60).toFixed(1) + '%');
}
d1(true); d1(false);
function d2(aiOn, playerPush) {
  const seeds = seedsOf(62000);
  let lead75 = 0, blown = 0, conc75 = 0;
  seeds.forEach(s => {
    const st = ENG.createMatch({ home: mkTeam('WHU', { ai: aiOn }), away: mkTeam('EVE', { ai: false }), seed: s });
    while (!st.finished) {
      ENG.stepMinute(st);
      if (st.minute === 70 && playerPush && st.score[1] < st.score[0]) ENG.patchTactic(st, 1, { mentality: 6 });
    }
    let led = false;
    st.events.forEach(e => { if (e.type === 'goal' && e.min <= 75 && e.score && e.score[0] > e.score[1]) led = true; });
    if (led) { lead75++; if (st.score[0] <= st.score[1]) blown++; st.events.forEach(e => { if (e.type === 'goal' && e.team === 1 && e.min > 75) conc75++; }); }
  });
  console.log('D2 AI' + (aiOn ? 'ON' : 'OFF') + ' 玩家' + (playerPush ? '70’全攻' : '不调整  ') + ' | 75’曾领先 ' + lead75 + ' | 被翻盘率 ' + (100 * blown / lead75).toFixed(1) + '% (目标<25%) | 75’后失球 ' + (conc75 / lead75).toFixed(2));
}
d2(true, false); d2(true, true); d2(false, false);
