/* 喵都幸存者 - 工具函数 */
'use strict';
const U = {
  TAU: Math.PI * 2,
  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp(a, b, t) { return a + (b - a) * t; },
  rand(a, b) { return a + Math.random() * (b - a); },
  randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
  pick(arr) { return arr[(Math.random() * arr.length) | 0]; },
  chance(p) { return Math.random() < p; },
  dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; },
  // 从数组中不重复地取 n 个（返回索引数组）
  pickIndices(len, n) {
    const idx = [];
    for (let i = 0; i < len; i++) idx.push(i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    return idx.slice(0, n);
  },
  swapRemove(arr, i) { arr[i] = arr[arr.length - 1]; arr.pop(); },
  fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  },
  // 大数字中文化：1.23万 / 2.05亿（结算伤害、DPS 用）
  fmtNum(v) {
    v = Math.round(v || 0);
    if (v >= 1e8) return (Math.round(v / 1e6) / 100) + '亿';
    if (v >= 1e4) return (Math.round(v / 100) / 100) + '万';
    return '' + v;
  },
  // 确定性哈希（地图 chunk 用），返回 0..1
  hash2(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 1442695040888963) | 0;
    h = (h ^ (h >> 13)) * 1274126177 | 0;
    h = h ^ (h >> 16);
    return (h >>> 0) / 4294967295;
  },
  storage: {
    get(key, def) {
      try { const v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); }
      catch (e) { return def; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 无痕模式等 */ }
    }
  },
  // 把 angle 规范到 [-PI, PI]
  angNorm(a) { while (a > Math.PI) a -= U.TAU; while (a < -Math.PI) a += U.TAU; return a; }
};
