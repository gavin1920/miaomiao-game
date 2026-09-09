/* 实验E0：官方战术全联赛双循环 380 场 → 对照 data/calibration/epl_baseline.csv */
'use strict';
const H = require('./harness.js');
const { DATA, mkTeam, play } = H;
let goals = 0, shots = 0, sot = 0, passOk = 0, passAtt = 0, corners = 0, fouls = 0, yell = 0, red = 0, n = 0;
const clubs = DATA.CLUBS.map(c => c.id);
let homeW = 0, draw = 0, goalsHome = 0, goalsAway = 0;
// 每对打 5 个种子以降噪（等效 190 对×5=950 场）
for (let k = 0; k < 5; k++) {
  clubs.forEach((h, i) => clubs.forEach((a, j) => {
    if (i === j) return;
    const st = play(mkTeam(h, {}), mkTeam(a, {}), 90000 + k * 1000 + i * 21 + j);
    const s0 = st.stats[0], s1 = st.stats[1];
    goals += st.score[0] + st.score[1]; goalsHome += st.score[0]; goalsAway += st.score[1];
    shots += s0.shots + s1.shots; sot += s0.sot + s1.sot;
    passOk += s0.passOk + s1.passOk; passAtt += s0.passAtt + s1.passAtt;
    corners += s0.corners + s1.corners; fouls += s0.fouls + s1.fouls;
    yell += s0.yellow + s1.yellow; red += s0.red + s1.red;
    if (st.score[0] > st.score[1]) homeW++; else if (st.score[0] === st.score[1]) draw++;
    n++;
  }));
}
console.log('样本 ' + n + ' 场（官方战术）');
console.log('指标 | 引擎实测 | 基线区间 | 判定');
console.log('场均总进球 | ' + (goals / n).toFixed(2) + ' | 2.6-3.0 | ' + (goals / n >= 2.6 && goals / n <= 3.0 ? 'PASS' : 'FAIL'));
console.log('场均射门(双队合计) | ' + (shots / n).toFixed(1) + ' | 22-26(单队11-13) | ' + (shots / n >= 22 && shots / n <= 26 ? 'PASS' : 'FAIL'));
console.log('场均射正(合计) | ' + (sot / n).toFixed(1) + ' | 8-10(单队4-5) | ' + (sot / n >= 8 && sot / n <= 10 ? 'PASS' : 'FAIL'));
console.log('传球成功率 | ' + (100 * passOk / passAtt).toFixed(1) + '% | 78-86% | ' + (passOk / passAtt >= 0.78 && passOk / passAtt <= 0.86 ? 'PASS' : 'FAIL'));
console.log('场均角球(合计) | ' + (corners / n).toFixed(1) + ' | 6-14(单队3-7) | ' + (corners / n >= 6 && corners / n <= 14 ? 'PASS' : 'FAIL'));
console.log('场均犯规(合计) | ' + (fouls / n).toFixed(1) + ' | 20-26(单队10-13) | ' + (fouls / n >= 20 && fouls / n <= 26 ? 'PASS' : 'FAIL'));
console.log('场均黄牌(合计) | ' + (yell / n).toFixed(2) + ' | 6-9(单队3-4.5) | ' + (yell / n >= 6 && yell / n <= 9 ? 'PASS' : 'FAIL'));
console.log('场均红牌(合计) | ' + (red / n).toFixed(3) + ' | 真实英超≈0.18 | ' + (red / n < 0.4 ? 'PASS' : 'FAIL'));
console.log('主胜/平/客胜 | ' + (100 * homeW / n).toFixed(1) + '%/' + (100 * draw / n).toFixed(1) + '%/' + (100 - homeW / n * 10 - draw / n * 10).toFixed(1) + '% | 真实≈45/26/29');
