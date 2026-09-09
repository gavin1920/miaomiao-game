/* 微信开发者工具自动化冒烟测试
   前置：cli.bat auto --project <工程> --auto-port 9420
   运行：node smoke.js
   输出：连接/游戏上下文/存储/报错采集/截图 的检查结果（JSON） */
'use strict';
const automator = require('miniprogram-automator');

(async () => {
  const report = { steps: [], consoleMsgs: [], exceptions: [] };
  const mp = await automator.launch({
    cliPath: 'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat',
    projectPath: 'C:/Users/gavin/Desktop/Games/meow-minigame',
    port: 9421,
    timeout: 60000
  });
  report.steps.push('connect ✔');

  // 监听模拟器 console 与异常
  try {
    mp.on('console', msg => {
      if (msg.type === 'error' || msg.type === 'warn') {
        report.consoleMsgs.push(`${msg.type}: ${(msg.args || []).map(a => String(a && a.description ? a.description : a)).join(' ').slice(0, 120)}`);
      }
    });
    mp.on('exception', err => report.exceptions.push(String(err && err.message).slice(0, 120)));
    report.steps.push('listeners ✔');
  } catch (e) { report.steps.push('listeners ✖ ' + e.message); }

  // 1) 游戏上下文健全性（在游戏全局里执行）
  try {
    report.ctx = await mp.evaluate(() => {
      const cv = (typeof wx !== 'undefined' && wx.createCanvas) ? 'has-createCanvas' : 'no';
      let stubDoc = null;
      try { stubDoc = document.createElement.__stub === true; } catch (e) { stubDoc = 'err'; }
      const sys = (typeof wx !== 'undefined' && wx.getSystemInfoSync) ? wx.getSystemInfoSync() : {};
      return {
        hasWx: typeof wx !== 'undefined',
        hasGameGlobal: typeof GameGlobal !== 'undefined',
        docStub: stubDoc,
        viewport: [sys.windowWidth, sys.windowHeight],
        pixelRatio: sys.pixelRatio,
        best: wx.getStorageSync ? String(wx.getStorageSync('meow_best')).slice(0, 40) : 'n/a'
      };
    });
    report.steps.push('evaluate ✔');
  } catch (e) { report.ctx = 'evaluate ✖ ' + e.message; }

  // 2) 截图存档
  try {
    await mp.screenshot({ path: __dirname + '/smoke-shot.png' });
    report.steps.push('screenshot ✔ -> test/automator/smoke-shot.png');
  } catch (e) { report.steps.push('screenshot ✖ ' + e.message); }

  console.log(JSON.stringify(report, null, 2));
  await mp.disconnect();
  process.exit(0);
})().catch(e => { console.error('SMOKE-FAIL:', e.message); process.exit(1); });
