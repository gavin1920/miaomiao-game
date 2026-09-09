/* 实验B4：支配策略验证 —— 全攻+反击 vs 各档位官方AI */
'use strict';
const H = require('./harness.js');
const { mkTeam, play, summarize } = H;
const N = 300;
const seeds = []; for (let i = 0; i < N; i++) seeds.push(55000 + i * 29);
function rep(label, homeDef, awayDef) {
  const ms = [];
  for (let i = 0; i < N; i++) ms.push(play(mkTeam(homeDef.club, homeDef), mkTeam(awayDef.club, awayDef), seeds[i]));
  const s = summarize(ms, 0);
  console.log(label + ' | 胜/平/负 ' + s.w + '/' + s.d + '/' + s.l + ' (' + s.winPct + '%) | ' + s.gf + '-' + s.ga + ' | xG ' + s.xg + '-' + s.xga + ' | 反击 ' + s.counters);
  return s;
}
const METAg = { instr: { mentality: 6, line: 4, press: 2, pressZone: 2, tempo: 3, pass: 1, attWidth: 1, defWidth: 1, focus: 'balanced', overlap: 1, tackling: 1, gkDist: 0, counter: 1, gegen: 1, timeWaste: 0, offside: 0 } };
const METAmid = { formation: '4-4-2', instr: Object.assign({}, METAg.instr) };

console.log('=== B4: 同一阵容(WHU 16人班底用WHU全队), 官方AI vs 官方AI+META唯一差异=玩家侧 ===');
rep('B4.1 WHU官方 vs MCI官方', { club: 'WHU' }, { club: 'MCI' });
rep('B4.2 WHU全攻+反击 vs MCI官方', { club: 'WHU', instr: METAg.instr }, { club: 'MCI' });
rep('B4.3 WHU官方 vs EVE官方', { club: 'WHU' }, { club: 'EVE' });
rep('B4.4 WHU全攻+反击 vs EVE官方', { club: 'WHU', instr: METAg.instr }, { club: 'EVE' });
rep('B4.5 EVE官方 vs MCI官方', { club: 'EVE' }, { club: 'MCI' });
rep('B4.6 EVE全攻+反击 vs MCI官方', { club: 'EVE', instr: METAg.instr }, { club: 'MCI' });
rep('B4.7 BUR官方 vs MCI官方', { club: 'BUR' }, { club: 'MCI' });
rep('B4.8 BUR全攻+反击 vs MCI官方', { club: 'BUR', instr: METAg.instr }, { club: 'MCI' });
rep('B4.9 MCI官方 vs WHU官方(方向对照)', { club: 'MCI' }, { club: 'WHU' });
rep('B4.10 MCI官方 vs WHU全攻+反击', { club: 'MCI' }, { club: 'WHU', instr: METAg.instr });
