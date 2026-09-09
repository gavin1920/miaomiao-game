/* 性能专项：1000场计时 / rng预算分解 / compileTeam 单次成本 / frames 内存 */
'use strict';
const H = require('./harness.js');
const { ENG, mkTeam } = H;

/* 1000 场计时（含建队） */
let t0 = Date.now();
for (let i = 0; i < 1000; i++) {
  ENG.simulateToEnd(ENG.createMatch({ home: mkTeam('ARS', {}), away: mkTeam('LIV', {}), seed: i }));
}
let built = Date.now() - t0;
t0 = Date.now();
const st0 = ENG.createMatch({ home: mkTeam('ARS', {}), away: mkTeam('LIV', {}), seed: 1 });
for (let i = 0; i < 1000; i++) {
  const st = ENG.createMatch({ home: mkTeam('ARS', {}), away: mkTeam('LIV', {}), seed: i });
  while (!st.finished) ENG.stepMinute(st);
}
console.log('1000场(含createMatch): ' + built + 'ms → ' + (built / 1000).toFixed(2) + 'ms/场; 纯stepMinute循环: ' + (Date.now() - t0) + 'ms');

/* rng 预算：单场分解（数 pushFrame 消耗占比） */
const st = ENG.createMatch({ home: mkTeam('ARS', {}), away: mkTeam('LIV', {}), seed: 42 });
let total = 0, simOnly = 0, lastMinuteCount = 0, minuteLog = [];
const origRng = st.rng;
st.rng = function () { total++; lastMinuteCount++; return origRng(); };
while (!st.finished) { lastMinuteCount = 0; ENG.stepMinute(st); minuteLog.push(lastMinuteCount); }
const avgMinute = minuteLog.reduce((a, b) => a + b, 0) / minuteLog.length;
console.log('单场rng总消耗 ' + total + ' (' + (total / st.minute).toFixed(1) + '/分钟)');

/* pushFrame 单独测量：构造 state 后只调 pushFrame（用空 compileTeam 调用路径） */
const st2 = ENG.createMatch({ home: mkTeam('ARS', {}), away: mkTeam('LIV', {}), seed: 42 });
let pf = 0; const orig2 = st2.rng; st2.rng = function () { pf++; return orig2(); };
const cA = ENG.compileTeam(st2, 0), cB = ENG.compileTeam(st2, 1);
// pushFrame 未导出，等价复现：simulate 1 minute 但屏蔽其他消耗不可行 → 改为测量差值：
// 无帧版本不存在。改用近似：帧内 rng = 每名球员1次 + ballXY 2-4 次
console.log('pushFrame(单帧) rng 消耗（stepMinute 1 次含帧）: 用 compileTeam 后手动 step 1 次 = ' + (() => { let n = 0; const o = st2.rng; st2.rng = () => { n++; return o(); }; ENG.stepMinute(st2); return n; })() + ' 次（其中帧≈' + (22 + 2) + '-26）');

/* compileTeam 单次耗时 */
const st3 = ENG.createMatch({ home: mkTeam('ARS', {}), away: mkTeam('LIV', {}), seed: 42 });
t0 = Date.now();
for (let i = 0; i < 20000; i++) { ENG.compileTeam(st3, 0); ENG.compileTeam(st3, 1); }
console.log('compileTeam×40000: ' + (Date.now() - t0) + 'ms → ' + ((Date.now() - t0) / 40000 * 1000).toFixed(1) + 'µs/次；每场约被调 ' + (st.minute * 2 + 2) + '+ 次（tick2 + findAssister/定位球等）');

/* frames 内存估算 */
const json = JSON.stringify(st.frames);
console.log('frames: ' + st.frames.length + ' 帧, JSON 体积 ' + (json.length / 1024).toFixed(1) + ' KB/场（内存占用约同量级×2）');

/* 每分钟 rng 分布（找异常峰值） */
minuteLog.sort((a, b) => b - a);
console.log('单分钟rng: 最大 ' + minuteLog[0] + ' 中位 ' + minuteLog[Math.floor(minuteLog.length / 2)] + ' 最小 ' + minuteLog[minuteLog.length - 1]);
