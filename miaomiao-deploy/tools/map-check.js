/* 地图连通性校验：每张手工地图从出生点洪泛填充，验证可走区域连通、
   猫道两端接通可走区、没有大范围被误封的死区。
   用法: node tools/map-check.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* ---------- 最小 DOM/Canvas 桩（maps.js 构建期不需要真画布） ---------- */
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

const T = MAPS.T, CELL = MAPS.CELL;
let failed = false;

for (const m0 of MAPS.list) {
  if (m0.endless) continue; // 经典无限图不参与校验
  const m = m0;
  const gw = m.gw, gh = m.gh, grid = m.grid;
  /* ---- 地形行为断言（在第一张图上做一次） ---- */
  if (m.id === 'oldtown') {
    // 猫道：猫能走、敌人被挡
    if (!m.free(942, 700, true, 12) || m.free(942, 700, false, 12)) {
      console.error('✗ 猫道规则失效：敌人应被猫道挡住、玩家应能通过');
      failed = true;
    } else console.log('✓ 猫道规则：玩家可通行，敌人被阻挡');
    // 减速：公园草地 speed < 1，街道 = 1
    const gs = m.speedAt(2400, 2700), rs = m.speedAt(2400, 2325);
    if (!(gs < 1) || rs !== 1) {
      console.error(`✗ 减速规则失效：草地=${gs} 街道=${rs}`);
      failed = true;
    } else console.log(`✓ 减速规则：草地 ×${gs} · 街道 ×${rs}`);
    // 阻挡：楼宇内不可站
    if (m.free(820, 180, true, 12)) { // apt 屋顶内
      console.error('✗ 阻挡规则失效：建筑内部应不可通行');
      failed = true;
    } else console.log('✓ 阻挡规则：建筑/水面不可通行');
  }
  const idx = (x, y) => y * gw + x;
  // 统计
  let walkN = 0, slowN = 0, catN = 0, blockN = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === T.WALK) walkN++;
    else if (grid[i] === T.SLOW) slowN++;
    else if (grid[i] === T.CAT) catN++;
    else blockN++;
  }
  // 出生点必须在可走区
  const s = m.start;
  const sCode = m.code(s.x, s.y);
  if (sCode === T.BLOCK) { console.error(`✗ ${m.meta.name}: 出生点在阻挡物里！`); failed = true; }
  // 中心格可走不代表玩家能站：free() 的四周探测点可能落进邻近阻挡（贴墙/过窄开局就卡死）。
  // 用玩家身体碰撞复检：13 ≈ 玩家半径 16 × 0.8，与 main.js moveActor 一致
  const spawnFree = m.free(s.x, s.y, true, 13);
  if (!spawnFree) {
    console.error(`✗ ${m.meta.name}: 出生点过窄/贴墙（free() 失败），开局会被卡住`);
    failed = true;
  }
  // 洪泛（可走 + 减速 + 猫道，从出生点）
  const seen = new Uint8Array(grid.length);
  const q = [[Math.floor(s.x / CELL), Math.floor(s.y / CELL)]];
  seen[idx(q[0][0], q[0][1])] = 1;
  let reach = 0;
  while (q.length) {
    const [cx, cy] = q.pop();
    reach++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const i2 = idx(nx, ny);
      if (seen[i2] || grid[i2] === T.BLOCK) continue;
      seen[i2] = 1;
      q.push([nx, ny]);
    }
  }
  const openN = walkN + slowN + catN;
  const reachWalk = countIn(seen, grid, T.WALK), reachSlow = countIn(seen, grid, T.SLOW), reachCat = countIn(seen, grid, T.CAT);
  const pct = reach / openN * 100;
  const pctWalk = reachWalk / Math.max(1, walkN) * 100;
  const pctSlow = reachSlow / Math.max(1, slowN) * 100;
  // 猫道都应贴着可达区（能进出）
  let catOk = true;
  for (let gy = 0; gy < gh && catOk; gy++) for (let gx = 0; gx < gw; gx++) {
    const i2 = idx(gx, gy);
    if (grid[i2] !== T.CAT || seen[i2]) continue;
    console.error(`✗ ${m.meta.name}: 存在不可达的猫道格 (${gx * CELL},${gy * CELL})`);
    catOk = false; failed = true;
    break;
  }
  const ok = pct >= 92 && pctWalk >= 90 && pctSlow >= 88 && catOk && sCode !== T.BLOCK && spawnFree;
  if (!ok) failed = true;
  console.log(`${ok ? '✓' : '✗'} ${m.meta.emoji} ${m.meta.name} [${m.w}×${m.h}] ` +
    `可走${(pctWalk).toFixed(1)}% 减速${(pctSlow).toFixed(1)}% 猫道${catN}格 总连通${pct.toFixed(1)}% ` +
    `(阻挡${(blockN / grid.length * 100).toFixed(0)}%)`);
  if (pct < 92) console.error(`   连通率过低：可能有区域被封死`);
}

function countIn(arr, grid, code) {
  let n = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] && grid[i] === code) n++;
  return n;
}

process.exit(failed ? 1 : 0);
