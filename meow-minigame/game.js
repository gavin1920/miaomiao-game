/* 喵都幸存者 · 微信小游戏版入口
   游戏本体在 game-js/（sync 脚本从 miaomiao-deploy 同步），适配层把 wx 伪装成浏览器环境，
   全部源文件按浏览器 script 标签的语义拼接进 bundle.js（顶层 const 跨文件可见）。 */
require('./bundle.js');

/* ---- 微信社交能力（浏览器桩下这些调用被安全跳过） ---- */
if (typeof wx !== 'undefined') {
  if (wx.showShareMenu) wx.showShareMenu({});
  if (wx.onShareAppMessage) {
    wx.onShareAppMessage(() => ({
      title: '喵都幸存者：带上大橘，今夜守卫喵都！',
      query: 'from=share'
    }));
  }
}
