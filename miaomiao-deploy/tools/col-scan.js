/* 碰撞/视觉一致性扫描：逐格比对 grid 的 BLOCK 与地面绘制/精灵视觉占地，
   报告「视觉开阔但实际 BLOCK」的隐形墙候选聚类，以及反向的「画了墙但能走」聚类。
   用法: node tools/col-scan.js */
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
  console, performance, URLSearchParams, setTimeout, clearTimeout,
  setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 1,
  localStorage: { getItem: () => null, setItem() {} },
  location: { search: '', href: 'http://localhost/t' },
  navigator: { userAgent: 'node' },
  document: {
    hidden: false, fonts: null,
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
const T = MAPS.T, CELL = MAPS.CELL;
const S = MAPS.sprites; // 烘焙精灵表（maps.js 导出）

/* 地面绘制 op 的视觉类别：1 = 画的是「不可通过」的东西（墙/水/建筑/围栏/轨道/岩石），0 = 开阔地面 */
const BLOCK_VIS = new Set(['wall', 'water', 'bld', 'fence', 'hedge', 'hedgeDark', 'rockwall', 'track', 'roundrock']);

function clusters(cells, gw) {
  const out = [];
  const seen = new Set();
  for (const i0 of cells) {
    if (seen.has(i0)) continue;
    const q = [i0]; seen.add(i0);
    let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    while (q.length) {
      const i = q.pop(); n++;
      const cx = i % gw, cy = (i / gw) | 0;
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (dx === -1 && cx === 0) continue;
        if (dx === 1 && cx === gw - 1) continue;
        const j = i + dy * gw + dx;
        if (cells.has(j) && !seen.has(j)) { seen.add(j); q.push(j); }
      }
    }
    out.push({ n, x0: x0 * CELL, y0: y0 * CELL, x1: (x1 + 1) * CELL, y1: (y1 + 1) * CELL });
  }
  return out.sort((a, b) => b.n - a.n);
}

for (const m of MAPS.list) {
  if (m.endless) continue;
  m.init(); // 烘焙精灵表，供读取视觉尺寸
  const gw = m.gw, gh = m.gh, N = gw * gh;
  const vis = new Uint8Array(N); // 0 开阔 · 1 阻挡视觉 · 2 精灵视觉占地
  const stampRect = (x, y, w, h, v) => {
    const x1 = x + w, y1 = y + h;
    for (let gy = Math.max(0, (y / CELL | 0)); gy <= Math.min(gh - 1, ((y1 - 0.01) / CELL | 0)); gy++) {
      for (let gx = Math.max(0, (x / CELL | 0)); gx <= Math.min(gw - 1, ((x1 - 0.01) / CELL | 0)); gx++) {
        const px = gx * CELL + CELL / 2, py = gy * CELL + CELL / 2;
        if (px >= x && px <= x1 && py >= y && py <= y1) vis[gy * gw + gx] = v;
      }
    }
  };
  for (const op of m.ops) {
    const blocking = BLOCK_VIS.has(op.k) ? 1 : 0;
    if (op.k === 'roundcourt' || op.k === 'roundrock') {
      const r = op.r, r2 = r * r;
      for (let gy = Math.max(0, ((op.y - r) / CELL | 0)); gy <= Math.min(gh - 1, ((op.y + r) / CELL | 0)); gy++) {
        for (let gx = Math.max(0, ((op.x - r) / CELL | 0)); gx <= Math.min(gw - 1, ((op.x + r) / CELL | 0)); gx++) {
          const px = gx * CELL + CELL / 2, py = gy * CELL + CELL / 2;
          if ((px - op.x) * (px - op.x) + (py - op.y) * (py - op.y) <= r2) vis[gy * gw + gx] = blocking;
        }
      }
      continue;
    }
    stampRect(op.x, op.y, op.w || 60, op.h || 60, blocking);
  }
  /* 精灵视觉占地（世界矩形 = 画布半宽/半高，锚点脚底 y+6；flat() 的贴地精灵不算立体物） */
  const flatSpr = new Set(m.ops.filter(o => o.k === 'spr').map(o => o.spr));
  for (const d of m.decor) {
    const img = typeof d.spr === 'string' ? S[d.spr] : d.spr;
    if (!img || !img.width || flatSpr.has(d.spr)) continue;
    const w = img.width / 2 * d.sx, h = img.height / 2 * d.sy;
    const rx0 = d.x - w / 2, rx1 = d.x + w / 2, ry0 = d.y + 6 - h, ry1 = d.y + 6;
    for (let gy = Math.max(0, (ry0 / CELL | 0)); gy <= Math.min(gh - 1, ((ry1 - 0.01) / CELL | 0)); gy++) {
      for (let gx = Math.max(0, (rx0 / CELL | 0)); gx <= Math.min(gw - 1, ((rx1 - 0.01) / CELL | 0)); gx++) {
        const px = gx * CELL + CELL / 2, py = gy * CELL + CELL / 2;
        if (px >= rx0 && px <= rx1 && py >= ry0 && py <= ry1) vis[gy * gw + gx] = 2;
      }
    }
  }
  /* 隐形墙候选：BLOCK 且既无阻挡视觉、也没有任何精灵视觉覆盖；反向：画了墙但能走 */
  const hidden = new Set(), ghost = new Set();
  let blockN = 0;
  for (let i = 0; i < N; i++) {
    if (m.grid[i] === T.BLOCK) blockN++;
    if (m.grid[i] === T.BLOCK && vis[i] === 0) hidden.add(i);
    if (m.grid[i] !== T.BLOCK && vis[i] === 1) ghost.add(i);
  }
  const hc = clusters(hidden, gw), gc = clusters(ghost, gw);
  console.log(`\n==== ${m.meta.emoji} ${m.meta.name} [${m.w}x${m.h}] ====`);
  console.log(`隐形墙候选: ${hidden.size}格 (${(hidden.size / N * 100).toFixed(2)}% 全图, 占阻挡 ${(hidden.size / Math.max(1, blockN) * 100).toFixed(1)}%) · 聚类 ${hc.length}; 画墙能走: ${ghost.size}格 · 聚类 ${gc.length}`);
  for (const c of hc.slice(0, 30)) {
    console.log(`  隐形墙 ${String(c.n).padStart(4)}格 (${c.x0},${c.y0})~(${c.x1},${c.y1}) 中心(${Math.round((c.x0 + c.x1) / 2)},${Math.round((c.y0 + c.y1) / 2)})`);
  }
  for (const c of gc.slice(0, 12)) {
    console.log(`  画墙能走 ${String(c.n).padStart(4)}格 (${c.x0},${c.y0})~(${c.x1},${c.y1}) 中心(${Math.round((c.x0 + c.x1) / 2)},${Math.round((c.y0 + c.y1) / 2)})`);
  }
}
