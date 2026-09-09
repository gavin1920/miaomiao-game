/* 打印每张手工地图的 1:1 像素尺寸：每行「id 宽 高」。
   供 tools/export-maps.sh 按尺寸开无头浏览器窗口截图（maps.js 构建期不需要真画布，
   用与 map-check.js 相同的最小 DOM/Canvas 桩）。
   用法: node tools/map-sizes.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const noop = () => undefined;
function makeCtx() {
  const target = {
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 42 }),
    canvas: { width: 0, height: 0 }
  };
  return new Proxy(target, {
    get(o, k) { if (k in o) return o[k]; return noop; },
    set(o, k, v) { o[k] = v; return true; }
  });
}
const sandbox = {
  console, performance,
  URLSearchParams,
  setTimeout, clearTimeout,
  setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 1,
  localStorage: { getItem: () => null, setItem() {} },
  location: { search: '', href: 'http://localhost/t' },
  navigator: { userAgent: 'node' },
  document: {
    hidden: false,
    fonts: null,
    body: { appendChild() {} },
    getElementById: () => ({ getContext: makeCtx, width: 0, height: 0, style: {} }),
    createElement: () => ({ width: 0, height: 0, getContext: makeCtx, style: {} }),
    addEventListener() {}
  },
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of ['js/util.js', 'js/art.js', 'js/maps.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
const { MAPS } = vm.runInContext('({ MAPS })', sandbox);

for (const m of MAPS.list) {
  if (m.endless) continue; // 无限网格没有 1:1 全图
  console.log(m.id, m.w, m.h);
}
