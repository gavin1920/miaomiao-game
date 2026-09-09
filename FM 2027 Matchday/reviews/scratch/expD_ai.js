/* 实验D：AI 经理质量 —— 追分有效性 / 领先保守被剥削 / 换人情境盲区 */
'use strict';
const H = require('./harness.js');
const { ENG, mkTeam } = H;
const N = 300, seeds = []; for (let i = 0; i < N; i++) seeds.push(61000 + i * 17);

/* D1: BUR(弱,被测AI) vs WHU(强,哑AI)。BUR ai on/off，看 60 分钟时落后场的最终翻盘率 */
function d1(aiOn) {
  let trail60 = 0, comeW = 0, comeD = 0, gfLate = 0;
  seeds.forEach(s => {
    const h = mkTeam('WHU', { ai: false }), a = mkTeam('BUR', { ai: aiOn });
    const st = ENG.createMatch({ home: h, away: a, seed: s });
    // 手动跑：60分钟时不干预（ai off 的 BUR 完全静态）
    ENG.simulateToEnd(st);
    // 重建 60' 比分：从 events 找 60' 前进球
    let s60 = [0, 0];
    st.events.forEach(e => { if (e.type === 'goal' && e.min <= 60 && e.score) s60 = e.score.slice(); });
    const trail = s60[1] < s60[0];
    if (!trail) return;
    trail60++;
    const fin = st.score[1] - st.score[0];
    if (fin > 0) comeW++; else if (fin === 0) comeD++;
    st.events.forEach(e => { if (e.type === 'goal' && e.team === 1 && e.min > 60) gfLate++; });
  });
  console.log('D1 BUR ai=' + (aiOn ? 'ON ' : 'OFF') + ' | 60‘时落后 ' + trail60 + '/' + N + ' 场 | 翻盘胜 ' + comeW + ' (' + (100 * comeW / trail60).toFixed(1) + '%) 追平 ' + comeD + ' (' + (100 * comeD / trail60).toFixed(1) + '%) | 60‘后AI方进球 ' + (gfLate / trail60).toFixed(2) + '/场');
}
d1(true); d1(false);

/* D2: AI 领先保守是否被剥削。WHU(ai,领先方) vs EVE(玩家)。玩家 70' 落后时开全攻 mentality6。
   对照组：玩家不调整。再对照：WHU ai=false（完全静态）。看 75‘ 以后失球数。 */
function d2(playerPush, aiOn) {
  let lead75 = 0, conceded75 = 0, blown = 0;
  seeds.forEach(s => {
    const h = mkTeam('WHU', { ai: aiOn }), a = mkTeam('EVE', { ai: false });
    const st = ENG.createMatch({ home: h, away: a, seed: s });
    let patched = false;
    while (!st.finished) {
      ENG.stepMinute(st);
      if (st.minute === 70 && playerPush && st.score[1] < st.score[0]) {
        ENG.patchTactic(st, 1, { mentality: 6, line: 4, tempo: 3 });
        patched = true;
      }
    }
    // AI 主队是否曾在 75' 领先
    let led75 = false;
    st.events.forEach(e => { if (e.type === 'goal' && e.min <= 75 && e.score && e.score[0] > e.score[1]) led75 = true; });
    if (led75 && st.score[0] <= st.score[1]) blown++;
    if (led75) {
      lead75++;
      st.events.forEach(e => { if (e.type === 'goal' && e.team === 1 && e.min > 75) conceded75++; });
    }
  });
  console.log('D2 AI' + (aiOn ? 'ON ' : 'OFF') + ' 玩家' + (playerPush ? '70’全攻' : '不调整  ') + ' | AI曾领先至75‘ ' + lead75 + ' 场 | 75’后被进 ' + (conceded75 / lead75).toFixed(2) + '/场 | 被翻盘(75' + "'领先→不胜) " + blown + ' (' + (100 * blown / lead75).toFixed(1) + '%)');
}
d2(false, true); d2(true, true); d2(false, false); d2(true, false);

/* D3: AI 换人情境盲区实证：AI 方红牌后是否还按体能换人 / 是否有人被换上到已空缺位置 */
let redSubs = 0, redMatches = 0, chaseSubFw = 0;
seeds.forEach(s => {
  const st = ENG.createMatch({ home: mkTeam('ARS', { ai: true }), away: mkTeam('LIV', { ai: true }), seed: s });
  while (!st.finished) {
    ENG.stepMinute(st);
  }
  st.teams.forEach((t, sd) => {
    if (st.stats[sd].red > 0) {
      redMatches++;
      const subEv = st.events.filter(e => e.type === 'sub' && e.team === sd).length;
      if (subEv >= 5) redSubs++;
    }
  });
});
console.log('D3 AI方吃到红牌的比赛 ' + redMatches + ' 场，其中仍用满5名额(含体能换人) ' + redSubs + ' 场（无红牌特殊应对逻辑，代码证据：engine.js aiManager 仅 stamina<52 与落后/领先三分支）');
