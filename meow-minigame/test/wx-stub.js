/* 浏览器测试桩：伪装 wx API（adapter 的桥接目标），本地冒烟测试小游戏版用。
   仅 test/ 目录使用，不进小游戏包。 */
'use strict';
window.__DEV__ = true;          // 打开 fork 里的调试钩子（__MS）
window.__store = {};            // 模拟 wx 存储
const __touchCbs = { start: [], move: [], end: [], cancel: [] };
window.wx = {
  getSystemInfoSync: () => ({ windowWidth: window.innerWidth, windowHeight: window.innerHeight, pixelRatio: 2 }),
  // 浏览器测试里屏幕画布走 document.getElementById('game')，离屏走 document.createElement，
  // 所以这里故意不提供 createCanvas（adapter 会走浏览器分支）
  onTouchStart: cb => __touchCbs.start.push(cb),
  onTouchMove: cb => __touchCbs.move.push(cb),
  onTouchEnd: cb => __touchCbs.end.push(cb),
  onTouchCancel: cb => __touchCbs.cancel.push(cb),
  getStorageSync: k => (k in window.__store) ? window.__store[k] : '',
  setStorageSync: (k, v) => { window.__store[k] = v; },
  removeStorageSync: k => { delete window.__store[k]; },
  showToast: o => { (window.__toasts = window.__toasts || []).push(o.title); console.log('[toast]', o && o.title); },
  canvasToTempFilePath: o => { if (o.success) o.success({ tempFilePath: 'test-report.png' }); },
  saveImageToPhotosAlbum: o => { (window.__toasts = window.__toasts || []).push('saved:' + o.filePath); if (o.success) o.success(); },
  showShareMenu: () => {},
  onShareAppMessage: () => {},
  onHide: cb => { (window.__hideCbs = window.__hideCbs || []).push(cb); },
  env: { USER_DATA_PATH: 'wxfile://usr' }
};
// 触摸全链路：wx.__fire → adapter 桥 → 画布 touch 事件 → MUI / 摇杆
window.wx.__fire = (type, x, y, id) => {
  id = id || 1;
  const t = { identifier: id, clientX: x, clientY: y, x, y };
  const e = { changedTouches: [t], touches: (type === 'end' || type === 'cancel') ? [] : [t], preventDefault() {} };
  (__touchCbs[type] || []).forEach(cb => cb(e));
};
