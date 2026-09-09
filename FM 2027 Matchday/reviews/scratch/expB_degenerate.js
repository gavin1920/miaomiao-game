/* 实验B：退化策略搜索 —— 摆大巴/全攻/反击开关/支配策略 */
'use strict';
const H = require('./harness.js');
const { TAC, mkTeam, play, summarize } = H;
const N = 300;
const seeds = []; for (let i = 0; i < N; i++) seeds.push(31000 + i * 41);
function rep(label, homeDef, awayDef, side) {
  const ms = [];
  for (let i = 0; i < N; i++) ms.push(play(mkTeam(homeDef.club, homeDef), mkTeam(awayDef.club, awayDef), seeds[i]));
  const s = summarize(ms, side || 0);
  console.log(label + ' | 胜/平/负 ' + s.w + '/' + s.d + '/' + s.l + ' (' + s.winPct + '%) | 均分 ' + s.gf + '-' + s.ga + ' | xG ' + s.xg + '-' + s.xga + ' | 反击 ' + s.counters + '/被反 ' + s.countersConc + ' | 射门 ' + s.shots);
  return s;
}
const OFFICIAL = {}; // 官方战术 = 不给 instr 覆盖
const BUS = { formation: '5-4-1', instr: { mentality: 0, line: 0, press: 0, pressZone: 0, tempo: 0, pass: 1, attWidth: 1, defWidth: 0, focus: 'balanced', overlap: 0, tackling: 0, gkDist: 0, counter: 1, gegen: 0, timeWaste: 1, offside: 0 } };
const BUS_NOCOUNTER = Object.assign({}, BUS, { instr: Object.assign({}, BUS.instr, { counter: 0 }) });
const ALLout = { formation: '4-2-4', instr: { mentality: 6, line: 4, press: 2, pressZone: 2, tempo: 3, pass: 2, attWidth: 2, defWidth: 1, focus: 'flanks', overlap: 2, tackling: 1, gkDist: 0, counter: 0, gegen: 1, timeWaste: 0, offside: 0 } };
const STD = { instr: { mentality: 3, line: 2, press: 1, pressZone: 1, tempo: 1, pass: 1, attWidth: 1, defWidth: 1, focus: 'balanced', overlap: 1, tackling: 1, gkDist: 0, counter: 0, gegen: 0, timeWaste: 0, offside: 0 } };
const STD_COUNTER = { instr: Object.assign({}, STD.instr, { counter: 1 }) };

console.log('=== B1 弱队求生: BUR(官方) vs MCI(官方) 及大巴变体, N=' + N + ' ===');
rep('B1.0 BUR官方(客视角主队=BUR在主场)', { club: 'BUR' }, { club: 'MCI' });
rep('B1.1 BUR僵尸大巴+反击', { club: 'BUR', formation: BUS.formation, instr: BUS.instr }, { club: 'MCI' });
rep('B1.2 BUR大巴但不开反击', { club: 'BUR', formation: BUS.formation, instr: BUS_NOCOUNTER.instr }, { club: 'MCI' });
rep('B1.3 BUR官方+仅开反击', { club: 'BUR', instr: STD_COUNTER.instr }, { club: 'MCI' });
console.log('');
console.log('=== B1b BUR大巴 vs 中游 WHU/=== ');
rep('B1b.0 BUR官方 vs WHU官方', { club: 'BUR' }, { club: 'WHU' });
rep('B1b.1 BUR大巴 vs WHU官方', { club: 'BUR', formation: BUS.formation, instr: BUS.instr }, { club: 'WHU' });
rep('B1b.2 WHU官方+开反击 vs BUR大巴', { club: 'WHU', instr: STD_COUNTER.instr }, { club: 'BUR', formation: BUS.formation, instr: Object.assign({}, BUS.instr, { counter: 1 }) });
console.log('');
console.log('=== B2 剪刀石头布? 同为WHU互打, N=' + N + ' ===');
rep('B2.a 全攻4-2-4 vs 标准', { club: 'WHU', formation: ALLout.formation, instr: ALLout.instr }, { club: 'WHU', instr: STD.instr });
rep('B2.b 标准 vs 大巴5-4-1', { club: 'WHU', instr: STD.instr }, { club: 'WHU', formation: BUS.formation, instr: BUS.instr });
rep('B2.c 大巴5-4-1 vs 全攻4-2-4', { club: 'WHU', formation: BUS.formation, instr: BUS.instr }, { club: 'WHU', formation: ALLout.formation, instr: ALLout.instr });
rep('B2.d 标准+反击 vs 标准', { club: 'WHU', instr: STD_COUNTER.instr }, { club: 'WHU', instr: STD.instr });
rep('B2.e 标准+反击 vs 标准+反击', { club: 'WHU', instr: STD_COUNTER.instr }, { club: 'WHU', instr: STD_COUNTER.instr });
rep('B2.f 全攻 vs 全攻', { club: 'WHU', formation: ALLout.formation, instr: ALLout.instr }, { club: 'WHU', formation: ALLout.formation, instr: ALLout.instr });
console.log('');
console.log('=== B3 强弱重复对局合理性, N=' + N + ' ===');
rep('B3.a MCI官方(主) vs BUR官方', { club: 'MCI' }, { club: 'BUR' });
rep('B3.b ARS官方(主) vs ARS官方(镜像)', { club: 'ARS' }, { club: 'ARS' });
rep('B3.c ARS官方(主) vs EVE官方', { club: 'ARS' }, { club: 'EVE' });
