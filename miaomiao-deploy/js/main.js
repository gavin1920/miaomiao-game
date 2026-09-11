/* 喵都幸存者 - 游戏主程序 */
'use strict';
(() => {
  const { WEAPONS, WEAPON_ORDER, PASSIVES, PASSIVE_ORDER, ENEMIES, STAMP_META, STAMP_ORDER } = DATA;
  const DEV = /[?&]dev=1/.test(location.search);
  const AUTO = DEV ? new URLSearchParams(location.search).get('auto') : null;
  const TAU = U.TAU;

  /* ================= 画布与视口 ================= */
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let vw = 0, vh = 0, dpr = 1, vignette = null;
  let zoom = 1, worldW = 0, worldH = 0; // 世界层缩放：小屏缩小世界保证视野；worldW/H 为可视范围对应的世界尺寸
  /* 意见1（第三版）：整体缩放档位。1X = 当前视野（小屏优先保证可视范围）；4X = 旧版大小
     （视野 4 倍化改版前的角色尺寸，即世界缩放 ×2，档位在 1X~4X 间线性过渡）。
     意见3（第五版）：档位精简为 1→2→4 三档循环；悬浮钮移入 ⚙ 设置抽屉。 */
  const ZOOM_LV = [1, 2, 4];
  let userZoom = U.storage.get('meow_zoom', 1);
  if (!ZOOM_LV.includes(userZoom)) userZoom = 1;
  /* 意见2（第三版）：游戏加速档位 1X/2X/3X（只作用游戏逻辑时间，演出与菜单不受影响） */
  const SPD_LV = [1, 2, 3];
  let gameSpeed = U.storage.get('meow_speed', 1);
  if (!SPD_LV.includes(gameSpeed)) gameSpeed = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = window.innerWidth; vh = window.innerHeight;
    if (vw < 2 || vh < 2) return; // 旋转/分屏切换瞬间 innerWidth 可能短暂为 0，等下一帧自愈检查再量
    // 意见6：整体视野 = 原来的 4 倍（2 倍宽 × 2 倍高）→ 世界缩放减半，
    // 人物/敌人/武器随世界变换等比缩小一半，屏幕可见的世界范围翻倍。
    // 下限 0.35 只作用于手机（短边 <700）：0.25 时主角只有 16px 实在太小
    // 玩家缩放档位乘在上面：1X=该基准，4X=×2（旧版大小）
    zoom = Math.min(0.5, Math.max(0.35, Math.min(vw, vh) / 2000)) * (1 + (userZoom - 1) / 3);
    worldW = vw / zoom; worldH = vh / zoom;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    // 关键：CSS 显示尺寸必须与渲染用的 vw/vh 同步，否则 canvas 会按属性尺寸(=视口×dpr)显示
    cv.style.width = vw + 'px'; cv.style.height = vh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    vignette = document.createElement('canvas');
    vignette.width = vw; vignette.height = vh;
    const vx = vignette.getContext('2d');
    const g = vx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.42, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.62);
    g.addColorStop(0, 'rgba(8,8,28,0)');
    g.addColorStop(1, 'rgba(8,8,28,0.55)');
    vx.fillStyle = g; vx.fillRect(0, 0, vw, vh);
  }
  window.addEventListener('resize', resize);
  // 横竖屏切换：iOS Safari 触发 orientationchange 时 innerWidth/innerHeight 还没定，延迟再校一次；
  // Android 走 screen.orientation。帧循环里还有兜底自检，任何设备漏事件都能自愈
  window.addEventListener('orientationchange', () => { resize(); setTimeout(resize, 300); });
  if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', resize);
  resize();

  const $ = id => document.getElementById(id);
  const screens = {
    menu: $('screen-menu'), levelup: $('screen-levelup'), chest: $('screen-chest'),
    pause: $('screen-pause'), over: $('screen-over'), help: $('help-panel')
  };
  const show = (el, on) => el.classList[on ? 'remove' : 'add']('hidden');

  /* ================= 缩放 / 加速档位 / 音效开关 ================= */
  /* 单一真源：档位与静音只在 main.js 的 setZoom/setSpeed/toggleMuted 里改；变化经 updateToggleBtns 广播
     meow-toggles 事件（意见9：界面按钮只留 🔊 音效钮，缩放/加速保留快捷键 -/= · 1/2/3，小游戏端面板同步精简）。 */
  function updateToggleBtns() {
    try {
      if (typeof document.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        document.dispatchEvent(new CustomEvent('meow-toggles', { detail: { zoom: userZoom, speed: gameSpeed, muted: Sfx.isMuted() } }));
      }
    } catch (e) { /* 无头测试桩等环境没有 CustomEvent 时静默跳过 */ }
  }
  function setZoom(lv) {
    if (!ZOOM_LV.includes(lv) || lv === userZoom) return;
    userZoom = lv;
    U.storage.set('meow_zoom', lv);
    resize();
    if (G.state !== 'menu') banner('🔍 画面缩放 ' + lv + 'X' + (lv === 4 ? '（旧版大小）' : ''), 1.5);
    updateToggleBtns();
  }
  // 取模循环（修复旧版 U.clamp 夹到端点后点不动的卡死）：1 → 2 → 4 → 1；dir=-1 反向
  function cycleZoom(dir) {
    const i = ZOOM_LV.indexOf(userZoom);
    setZoom(ZOOM_LV[((i < 0 ? 0 : i) + dir + ZOOM_LV.length) % ZOOM_LV.length]);
  }
  function setSpeed(lv) {
    if (!SPD_LV.includes(lv)) return;
    gameSpeed = lv;
    U.storage.set('meow_speed', lv);
    if (G.state === 'play') banner('⏩ 游戏速度 ' + lv + 'X', 1.5);
    updateToggleBtns();
  }
  // 单击循环 1X → 2X → 3X → 1X（⚙ 设置抽屉与快捷键共用）
  function cycleSpeed() { setSpeed(SPD_LV[(SPD_LV.indexOf(gameSpeed) + 1) % SPD_LV.length]); }
  // 音效开关在暂停面板三钮一行（与 🔍 缩放 / ⏩ 加速同级；从平衡设置抽屉移出）；
  // M 快捷键与面板按钮共用同一真源，按钮文字不在这里直接改，统一走 updateToggleBtns 广播刷新
  function toggleMuted() {
    Sfx.setMuted(!Sfx.isMuted());
    updateToggleBtns();
  }

  /* ================= 城市地图（无限网格，chunk 缓存） ================= */
  const CHUNK = 512, ROAD = 96, SIDEWALK = 22, CHUNK_PAD = 48, PIX = 4;
  let curMap = null; // 手工地图（MAPS 里的固定面积地图）；null = 经典无限街区
  const chunkCache = new Map();
  function blockType(cx, cy) {
    const h = U.hash2(cx, cy, 77);
    if (h < 0.3) return 'park';
    if (h < 0.55) return 'plaza';
    if (h < 0.78) return 'lot';
    return 'market';
  }
  function genChunk(cx, cy) {
    const PAD = CHUNK_PAD, S = CHUNK + PAD * 2;
    const PIX = 4; // 地形低清烘焙：整个世界 1/4 分辨率，像素化
    const c = document.createElement('canvas');
    c.width = S / PIX; c.height = S / PIX;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.lineJoin = 'round'; x.lineCap = 'round';
    x.scale(1 / PIX, 1 / PIX);
    x.translate(PAD, PAD);
    const lamps = [], signs = [];
    const bx = cx * CHUNK, by = cy * CHUNK;
    // 地面
    const isRoadW = wx => ((wx % CHUNK) + CHUNK) % CHUNK < ROAD;
    // 每像素级判断太慢，逐 16px 网格填色
    for (let gy = -PAD; gy < CHUNK + PAD; gy += 16) {
      for (let gx = -PAD; gx < CHUNK + PAD; gx += 16) {
        const wx = bx + gx, wy = by + gy;
        const road = isRoadW(wx) || isRoadW(wy);
        if (road) x.fillStyle = '#2e3046';
        else {
          const inBlockX = ((wx % CHUNK) + CHUNK) % CHUNK, inBlockY = ((wy % CHUNK) + CHUNK) % CHUNK;
          const nearEdge = inBlockX < ROAD + SIDEWALK || inBlockY < ROAD + SIDEWALK;
          if (nearEdge) x.fillStyle = '#454963'; // 人行道
          else x.fillStyle = '#3a3d58';
        }
        x.fillRect(gx, gy, 16, 16);
      }
    }
    // 草地 / 广场 / 停车场地面色块（块内部 96+22 起到 512）
    const type = blockType(cx, cy);
    const ix = ROAD + SIDEWALK, iw = CHUNK - ix;
    if (type === 'park') { x.fillStyle = '#2c463a'; x.fillRect(ix, ix, iw, iw); }
    else if (type === 'plaza') { x.fillStyle = '#3e4160'; x.fillRect(ix, ix, iw, iw); }
    else if (type === 'lot') { x.fillStyle = '#343650'; x.fillRect(ix, ix, iw, iw); }
    // 块内随机点缀坐标
    const R = (a, b) => U.hash2(cx * 31 + a, cy * 57 + b, 913);
    const px = i => ix + 30 + R(1, i) * (iw - 60);
    const py = i => ix + 30 + R(2, i) * (iw - 60);
    // 沥青噪点（路上）
    x.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = 0; i < 44; i++) {
      const gx2 = R(11, i) * CHUNK, gy2 = R(12, i) * CHUNK;
      if (gx2 < ROAD || gy2 < ROAD) x.fillRect(gx2, gy2, 3, 3);
    }
    // 人行道砖缝 + 路缘亮线
    x.strokeStyle = 'rgba(255,255,255,.05)'; x.lineWidth = 2;
    x.beginPath();
    for (let t2 = 0; t2 < CHUNK; t2 += 26) {
      x.moveTo(t2, ROAD); x.lineTo(t2, ROAD + SIDEWALK);
      x.moveTo(ROAD, t2); x.lineTo(ROAD + SIDEWALK, t2);
    }
    x.stroke();
    x.strokeStyle = 'rgba(220,225,255,.13)'; x.lineWidth = 3;
    x.beginPath();
    x.moveTo(-PAD, ROAD + SIDEWALK); x.lineTo(CHUNK + PAD, ROAD + SIDEWALK);
    x.moveTo(ROAD + SIDEWALK, -PAD); x.lineTo(ROAD + SIDEWALK, CHUNK + PAD);
    x.stroke();
    // 道路中线（黄虚线）
    x.strokeStyle = '#8f8558'; x.lineWidth = 4; x.setLineDash([26, 30]);
    x.beginPath(); x.moveTo(-PAD, 48); x.lineTo(CHUNK + PAD, 48);
    x.moveTo(48, -PAD); x.lineTo(48, CHUNK + PAD); x.stroke();
    x.setLineDash([]);
    // 斑马线（路口：chunk 左上角区域）
    const cw = Art.decor.crosswalk;
    x.save(); x.translate(2, 6); x.rotate(0); x.globalAlpha = 0.8;
    x.drawImage(cw, 8, ROAD + 8, 34, 80); x.rotate(0);
    x.restore();
    x.save(); x.translate(6, 2); x.globalAlpha = 0.8;
    x.rotate(Math.PI / 2); x.drawImage(cw, 10, ROAD + 4, 34, 80);
    x.restore();
    // 井盖
    x.drawImage(Art.decor.manhole, ROAD + 150 + R(3, 1) * 200, 36, 40, 40);
    x.drawImage(Art.decor.manhole, 34, ROAD + 180 + R(3, 2) * 180, 36, 36);
    // 路灯：放块角
    const lampC = Art.decor.lamp;
    const lampPos = [[ix - 34, ix - 60], [CHUNK - 40, ix - 60], [ix - 34, CHUNK - 40], [CHUNK - 40, CHUNK - 40]];
    for (const [lx, ly] of lampPos) {
      x.drawImage(lampC, lx, ly);
      lamps.push({ x: bx + lx + 28, y: by + ly + 40 });
    }
    // 块内容
    if (type === 'park') {
      const n = 3 + Math.floor(R(4, 1) * 3);
      for (let i = 0; i < n; i++) {
        const tx = px(i + 10), ty = py(i + 20);
        x.drawImage(Art.decor.tree, tx - 48, ty - 52);
      }
      for (let i = 0; i < 4; i++) x.drawImage(Art.decor.bush, px(i + 30) - 28, py(i + 40) - 20);
      if (R(5, 1) < 0.45) x.drawImage(Art.decor.pond, ix + iw / 2 - 70, ix + iw / 2 - 55);
      x.drawImage(Art.decor.bench, px(50) - 44, py(51) - 22);
      x.drawImage(Art.decor.potted, px(52) - 22, py(53) - 28);
      // 草丛
      x.fillStyle = 'rgba(120,200,140,.16)';
      for (let i = 0; i < 24; i++) {
        x.beginPath(); x.ellipse(px(i + 80), py(i + 90), 7, 3, 0, 0, TAU); x.fill();
      }
      // 小花
      x.save();
      for (let i = 0; i < 14; i++) {
        x.fillStyle = ['#ff9dc3', '#ffd34d', '#c9a7ff'][i % 3];
        x.globalAlpha = 0.7;
        x.beginPath(); x.arc(px(i + 60), py(i + 70), 3, 0, TAU); x.fill();
      }
      x.restore();
    } else if (type === 'plaza') {
      x.drawImage(Art.decor.fountain, ix + iw / 2 - 60, ix + iw / 2 - 60);
      x.drawImage(Art.decor.bench, px(11) - 44, py(12) - 22);
      x.drawImage(Art.decor.bench, px(13) - 44, py(14) - 22);
      for (let i = 0; i < 3; i++) x.drawImage(Art.decor.bush, px(i + 15) - 28, py(i + 16) - 20);
      x.drawImage(Art.decor.potted, px(17) - 22, py(18) - 28);
    } else if (type === 'lot') {
      // 停车位线
      x.strokeStyle = 'rgba(220,220,200,.35)'; x.lineWidth = 4;
      for (let i = 0; i < 6; i++) {
        const lx = ix + 40 + i * 60;
        x.beginPath(); x.moveTo(lx, ix + 50); x.lineTo(lx, ix + 170); x.stroke();
        x.beginPath(); x.moveTo(lx, ix + iw - 50); x.lineTo(lx, ix + iw - 170); x.stroke();
      }
      x.drawImage(Art.decor.vending, px(21) - 30, py(22) - 42);
      x.drawImage(Art.decor.hydrant, px(23) - 20, py(24) - 24);
      x.drawImage(Art.decor.puddle, px(25) - 45, py(26) - 20);
    } else { // market 夜市
      const signKeys = Object.keys(Art.decor.sign);
      const n = 2 + Math.floor(R(6, 1) * 2);
      for (let i = 0; i < n; i++) {
        const sx = ix + 40 + i * (iw - 120) / Math.max(1, n - 1) + R(7, i) * 30;
        const spr = Art.decor.sign[signKeys[Math.floor(R(8, i) * signKeys.length)]];
        x.drawImage(spr, sx, ix + 30);
        signs.push({ x: bx + sx + 42, y: by + ix + 30, c: i % 2 ? 'neonPink' : 'neonCyan' });
      }
      x.drawImage(Art.decor.bench, px(31) - 44, py(32) - 22);
      x.drawImage(Art.decor.hydrant, px(33) - 20, py(34) - 24);
      x.drawImage(Art.decor.boxes, ix + 30, CHUNK - 92);
      x.drawImage(Art.decor.puddle, px(35) - 45, py(36) - 20);
      // 彩灯串
      const ly0 = ix + 24;
      x.strokeStyle = 'rgba(255,220,150,.35)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(ix + 20, ly0); x.quadraticCurveTo(ix + iw / 2, ly0 + 26, ix + iw - 20, ly0); x.stroke();
      for (let i = 0; i < 9; i++) {
        const t2 = (i + 0.5) / 9;
        const lx2 = U.lerp(ix + 20, ix + iw - 20, t2);
        const ly2 = ly0 + Math.sin(t2 * Math.PI) * 19;
        x.fillStyle = ['#ffd34d', '#7de3e0', '#ff9dc3', '#c9a7ff'][i % 4];
        x.beginPath(); x.arc(lx2, ly2 + 4, 3, 0, TAU); x.fill();
      }
    }
    return { canvas: c, pad: PAD, lamps, signs };
  }
  function getChunk(cx, cy) {
    const key = cx + ',' + cy;
    let ch = chunkCache.get(key);
    if (!ch) {
      ch = genChunk(cx, cy);
      chunkCache.set(key, ch);
      if (chunkCache.size > 26) {
        const k0 = chunkCache.keys().next().value;
        chunkCache.delete(k0);
      }
    }
    return ch;
  }

  /* ================= 输入 ================= */
  const keys = {};
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    keys[e.code] = true;
    onAnyInput();
    handleKey(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  // 触摸摇杆
  const IS_TOUCH = 'ontouchstart' in window; // 手机/平板：提示文案与桌面不同
  const joy = { on: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  cv.addEventListener('touchstart', e => {
    onAnyInput();
    if (G.state !== 'play') return;
    const t = e.changedTouches[0];
    joy.on = true; joy.id = t.identifier;
    joy.ox = t.clientX; joy.oy = t.clientY; joy.x = 0; joy.y = 0;
    e.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) {
        const dx = t.clientX - joy.ox, dy = t.clientY - joy.oy;
        const d = Math.hypot(dx, dy);
        const cl = Math.min(1, d / 46);
        joy.x = d > 4 ? dx / d * cl : 0;
        joy.y = d > 4 ? dy / d * cl : 0;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const endTouch = e => {
    for (const t of e.changedTouches) if (t.identifier === joy.id) { joy.on = false; joy.x = 0; joy.y = 0; }
  };
  cv.addEventListener('touchend', endTouch);
  cv.addEventListener('touchcancel', endTouch);
  // iOS Safari 无视 user-scalable=no：捏合会放大页面导致画面错位，用 Safari 专有 gesture 事件拦掉
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('gesturechange', e => e.preventDefault());
  let lastInputAt = 0;
  function onAnyInput() { lastInputAt = performance.now(); Sfx.ensure(); }

  /* ================= 游戏状态 ================= */
  const G = {
    state: 'menu', time: 0, timeScale: 1, realTime: 0,
    cam: { x: 0, y: 0 }, shake: 0, flash: 0,
    player: null, enemies: [], projs: [], slashes: [], zones: [], gems: [],
    slimes: [], eprojs: [], // 意见6：蜗牛黏液带 / 敌方羽毛弹
    warps: 0, // 反卡死瞬移计数（dev 面板观测）
    pickups: [], chests: [], parts: [], dmgs: [], after: [],
    spawnT: 1, pendingLv: 0, bossWarn: 0, bossSpawned: false, boss: null,
    kills: 0, gold: 0, gemCombo: 0, gemComboT: 0, idleMeowT: 8,
    elitesDone: 0, eventsDone: 0, dyingT: 0, victoryT: 0, hitSfxT: 0,
    flies: [], petals: [], uid: 0, slowmoT: 0, lowHpPulse: 0, heartT: 0, evoPending: false,
    // 轮次系统
    round: 1, roundTime: 0, waveT: 0, batch: 0, batchBossSpawned: false, roundBossPending: false,
    spawnHold: false, // 意见6：同屏到顶停刷 / 回落阈值恢复的滞回状态
    countMul: 1, // 轮间杂兵数量乘数 ×2^(轮次-1)（只作用于杂兵刷怪与同屏上限）
    roundMods: null, prevRound: null, batchBossSpawnT: 0, batchBossFrac: 1,
    bossSpawnT: -1, bossTTKSamples: [], pendingBossAffixes: [],
    rsHpSum: 0, rsHpN: 0, lvStart: 1,
    // 老鼠妈妈（第3轮压轴）：motherWarnT 警告演出计时 / motherActive 战斗中 / motherDone 已讨伐
    motherWarnT: 0, motherActive: false, motherDone: false, mother: null, motherSpawnT: 0,
    motherTTK: 0, motherFxT: 0,
    // 伤害统计：总量 + 逐秒桶（结算 DPS / 最高秒伤）
    dmgTotal: 0, secDmg: 0, secIdx: -1, peakSec: 0
  };
  const FX = DATA.CFG.fx;
  let mods = null;
  function calcMods() {
    const m = { might: 1, cdMult: 1, areaMult: 1, spdMult: 1, amountBonus: 0, regen: 0, pickMult: 1, luck: 0,
                crit: 0, lifesteal: 0, pierceBonus: 0 };
    for (const p of G.player.passives) {
      const pm = PASSIVES[p.id].mod(p.lv);
      if (pm.might) m.might += pm.might;
      if (pm.cdMult) m.cdMult *= pm.cdMult;
      if (pm.areaMult) m.areaMult *= pm.areaMult;
      if (pm.spdMult) m.spdMult *= pm.spdMult;
      if (pm.amountBonus) m.amountBonus += pm.amountBonus;
      if (pm.regen) m.regen += pm.regen;
      if (pm.pickMult) m.pickMult *= pm.pickMult;
      if (pm.luck) m.luck += pm.luck;
      if (pm.crit) m.crit += pm.crit; // 幸运锦鲤：每级 +0.25% 暴击（全武器）
    }
    // 猫爪印：mulUp 逐层 ×(1+v)、mulDown 逐层 ×(1-v)、add 逐层累加（每层数值 = CFG.stamps[id]）
    const ST = DATA.CFG.stamps;
    for (const af of G.player.affixes || []) {
      const meta = STAMP_META[af.id];
      if (!meta) continue;
      const v = ST[af.id];
      for (let i = 0; i < af.stacks; i++) {
        if (meta.mode === 'mulUp') m[meta.ch] *= 1 + v;
        else if (meta.mode === 'mulDown') m[meta.ch] *= 1 - v;
        else m[meta.ch] += v;
      }
    }
    // 7 枚印全部无上限；引擎底线在别处兜底（单武器冷却 minCd、场上投射物总量 480）
    mods = m;
    // 意见1：70 级起每级 +2% 最大生命 / +1% 移速（乘在被动加成之上）；maxHp/移速统一在这里重算
    const PL = DATA.CFG.postLevel || {};
    const glv = Math.max(0, (G.player.lv || 1) - (PL.autoFrom != null ? PL.autoFrom : 70));
    const milkLv = passLv('milk');
    const milkMod = milkLv > 0 ? PASSIVES.milk.mod(milkLv) : {}; // 未拥有牛奶盒时不给任何加成（mod(0) 会被钳到 1 级）
    G.player.maxHp = Math.round(DATA.PLAYER.hp * (milkMod.hpMult || 1) * Math.pow(1 + (PL.hpPerLv != null ? PL.hpPerLv : 0.02), glv));
    G.player.spdMul = Math.pow(1 + (PL.spdPerLv != null ? PL.spdPerLv : 0.01), glv);
  }
  // 70 级起升 1 级的自动成长：重算 maxHp/移速，并把血回满
  function applyPostGrow() {
    const P = G.player;
    calcMods();
    P.hp = P.maxHp; // 如果血不满，恢复满血
    heartAt(P.x, P.y - 34);
    part({ x: P.x, y: P.y - 8, life: 0.7, size: 34, col: '#8fd982', kind: 'ring' });
  }
  // 80 级起拾取经验不再直接升级；开宝箱时把攒下的经验一次结算成等级（同样享受自动成长）
  function applyChestLevels() {
    const P = G.player, PL = DATA.CFG.postLevel || {};
    if (PL.chestOnlyFrom == null) return;
    let n = 0, need = DATA.xpNeed(P.lv || 1);
    while ((P.xp || 0) >= need && n < 80) {
      P.xp -= need;
      P.lv = (P.lv || 1) + 1;
      applyPostGrow(); // 走到这里的等级必然 ≥ 80，早已过了三选一区间：直接自动成长
      n++; need = DATA.xpNeed(P.lv);
    }
    if (n) {
      banner('📦 宝箱经验结算：连升 ' + n + ' 级！（生命 +' + Math.round((PL.hpPerLv || 0.02) * 100) + '%/级 · 移速 +' +
        Math.round((PL.spdPerLv || 0.01) * 100) + '%/级）', 2.4);
      Sfx.sfx.lvl();
    }
  }
  function passLv(id) {
    const p = G.player.passives.find(p => p.id === id);
    return p ? p.lv : 0;
  }

  /* ================= 猫爪印（全武器词条） ================= */
  function stampStacks(id) {
    const af = G.player && G.player.affixes.find(a => a.id === id);
    return af ? af.stacks : 0;
  }
  function stampUnlocked() {
    return !!G.player && (G.player.lv || 1) >= DATA.CFG.stamps.minLevel;
  }
  function stampPoolIds() {
    return stampUnlocked() ? STAMP_ORDER.slice() : [];
  }
  // 按权重抽一种印；exclude = 本次三选一/宝箱内已出现的印（同屏去重）
  function pickStampId(exclude) {
    const avail = stampPoolIds().filter(id => !exclude.includes(id));
    if (!avail.length) return null;
    const ST = DATA.CFG.stamps;
    let total = 0;
    const ws = avail.map(id => {
      const wk = STAMP_META[id].weightKey;
      const w = wk ? (ST[wk] || 1) : 1;
      total += w;
      return w;
    });
    let r = Math.random() * total;
    for (let i = 0; i < avail.length; i++) { r -= ws[i]; if (r <= 0) return avail[i]; }
    return avail[avail.length - 1];
  }
  // 卡片/宝箱文案：展示叠到第 n 层后的累计效果（n ≥ 1）
  function stampEffectText(id, n) {
    const f2 = v => '' + (Math.round(v * 100) / 100);
    const pct = v => Math.round(v * 1000) / 10;
    const ST = DATA.CFG.stamps;
    switch (id) {
      case 'dmg': return '全武器伤害 ×' + f2(Math.pow(1 + ST.dmg, n - 1)) + ' → ×' + f2(Math.pow(1 + ST.dmg, n));
      case 'cd': return '全武器冷却 ×' + f2(Math.pow(1 - ST.cd, n - 1)) + ' → ×' + f2(Math.pow(1 - ST.cd, n));
      case 'area': return '攻击范围 ×' + f2(Math.pow(1 + ST.area, n - 1)) + ' → ×' + f2(Math.pow(1 + ST.area, n));
      case 'amount': return '投射物数量 +' + (n - 1) + ' → +' + n;
      case 'pierce': return '投射物穿透 +' + (n - 1) + ' → +' + n;
      case 'crit': return '暴击率 ' + pct(ST.crit * (n - 1)) + '% → ' + pct(ST.crit * n) + '%（暴伤 ×2）';
      case 'lifesteal': return '攻击吸血 ' + pct(ST.lifesteal * (n - 1)) + '% → ' + pct(ST.lifesteal * n) + '%';
    }
    return '';
  }

  function resetRun() {
    G.time = 0; G.timeScale = 1; G.slowmoT = 0;
    G.enemies.length = 0; G.projs.length = 0; G.slashes.length = 0; G.zones.length = 0;
    G.slimes.length = 0; G.eprojs.length = 0;
    G.gems.length = 0; G.pickups.length = 0; G.chests.length = 0; G.parts.length = 0; G.dmgs.length = 0; G.after.length = 0;
    G.spawnT = 1.2; G.pendingLv = 0;
    G.kills = 0; G.gold = 0; G.gemCombo = 0; G.idleMeowT = U.rand(8, 14);
    G.dmgTotal = 0; G.secDmg = 0; G.secIdx = -1; G.peakSec = 0;
    G.dyingT = 0; G.victoryT = 0; G.shake = 0; G.flash = 0;
    G.motherWarnT = 0; G.motherActive = false; G.motherDone = false; G.mother = null;
    G.motherSpawnT = 0; G.motherTTK = 0; G.motherFxT = 0;
    G.house = null; // 意见10：老鼠妈妈的老巢实体（每局重盖）
    G.banner = null;
    G.prevRound = null;
    G.catHint = false; G.dustT = 0;
    chunkCache.clear();
    // 手工地图初始化（地形/装饰烘焙在选图时确定）
    curMap = MAPS.get(G.mapId);
    if (curMap) curMap.init();
    const st = curMap ? curMap.start : { x: 0, y: 0 };
    G.player = {
      x: st.x, y: st.y, vx: 0, vy: 0, r: DATA.PLAYER.r, fx: 1, fy: 0, flip: false,
      hp: DATA.PLAYER.hp, maxHp: DATA.PLAYER.hp,
      iframes: 0, walkT: 0, moving: false, slowT: 0, slowF: 1, stunT: 0, disarmT: 0,
      weapons: [{ id: 'claw', lv: 1, t: 0.4, state: 0 }],
      passives: [], affixes: [], hurtT: 0, blinkT: U.rand(2, 5), blinkA: 0
    };
    mods = null; calcMods();
    G.cam.x = 0; G.cam.y = 0;
    G.flies.length = 0;
    for (let i = 0; i < 26; i++) G.flies.push({
      x: U.rand(-vw, vw), y: U.rand(-vh, vh),
      ph: U.rand(0, TAU), sp: U.rand(0.4, 1)
    });
    G.petals.length = 0;
    for (let i = 0; i < 14; i++) G.petals.push({
      x: Math.random(), y: Math.random(), ph: U.rand(0, TAU), sp: U.rand(0.5, 1.1), sz: U.rand(2.4, 4.2)
    });
    G.heartT = 0; G.evoPending = false;
    startRound(1);
    // 意见10：地图边缘盖老鼠妈妈的老巢——捣毁可提前引出妈妈，比比谁的 BD 通关更快
    if (spawnMotherHouse()) banner('🗺️ 地图边缘有一座贴满抓痕的怪房子……捣毁它，老鼠妈妈就会现身！', 4);
  }

  /* ================= 轮次系统 ================= */
  // 震屏统一入口：主震（boss落地/精英死/受伤等低频大震）直接累加、上限 shakeMax；
  // 次震（暴击/大体型怪死亡等高频小震）带阻尼（现有震幅越大加得越少）且上限更低 —— 中后期不再常驻晃动
  function addShake(v, major) {
    if (major) { G.shake = Math.min(FX.shakeMax, G.shake + v); return; }
    const damp = Math.max(0, 1 - G.shake / FX.shakeMax);
    G.shake = Math.min(Math.min(FX.shakeMinorCap, FX.shakeMax), G.shake + v * damp);
  }
  // 进入第 n 轮：重置轮内时间轴与批次进度，套用该轮难度；残怪与掉落全部保留
  function startRound(n) {
    const R = DATA.ROUNDS;
    G.round = n; G.roundTime = 0; G.waveT = 0;
    G.countMul = Math.pow(DATA.CFG.growth.countRoundMul || 1, n - 1); // 杂兵数量 ×2^(轮次-1)
    G.batch = 0; G.batchBossSpawned = false; G.batchBossSpawnT = 0; G.batchBossFrac = 1;
    G.roundBossPending = false;
    G.elitesDone = 0; G.eventsDone = 0;
    G.bossSpawned = false; G.bossWarn = 0; G.boss = null;
    G.bossTTKSamples = []; G.pendingBossAffixes = [];
    G.bossSpawnT = -1;
    G.roundMods = DATA.roundMods(n, G.prevRound);
    G.spawnT = n > 1 ? 4 : 1.2; // 轮间喘息：留出清理残怪的时间窗
    G.spawnHold = false;
    G.rsHpSum = 0; G.rsHpN = 0; G.lvStart = G.player ? (G.player.lv || 1) : 1;
    if (DEV) console.log('[round ' + n + ']', JSON.stringify(G.roundMods));
    if (n > 1) banner('🌙 第 ' + n + ' 轮开始！（批次 1/' + R.batchCount + ' · 威胁 ×' + G.roundMods.hp.toFixed(2) + '）', 3.4);
  }
  // 批次头目被讨伐 → 下一批立刻来袭；最后一批完成 → 鼠王待命
  function advanceBatch() {
    const R = DATA.ROUNDS;
    G.batch++;
    G.batchBossSpawned = false;
    // 内容时间轴快进：头目讨伐得越快，下一批（含头目降临点）来得越早，整轮自然短于标称 15 分钟
    G.waveT = Math.max(G.waveT, G.batch * R.batchLen);
    if (G.batch >= R.batchCount) {
      G.roundBossPending = true;
      banner('👑 批次头目全灭！宝箱已掉落，鼠王·铁须 正在赶来…', 2.6);
    } else {
      banner('⚔ 头目讨伐成功！掉落了宝箱！第 ' + (G.batch + 1) + '/' + R.batchCount + ' 批次来袭！', 2.4);
      G.spawnT = Math.max(G.spawnT, 2.2); // 批次衔接喘息
    }
  }
  function pickAffixes(n, forced, noSplit) {
    const pool = Object.keys(DATA.ROUNDS.affixes).filter(id => !(noSplit && id === 'split'));
    const out = [];
    for (const id of forced || []) { if (out.length < n && pool.includes(id) && !out.includes(id)) out.push(id); }
    while (out.length < n && out.length < pool.length) {
      const id = U.pick(pool);
      if (!out.includes(id)) out.push(id);
    }
    return out;
  }
  function applyAffixes(e) {
    const A = DATA.ROUNDS.affixes;
    for (const id of e.affixes || []) {
      const a = A[id];
      if (!a) continue;
      if (a.spd) e.spd *= a.spd;
      if (a.dmgTaken) e.dmgTakenMul = a.dmgTaken;
      if (a.kbRes) e.kbRes = a.kbRes;
      if (a.atFrac) e.affEnrage = true;
      if (a.n) e.affSplit = true;
    }
  }
  function affixNames(e) {
    return (e.affixes || []).map(id => (DATA.ROUNDS.affixes[id] || {}).name || id).join('·');
  }
  // 批次头目：精英模板 + 鼠王生命比例 + 词条
  function spawnBatchBoss() {
    const R = DATA.ROUNDS, M = G.roundMods;
    const type = R.batchBossTypes[(G.batch + G.round - 1) % R.batchBossTypes.length];
    const frac = R.batchBossHpFracs[Math.min(G.batch, R.batchBossHpFracs.length - 1)];
    const pt = edgePoint(80);
    const e = spawnEnemy(type, pt.x, pt.y, true);
    // 生命按鼠王公式重算（含轮间指数成长）；伤害/速度沿用 spawnEnemy 的轮内+轮间结果
    e.hp = e.maxHp = ENEMIES.boss.hp * DATA.DIFF.bossHp * (M ? M.bossHp : 1) * frac * roundPow().hp;
    e.scale = R.batchBossScale; e.r *= 1.12; e.dmg *= 1.15;
    e.batchBoss = true;
    e.affixes = pickAffixes(M ? M.bbAffix : 0, M ? M.bbAffixIds : [], false);
    applyAffixes(e);
    G.batchBossSpawnT = G.roundTime; G.batchBossFrac = frac;
    const aff = affixNames(e);
    banner('⚠ 第 ' + (G.batch + 1) + ' 批次头目 · ' + e.def.name + (aff ? '【' + aff + '】' : '') + ' 来袭！', 2.8);
    Sfx.sfx.boss();
    addShake(6, true);
  }
  // 本轮结算数据（动态难度的输入）
  function collectRoundStats() {
    const D = DATA.ROUNDS.dynamic;
    let ttk = D.parBossTTK;
    if (G.bossTTKSamples.length) {
      let s = 0;
      for (const v of G.bossTTKSamples) s += v;
      ttk = s / G.bossTTKSamples.length;
    }
    return {
      actualTime: G.roundTime,
      bossTTK: ttk,
      avgHpFrac: G.rsHpN > 60 ? G.rsHpSum / G.rsHpN : 0.75,
      lvGain: (G.player ? (G.player.lv || 1) : 1) - G.lvStart
    };
  }
  // 鼠王被讨伐 → 本轮结束，进入下一轮（残怪保留）
  function finishRound(stats) {
    G.prevRound = { mods: G.roundMods, stats };
    G.gold += 60 + G.round * 15; // 守轮奖励
    startRound(G.round + 1);
  }
  // 老鼠妈妈被讨伐 → 压轴胜利演出，随后弹出以「讨伐用时」为核心指标的成功结算
  function killMother(e) {
    G.motherDone = true;
    G.motherActive = false;
    G.motherTTK = Math.max(1, G.time - (G.motherSpawnT || G.time));
    G.gold += DATA.CFG.finale.motherGold;
    // 意见3：死后掉落 30 枚金币（落在地上，拾取照常走金币抽奖）+ 1 个专属宝箱
    //（必定最多 5 件奖励、必定不含金币，见 openChest）
    const F = DATA.CFG.finale;
    for (let i = 0; i < (F.motherCoinN != null ? F.motherCoinN : 30); i++) {
      const a2 = U.rand(0, TAU), d2 = U.rand(24, 130);
      dropPickup(e.x + Math.cos(a2) * d2, e.y + Math.sin(a2) * d2, 'coin');
    }
    G.chests.push({ x: e.x, y: e.y + 10, t: 0, taken: false, mother: true });
    G.player.iframes = Math.max(G.player.iframes, 3); // 庆祝演出期无敌：压轴胜利绝不被残怪翻盘
    popStars(e.x, e.y, '#e2b7ff', 60);
    part({ x: e.x, y: e.y, life: 1.1, size: 180, col: '#e2b7ff', kind: 'ring' });
    part({ x: e.x, y: e.y, life: 0.8, size: 120, col: '#ffffff', kind: 'ring' });
    G.flash = 0.7; addShake(14, true);
    Sfx.sfx.bigPop(); Sfx.meow('victory');
    G.timeScale = 0.25; G.slowmoT = 1.4;
    G.after.push({ t: 1.6, fn: showMotherResult });
  }
  function showMotherResult() {
    G.state = 'over';
    const data = collectResult(true);
    data.mother = true;
    data.motherTTK = G.motherTTK;
    // 意见10：讨伐妈妈即强制收官（无限模式代码全保留，rounds.motherEndsRun=false 可重新开放「继续夜巡」）
    data.continueOffer = DATA.CFG.rounds && DATA.CFG.rounds.motherEndsRun === false;
    const mb = U.storage.get('meow_best_mother', 0);
    if (!mb || G.motherTTK < mb) U.storage.set('meow_best_mother', Math.round(G.motherTTK * 10) / 10);
    data.bestMother = U.storage.get('meow_best_mother', 0);
    data.best = saveBest();
    Result.open(data);
    submitRunToLb(data);
    Sfx.sfx.victory(); Sfx.meow('happy');
    show(screens.over, true);
  }

  /* ================= 粒子 / 飘字 ================= */
  function part(o) {
    if (G.parts.length > 600) G.parts.shift();
    G.parts.push(Object.assign({ t: 0, life: 0.6, vx: 0, vy: 0, size: 5, col: '#fff', kind: 'dot', rot: U.rand(0, TAU), vr: U.rand(-4, 4) }, o));
  }
  function popStars(x, y, col, n) {
    if (G.parts.length > FX.particleLodAt) n = Math.ceil(n / 2); // 粒子过载时生成量减半（LOD）
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, TAU), s = U.rand(40, 160);
      part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: U.rand(0.3, 0.6), size: U.rand(3, 6), col, kind: 'star', grav: 300 });
    }
  }
  // 彩纸（金币抽奖 ≥10% 大奖庆祝）：多彩小星屑向上抛洒再洒落
  function confettiAt(x, y) {
    const cols = ['#ffd34d', '#ff8fb5', '#8fe08a', '#9fd8f2', '#e2b7ff'];
    let n = 18;
    if (G.parts.length > FX.particleLodAt) n = Math.ceil(n / 2); // 粒子过载时生成量减半（LOD）
    for (let i = 0; i < n; i++) {
      const a = U.rand(-Math.PI, 0); // 上半圆：全部往上抛
      const s = U.rand(60, 200);
      part({ x: x + U.rand(-12, 12), y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.rand(0.5, 0.95), size: U.rand(3, 5.5), col: U.pick(cols), kind: 'star', grav: 260 });
    }
  }
  function heartAt(x, y) { part({ x, y, vy: -46, life: 1.1, size: 7, col: '#ff8fb5', kind: 'heart' }); }
  function sweatDrop(x, y) { part({ x, y, vy: -30, vx: U.rand(-8, 8), life: 0.8, size: 4, col: '#9fd8f2', kind: 'dot' }); }
  // 光柱（升级/开箱/进化演出）
  function beamAt(x, y, col) {
    part({ x, y, life: 0.55, size: 26, col, kind: 'beam' });
    for (let i = 0; i < 10; i++) {
      part({ x: x + U.rand(-14, 14), y: y + U.rand(-8, 8), vy: -U.rand(120, 260), vx: U.rand(-20, 20), life: U.rand(0.4, 0.8), size: U.rand(2.5, 5), col, kind: 'star' });
    }
  }
  function dmgNum(x, y, v, crit) {
    if (G.dmgs.length > 90) G.dmgs.shift();
    G.dmgs.push({ x: x + U.rand(-8, 8), y, t: 0, life: crit ? 0.9 : 0.7, txt: '' + Math.round(v), crit: !!crit, vy: crit ? -84 : -58 });
  }
  // 金色小飘字（金币抽奖小奖反馈）
  function goldFloat(x, y, txt) {
    if (G.dmgs.length > 90) G.dmgs.shift();
    G.dmgs.push({ x: x + U.rand(-8, 8), y, t: 0, life: 0.8, txt: '' + txt, crit: false, col: '#ffd34d', vy: -46 });
  }
  function banner(txt, t) { G.banner = { txt, t: t || 3 }; }

  /* ================= 敌人 ================= */
  // 统一出生点约束：手工地图上钳到可行走位置（不卡墙、不进猫道）
  function walkPoint(x, y, maxR) {
    if (!curMap) return { x, y };
    return curMap.nearWalk(x, y, false, maxR || 640);
  }
  // 在玩家周围屏幕外一点点生成
  function edgePoint(margin) {
    const a = U.rand(0, TAU);
    const rx = worldW / 2 + (margin || 50), ry = worldH / 2 + (margin || 50);
    return walkPoint(G.player.x + Math.cos(a) * rx, G.player.y + Math.sin(a) * ry);
  }
  // 意见2：轮间指数成长（×3^(轮-1) 血 / ×2^(轮-1) 攻 / ×1.1^(轮-1) 速），
  // 叠在既有机制之上；作用杂兵/精英/头目/鼠王，老鼠妈妈不走这里（数值全固定）
  function roundPow() {
    const Gw = DATA.CFG.growth, k = Math.max(0, G.round - 1);
    return {
      hp: Math.pow(Gw.roundHpMul != null ? Gw.roundHpMul : 3, k),
      dmg: Math.pow(Gw.roundDmgMul != null ? Gw.roundDmgMul : 2, k),
      spd: Math.pow(Gw.roundSpdMul != null ? Gw.roundSpdMul : 1.1, k)
    };
  }
  function spawnEnemy(type, x, y, elite) {
    const def = ENEMIES[type];
    const D = DATA.DIFF, EC = DATA.CFG.elite;
    const M = G.roundMods;
    const RP = roundPow();
    if (curMap) { const p2 = walkPoint(x, y); x = p2.x; y = p2.y; }
    // 轮内成长曲线（按本轮时间）× 轮次难度倍率 × 轮间指数成长
    const hpM = DATA.hpMult(G.roundTime) * (M ? M.hp : 1) * RP.hp;
    const dm = DATA.dmgMult(G.roundTime) * (M ? M.dmg : 1) * RP.dmg;
    const sm = DATA.spdMult(G.roundTime) * RP.spd;
    const e = {
      uid: ++G.uid, type, def,
      x, y, vx: 0, vy: 0, kx: 0, ky: 0,
      hp: def.hp * hpM * D.enemyHp, maxHp: def.hp * hpM * D.enemyHp,
      spd: def.spd * sm * U.rand(0.92, 1.08) * D.enemySpd,
      dmg: def.dmg * dm * D.enemyDmg, r: def.r,
      phase: U.rand(0, TAU), flash: 0, slowT: 0, slowF: 1,
      blinkT: U.rand(2, 6), blinkA: 0, faceT: 0,
      elite: !!elite, scale: elite ? EC.scale : 1, orbCd: 0, lungeT: 0, lungeCd: U.rand(1, 2),
      // 意见6：行为特性计时（首次触发时间随机错开，避免同帧群体行动）
      dashSt: 0, dashT: 0, dashCd: U.rand(1.5, 3.2), dashX: 0, dashY: 0,
      fireCd: U.rand(1.2, 2.8), slimeT: U.rand(0.2, 0.7), stealT: 0, tgtGem: null,
      stkT: 0, stkX: x, stkY: y, // 反卡死：卡住累计时长 / 上帧采样点
      boss: false, dieDone: false
    };
    if (elite) { e.hp *= EC.hpMul * (M ? M.eliteHp : 1) * (DATA.DIFF.eliteHp || 1); e.maxHp = e.hp; e.dmg *= EC.dmgMul; e.r *= 1.5; e.spd *= EC.spdMul; }
    G.enemies.push(e);
    return e;
  }
  function spawnBoss(affixIds) {
    const a = U.rand(0, TAU);
    const d = Math.min(worldW, worldH) * 0.4; // 落在视野内，登场演出可见
    const def = ENEMIES.boss;
    const F = DATA.CFG.finale;
    const M = G.roundMods;
    const RP = roundPow();
    let bx = G.player.x + Math.cos(a) * d, by = G.player.y + Math.sin(a) * d;
    if (curMap) { const p2 = walkPoint(bx, by, 900); bx = p2.x; by = p2.y; }
    const b = {
      uid: ++G.uid, type: 'boss', def,
      x: bx, y: by,
      vx: 0, vy: 0, kx: 0, ky: 0,
      hp: def.hp * DATA.DIFF.bossHp * (M ? M.bossHp : 1) * RP.hp, maxHp: def.hp * DATA.DIFF.bossHp * (M ? M.bossHp : 1) * RP.hp,
      spd: def.spd * RP.spd, dmg: def.dmg * DATA.DIFF.enemyDmg * RP.dmg, r: def.r,
      phase: 0, flash: 0, slowT: 0, slowF: 1, elite: false, scale: 1,
      blinkT: U.rand(2, 5), blinkA: 0, faceT: 0, landT: 0,
      stkT: 0, stkX: bx, stkY: by,
      boss: true, state: 'entry', entryT: 0.9, entryD: 0.9, st: 0, summonT: F.bossSummonCd, lungeT: 0, lungeCd: 0, orbCd: 0, dieDone: false
    };
    b.affixes = affixIds || [];
    applyAffixes(b);
    G.enemies.push(b); G.boss = b;
    G.bossSpawnT = G.roundTime;
  }
  // 老鼠妈妈警告演出（第 3 轮鼠王被讨伐后触发；守轮奖励与动态难度输入已提前记好）
  function startMotherWarn() {
    if (G.state !== 'play') return;
    const F = DATA.CFG.finale;
    G.motherWarnT = F.motherWarn;
    G.motherActive = true;
    banner('🐭 老鼠妈妈 正在赶来——为了孩子们，她很生气！', 3.2);
    Sfx.sfx.boss();
  }
  // 压轴 Boss 老鼠妈妈：全部数值固定，不吃难度倍率 / 动态难度 / 轮内成长
  function spawnMother() {
    const def = ENEMIES.mother;
    const a = U.rand(0, TAU);
    const d = Math.min(worldW, worldH) * 0.42;
    let bx = G.player.x + Math.cos(a) * d, by = G.player.y + Math.sin(a) * d;
    if (curMap) { const p2 = walkPoint(bx, by, 900); bx = p2.x; by = p2.y; }
    const m = {
      uid: ++G.uid, type: 'mother', def,
      x: bx, y: by, vx: 0, vy: 0, kx: 0, ky: 0,
      hp: def.hp, maxHp: def.hp, // 固定值（500 万），不吃任何难度/动态/轮间倍率
      spd: def.spd, dmg: def.dmg, r: def.r,
      phase: 0, flash: 0, slowT: 0, slowF: 1, elite: false, scale: 1,
      blinkT: U.rand(2, 5), blinkA: 0, faceT: 0, landT: 0,
      stkT: 0, stkX: bx, stkY: by,
      boss: true, mother: true, state: 'entry', entryT: 1.1, entryD: 1.1,
      st: 0, skillT: DATA.CFG.finale.motherSkillCd, orbCd: 0, dieDone: false
    };
    G.enemies.push(m); G.mother = m;
    G.motherSpawnT = G.time; // 讨伐用时从这里起算（结算核心指标）
    banner('🐭 老鼠妈妈 降临！讨伐她！', 3);
  }
  // 意见10：老鼠妈妈的老巢——每张手工地图边缘一座（maps.js placeMotherHouse 选点并盖实心碰撞）
  // 固定 100 万血不吃任何倍率；不可移动、不受击退、不参与刷怪上限与卡死判定；捣毁后妈妈提前降临。
  function spawnMotherHouse() {
    if (!curMap || !curMap.houseSpot || G.house) return false;
    const C = DATA.CFG.motherHouse || {};
    const hp = C.hp || 1000000;
    const e = {
      uid: ++G.uid, type: 'house', def: { name: '老鼠妈妈的老巢', xp: 0, mass: 60 },
      x: curMap.houseSpot.x, y: curMap.houseSpot.y, vx: 0, vy: 0, kx: 0, ky: 0,
      hp, maxHp: hp, spd: 0, dmg: 0, r: C.r || 48,
      phase: 0, flash: 0, slowT: 0, slowF: 1, elite: false, scale: 1,
      blinkT: 1e9, blinkA: 0, faceT: 0,
      stkT: 0, stkX: curMap.houseSpot.x, stkY: curMap.houseSpot.y,
      house: true, ruined: false, boss: false, dieDone: false
    };
    G.enemies.push(e); G.house = e;
    return true;
  }
  // 老巢被捣毁：留下实心废墟（残骸继续挡路），走与第 3 轮强制降临同一条警告演出链召出妈妈
  function destroyMotherHouse(e) {
    G.house = null;
    G.kills++;
    e.ruined = true;
    G.gold += (DATA.CFG.motherHouse || {}).gold || 50;
    popStars(e.x, e.y, '#c9b08a', 26);
    part({ x: e.x, y: e.y, life: 0.7, size: 120, col: '#d9c8a8', kind: 'ring' });
    part({ x: e.x, y: e.y - 20, life: 0.5, size: 70, col: '#8a6f4d', kind: 'ring' });
    for (let i = 0; i < 10; i++) {
      const a2 = U.rand(0, TAU);
      part({ x: e.x + Math.cos(a2) * 30, y: e.y, vx: Math.cos(a2) * U.rand(60, 170), vy: -U.rand(40, 150), life: U.rand(0.4, 0.9), size: U.rand(3, 7), col: '#8a6f4d', kind: 'dot', grav: 340 });
    }
    G.flash = 0.35; addShake(10, true);
    Sfx.sfx.bigPop();
    if (G.motherActive || G.motherDone) { banner('老巢塌了——老鼠妈妈早就亲自出马了！', 2.2); return; }
    banner('🏚️ 老巢被捣毁！老鼠妈妈杀气腾腾地赶来了！', 3);
    G.after.push({ t: 1.1, fn: startMotherWarn });
  }
  // 老鼠妈妈行为：追击 + 唯一技能「全屏斩」（10 秒一次，0.6 秒预警）
  function updateMother(m, dt) {
    const F = DATA.CFG.finale;
    m.st -= dt;
    if (m.landT > 0) m.landT -= dt;
    if (m.state === 'entry') { // 从天而降
      m.entryT -= dt;
      if (m.entryT <= 0) {
        m.state = 'chase'; m.st = 1.4; m.landT = 0.3;
        addShake(14, true);
        part({ x: m.x, y: m.y + 26, life: 0.8, size: 130, col: '#e2b7ff', kind: 'ring' });
        for (let i = 0; i < 18; i++) {
          const a2 = U.rand(0, TAU);
          part({ x: m.x + Math.cos(a2) * 40, y: m.y + 30, vx: Math.cos(a2) * U.rand(70, 190), vy: -U.rand(30, 140), life: U.rand(0.3, 0.8), size: U.rand(3, 8), col: '#bfa9d8', kind: 'dot', grav: 320 });
        }
        Sfx.sfx.bigPop();
      }
      return;
    }
    if (m.state === 'chase') {
      m.skillT -= dt;
      if (m.skillT <= F.motherTele) { m.state = 'tele'; m.st = F.motherTele; Sfx.sfx.motherWarn(); }
    } else if (m.state === 'tele') { // 预警结束 → 全屏斩
      if (m.st <= 0) { m.state = 'chase'; m.skillT = F.motherSkillCd; motherSlash(); }
    }
  }
  // 全屏斩：扣除主角「当前」体力的 50%（保底 1 点，绝不直接致死）
  // 控制链：眩晕1秒（不能动/武器停）→ 缴械1秒（能动/武器停）→ 减速×0.55共2秒（与缴械前1秒重叠）
  // 命中表现 0.3 秒内结束：短闪 + 冲击环 + 短促紫边，不做长驻全屏覆盖
  function motherSlash() {
    const F = DATA.CFG.finale, P = G.player;
    const before = P.hp;
    P.hp = Math.max(F.motherHpFloor, P.hp * (1 - F.motherHpFrac));
    P.stunT = F.motherStun || 0;
    P.disarmT = (F.motherStun || 0) + (F.motherDisarm || 0);
    P.slowT = (F.motherStun || 0) + (F.motherSlowT || 0);
    P.slowF = F.motherSlowMul;
    P.hurtT = 0.3;
    P.moving = false;
    dmgNum(P.x, P.y - 30, Math.max(1, Math.round(before - P.hp)), true);
    part({ x: P.x, y: P.y, life: 0.45, size: 150, col: '#d9a8ff', kind: 'ring' });
    part({ x: P.x, y: P.y, life: 0.3, size: 90, col: '#ffffff', kind: 'ring' });
    G.flash = 0.3;
    G.motherFxT = 0.3;
    addShake(12, true);
    Sfx.sfx.motherSkill();
    Sfx.meow('hurt');
    if (P.hp <= 0) { P.hp = 0; startDying(); } // 保底理论上不会触发，兜底
  }
  function killEnemy(e) {
    if (e.dieDone) return;
    if (e.house) { destroyMotherHouse(e); return; } // 意见10：老巢捣毁走专属流程（残骸保留，妈妈降临）
    e.dieDone = true;
    G.kills++;
    // 掉落
    if (e.boss) {
      if (e.mother) { killMother(e); return; }
      // 轮Boss被讨伐：本轮结束（残怪保留），短暂演出后进入下一轮
      G.bossTTKSamples.push(Math.max(2, G.roundTime - Math.max(0, G.bossSpawnT)));
      popStars(e.x, e.y, '#ffd34d', 40);
      part({ x: e.x, y: e.y, life: 0.9, size: 120, col: '#ffd9e6', kind: 'ring' });
      G.flash = 0.6; addShake(14, true);
      Sfx.sfx.bigPop(); Sfx.meow('victory'); Sfx.sfx.victory();
      G.timeScale = 0.25;
      G.slowmoT = 1.1;
      const stats = collectRoundStats();
      if (G.round === 3 && !G.motherDone && !G.motherActive) {
        // 第 3 轮压轴：守轮结算照记（金币 + 动态难度输入），但不进入下一轮——老鼠妈妈即将降临
        G.prevRound = { mods: G.roundMods, stats };
        G.gold += 60 + G.round * 15;
        G.after.push({ t: 1.3, fn: startMotherWarn });
      } else {
        G.after.push({ t: 1.3, fn: () => finishRound(stats) });
      }
      return;
    }
    if (e.elite) {
      for (let i = 0; i < 6; i++) dropGem(e.x + U.rand(-24, 24), e.y + U.rand(-24, 24), 5);
      dropGem(e.x, e.y, 25);
      // 意见7：普通精英不再必掉宝箱——基础 50%，幸运每点 +6%（锦鲤满级 luck=3 → 68%，封顶 85%），
      // 没掉宝箱改掉 1 枚金币；批次头目属 boss 级不受影响、必掉宝箱
      const EC2 = DATA.CFG.elite;
      const chestP = Math.min(0.85, (EC2.chestBase != null ? EC2.chestBase : 1) + mods.luck * (EC2.chestLuck || 0));
      if (e.batchBoss || U.chance(chestP)) {
        G.chests.push({ x: e.x, y: e.y, t: 0, taken: false });
        banner('✨ 精英倒下了！掉落了宝箱 ✨', 2.2);
      } else {
        dropPickup(e.x, e.y, 'coin');
        banner('✨ 精英倒下了！掉了一枚金币 ✨', 2);
      }
      dropPickup(e.x + 20, e.y, 'milk');
      // 分裂词条：死后裂出一圈小型精英血量的同类
      if (e.affSplit && !e.noSplit) {
        const S = DATA.ROUNDS.affixes.split;
        for (let i = 0; i < S.n; i++) {
          const a2 = i / S.n * TAU;
          const c = spawnEnemy(e.type, e.x + Math.cos(a2) * 46, e.y + Math.sin(a2) * 46, false);
          c.hp *= S.hpMul; c.maxHp = c.hp; c.scale = 1.3; c.r *= 1.25; c.noSplit = true;
        }
        banner('❗ 头目分裂了！', 1.5);
      }
      if (e.batchBoss) {
        G.bossTTKSamples.push(Math.max(2, (G.roundTime - G.batchBossSpawnT) / (G.batchBossFrac || 1)));
        G.chests.push({ x: e.x, y: e.y, t: 0, taken: false }); // 头目讨伐 → 宝箱（每轮 4 次）
        advanceBatch();
      }
    } else {
      dropGem(e.x, e.y, e.def.xp);
      const D = DATA.DROPS;
      const luck = mods.luck;
      if (U.chance(D.coin + luck * 0.01)) dropPickup(e.x, e.y, 'coin');
      else if (U.chance(D.milk + luck * 0.004)) dropPickup(e.x, e.y, 'milk');
      else if (U.chance(D.firework + luck * 0.003)) dropPickup(e.x, e.y, 'firework');
      else if (U.chance(D.vacuum + luck * 0.003)) dropPickup(e.x, e.y, 'vacuum');
      else if (U.chance(D.chestDrop + luck * D.chestLuck)) G.chests.push({ x: e.x, y: e.y, t: 0, taken: false }); // 极小概率掉宝箱，幸运提升
      Sfx.sfx.pop();
      popStars(e.x, e.y, '#fff', 5 + (e.def.mass > 2 ? 4 : 0));
      if (e.def.mass > 2) addShake(2.5);
    }
  }
  function hitEnemy(e, dmg, kbx, kby, opts) {
    if (e.dieDone || e.hp <= 0 || (e.house && e.ruined)) return;
    opts = opts || {};
    // 猫爪印：全局会心/汲血并入每一次伤害（全武器 + 光环/区域生效）
    if (mods.crit) opts.crit = (opts.crit || 0) + mods.crit;
    if (mods.lifesteal) opts.lifesteal = (opts.lifesteal || 0) + mods.lifesteal;
    let d = dmg, crit = false;
    if (opts.crit && U.chance(opts.crit)) { d *= opts.critMul || 2; crit = true; }
    if (e.dmgTakenMul) d *= e.dmgTakenMul; // 「铁壁」词条：受伤减免
    e.hp -= d;
    G.dmgTotal += d; G.secDmg += d; // 结算统计：总伤害 + 当前秒桶
    e.flash = 0.12;
    dmgNum(e.x, e.y - e.r - 6, d, crit);
    if (!e.boss && !e.house && !opts.noKb) {
      const res = e.kbRes != null ? e.kbRes : (e.def.kbRes || 1);
      const m = e.def.mass || 1;
      e.kx += (kbx || 0) * res / m; e.ky += (kby || 0) * res / m;
      if (Math.abs(kbx || 0) + Math.abs(kby || 0) > 60) e.faceT = 0.4; // 被打飞的惊讶脸
    }
    if (crit) {
      addShake(2);
      part({ x: e.x, y: e.y - e.r, life: 0.3, size: 16, col: '#ffd34d', kind: 'ring' });
    }
    if (opts.lifesteal) healPlayer(d * opts.lifesteal);
    Sfx.sfx.hitThrottle();
    if (e.hp <= 0) killEnemy(e);
  }
  // 节流打击音效
  let hitSfxLast = 0;
  Sfx.sfx.hitThrottle = () => {
    const now = performance.now();
    if (now - hitSfxLast > 70) { hitSfxLast = now; Sfx.sfx.hit(); }
  };

  /* ================= 掉落物 ================= */
  function dropGem(x, y, v) {
    if (curMap) { const p2 = walkPoint(x, y, 120); x = p2.x; y = p2.y; } // 别掉进墙里捡不到
    if (G.gems.length > DATA.CFG.drops.gemMax) { // 合并最旧的两颗
      const a = G.gems[0], b = G.gems[1];
      a.val += b ? b.val : 0;
      if (b) U.swapRemove(G.gems, 1);
    }
    G.gems.push({ x: x + U.rand(-6, 6), y: y + U.rand(-6, 6), vx: U.rand(-40, 40), vy: U.rand(-40, 40), val: v, vac: false, t: U.rand(0, TAU) });
  }
  function dropPickup(x, y, kind) {
    if (curMap) { const p2 = walkPoint(x, y, 120); x = p2.x; y = p2.y; }
    G.pickups.push({ x, y, kind, t: U.rand(0, TAU) });
  }

  /* ================= 空间哈希 ================= */
  const CELL = 76;
  let grid = new Map();
  function gridKey(cx, cy) { return cx * 100003 + cy; }
  function rebuildGrid() {
    grid.clear();
    for (const e of G.enemies) {
      if (e.dieDone) continue;
      const k = gridKey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
      let arr = grid.get(k);
      if (!arr) { arr = []; grid.set(k, arr); }
      arr.push(e);
    }
  }
  function queryGrid(x, y, r, out) {
    out.length = 0;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const arr = grid.get(gridKey(cx, cy));
      if (arr) for (const e of arr) out.push(e);
    }
    return out;
  }
  const qbuf = [];
  const FD = [0, 0]; // 流场方向复用数组

  /* ================= 武器系统 ================= */
  // 意见5：所有攻击无论叠加后理论范围多大，最大都不超过屏幕——
  // 范围类攻击以「可视区短边的一半」为半径上限，投射物离开视野即消失（见 updateProjs）
  function atkMaxR() { return Math.min(worldW, worldH) * 0.5; }
  function wStats(w) {
    const def = WEAPONS[w.id];
    if (w.evolved) return Object.assign({}, def.statsEvo);
    const s = Object.assign({}, def.stats(w.lv));
    return s;
  }
  function evoEligible(w) {
    const def = WEAPONS[w.id];
    return !w.evolved && w.lv >= def.maxLv && passLv(def.evoPassive) > 0;
  }
  function nearestEnemy(x, y, maxR) {
    let best = null, bd = maxR * maxR;
    for (const e of G.enemies) {
      if (e.dieDone) continue;
      const d = U.dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function fireProj(o) {
    if (G.projs.length > 480) return;
    G.projs.push(Object.assign({ t: 0, life: 1.5, pierce: 1, hitSet: null, rot: 0, spin: 0 }, o));
  }
  function updateWeapons(dt) {
    const P = G.player;
    if (P.stunT > 0 || P.disarmT > 0) return; // 眩晕/缴械：全武器暂停（冷却与环绕球一并冻结）
    for (const w of P.weapons) {
      const def = WEAPONS[w.id];
      const s = wStats(w);
      const cd = Math.max(DATA.CFG.stamps.minCd, s.cd * mods.cdMult); // 引擎底线：冷却再低也不快过 minCd
      w.cdMax = cd; // 供 HUD 冷却指示
      w.t -= dt;
      if (w.id === 'orbit' || w.evolved && w.id === 'planet') {
        // 环绕武器独立状态机
        if (w.state === 0) { if (w.t <= 0) { w.state = 1; w.activeT = s.active; } }
        else {
          w.activeT -= dt;
          w.ang = (w.ang || 0) + s.speed * dt;
          if (w.activeT <= 0) { w.state = 0; w.t = cd; }
        }
        continue;
      }
      if (w.t > 0) continue;
      w.t = cd;
      const might = mods.might;
      switch (def.kind) {
        case 'claw': {
          const dmg = s.dmg * might, area = s.area * mods.areaMult;
          const mR = atkMaxR();
          const dirs = [[P.fx, P.fy]];
          if (s.both) dirs.push([-P.fx, -P.fy]);
          for (let wi = 0; wi < s.waves; wi++) {
            for (const [dx, dy] of dirs) {
              const delay = wi * 0.14 + (dx === -P.fx && dy === -P.fy ? 0.07 : 0);
              const fx = dx, fy = dy;
              G.after.push({
                t: delay, fn: () => {
                  G.slashes.push({
                    x: P.x, y: P.y, fx, fy, t: 0, life: 0.2,
                    reach: Math.min(145 * area, mR), half: Math.min(62 * area, mR * 0.5),
                    dmg, crit: s.crit, critMul: s.critMul, lifesteal: s.lifesteal,
                    kb: s.kb, hitSet: new Set()
                  });
                  Sfx.sfx.hit();
                }
              });
            }
          }
          break;
        }
        case 'homing': {
          const n = s.amount + mods.amountBonus;
          for (let i = 0; i < n; i++) {
            const a = U.rand(0, TAU);
            fireProj({
              kind: 'note', x: P.x, y: P.y - 10,
              vx: Math.cos(a) * s.speed * 0.5, vy: Math.sin(a) * s.speed * 0.5,
              speed: s.speed * mods.spdMult, dmg: s.dmg * might, pierce: s.pierce + mods.pierceBonus,
              life: 2.6, r: 12, retarget: 0
            });
          }
          break;
        }
        case 'knife': {
          const n = s.amount + mods.amountBonus;
          const base = Math.atan2(P.fy, P.fx);
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * s.spread + U.rand(-0.03, 0.03);
            const sp = s.speed * mods.spdMult;
            fireProj({
              kind: 'fish', x: P.x, y: P.y - 6,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              dmg: s.dmg * might, pierce: s.pierce + mods.pierceBonus, life: 1.3, r: 12,
              rot: a, spin: 0
            });
          }
          break;
        }
        case 'axe': {
          const n = s.amount + mods.amountBonus;
          for (let i = 0; i < n; i++) {
            fireProj({
              kind: 'axe', x: P.x + U.rand(-14, 14), y: P.y - 10,
              vx: U.rand(-130, 130) + P.fx * 60, vy: -U.rand(500, 600),
              grav: 980, dmg: s.dmg * might, pierce: 99, life: 2.6,
              r: Math.min(20 * s.area * mods.areaMult, atkMaxR() * 0.3),
              area: s.area * mods.areaMult, spin: U.rand(6, 9) * (U.chance(0.5) ? 1 : -1), startY: P.y
            });
          }
          break;
        }
        case 'lobzone': {
          const n = s.amount + mods.amountBonus;
          const lobR = Math.min(560, atkMaxR());
          for (let i = 0; i < n; i++) {
            const tgt = nearestEnemy(P.x, P.y, lobR);
            let tx, ty;
            if (tgt) { tx = tgt.x + U.rand(-30, 30); ty = tgt.y + U.rand(-30, 30); }
            else { const a = U.rand(0, TAU), d = U.rand(120, Math.min(320, lobR)); tx = P.x + Math.cos(a) * d; ty = P.y + Math.sin(a) * d; }
            fireProj({
              kind: 'litter', sx: P.x, sy: P.y - 12, tx, ty,
              T: U.rand(0.6, 0.8), t: 0, arc: 130,
              dmg: s.dmg * might, zoneR: Math.min(s.zoneR * mods.areaMult, atkMaxR() * 0.6), zoneT: s.zoneT, r: 12
            });
          }
          break;
        }
        case 'zap': {
          const strike = (e, d) => {
            G.parts.push({ t: 0, life: 0.26, kind: 'bolt', x1: e.x + U.rand(-30, 30), y1: e.y - 330, x2: e.x, y2: e.y - 8, col: '#ffe86b', size: 0, vr: 0, rot: 0, vx: 0, vy: 0 });
            part({ x: e.x, y: e.y - 8, life: 0.3, size: 22, col: '#fff7c8', kind: 'ring' });
            hitEnemy(e, d, 0, 0, { noKb: true });
          };
          const n = s.strikes + mods.amountBonus;
          const zapR2 = Math.min(560, atkMaxR());
          const inR = [];
          for (const e of G.enemies) if (!e.dieDone && U.dist2(P.x, P.y, e.x, e.y) < zapR2 * zapR2) inR.push(e);
          if (!inR.length) { w.t = 0.35; break; }
          let struck = [];
          for (let i = 0; i < n; i++) {
            const e = U.pick(inR);
            if (struck.includes(e)) continue;
            strike(e, s.dmg * might);
            struck.push(e);
            if (s.chain) {
              let from = e;
              for (let ci = 0; ci < s.chain; ci++) {
                let nb = null, bd = 160 * 160;
                for (const o of G.enemies) {
                  if (o.dieDone || struck.includes(o)) continue;
                  const d = U.dist2(from.x, from.y, o.x, o.y);
                  if (d < bd) { bd = d; nb = o; }
                }
                if (!nb) break;
                G.parts.push({ t: 0, life: 0.22, kind: 'bolt', x1: from.x, y1: from.y - 10, x2: nb.x, y2: nb.y - 10, col: '#ffe86b', size: 0, vr: 0, rot: 0, vx: 0, vy: 0 });
                strike(nb, s.dmg * might * 0.6);
                struck.push(nb); from = nb;
              }
            }
          }
          Sfx.sfx.thunder();
          break;
        }
      }
    }
    // 光环武器（持续型）
    for (const w of P.weapons) {
      if (WEAPONS[w.id].kind !== 'aura') continue;
      const s = wStats(w);
      const r = Math.min(s.radius * mods.areaMult, atkMaxR());
      w.tickT = (w.tickT || 0) - dt;
      if (w.tickT <= 0) {
        w.tickT = Math.max(0.15, s.tick * mods.cdMult); // 疾风印/小闹钟同样提高跳伤频率
        const dmg = s.dmg * mods.might;
        queryGrid(P.x, P.y, r, qbuf);
        for (const e of qbuf) {
          if (e.dieDone) continue;
          if (U.dist2(P.x, P.y, e.x, e.y) < (r + e.r) * (r + e.r)) {
            hitEnemy(e, dmg, 0, 0, { noKb: true });
            e.slowT = 0.5; e.slowF = 1 - (s.slow || 0);
          }
        }
        if (U.chance(0.6)) part({ x: P.x + U.rand(-r, r), y: P.y + U.rand(-r, r), vy: -20, life: 0.8, size: 4, col: '#9fe29a', kind: 'leaf' });
      }
    }
    // 环绕球碰撞
    for (const w of P.weapons) {
      if (WEAPONS[w.id].kind !== 'orbit' || w.state !== 1) continue;
      const s = wStats(w);
      const R = Math.min(s.radius * mods.areaMult, atkMaxR() * 0.8);
      const dmg = s.dmg * mods.might;
      const nOrb = s.amount + mods.amountBonus; // 影分印/手套对毛线球同样生效
      for (let i = 0; i < nOrb; i++) {
        const a = (w.ang || 0) + i * TAU / nOrb;
        const bx = P.x + Math.cos(a) * R, by = P.y + Math.sin(a) * R * 0.72; // 椭圆轨道更俯视
        queryGrid(bx, by, 30, qbuf);
        for (const e of qbuf) {
          if (e.dieDone || e.orbCd > 0) continue;
          if (U.dist2(bx, by, e.x, e.y) < (26 + e.r) * (26 + e.r)) {
            e.orbCd = s.hitCd;
            const ka = Math.atan2(e.y - P.y, e.x - P.x);
            hitEnemy(e, dmg, Math.cos(ka) * s.kb, Math.sin(ka) * s.kb);
          }
        }
      }
    }
  }
  // 挥击结算
  function updateSlashes(dt) {
    for (let i = G.slashes.length - 1; i >= 0; i--) {
      const s = G.slashes[i];
      s.t += dt;
      if (s.t < 0.02 || s.t > 0.16) { if (s.t >= s.life) U.swapRemove(G.slashes, i); continue; }
      const P = G.player;
      queryGrid(P.x + s.fx * s.reach / 2, P.y + s.fy * s.reach / 2, s.reach, qbuf);
      for (const e of qbuf) {
        if (e.dieDone || s.hitSet.has(e.uid)) continue;
        const dx = e.x - P.x, dy = e.y - P.y;
        const fw = dx * s.fx + dy * s.fy;
        const sd = -dx * s.fy + dy * s.fx;
        if (fw > -e.r && fw < s.reach && Math.abs(sd) < s.half + e.r) {
          s.hitSet.add(e.uid);
          const ka = Math.atan2(s.fy, s.fx);
          hitEnemy(e, s.dmg, Math.cos(ka) * s.kb, Math.sin(ka) * s.kb, { crit: s.crit, critMul: s.critMul, lifesteal: s.lifesteal });
          if (s.lifesteal) part({ x: P.x + U.rand(-10, 10), y: P.y - 20, vy: -40, life: 0.7, size: 5, col: '#ff8fb5', kind: 'heart' });
        }
      }
      if (s.t >= s.life) U.swapRemove(G.slashes, i);
    }
  }

  /* ================= 子弹更新 ================= */
  function updateProjs(dt) {
    for (let i = G.projs.length - 1; i >= 0; i--) {
      const p = G.projs[i];
      p.t += dt;
      // 意见5：任何攻击都不跑到屏幕外面——投射物一离开视野（留 40px 余量）立即消失
      //（猫砂弹例外：起/落点都已按攻击上限钳在屏内，中途剔除会导致伤害区丢失）
      if (p.kind !== 'litter' &&
          (Math.abs(p.x - G.cam.x) > worldW / 2 + 40 || Math.abs(p.y - G.cam.y) > worldH / 2 + 40)) {
        U.swapRemove(G.projs, i);
        continue;
      }
      if (p.kind === 'note') {
        p.retarget -= dt;
        if (p.retarget <= 0 || !p.tgt || p.tgt.dieDone) { p.tgt = nearestEnemy(p.x, p.y, 900); p.retarget = 0.25; }
        if (p.tgt) {
          const a = Math.atan2(p.tgt.y - p.y, p.tgt.x - p.x);
          const ca = Math.atan2(p.vy, p.vx);
          const na = ca + U.angNorm(a - ca) * Math.min(1, dt * 7);
          const sp = Math.hypot(p.vx, p.vy) || p.speed;
          p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
        }
        const sp = Math.hypot(p.vx, p.vy);
        if (sp < p.speed) { p.vx *= 1 + dt * 4; p.vy *= 1 + dt * 4; }
        p.rot = Math.sin(p.t * 10) * 0.3;
      } else if (p.kind === 'fish') {
        p.rot = Math.atan2(p.vy, p.vx);
      } else if (p.kind === 'axe') {
        p.vy += p.grav * dt;
        p.rot += p.spin * dt;
        if (p.vy > 0 && p.y > p.startY + 90) { p.t = p.life + 1; }
      } else if (p.kind === 'litter') {
        const k = Math.min(1, p.t / p.T);
        p.x = U.lerp(p.sx, p.tx, k); p.y = U.lerp(p.sy, p.ty, k) - Math.sin(k * Math.PI) * p.arc;
        p.rot = k * 9;
        if (k >= 1) { // 落地
          if (G.zones.length >= FX.zoneMax) G.zones.shift(); // 同屏伤害区上限：移除最旧的，地面不被猫砂淹没
          G.zones.push({ x: p.tx, y: p.ty, r: p.zoneR, t: p.zoneT, maxT: p.zoneT, tickT: 0, dmg: p.dmg });
          queryGrid(p.tx, p.ty, p.zoneR, qbuf);
          for (const e of qbuf) {
            if (e.dieDone) continue;
            if (U.dist2(p.tx, p.ty, e.x, e.y) < (p.zoneR * 0.8 + e.r) * (p.zoneR * 0.8 + e.r)) hitEnemy(e, p.dmg, 0, 0, { noKb: true });
          }
          popStars(p.tx, p.ty, '#e4d7c2', 6);
          Sfx.sfx.hitThrottle(); // 落地音走统一节流，连发时不再糊成一片噪声
          U.swapRemove(G.projs, i);
          continue;
        }
      }
      if (p.kind !== 'litter') { p.x += p.vx * dt; p.y += p.vy * dt; }
      // 碰撞
      queryGrid(p.x, p.y, p.r + 30, qbuf);
      let dead = false;
      for (const e of qbuf) {
        if (e.dieDone) continue;
        if (p.hitSet && p.hitSet.has(e.uid)) continue;
        if (U.dist2(p.x, p.y, e.x, e.y) < (p.r + e.r) * (p.r + e.r)) {
          if (!p.hitSet) p.hitSet = new Set();
          p.hitSet.add(e.uid);
          const sp2 = Math.hypot(p.vx || 0, p.vy || 0) || 1;
          hitEnemy(e, p.dmg, (p.vx || 0) / sp2 * 90, (p.vy || 0) / sp2 * 90);
          p.pierce--;
          if (p.pierce <= 0) { dead = true; break; }
        }
      }
      if (dead || p.t >= p.life) U.swapRemove(G.projs, i);
    }
  }
  function updateZones(dt) {
    for (let i = G.zones.length - 1; i >= 0; i--) {
      const z = G.zones[i];
      z.t -= dt; z.tickT -= dt;
      if (z.tickT <= 0) {
        z.tickT = 0.42;
        queryGrid(z.x, z.y, z.r, qbuf);
        for (const e of qbuf) {
          if (e.dieDone) continue;
          if (U.dist2(z.x, z.y, e.x, e.y) < (z.r + e.r) * (z.r + e.r)) hitEnemy(e, z.dmg * 0.55, 0, 0, { noKb: true });
        }
      }
      if (z.t <= 0) U.swapRemove(G.zones, i);
    }
  }

  /* ================= 敌方羽毛弹 / 视线（意见6） ================= */
  // 手工地图两点间是否无墙体阻隔（鸽子吐羽毛前用；40px 步长抽样足够粗）
  function hasLoS(x0, y0, x1, y1) {
    if (!curMap) return true;
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(d / 40));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (curMap.code(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) === MAPS.T.BLOCK) return false;
    }
    return true;
  }
  function updateEprojs(dt) {
    const P = G.player;
    for (let i = G.eprojs.length - 1; i >= 0; i--) {
      const p = G.eprojs[i];
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t >= p.life ||
          Math.abs(p.x - G.cam.x) > worldW / 2 + 60 || Math.abs(p.y - G.cam.y) > worldH / 2 + 60) {
        U.swapRemove(G.eprojs, i); continue;
      }
      if (G.state === 'play' && U.dist2(p.x, p.y, P.x, P.y) < (p.r + P.r) * (p.r + P.r)) {
        damagePlayer(p.dmg);
        part({ x: p.x, y: p.y, life: 0.25, size: 12, col: '#f0ead8', kind: 'ring' });
        U.swapRemove(G.eprojs, i);
      }
    }
  }

  /* ================= 敌人更新 ================= */
  // 反卡死瞬移落点：主角视野内、贴屏幕边缘的随机可走点（不在墙里/猫道里、离主角保底距离）
  function warpStuckPoint(e) {
    const A = DATA.CFG.antiStuck;
    const P = G.player;
    const hw = Math.max(40, worldW / 2 - A.edgeInset - e.r);
    const hh = Math.max(40, worldH / 2 - A.edgeInset - e.r);
    const minD = A.minPlayerD + e.r;
    let fb = null;
    for (let i = 0; i < A.samples; i++) {
      const side = (U.rand(0, 4)) | 0, t = U.rand(-1, 1); // 随机一条屏幕边 + 边上随机位置
      let x = G.cam.x + (side === 1 ? hw : side === 3 ? -hw : t * hw);
      let y = G.cam.y + (side === 0 ? -hh : side === 2 ? hh : t * hh);
      if (curMap && !curMap.free(x, y, false, e.r * 0.8)) {
        const p2 = curMap.nearWalk(x, y, false, A.edgeInset * 3); // 拉到附近可走点，尽量保住"贴边"
        if (Math.abs(p2.x - x) + Math.abs(p2.y - y) > A.edgeInset * 3) continue; // 边缘是实心墙：换一处
        x = p2.x; y = p2.y;
      }
      if (!fb) fb = { x, y };
      if (U.dist2(x, y, P.x, P.y) >= minD * minD) return { x, y };
    }
    return fb || edgePoint(50); // 视野太小凑不出保底距离时退而求其次；理论兜底走屏外生成
  }
  // 卡住判定与瞬移：在敌人位移结算后调用。stkT 负值段 = 瞬移后的保护冷却。
  function updateStuck(e, dt, dist, sp) {
    const A = DATA.CFG.antiStuck, P = G.player;
    const bossLv = e.boss || e.batchBoss;
    const limit = bossLv ? A.bossT : A.trashT;
    // 只统计"想追但追不动"：贴身互殴、入场演出不算卡；杂兵的合法定身（如三花蓄力）sp=0 天然排除。
    // Boss 级的蓄力/冲锋阶段（sp 被置 0）也要计时：卡在"蓄力→撞墙冲锋"循环里的鼠王位移恒为零，
    // 若不计时会被状态切换反复清零、永远打不死卡死轮次；健康 Boss 冲锋/追击有位移，照常衰减不会误判。
    const bossCycle = e.boss && (e.state === 'tele' || e.state === 'charge');
    const want = (sp > 1 || bossCycle) && dist > e.r + P.r + A.engageR;
    // 阈值随自身速度等比缩放（蜗牛/鼠王全速行走也不能误判，勿加绝对像素下限）；moved = 本帧真实位移（含击退/分离）
    const moved = Math.hypot(e.x - e.stkX, e.y - e.stkY);
    if (e.stkT < 0) e.stkT = Math.min(0, e.stkT + dt); // 冷却走完才重新计时
    else if (want && moved < sp * dt * A.frac + 0.02) e.stkT += dt;
    else e.stkT = Math.max(0, e.stkT - dt * 2); // 正常移动快速清零：偶尔蹭一下墙不累积
    e.stkX = e.x; e.stkY = e.y;
    if (e.stkT < limit) return;
    const pt = warpStuckPoint(e);
    part({ x: e.x, y: e.y + 10, life: 0.4, size: e.r * 2.2, col: '#b9a6f5', kind: 'ring' });
    e.x = pt.x; e.y = pt.y; e.kx = 0; e.ky = 0;
    e.stkT = -A.reWarpCd;
    e.warpStun = A.warpStun || 1.2; // 落地发懵：不动不攻击（公平交付，冲锋怪不再落地贴脸突袭）
    e.flash = 0.22;
    part({ x: e.x, y: e.y + 10, life: 0.5, size: e.r * 2.6, col: '#e2d6ff', kind: 'ring' });
    popStars(e.x, e.y, '#cbb8f0', bossLv ? 12 : 6);
    G.warps++;
    if (bossLv) { banner(e.def.name + ' 撕开空间追了上来！', 2.2); Sfx.sfx.bigPop(); addShake(8, true); }
    else Sfx.sfx.pop();
  }
  function updateEnemies(dt) {
    const P = G.player;
    if (curMap) { // 玩家流场：0.35s 一轮窗口 BFS（所有怪物据此绕墙寻路）
      G.flowT = (G.flowT || 0) - dt;
      if (G.flowT <= 0) { G.flowT = 0.35; curMap.buildFlow(P.x, P.y, 80); }
    }
    const cap = trashCap(); // 远敌传送回收的补怪判断使用同一杂兵上限
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      if (e.dieDone) { U.swapRemove(G.enemies, i); continue; }
      e.flash -= dt; e.orbCd -= dt; e.faceT -= dt;
      // 「狂暴」词条：血量低于阈值后一次性提速增伤
      if (e.affEnrage && !e.enraged && e.hp <= e.maxHp * (DATA.ROUNDS.affixes.enrage.atFrac || 0.3)) {
        e.enraged = true;
        const A = DATA.ROUNDS.affixes.enrage;
        e.spd *= A.spd; e.dmg *= A.dmg; e.flash = 0.3;
        part({ x: e.x, y: e.y - e.r, life: 0.5, size: 30, col: '#ff6b81', kind: 'ring' });
      }
      if (e.slowT > 0) { e.slowT -= dt; } else e.slowF = 1;
      if (e.warpStun > 0) e.warpStun -= dt; // 反卡死瞬移落地的发懵倒计时
      // 眨眼（生命感）
      e.blinkT -= dt;
      if (e.blinkT <= 0) { e.blinkA = 0.14; e.blinkT = U.rand(2.4, 5.5); }
      if (e.blinkA > 0) e.blinkA -= dt;
      // 清理太远的敌人（传送回包围圈）——老巢是地标，永不回收
      const pdx = P.x - e.x, pdy = P.y - e.y;
      const pd2 = pdx * pdx + pdy * pdy;
      const despawnR = Math.max(worldW, worldH) * 1.6;
      if (pd2 > despawnR * despawnR && !e.boss && !e.elite && !e.house) {
        U.swapRemove(G.enemies, i);
        // 意见6：补怪同样遵守上限滞回（打到回落阈值以下才补）
        if (G.enemies.length < (DATA.CFG.growth.capResume || 100)) {
          const pt = edgePoint(60);
          spawnEnemy(e.type, pt.x, pt.y, false);
        }
        continue;
      }
      // 老巢：静止地标，不走 AI/位移/碰撞/卡死判定（受击与分离网格照常）
      if (e.house) continue;
      const dist = Math.sqrt(pd2) || 1;
      let dirx = pdx / dist, diry = pdy / dist;
      let sp = e.spd * e.slowF * (curMap ? curMap.speedAt(e.x, e.y) : 1); // 地形减速同样拖慢鼠群
      // 流场寻路（v18）：手工地图上按玩家流场绕墙追击，替代直线撞墙
      if (curMap && curMap.flowReady && curMap.flowDir(e.x, e.y, FD)) { dirx = FD[0]; diry = FD[1]; }
      const def = e.def;
      if (def.zig) { // 麻雀 zigzag
        const px2 = -diry, py2 = dirx;
        const w2 = Math.sin(G.time * 5 + e.phase) * 0.7;
        dirx += px2 * w2; diry += py2 * w2;
        const l = Math.hypot(dirx, diry); dirx /= l; diry /= l;
      } else if (def.erratic) { // 蝙蝠乱窜
        e.phase -= dt;
        if (e.phase <= 0) { e.phase = U.rand(0.2, 0.45); e.wobble = U.rand(-1.2, 1.2); }
        const px2 = -diry, py2 = dirx;
        dirx += px2 * (e.wobble || 0); diry += py2 * (e.wobble || 0);
        const l = Math.hypot(dirx, diry); dirx /= l; diry /= l;
      } else if (def.lunge) { // 大鹅冲锋
        e.lungeCd -= dt;
        if (e.lungeT > 0) { e.lungeT -= dt; sp *= 2.6; }
        else if (dist < 220 && e.lungeCd <= 0) { e.lungeT = 0.5; e.lungeCd = 2.6; }
      } else if (e.boss) {
        if (e.mother) updateMother(e, dt);
        else updateBoss(e, dt, dist, dirx, diry);
        if (e.state !== 'chase') sp = 0; // 蓄力定身 / 冲刺自控位移
        sp *= e.slowF;
      }
      // 意见6：行为特性（杂兵与普通精英生效；头目级 boss/batchBoss 保持专一打法）
      const TR = DATA.CFG.enemyTraits;
      const trash = !e.boss && !e.batchBoss;
      if (trash && def.dash) { // 三花姐：黄圈预警定身 → 直线突进
        e.dashCd -= dt;
        if (e.dashSt === 1) {
          e.dashT -= dt; sp = 0;
          e.teleFx = (e.teleFx || 0) - dt;
          if (e.teleFx <= 0) { e.teleFx = 0.16; part({ x: e.x, y: e.y + 12, life: 0.32, size: 26, col: '#ffd34d', kind: 'ring' }); }
          if (e.dashT <= 0) { e.dashSt = 2; e.dashT = TR.dash.time; e.dashX = dirx; e.dashY = diry; Sfx.sfx.pop(); }
        } else if (e.dashSt === 2) {
          e.dashT -= dt;
          sp = e.spd * TR.dash.mul; dirx = e.dashX; diry = e.dashY;
          if (e.dashT <= 0) { e.dashSt = 0; e.dashCd = TR.dash.cd; }
        } else if (e.dashCd <= 0 && dist < TR.dash.range) {
          e.dashSt = 1; e.dashT = TR.dash.windup;
        }
      }
      if (trash && def.ranged) { // 鸽子：中距离吐羽毛（有墙隔着就不打）
        e.fireCd -= dt;
        if (e.fireCd <= 0 && dist > 90 && dist < TR.ranged.range) {
          e.fireCd = TR.ranged.cd * U.rand(0.85, 1.2);
          if (hasLoS(e.x, e.y, P.x, P.y)) {
            const fa = Math.atan2(P.y - e.y, P.x - e.x);
            G.eprojs.push({ x: e.x, y: e.y - 6, vx: Math.cos(fa) * TR.ranged.speed, vy: Math.sin(fa) * TR.ranged.speed,
              r: 7, dmg: e.dmg * TR.ranged.dmgMul, t: 0, life: TR.ranged.life, rot: fa });
            part({ x: e.x, y: e.y - e.r - 8, life: 0.22, size: 9, col: '#fff', kind: 'ring' });
            Sfx.sfx.pop();
          }
        }
      }
      if (trash && def.steal) { // 浣熊：主角不在跟前就先扑最近的鱼干吞掉
        e.stealT -= dt;
        if (e.stealT <= 0) {
          e.stealT = 0.25;
          e.tgtGem = null;
          if (dist > TR.steal.keep) {
            let bd = TR.steal.radius * TR.steal.radius;
            for (const g of G.gems) {
              const d2 = U.dist2(e.x, e.y, g.x, g.y);
              if (d2 < bd) { bd = d2; e.tgtGem = g; }
            }
          }
        }
        if (e.tgtGem && G.gems.indexOf(e.tgtGem) >= 0) {
          const gd = Math.hypot(e.tgtGem.x - e.x, e.tgtGem.y - e.y) || 1;
          dirx = (e.tgtGem.x - e.x) / gd; diry = (e.tgtGem.y - e.y) / gd;
          if (gd < TR.steal.eatR) {
            U.swapRemove(G.gems, G.gems.indexOf(e.tgtGem));
            e.tgtGem = null;
            goldFloat(e.x, e.y - 22, '咕！');
            popStars(e.x, e.y, '#9fe29a', 6);
            Sfx.sfx.pop();
          }
        }
      }
      if (trash && def.slime && sp > 4) { // 蜗牛：移动时身后留黏液（只拖慢主角）
        e.slimeT -= dt;
        if (e.slimeT <= 0) {
          e.slimeT = TR.slime.gap;
          if (G.slimes.length >= TR.slime.max) G.slimes.shift();
          G.slimes.push({ x: e.x, y: e.y + 8, r: TR.slime.r, t: TR.slime.life, maxT: TR.slime.life });
        }
      }
      // 分离（同格拥挤互推）
      queryGrid(e.x, e.y, e.r + 8, qbuf);
      let sepx = 0, sepy = 0, nsep = 0;
      for (const o of qbuf) {
        if (o === e || o.dieDone) continue;
        const dx = e.x - o.x, dy = e.y - o.y;
        const d2 = dx * dx + dy * dy;
        const rr2 = (e.r + o.r) * 0.9;
        if (d2 < rr2 * rr2 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          sepx += dx / d; sepy += dy / d;
          if (++nsep >= 5) break;
        }
      }
      if (nsep) {
        const l = Math.hypot(sepx, sepy) || 1;
        dirx = dirx * 0.82 + sepx / l * 0.35; diry = diry * 0.82 + sepy / l * 0.35;
      }
      // 位移（手工地图上绕墙滑动；猫道对敌人是墙）
      if (e.warpStun > 0) sp = 0; // 发懵中：原地发抖不移动（突进/冲锋也停）
      const mdx = (dirx * sp + e.kx) * dt, mdy = (diry * sp + e.ky) * dt;
      if (curMap) curMap.moveActor(e, mdx, mdy, false);
      else { e.x += mdx; e.y += mdy; }
      e.kx *= 1 - Math.min(1, dt * 7); e.ky *= 1 - Math.min(1, dt * 7);
      // 反卡死兜底：寻路仍解不了的死角，卡满阈值瞬移进主角视野贴边处（v19）
      updateStuck(e, dt, dist, sp);
      // 碰撞玩家
      if (!e.dieDone && pd2 < (e.r + P.r) * (e.r + P.r)) {
        damagePlayer(e.dmg);
      }
    }
  }
  function updateBoss(b, dt, dist, dirx, diry) {
    const F = DATA.CFG.finale;
    b.st -= dt;
    b.summonT -= dt;
    if (b.landT > 0) b.landT -= dt;
    if (b.state === 'entry') { // 从天而降
      b.entryT -= dt;
      if (b.entryT <= 0) {
        b.state = 'chase'; b.st = 1.6; b.landT = 0.28;
        addShake(14, true);
        part({ x: b.x, y: b.y + 20, life: 0.7, size: 90, col: '#cfd0ff', kind: 'ring' });
        for (let i = 0; i < 14; i++) {
          const a2 = U.rand(0, TAU);
          part({ x: b.x + Math.cos(a2) * 30, y: b.y + 24, vx: Math.cos(a2) * U.rand(60, 160), vy: -U.rand(30, 120), life: U.rand(0.3, 0.7), size: U.rand(3, 7), col: '#8d93aa', kind: 'dot', grav: 300 });
        }
        Sfx.sfx.bigPop();
      }
      return;
    }
    if (b.state === 'chase') {
      if (b.summonT <= 0) {
        b.summonT = F.bossSummonCd;
        banner('鼠王：吱吱吱！孩子们上！', 2);
        for (let i = 0; i < F.bossSummonN; i++) {
          const a = U.rand(0, TAU);
          const r = spawnEnemy('rat', b.x + Math.cos(a) * 60, b.y + Math.sin(a) * 60, false);
          r.hp *= F.bossSummonHpMul; r.maxHp = r.hp;
        }
      }
      if (dist < F.bossChargeDist && b.st <= 0) { b.state = 'tele'; b.st = F.bossTeleTime; }
    } else if (b.state === 'tele') {
      if (b.st <= 0) {
        b.state = 'charge'; b.st = F.bossChargeTime;
        b.cvx = dirx * b.spd * F.bossChargeMul; b.cvy = diry * b.spd * F.bossChargeMul;
        Sfx.sfx.boss();
      }
    } else if (b.state === 'charge') {
      if (curMap) curMap.moveActor(b, b.cvx * dt, b.cvy * dt, false);
      else { b.x += b.cvx * dt; b.y += b.cvy * dt; }
      if (U.chance(0.5)) part({ x: b.x + U.rand(-20, 20), y: b.y + 30, vy: -30, life: 0.4, size: 6, col: '#8d93aa', kind: 'dot' });
      if (b.st <= 0) { b.state = 'chase'; b.st = 2.2; }
    }
  }

  /* ================= 玩家 ================= */
  function healPlayer(v) {
    const P = G.player;
    P.hp = Math.min(P.maxHp, P.hp + v);
  }
  function damagePlayer(d) {
    const P = G.player;
    if (P.iframes > 0 || G.state !== 'play') return;
    P.hp -= d;
    P.iframes = DATA.PLAYER.iframes;
    P.hurtT = 0.25;
    addShake(7, true);
    G.flash = 0.25;
    Sfx.sfx.playerHurt();
    Sfx.meow('hurt');
    dmgNum(P.x, P.y - 26, d, false);
    popStars(P.x, P.y - 10, '#ff8f9f', 5);
    if (P.hp <= 0) { P.hp = 0; startDying(); }
  }
  function updatePlayer(dt) {
    const P = G.player;
    // 老鼠妈妈全屏斩控制链：眩晕（不能动）→ 缴械（能动但武器停，updateWeapons 处理）
    if (P.stunT > 0) P.stunT -= dt;
    if (P.disarmT > 0) P.disarmT -= dt;
    let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    let iy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    if (joy.on) { ix = joy.x; iy = joy.y; }
    if (P.stunT > 0) { ix = 0; iy = 0; }
    const l = Math.hypot(ix, iy);
    P.moving = l > 0.15;
    // 老鼠妈妈全屏斩减速（等同踩到减速地面）+ 地形减速（草地/沙地/深雪/落叶）+ 70级后移速成长
    if (P.slowT > 0) { P.slowT -= dt; if (P.slowT <= 0) P.slowF = 1; }
    // 意见6：蜗牛黏液带踩上去额外减速（与地形减速叠乘）
    let slimeMul = 1;
    const SLT = (DATA.CFG.enemyTraits || {}).slime;
    if (SLT) for (const s of G.slimes) {
      if (U.dist2(P.x, P.y, s.x, s.y) < (s.r + 10) * (s.r + 10)) { slimeMul = Math.min(slimeMul, SLT.slow); break; }
    }
    const terMul = (curMap ? curMap.speedAt(P.x, P.y) : 1) * (P.slowT > 0 ? (P.slowF || 1) : 1) * (P.spdMul || 1) * slimeMul;
    // 移动加速曲线：渐起渐停，走起来更"软"
    const acc = Math.min(1, dt * 11), dec = Math.min(1, dt * 13);
    if (P.moving) {
      ix /= Math.max(1, l); iy /= Math.max(1, l);
      P.vx = U.lerp(P.vx, ix * DATA.PLAYER.speed * terMul, acc);
      P.vy = U.lerp(P.vy, iy * DATA.PLAYER.speed * terMul, acc);
      P.fx = ix; P.fy = iy;
      if (Math.abs(ix) > 0.2) P.flip = ix < 0;
      P.walkT += dt * Math.min(1.3, Math.hypot(P.vx, P.vy) / DATA.PLAYER.speed + 0.35);
      // 减速地形扬尘
      G.dustT -= dt;
      if (terMul < 1 && G.dustT <= 0) {
        G.dustT = 0.16;
        part({ x: P.x + U.rand(-8, 8), y: P.y + 20, vx: U.rand(-12, 12), vy: -U.rand(10, 26), life: 0.5, size: 3, col: (curMap && curMap.meta.dust) || '#cfd8e8', kind: 'dot' });
      }
    } else {
      P.vx = U.lerp(P.vx, 0, dec); P.vy = U.lerp(P.vy, 0, dec);
    }
    // 手工地图：碰撞滑动（猫可以走猫道）
    if (curMap) curMap.moveActor(P, P.vx * dt, P.vy * dt, true);
    else { P.x += P.vx * dt; P.y += P.vy * dt; }
    // 第一次踏上猫道：教学提示
    if (curMap && !G.catHint && curMap.code(P.x, P.y) === MAPS.T.CAT) {
      G.catHint = true;
      banner('🐾 猫道！只有你能钻过去，鼠群进不来～', 2.8);
      Sfx.meow('idle');
    }
    P.iframes -= dt; P.hurtT -= dt;
    // 眨眼
    P.blinkT -= dt;
    if (P.blinkT <= 0) { P.blinkA = 0.13; P.blinkT = U.rand(2.2, 5); }
    if (P.blinkA > 0) P.blinkA -= dt;
    if (mods.regen) healPlayer(mods.regen * dt);
    // 闲置喵叫（真实采样）：间隔拉大，时不时来一声就好
    G.idleMeowT -= dt;
    if (G.idleMeowT <= 0) {
      G.idleMeowT = U.rand(14, 26);
      Sfx.meow('idle');
      heartAt(P.x + 14 * (P.flip ? -1 : 1), P.y - 34);
    }
  }

  /* ================= 拾取更新 ================= */
  function updatePickups(dt) {
    const P = G.player;
    const pickR = DATA.PLAYER.pickupR * mods.pickMult;
    // 鱼干
    for (let i = G.gems.length - 1; i >= 0; i--) {
      const g = G.gems[i];
      g.t += dt;
      const d2 = U.dist2(P.x, P.y, g.x, g.y);
      if (g.vac || d2 < pickR * pickR) {
        const d = Math.sqrt(d2) || 1;
        const pull = g.vac ? 700 : 380 + (1 - Math.min(1, d / pickR)) * 520; // 越近吸得越快
        g.vx = (P.x - g.x) / d * pull; g.vy = (P.y - g.y) / d * pull;
        g.x += g.vx * dt; g.y += g.vy * dt;
        if (d < 20) {
          addXp(g.val);
          G.gemCombo++; G.gemComboT = 1;
          Sfx.sfx.gem(G.gemCombo);
          U.swapRemove(G.gems, i);
        }
      } else {
        g.x += g.vx * dt; g.y += g.vy * dt;
        g.vx *= 1 - Math.min(1, dt * 6); g.vy *= 1 - Math.min(1, dt * 6);
      }
    }
    G.gemComboT -= dt;
    if (G.gemComboT <= 0) G.gemCombo = 0;
    // 其他掉落
    for (let i = G.pickups.length - 1; i >= 0; i--) {
      const p = G.pickups[i];
      p.t += dt;
      const pdx2 = U.dist2(P.x, P.y, p.x, p.y);
      if (p.vac || pdx2 < (pickR * 0.8 + 14) * (pickR * 0.8 + 14)) {
        const d = Math.sqrt(pdx2) || 1;
        const pull = p.vac ? 700 : 260; // 被吸尘器盯上的金币：全场高速飞向主角
        p.x += (P.x - p.x) / d * pull * dt; p.y += (P.y - p.y) / d * pull * dt;
      }
      if (U.dist2(P.x, P.y, p.x, p.y) < 26 * 26) {
        if (p.kind === 'coin') { G.gold += Math.round(U.randInt(3, 8) * DATA.DIFF.goldGain); Sfx.sfx.coin(); coinLottery(p.x, p.y); }
        else if (p.kind === 'milk') { healPlayer(DATA.CFG.drops.milkHeal); Sfx.sfx.milk(); heartAt(P.x, P.y - 30); part({ x: P.x, y: P.y - 20, life: 0.6, size: 26, col: '#bfe3ff', kind: 'ring' }); }
        else if (p.kind === 'firework') {
          Sfx.sfx.firework();
          G.flash = 0.5; addShake(12, true);
          part({ x: P.x, y: P.y, life: 0.5, size: 60, col: '#ffd34d', kind: 'ring' });
          // 烟花伤害 = max(固定 150, 屏内「满血杂兵」中最低血者的 80%)：杂兵血量随轮次膨胀后，烟花依然保有清场存在感
          // （头目/老鼠妈妈/老巢不参与基准计算，避免屏内只剩满血 Boss 或老巢时被一刀削 80%）
          let fullMin = Infinity;
          for (const e of G.enemies) {
            if (e.dieDone || e.boss || e.mother || e.house || e.maxHp == null) continue;
            if (Math.abs(e.x - P.x) >= worldW / 2 + 60 || Math.abs(e.y - P.y) >= worldH / 2 + 60) continue;
            if (e.hp >= e.maxHp && e.hp < fullMin) fullMin = e.hp;
          }
          const fdmg = Math.max(DATA.CFG.drops.fireworkDmg, Number.isFinite(fullMin) ? fullMin * 0.8 : 0);
          for (const e of G.enemies) {
            if (e.dieDone) continue;
            if (Math.abs(e.x - P.x) < worldW / 2 + 60 && Math.abs(e.y - P.y) < worldH / 2 + 60) hitEnemy(e, fdmg, 0, 0, { noKb: true });
          }
        } else if (p.kind === 'vacuum') {
          Sfx.sfx.vacuum();
          for (const g of G.gems) g.vac = true;
          for (const o of G.pickups) if (o.kind === 'coin') o.vac = true; // 意见4：吸小鱼干时金币一起吸
          part({ x: P.x, y: P.y, life: 0.8, size: 40, col: '#9fe29a', kind: 'ring' });
        }
        U.swapRemove(G.pickups, i);
      }
    }
    // 宝箱
    for (let i = G.chests.length - 1; i >= 0; i--) {
      const c = G.chests[i];
      c.t += dt;
      if (!c.taken && U.dist2(P.x, P.y, c.x, c.y) < DATA.CFG.chest.radius * DATA.CFG.chest.radius) {
        c.taken = true;
        U.swapRemove(G.chests, i);
        // 开箱小演出：光柱 + 彩纸，稍候弹面板
        part({ x: c.x, y: c.y, life: 0.8, size: 40, col: '#ffe9a8', kind: 'ring' });
        beamAt(c.x, c.y - 10, '#ffe9a8');
        popStars(c.x, c.y, '#ffd34d', 16);
        Sfx.sfx.chest();
        G.after.push({ t: 0.4, fn: () => openChest(!!c.mother) });
      }
    }
  }

  /* ================= 金币经验规则 ================= */
  // 拾到金币 → 均匀随机查 lottery.tiers 定档：单枚经验 = 档位% × 当前等级升级所需经验（80% 封顶）。
  // 绝大部分落在最小的 1%，极少到 30%，非常罕见到 80%；幸运（锦鲤）放大非最小档概率。
  function rollLotteryTier() {
    const L = DATA.LOTTERY;
    const tiers = L.tiers || [];
    if (!tiers.length) return 0.01;
    const minPct = tiers[tiers.length - 1].pct;
    const luck = mods ? (mods.luck || 0) : 0;
    const boost = 1 + luck * (L.luckBoost || 1);
    let total = 0;
    const eff = tiers.map(t => {
      const p = t.pct === minPct ? t.p : t.p * boost;
      total += p;
      return { pct: t.pct, p };
    });
    let r = Math.random() * total;
    for (const t of eff) { if (r < t.p) return t.pct; r -= t.p; }
    return minPct;
  }
  function applyLottery(pct, x, y) {
    const need = DATA.xpNeed(G.player.lv || 1);
    const v = Math.max(1, Math.round(need * pct));
    addXp(v);
    const pc = Math.round(pct * 100);
    // 世界层特效只在实际游戏画面播（宝箱金币位走宝箱面板自己的联动演出，世界层只留粒子/飘字，恢复后立刻可见）
    const inWorld = G.state === 'play';
    if (pct >= 0.80) {
      // ≥80%：最高规格——烟花 + 全屏金光 + 震屏 + 群猫欢呼迷你版
      popStars(x, y, '#ffd34d', 26);
      part({ x, y, life: 0.9, size: 70, col: '#ffd34d', kind: 'ring' });
      goldFloat(x, y - 18, '💥 ' + pc + '% 经验大奖 +' + v);
      if (inWorld) {
        G.flash = 0.55; addShake(10, true);
        Sfx.sfx.firework(); Sfx.sfx.fanfare(true); Sfx.sfx.meowChoir();
        worldCelebrate();
      }
    } else if (pct >= 0.30) {
      // ≥30%：接近头奖——短 fanfare + 震屏 + 彩纸
      popStars(x, y, '#ffd34d', 20);
      confettiAt(x, y - 6);
      part({ x, y, life: 0.8, size: 60, col: '#ffd34d', kind: 'ring' });
      goldFloat(x, y - 16, '✨ ' + pc + '% 经验 +' + v);
      if (inWorld) { addShake(6, true); Sfx.sfx.fanfare(false); }
    } else if (pct >= 0.10) {
      // ≥10%：金币大奖式演出（数值直达，演出加强 + 彩纸）
      popStars(x, y, '#ffd34d', 18);
      confettiAt(x, y - 6);
      part({ x, y, life: 0.7, size: 55, col: '#ffd34d', kind: 'ring' });
      goldFloat(x, y - 16, pc + '% 经验 +' + v);
      if (inWorld) Sfx.sfx.rareDing();
    } else if (pct >= 0.05) {
      // ≥5%：低概率大额经验——星星爆 + 金色飘字升级 + 专属「叮咚」
      popStars(x, y, '#ffe9a8', 12);
      goldFloat(x, y - 15, '⭐ ' + pc + '% 经验 +' + v);
      if (inWorld) Sfx.sfx.dingDong();
    } else {
      goldFloat(x, y - 14, '+' + v);
    }
    return v;
  }
  function coinLottery(x, y) {
    applyLottery(rollLotteryTier(), x, y);
  }
  function addXp(v) {
    const P = G.player;
    const PL = DATA.CFG.postLevel || {};
    P.xp = (P.xp || 0) + v * DATA.DIFF.xpGain * ((G.roundMods && G.roundMods.xpMul) || 1);
    let need = DATA.xpNeed(P.lv || 1);
    while (P.xp >= need) {
      const nl = (P.lv || 1) + 1;
      if (PL.chestOnlyFrom != null && nl > PL.chestOnlyFrom) break; // 80 级后：经验攒着，只能靠宝箱结算升级
      P.xp -= need;
      P.lv = nl;
      if (PL.autoFrom != null && nl >= PL.autoFrom) applyPostGrow(); // 70 级起：自动成长（+2% 生命/+1% 移速/回满），不再弹三选一
      else G.pendingLv++;
      need = DATA.xpNeed(P.lv);
    }
    if (G.pendingLv > 0 && G.state === 'play') openLevelUp();
  }

  /* ================= 升级 3 选 1 ================= */
  let lvlChoices = [];
  // 专有被动门槛：被动是武器进化的钥匙（evoPassive 配对）——没拥有对应武器前不进卡池；
  // 武器选满后拿不到新武器，未拥有武器的专有被动随之绝迹。无配对的通用被动（磁铁鱼/锦鲤）不受限。
  function passiveOffered(id) {
    let paired = false;
    for (const wid of WEAPON_ORDER) {
      if ((WEAPONS[wid] || {}).evoPassive !== id) continue;
      paired = true;
      if (G.player.weapons.find(w => w.id === wid)) return true;
    }
    return !paired;
  }
  function buildPool() {
    const P = G.player;
    const pool = [];
    for (const w of P.weapons) if (!w.evolved && w.lv < WEAPONS[w.id].maxLv) pool.push({ kind: 'w', id: w.id, cur: w });
    // 武器上限：默认猫爪不计入，猫爪外最多再选 slots.weapon 种
    const pickedW = P.weapons.filter(w => w.id !== 'claw').length;
    if (pickedW < DATA.SLOTS.weapon)
      for (const id of WEAPON_ORDER) if (!P.weapons.find(w => w.id === id)) pool.push({ kind: 'w', id, cur: null });
    for (const p of P.passives) if (p.lv < PASSIVES[p.id].maxLv) pool.push({ kind: 'p', id: p.id, cur: p });
    if (P.passives.length < DATA.SLOTS.passive)
      for (const id of PASSIVE_ORDER) if (!P.passives.find(p => p.id === id) && passiveOffered(id)) pool.push({ kind: 'p', id, cur: null });
    return pool;
  }
  function openLevelUp() {
    G.state = 'levelup';
    Sfx.sfx.lvl();
    Sfx.meow('happy');
    const pool = buildPool();
    const idx = U.pickIndices(pool.length, 3); // 洗牌抽 3 张（不足 3 张时全出）
    lvlChoices = idx.map(i => pool[i]);
    // 意见1：升级三选一不再出现猫爪印（70 级后只通过宝箱发放）；常规卡也抽空了才给安慰奖
    if (!lvlChoices.length) lvlChoices = [{ kind: 'heal' }];
    const box = $('lvl-cards');
    box.innerHTML = '';
    if (AUTO === 'play' || AUTO === 'boss') setTimeout(() => chooseCard(0), 400);
    lvlChoices.forEach((c, i) => {
      const card = document.createElement('div');
      card.className = 'card';
      let tag, name, desc, iconKey, pips = 0, pipsMax = 0, tagCls = '';
      if (c.kind === 'w') {
        const def = WEAPONS[c.id];
        if (c.cur) {
          tag = `Lv ${c.cur.lv} → ${c.cur.lv + 1}`;
          desc = def.gain[c.cur.lv];
          pips = c.cur.lv + 1; pipsMax = def.maxLv;
          if (c.cur.lv + 1 >= def.maxLv && passLv(def.evoPassive) > 0) { tagCls = 'evo'; tag = '满级！可进化 →'; }
        } else { tagCls = 'new'; tag = '新武器！'; desc = def.desc; pips = 1; pipsMax = def.maxLv; }
        name = def.name; iconKey = def.icon;
      } else if (c.kind === 'p') {
        const def = PASSIVES[c.id];
        if (c.cur) { tag = `Lv ${c.cur.lv} → ${c.cur.lv + 1}`; pips = c.cur.lv + 1; pipsMax = def.maxLv; }
        else { tagCls = 'new'; tag = '新道具！'; pips = 1; pipsMax = def.maxLv; }
        name = def.name; desc = def.desc; iconKey = def.icon;
      } else if (c.kind === 's') {
        const meta = STAMP_META[c.id];
        const stacks = stampStacks(c.id);
        tagCls = 'stamp';
        tag = stacks > 0 ? `猫爪印 ×${stacks} → ×${stacks + 1}` : '新猫爪印！';
        name = meta.name;
        desc = stampEffectText(c.id, stacks + 1);
        iconKey = meta.icon;
      } else { tagCls = 'new'; tag = '安慰奖'; name = '金枪鱼罐头'; desc = '回复 30 生命 + 100 金币'; iconKey = 'milkIcon'; }
      const pipsHtml = c.kind === 's'
        ? `<div class="scount">已叠 ×${stampStacks(c.id)}（可无限叠加）</div>`
        : Array.from({ length: pipsMax }, (_, k) => `<div class="pip ${k < pips ? 'on' : ''}"></div>`).join('');
      card.innerHTML = `<div class="tag ${tagCls}">${tag}</div>
        <canvas width="112" height="112"></canvas>
        <div class="cname">${name}</div><div class="cdesc">${desc}</div>
        <div class="pips">${pipsHtml}</div>
        <div class="hotkey">${i + 1}</div>`;
      const cc = card.querySelector('canvas').getContext('2d');
      cc.imageSmoothingEnabled = true;
      cc.drawImage(Art.icons[iconKey], 0, 0, 112, 112);
      card.addEventListener('click', () => chooseCard(i));
      box.appendChild(card);
    });
    show(screens.levelup, true);
  }
  function chooseCard(i) {
    if (G.state !== 'levelup') return;
    const c = lvlChoices[i];
    if (!c) return;
    Sfx.sfx.click();
    const P = G.player;
    if (c.kind === 'w') {
      if (c.cur) c.cur.lv++;
      else P.weapons.push({ id: c.id, lv: 1, t: 0.3, state: 0 });
    } else if (c.kind === 'p') {
      if (c.cur) c.cur.lv++;
      else P.passives.push({ id: c.id, lv: 1 });
      calcMods();
    } else if (c.kind === 's') {
      const af = P.affixes.find(a => a.id === c.id);
      if (af) af.stacks++;
      else P.affixes.push({ id: c.id, stacks: 1 });
      calcMods();
    } else {
      healPlayer(30); G.gold += 100;
    }
    G.pendingLv--;
    show(screens.levelup, false);
    if (G.pendingLv > 0) { openLevelUp(); return; }
    G.state = 'play';
    // 升级光柱演出
    const PP = G.player;
    beamAt(PP.x, PP.y - 6, '#a8ecff');
    heartAt(PP.x + 12 * (PP.flip ? -1 : 1), PP.y - 42);
  }

  /* ================= 宝箱（老虎机式开箱演出） ================= */
  /* 演出会话令牌：每场演出（开箱 / 金币头奖）++fxTok；所有 setTimeout 回调触发前先核对令牌，
     「跳过 / 收下 / 下一场」都会作废旧令牌并清空定时器——游戏恢复 play 后绝无残留回调乱触发。 */
  let fxTok = 0;
  const fxTimers = new Set();
  function fxLater(tok, ms, fn) {
    const t = setTimeout(() => { fxTimers.delete(t); if (tok === fxTok) fn(); }, ms);
    fxTimers.add(t);
  }
  function fxTimersClear() { for (const t of fxTimers) clearTimeout(t); fxTimers.clear(); }
  // 彻底收摊：作废回调 + 停庆祝层 +（若挂在 body）送回宝箱面板
  function fxStopAll() {
    fxTok++;
    fxTimersClear();
    chestFx.on = false;
    if (chestFx.timer) { clearTimeout(chestFx.timer); chestFx.timer = null; }
    chestFx.parts.length = 0; chestFx.cats.length = 0; chestFx.flash = 0; chestFx.rays = 0;
    if (chestFx.cv && chestFx.cv.className) chestFxMount(false);
  }
  /* ---- 庆祝覆盖层（#chest-fx）：彩纸/烟花/金光/群猫欢呼全画在这层 canvas 上，
          指针穿透、纯装饰，不碰游戏世界的渲染循环。宝箱态挂在 #screen-chest 里；
          金币头奖（≥80%）时临时挂到 body 播「迷你版」。setTimeout 链独立驱动
          （state='chest' 时主循环不推进世界，演出层自己走节拍）。 ---- */
  const chestFx = { cv: null, cx: null, on: false, timer: null, t: 0, parts: [], cats: [], rays: 0, flash: 0 };
  const CONF_COLS = ['#ffd34d', '#ff8fb5', '#8fe08a', '#9fd8f2', '#e2b7ff', '#fff6d8'];
  function chestFxMount(world) {
    const cv = chestFx.cv || (chestFx.cv = $('chest-fx'));
    if (!cv) return;
    const parent = world ? document.body : $('screen-chest');
    if (parent && parent.appendChild && cv.parentNode !== parent) parent.appendChild(cv); // 浏览器=移动节点 / 桩环境=安全空操作
    cv.className = world ? 'world' : '';
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    chestFx.cx = cv.getContext('2d');
  }
  // 一颗烟花：爆出一圈彩色火星 + 轻微金闪
  function chestFxBoom() {
    const fx = chestFx, w = fx.cv.width, h = fx.cv.height;
    const bx = U.rand(0.2, 0.8) * w, by = U.rand(0.15, 0.45) * h;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU, s = U.rand(120, 260);
      fx.parts.push({ kind: 'spark', x: bx, y: by, vx: Math.cos(a) * s, vy: Math.sin(a) * s, col: U.pick(CONF_COLS), t: 0, life: U.rand(0.5, 0.9), r: U.rand(2.5, 4.5) });
    }
    fx.flash = Math.max(fx.flash, 0.25);
  }
  // 启动一场庆祝：level 1=稀有（金闪+星星） / 2=大奖（彩纸横扫+金光+烟花三连+群猫欢呼）
  function chestFxStart(level) {
    const fx = chestFx;
    fx.on = true; fx.t = 0;
    fx.flash = Math.max(fx.flash, level >= 2 ? 0.6 : 0.35);
    const w = fx.cv.width, h = fx.cv.height;
    if (level >= 1) { // 稀有起：从面板宝箱位置炸开一蓬金色星星
      for (let i = 0; i < 22; i++) {
        const a = U.rand(0, TAU), s = U.rand(80, 240);
        fx.parts.push({ kind: 'spark', x: w / 2, y: h * 0.32, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, col: U.pick(['#ffd34d', '#fff6d8', '#ffe9a8']), t: 0, life: U.rand(0.5, 0.9), r: U.rand(2, 4) });
      }
    }
    if (level >= 2) {
      fx.rays = 2.4; // 金光加速旋转时长（秒）
      // 全屏彩纸横扫：左右两股对吹
      for (let i = 0; i < 80; i++) {
        const left = i % 2 === 0;
        fx.parts.push({ kind: 'conf', x: left ? -20 : w + 20, y: Math.random() * h * 0.7,
          vx: (left ? 1 : -1) * U.rand(160, 420), vy: U.rand(-260, -60), rot: U.rand(0, TAU), vr: U.rand(-9, 9),
          w2: U.rand(6, 11), h2: U.rand(4, 8), col: U.pick(CONF_COLS), t: 0, life: U.rand(1.2, 2.2) });
      }
      // 群猫欢呼：底部一排 6 只换色小猫（烘焙 2 帧轮播 + 随机相位蹦跳，绝不每帧重绘 drawCat）
      fx.cats.length = 0;
      for (let i = 0; i < 6; i++) {
        fx.cats.push({ i: i % Art.cheer.length, x: w * (0.5 + (i - 2.5) * 0.09), ph: U.rand(0, TAU), scale: U.rand(0.8, 1.1) });
      }
      const tok = fxTok; // 烟花三连（跟随当前演出会话，跳过即作废）
      for (let i = 0; i < 3; i++) fxLater(tok, 150 + i * 320, chestFxBoom);
    }
    if (!fx.timer) chestFxLoop();
  }
  function chestFxLoop() {
    const fx = chestFx;
    if (!fx.on) { fx.timer = null; return; }
    fx.timer = setTimeout(chestFxLoop, 33);
    const c = fx.cx; if (!c) return;
    const dt = 1 / 30, w = fx.cv.width, h = fx.cv.height;
    fx.t += dt;
    fx.flash = Math.max(0, fx.flash - dt * 1.6);
    fx.rays = Math.max(0, fx.rays - dt);
    for (let i = fx.parts.length - 1; i >= 0; i--) {
      const p = fx.parts[i]; p.t += dt;
      if (p.t >= p.life) { fx.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'conf') { p.vy += 320 * dt; p.vx *= 1 - dt * 1.2; p.rot += p.vr * dt; } // 彩纸：受重力飘落
      else { p.vy += 170 * dt; p.vx *= 1 - dt * 1.6; p.vy *= 1 - dt * 1.6; } // 火星：爆开减速坠落
    }
    c.clearRect(0, 0, w, h);
    // 金光加速旋转（大奖限定）
    if (fx.rays > 0) {
      c.save(); c.translate(w / 2, h * 0.42); c.rotate(fx.t * (fx.rays > 1 ? 5 : 2.2));
      c.globalAlpha = Math.min(0.42, fx.rays * 0.2);
      c.fillStyle = 'rgba(255,214,90,.55)';
      const R = Math.hypot(w, h) * 0.7;
      for (let i = 0; i < 12; i++) {
        c.rotate(TAU / 12);
        c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, -0.09, 0.09); c.closePath(); c.fill();
      }
      c.restore();
    }
    // 粒子：彩纸片 / 烟花火星 / 欢呼星星
    for (const p of fx.parts) {
      c.save(); c.globalAlpha = Math.max(0, 1 - p.t / p.life);
      if (p.kind === 'conf') {
        c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.col;
        c.fillRect(-p.w2 / 2, -p.h2 / 2, p.w2, p.h2);
      } else {
        c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill();
      }
      c.restore();
    }
    // 群猫欢呼：帧轮播 + 相位蹦跳，蹦跳时偶尔冒星星
    for (const ct of fx.cats) {
      const jump = Math.sin(fx.t * 9 + ct.ph);
      const size = 64 * ct.scale;
      const y = h - size * 0.62 - Math.max(0, jump) * 16;
      c.drawImage(Art.cheer[ct.i][jump > 0 ? 1 : 0], ct.x - size / 2, y, size, size);
    }
    if (fx.cats.length && Math.random() < dt * 6) {
      const ct = U.pick(fx.cats);
      fx.parts.push({ kind: 'spark', x: ct.x + U.rand(-20, 20), y: h - 90, vx: U.rand(-30, 30), vy: U.rand(-140, -60), col: U.pick(['#ffd34d', '#ff8fb5']), t: 0, life: 0.8, r: 3 });
    }
    // 全屏金光闪
    if (fx.flash > 0) {
      c.globalAlpha = Math.min(0.7, fx.flash); c.fillStyle = '#fff6d8';
      c.fillRect(0, 0, w, h); c.globalAlpha = 1;
    }
  }
  // 金币头奖（≥80%）世界层迷你庆祝：庆祝层临时挂 body，播完自动收摊（指针穿透不挡操作）
  function worldCelebrate() {
    fxTok++; fxTimersClear(); // 新的一场：作废旧演出残留
    chestFxMount(true);
    const tok = fxTok;
    chestFxStart(2);
    fxLater(tok, 2400, () => { if (tok === fxTok) fxStopAll(); });
  }
  /* ---- 老虎机滚动：所有奖励行的窗口 canvas 共用一条 tick 链，逐个落定为真奖励 ---- */
  let chestRolls = [];      // 当前宝箱的滚动行 {el,ctx,icon,tier,kind,done}
  let chestShowLevel = 0;   // 本箱整体演出规格：0 普通 / 1 稀有 / 2 大奖
  let chestUiWired = false; // 「跳过/收下」按钮的演出清理监听只补挂一次
  let slotIconPool = null;  // 滚动时随机闪过的图标池（惰性构建）
  function chestRollTick(tok) {
    if (tok !== fxTok) return;
    let rolling = false;
    for (const r of chestRolls) if (!r.done) rolling = true;
    if (!rolling) return;
    if (!slotIconPool) slotIconPool = Object.keys(Art.icons).map(k => Art.icons[k]).concat([Art.items.coin, Art.items.gem3]);
    const icv = U.pick(slotIconPool);
    for (const r of chestRolls) {
      if (r.done) continue;
      r.ctx.clearRect(0, 0, 88, 88);
      r.ctx.drawImage(icv, 0, 0, 88, 88); // 滚动就是滚着玩的：真实奖励数据早已结算
    }
    Sfx.sfx.slotTick();
    fxLater(tok, 55, () => chestRollTick(tok));
  }
  // 单行落定：定格真奖励 + 弹跳亮起 + 定音「哐当」；稀有/大奖行另有金光与「叮！」
  function chestSettleRow(tok, r) {
    if (tok !== fxTok || r.done) return;
    r.done = true;
    $('chest-icon').classList.remove('suspense'); // 首行落定即解除悬念摇晃
    r.ctx.clearRect(0, 0, 88, 88);
    r.ctx.drawImage(r.icon, 0, 0, 88, 88);
    r.el.classList.remove('rolling');
    r.el.classList.add('landed');
    if (r.tier >= 3) r.el.classList.add('big');
    else if (r.tier === 2) r.el.classList.add('rare');
    Sfx.sfx.slotStop();
    if (r.tier >= 3) {
      chestFx.flash = Math.max(chestFx.flash, 0.5);
      Sfx.sfx.rareDing();
      if (r.kind === 'evo') Sfx.sfx.evolve(); // 进化音效挪到进化行落定的瞬间，更带感
    } else if (r.tier === 2) {
      chestFx.flash = Math.max(chestFx.flash, 0.35);
      Sfx.sfx.rareDing();
    } else if (r.tier === 1) {
      Sfx.sfx.dingDong();
    }
  }
  // 演出收尾：按整体规格加码（大奖=彩纸横扫+金光+烟花+震屏+群猫欢呼+强 fanfare；稀有=金闪+琶音）
  function chestFinishShow(tok) {
    if (tok !== fxTok || G.state !== 'chest') return;
    $('chest-icon').classList.remove('suspense');
    $('chest-rays').classList.remove('rays-fast');
    const btn = $('btn-chest-ok');
    btn.textContent = '开心收下！';
    btn.classList.remove('skip');
    if (chestShowLevel >= 2) {
      chestFxStart(2);
      $('chest-rays').classList.add('rays-gold');
      $('chest-title').classList.add('super');
      $('chest-panel').classList.add('quake');
      fxLater(tok, 620, () => $('chest-panel').classList.remove('quake'));
      Sfx.sfx.fanfare(true);
      Sfx.sfx.meowChoir();
    } else if (chestShowLevel === 1) {
      chestFxStart(1); // 金色闪光 + 星星粒子
      Sfx.sfx.fanfare(false); // 喇叭琶音
    }
  }
  // 提前收下（=跳过演出）：立刻定格所有行 + 收掉全部演出回调与画面。数据早已结算，绝不卡玩家
  function chestSkipAll() {
    fxStopAll();
    $('chest-icon').classList.remove('suspense');
    $('chest-rays').classList.remove('rays-fast', 'rays-gold');
    $('chest-panel').classList.remove('quake');
    $('chest-title').classList.remove('super');
    for (const r of chestRolls) { // 没落定的行直接定格成真奖励（纯补画面）
      if (!r.done) {
        r.done = true;
        r.ctx.clearRect(0, 0, 88, 88);
        r.ctx.drawImage(r.icon, 0, 0, 88, 88);
        r.el.classList.remove('rolling');
        r.el.classList.add('landed');
      }
    }
    chestRolls = [];
    const btn = $('btn-chest-ok');
    btn.textContent = '开心收下！';
    btn.classList.remove('skip');
  }
  function openChest(isMother) {
    G.state = 'chest';
    const P = G.player;
    applyChestLevels(); // 80 级后攒下的经验：开宝箱时一次结算成等级（+2% 生命/+1% 移速/回满）
    const luck = mods.luck;
    // 进化优先
    const evoW = P.weapons.find(w => evoEligible(w));
    const rewards = [];
    let count = 1;
    const CH = DATA.CFG.chest;
    if (isMother) count = Math.max(1, DATA.CFG.finale.motherChestN || 5); // 老鼠妈妈宝箱：必定最多 N 件
    else {
      const p5 = CH.p5 + luck * CH.luckP5, p3 = CH.p3 + luck * CH.luckP3;
      if (U.chance(p5)) count = 5; else if (U.chance(p3)) count = 3;
    }
    if (evoW) {
      rewards.push({ type: 'evo', w: evoW });
    }
    let upgradable = () => {
      const list = [];
      for (const w of P.weapons) if (!w.evolved && w.lv < WEAPONS[w.id].maxLv) list.push({ kind: 'w', ref: w, id: w.id });
      for (const p of P.passives) if (p.lv < PASSIVES[p.id].maxLv) list.push({ kind: 'p', ref: p, id: p.id });
      return list;
    };
    const nUp = count - (evoW ? 1 : 0);
    const usedStamps = [];
    const stampOk = () => (P.lv || 1) >= DATA.CFG.stamps.minLevel;
    // 老鼠妈妈宝箱必定不含金币：金币位由 猫爪印 → 可升级项 → 牛奶回血 兜底
    const goldFallback = () => {
      if (stampOk()) {
        const sid = pickStampId(usedStamps);
        if (sid) { usedStamps.push(sid); rewards.push({ type: 's', id: sid }); return; }
      }
      const list = upgradable();
      if (list.length) { const pick = U.pick(list); rewards.push({ type: pick.kind, ref: pick.ref, id: pick.id }); return; }
      rewards.push({ type: 'heal' });
    };
    for (let i = 0; i < nUp; i++) {
      const list = upgradable();
      if (list.length) {
        // 印卡概率 = 常规奖励位概率 × share（与三选一同源的类别模型；印卡只出自宝箱）
        const sid = stampOk() && U.chance(DATA.CFG.stamps.share / (1 + DATA.CFG.stamps.share)) ? pickStampId(usedStamps) : null;
        if (sid) { usedStamps.push(sid); rewards.push({ type: 's', id: sid }); continue; }
        const pick = U.pick(list);
        rewards.push({ type: pick.kind, ref: pick.ref, id: pick.id });
      } else if (isMother) {
        goldFallback();
      } else if (stampOk() && U.chance(DATA.CFG.stamps.chestAffix)) {
        // 无可升级项：60% 出猫爪印（无尽期的硬通货），其余金币位
        const sid = pickStampId(usedStamps);
        if (sid) { usedStamps.push(sid); rewards.push({ type: 's', id: sid }); continue; }
        rewards.push({ type: 'gold' });
      } else {
        rewards.push({ type: 'gold' });
      }
    }
    // 呈现（同一技能抽中多次：逐行显示递进等级 Lv5→6 / Lv6→7 / Lv7→8，每次都是真实+1级）
    G.evoPending = rewards.some(r => r.type === 'evo');
    Sfx.meow('chest');
    const box = $('chest-rewards');
    box.innerHTML = '';
    const applyLater = [];
    const lvlPreview = new Map();
    const stampPreview = new Map();
    const rolls = []; // 老虎机滚动行（与奖励行一一对应）
    rewards.forEach(r => {
      let name, desc, iconKey;
      let tier = 0; // 该行的落定演出档：0 普通 / 1 小惊喜 / 2 稀有 / 3 大奖
      if (r.type === 'evo') {
        const def = WEAPONS[r.w.id];
        name = `✨ ${def.name} → ${evoName(r.w.id)} ✨`;
        desc = def.descEvo;
        iconKey = def.iconEvo;
        tier = 3;
        applyLater.push(() => evolveWeapon(r.w));
      } else if (r.type === 'w') {
        const def = WEAPONS[r.id];
        const from = lvlPreview.has(r.ref) ? lvlPreview.get(r.ref) : r.ref.lv;
        lvlPreview.set(r.ref, from + 1);
        name = def.name; desc = `威力提升！Lv ${from} → ${from + 1}`;
        iconKey = def.icon;
        applyLater.push(() => { r.ref.lv++; });
      } else if (r.type === 'p') {
        const def = PASSIVES[r.id];
        const from = lvlPreview.has(r.ref) ? lvlPreview.get(r.ref) : r.ref.lv;
        lvlPreview.set(r.ref, from + 1);
        name = def.name; desc = `效果增强！Lv ${from} → ${from + 1}`;
        iconKey = def.icon;
        applyLater.push(() => { r.ref.lv++; calcMods(); });
      } else if (r.type === 's') {
        const meta = STAMP_META[r.id];
        const cur = stampPreview.has(r.id) ? stampPreview.get(r.id) : stampStacks(r.id);
        stampPreview.set(r.id, cur + 1);
        name = '🐾 ' + meta.name + ' ×' + (cur + 1);
        desc = stampEffectText(r.id, cur + 1);
        iconKey = meta.icon;
        tier = 2; // 猫爪印 = 稀有档
        applyLater.push(() => {
          const af = P.affixes.find(a => a.id === r.id);
          if (af) af.stacks++;
          else P.affixes.push({ id: r.id, stacks: 1 });
          calcMods();
        });
      } else if (r.type === 'heal') { // 老鼠妈妈宝箱的兜底奖励位（无印可出、无可升级项时）
        name = '鲜奶 ×1';
        desc = '回复 ' + DATA.CFG.drops.milkHeal + ' 生命';
        iconKey = 'milkIcon';
        applyLater.push(() => { healPlayer(DATA.CFG.drops.milkHeal); heartAt(P.x, P.y - 30); });
      } else { // 金币位：恰好 1 枚金币 → 按金币经验规则抽奖折算，行内直接显示结果（落定演出与档位联动）
        const pct = rollLotteryTier();
        const v = Math.max(1, Math.round(DATA.xpNeed(P.lv || 1) * pct));
        name = '金币 ×1';
        desc = pct >= 0.10 ? `💥 抽中经验 ${Math.round(pct * 100)}% 大奖！（+${v}）`
                           : `抽奖 → 经验 +${Math.round(pct * 100)}%（+${v}）`;
        iconKey = null;
        tier = pct >= 0.30 ? 3 : pct >= 0.10 ? 2 : pct >= 0.05 ? 1 : 0;
        applyLater.push(() => applyLottery(pct, P.x, P.y - 10));
      }
      const row = document.createElement('div');
      row.className = 'reward rolling'; // 先以滚动态出现（压暗），落定时弹跳亮起
      row.innerHTML = `<canvas width="88" height="88"></canvas><div><div class="rname">${name}</div><div class="rdesc">${desc}</div></div>`;
      const cc = row.querySelector('canvas').getContext('2d');
      const icon = iconKey ? (Art.icons[iconKey] || Art.items.gem3) : Art.items.coin;
      cc.drawImage(icon, 0, 0, 88, 88); // 先定格真奖励：跳过/桩环境下行内容也完整
      rolls.push({ el: row, ctx: cc, icon, tier, kind: r.type, done: false });
      box.appendChild(row);
    });
    // 数据立即结算（演出纯装饰不阻塞）：提前收下时数值早已到账
    for (const f of applyLater) f();
    const ci = $('chest-icon').getContext('2d');
    ci.clearRect(0, 0, 240, 240);
    ci.drawImage(Art.items.chestOpen, 18, 42, 204, 170);
    show(screens.chest, true);
    // —— 演出会话开始：作废上一场残留，登记本场令牌 ——
    fxTok++; fxTimersClear();
    chestFxMount(false);
    chestRolls = rolls;
    const tok = fxTok;
    const maxTier = rolls.reduce((m, r) => Math.max(m, r.tier), 0);
    chestShowLevel = count >= 5 || maxTier >= 3 ? 2 : maxTier >= 2 ? 1 : 0; // 顶格 5 件 / 含大奖行 → 大奖规格
    const superChest = chestShowLevel >= 2, shinyChest = chestShowLevel === 1 || count >= 3;
    const title = $('chest-title');
    title.textContent = superChest ? '🎉 超级金宝箱！' : shinyChest ? '✨ 闪闪金宝箱！' : '🎁 金宝箱！';
    title.classList.toggle('super', superChest);
    $('chest-icon').classList.add('suspense');   // 悬念：宝箱摇晃加速
    $('chest-rays').classList.add('rays-fast');  // 光圈加速旋转
    const btn = $('btn-chest-ok');
    btn.textContent = '跳过 ⏭'; // 演出中=跳过（提前可点，点了立即收下）；AUTO 自动点击不受影响
    btn.classList.add('skip');
    if (!chestUiWired) { chestUiWired = true; btn.addEventListener('click', chestSkipAll); }
    // 老虎机节奏：沿用逐行 0.35s 的落定韵律（首行 0.55s 略作悬念），共用一条滚动 tick 链
    rolls.forEach((r, ri) => fxLater(tok, 550 + ri * 350, () => chestSettleRow(tok, r)));
    fxLater(tok, 560 + rolls.length * 350, () => chestFinishShow(tok));
    chestRollTick(tok);
    if (AUTO === 'play' || AUTO === 'boss') setTimeout(() => $('btn-chest-ok').click(), 1500);
  }
  const EVO_NAMES = {
    sakura: '樱花爆爪', ultra: '超声波', fishstorm: '千鱼风暴', tunarain: '金枪鱼雨',
    planet: '星球毛线', aurastorm: '猫薄荷风暴', littermeteor: '猫砂流星雨', thunderpuff: '雷霆炸毛'
  };
  function evoName(baseId) {
    return EVO_NAMES[WEAPONS[baseId].evo] || WEAPONS[baseId].evo;
  }
  function evolveWeapon(w) {
    const def = WEAPONS[w.id];
    // 用进化形态替换：直接在实例上记录 evolved，并保留原 id 以便查表
    w.evolved = true;
    w.evoFrom = w.id;
    w.dispName = evoName(w.id);
    w.t = 0.3; w.state = 0;
    popStars(G.player.x, G.player.y - 20, '#ff8fb5', 16);
    part({ x: G.player.x, y: G.player.y, life: 0.7, size: 50, col: '#ffd9e6', kind: 'ring' });
  }

  /* ================= 生成器 =================
     双时间轴：G.waveT = 内容时间轴（精英/事件/批次头目降临/怪种表——头目被打死就快进，打得快轮次更短）；
     G.roundTime = 真实时间（强度成长与同屏上限按它走，性能保护不破）。
     杂兵数量另乘轮间乘数 G.countMul = ×2^(轮次-1)（只作用杂兵，boss/精英/事件不受影响）。 */
  // 杂兵同屏上限：轮内成长曲线 × 轮间数量乘数，钳在性能硬顶内
  function trashCap() {
    const Gw = DATA.CFG.growth;
    return Math.min(Gw.screenCap || Gw.countHardMax || 480, DATA.aliveCap(G.roundTime) * (G.countMul || 1));
  }
  // 意见6：性能保护滞回——同屏到顶（screenCap）停刷，打到回落阈值（capResume）以下才继续刷
  function updateSpawnHold(cap) {
    const resume = DATA.CFG.growth.capResume || 100;
    if (!G.spawnHold && G.enemies.length >= cap) G.spawnHold = true;
    else if (G.spawnHold && G.enemies.length < resume) G.spawnHold = false;
    return G.spawnHold;
  }
  function updateSpawner(dt) {
    const R = DATA.ROUNDS, M = G.roundMods;
    G.spawnT -= dt;
    const cap = trashCap();
    const hold = updateSpawnHold(cap);
    if (G.spawnT <= 0) {
      G.spawnT = DATA.spawnEvery(G.roundTime) * (M ? M.spawn : 1);
      if (hold) return; // 上限滞回中：本拍不刷（计时照走，回落到阈值后自然恢复）
      const batchN = Math.min(DATA.CFG.growth.countBatchPerTick || 64, DATA.spawnBatch(G.roundTime) * (G.countMul || 1));
      const mix = DATA.mixAt(G.waveT + (M ? M.mixMin : 0) * 60); // 波次表起点随轮次后移
      const types = [];
      for (const k in mix) for (let i = 0; i < mix[k]; i++) types.push(k);
      const d = Math.hypot(worldW, worldH) / 2 + 50;
      for (let i = 0; i < batchN; i++) {
        if (G.enemies.length >= cap) break;
        const pt = edgePoint(50);
        spawnEnemy(U.pick(types), pt.x, pt.y, false);
      }
    }
    // 精英（宝箱）
    while (G.elitesDone < DATA.ELITES.length && G.waveT >= DATA.ELITES[G.elitesDone].t) {
      const el = DATA.ELITES[G.elitesDone++];
      const pt = edgePoint(60);
      spawnEnemy(el.type, pt.x, pt.y, true);
      banner('⚠ 出现了精英敌人！打倒它开宝箱！', 2.6);
    }
    // 事件
    while (G.eventsDone < DATA.EVENTS.length && G.waveT >= DATA.EVENTS[G.eventsDone].t) {
      const ev = DATA.EVENTS[G.eventsDone++];
      const count = Math.max(2, Math.round(ev.count * (M ? M.eventMul : 1)));
      banner(ev.msg, 3);
      if (ev.type === 'ring') {
        const rx = worldW / 2 + 40, ry = worldH / 2 + 40;
        for (let i = 0; i < count; i++) {
          const a = i / count * TAU;
          spawnEnemy(ev.enemy, G.player.x + Math.cos(a) * rx, G.player.y + Math.sin(a) * ry, false);
        }
      } else if (ev.type === 'line') {
        const d = worldW / 2 + 60;
        for (let i = 0; i < count; i++) {
          spawnEnemy(ev.enemy, G.player.x + d, G.player.y + (i - count / 2) * 70, false);
        }
      }
    }
    // 批次头目：批次进度达到 bossFrac 比例时降临（按内容时间轴）
    if (!G.batchBossSpawned && G.batch < R.batchCount && G.waveT >= (G.batch + R.bossFrac) * R.batchLen) {
      G.batchBossSpawned = true;
      spawnBatchBoss();
    }
    // 轮Boss：最后一批头目被讨伐后降临
    if (G.roundBossPending && !G.bossSpawned && G.bossWarn <= 0) {
      G.roundBossPending = false;
      G.bossSpawned = true;
      G.bossWarn = DATA.CFG.finale.bossWarn;
      G.pendingBossAffixes = pickAffixes(M ? M.bossAffix : 0, [], true);
      const aff = G.pendingBossAffixes.map(id => (R.affixes[id] || {}).name || id).join('·');
      Sfx.sfx.boss();
      banner('☠ 喵都之敌 · 鼠王·铁须' + (aff ? '【' + aff + '】' : '') + ' 降临！ ☠', 2.8);
    }
    if (G.bossWarn > 0) {
      G.bossWarn -= dt;
      if (G.bossWarn <= 0) spawnBoss(G.pendingBossAffixes);
    }
    // 老鼠妈妈：第 3 轮鼠王被讨伐后降临（压轴）
    if (G.motherWarnT > 0) {
      G.motherWarnT -= dt;
      if (G.motherWarnT <= 0) spawnMother();
    }
  }

  /* ================= 死亡 / 胜利 ================= */
  function startDying() {
    if (G.motherDone) return; // 老鼠妈妈已被讨伐：本局必定成功结算，不再翻转为失败
    G.state = 'dying';
    G.dyingT = 1.6;
    Sfx.meow('death', { force: true });
    Sfx.bgmStop();
    setTimeout(() => Sfx.sfx.gameOver(), 700);
    G.timeScale = 0.35;
    popStars(G.player.x, G.player.y, '#ffb066', 14);
  }
  function saveBest() {
    const b = U.storage.get('meow_best', { time: 0, kills: 0, gold: 0, rounds: 0 });
    if (G.time > b.time) b.time = Math.floor(G.time);
    if (G.kills > b.kills) b.kills = G.kills;
    if (G.gold > b.gold) b.gold = G.gold;
    if (G.round > (b.rounds || 0)) b.rounds = G.round;
    U.storage.set('meow_best', b);
    return b;
  }
  // 统一结算：成功（收工）与失败（倒下）共用同一张面板，只有标题/文案不同
  function collectResult(win) {
    // 把最后不满一秒的伤害桶也计入峰值
    if (G.secDmg > G.peakSec) G.peakSec = G.secDmg;
    return {
      win, round: G.round, time: G.time, lv: G.player.lv || 1, kills: G.kills, gold: G.gold,
      dmgTotal: G.dmgTotal, dps: G.time > 0 ? G.dmgTotal / G.time : 0, peakSec: G.peakSec,
      motherTTK: G.motherTTK || 0,
      diedToMother: !win && G.motherActive && !G.motherDone,
      weapons: G.player.weapons.map(w => ({ id: w.id, lv: w.lv, evolved: !!w.evolved })),
      passives: G.player.passives.map(p => ({ id: p.id, lv: p.lv })),
      affixes: (G.player.affixes || []).map(a => ({ id: a.id, stacks: a.stacks })),
      date: new Date()
    };
  }
  /* ================= 🏆 云端排行榜（js/leaderboard.js：微信小游戏/网页双端互通一张榜） =================
     云开发未配置时 LB 内部自动跳过；任何异常都被吞掉，绝不影响结算流程 */
  function submitRunToLb(data) {
    try {
      LB.submitRun({
        round: data.round, time: data.time, kills: data.kills, lv: data.lv, gold: data.gold,
        win: !!data.win, mother: !!data.mother, map: G.mapId, sp: gameSpeed
      }).then(r => showLbRank(r && r.rank)).catch(() => {});
    } catch (e) { /* noop */ }
  }
  function showLbRank(rank) { if (rank && Result.showLbRank) Result.showLbRank(rank); }

  function showResult(win) {
    G.state = 'over';
    const data = collectResult(win);
    const b = saveBest();
    data.best = b;
    Result.open(data);
    submitRunToLb(data);
    if (win) { Sfx.sfx.victory(); Sfx.meow('happy'); }
    show(screens.over, true);
  }
  function gameOver() { showResult(false); }

  /* ================= 主更新 ================= */
  function update(dt) {
    G.time += dt;
    G.roundTime += dt;
    G.waveT += dt; // 内容时间轴（精英/事件/头目降临按它推进；头目被讨伐时快进）
    // 最高秒伤：游戏时间每跨过 1 秒，把刚结束的整秒伤害桶与峰值比较
    const si = Math.floor(G.time);
    if (si !== G.secIdx) {
      if (G.secIdx >= 0 && G.secDmg > G.peakSec) G.peakSec = G.secDmg;
      G.secIdx = si; G.secDmg = 0;
    }
    const P = G.player;
    G.rsHpSum += Math.max(0, P.hp / P.maxHp); G.rsHpN++; // 血线采样（动态难度输入）
    updatePlayer(dt);
    rebuildGrid();
    updateSpawner(dt);
    updateWeapons(dt);
    updateSlashes(dt);
    updateProjs(dt);
    updateZones(dt);
    updateEprojs(dt); // 意见6：鸽子羽毛弹
    // 蜗牛黏液带老化
    for (let i = G.slimes.length - 1; i >= 0; i--) { G.slimes[i].t -= dt; if (G.slimes[i].t <= 0) U.swapRemove(G.slimes, i); }
    updateEnemies(dt);
    updatePickups(dt);
    updateFx(dt); // 粒子 / 飘字（雷电、开箱特效、伤害数字等，需随游戏时间老化消失）
    // after 队列（延迟挥击等）
    for (let i = G.after.length - 1; i >= 0; i--) {
      const a = G.after[i];
      a.t -= dt;
      if (a.t <= 0) { a.fn(); U.swapRemove(G.after, i); }
    }
    // 相机
    G.cam.x = U.lerp(G.cam.x, P.x, Math.min(1, dt * 6));
    G.cam.y = U.lerp(G.cam.y, P.y, Math.min(1, dt * 6));
    clampCam();
    G.shake = Math.max(0, G.shake - dt * FX.shakeDecay);
    G.flash = Math.max(0, G.flash - dt);
    G.motherFxT = Math.max(0, G.motherFxT - dt);
    // 萤火虫
    for (const f of G.flies) {
      f.ph += dt * f.sp;
      f.x += Math.cos(f.ph * 1.7) * 22 * dt;
      f.y += Math.sin(f.ph) * 16 * dt - 6 * dt;
    }
    // 樱花瓣氛围
    for (const pt of G.petals) {
      pt.ph += dt * pt.sp;
      pt.x += dt * 0.012 * pt.sp;
      pt.y += dt * 0.03 * pt.sp;
      if (pt.y > 1) { pt.y = 0; pt.x = Math.random(); }
      if (pt.x > 1) pt.x -= 1;
    }
    // 低血量脉冲 + 心跳
    G.lowHpPulse = P.hp < P.maxHp * 0.3 ? G.lowHpPulse + dt : 0;
    if (G.lowHpPulse > 0) {
      G.heartT -= dt;
      if (G.heartT <= 0) {
        G.heartT = 0.95;
        Sfx.sfx.heartbeat();
        if (U.chance(0.5)) sweatDrop(P.x + (P.flip ? -16 : 16), P.y - 40);
      }
    }
    // 眩晕表现：头顶打转的星星
    if (P.stunT > 0) {
      G.stunFxT = (G.stunFxT || 0) - dt;
      if (G.stunFxT <= 0) {
        G.stunFxT = 0.13;
        const sa = G.time * 9;
        part({ x: P.x + Math.cos(sa) * 16, y: P.y - 42 + Math.sin(sa) * 5, vy: -12, life: 0.45, size: 5, col: '#ffd34d', kind: 'star', vr: 8 });
      }
    }
    if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
  }
  function updateDying(dt) {
    G.dyingT -= dt;
    G.cam.x = U.lerp(G.cam.x, G.player.x, dt * 4);
    G.cam.y = U.lerp(G.cam.y, G.player.y, dt * 4);
    clampCam();
    if (G.dyingT <= 0) { G.timeScale = 1; gameOver(); }
  }

  /* ================= 渲染 ================= */
  let shX = 0, shY = 0;
  // 有界地图：相机钳在地图内，看不到"外面"
  function clampCam() {
    if (!curMap) return;
    const hx = Math.min(worldW / 2, curMap.w / 2), hy = Math.min(worldH / 2, curMap.h / 2);
    G.cam.x = U.clamp(G.cam.x, hx, Math.max(hx, curMap.w - hx));
    G.cam.y = U.clamp(G.cam.y, hy, Math.max(hy, curMap.h - hy));
  }
  // 世界坐标 → 视图坐标（视图中心为原点）；居中、震屏与 zoom 由变换矩阵承担
  function w2sx(x) { return x - G.cam.x; }
  function w2sy(y) { return y - G.cam.y; }
  function setWorldXf() { ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (vw / 2 + shX), dpr * (vh / 2 + shY)); }
  function setScreenXf() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  // 屏幕坐标系下锚定世界物体（HUD 用）
  function w2sxA(x) { return (x - G.cam.x) * zoom + vw / 2 + shX; }
  function w2syA(y) { return (y - G.cam.y) * zoom + vh / 2 + shY; }

  function render() {
    shX = G.shake > 0 ? U.rand(-G.shake, G.shake) : 0;
    shY = G.shake > 0 ? U.rand(-G.shake, G.shake) : 0;
    setScreenXf();
    ctx.fillStyle = '#20223a';
    ctx.fillRect(0, 0, vw, vh);
    const halfW = worldW / 2, halfH = worldH / 2;
    const camL = G.cam.x - halfW - 90, camT = G.cam.y - halfH - 90;
    const camR = G.cam.x + halfW + 90, camB = G.cam.y + halfH + 90;
    const cullP1 = 100 / zoom, cullP2 = 40 / zoom, cullP3 = 60 / zoom;
    setWorldXf();
    // ---- 地面 ----
    const lamps = [];
    if (curMap) {
      curMap.drawGround(ctx, camL, camT, camR, camB, G.cam.x, G.cam.y);
      for (const l of curMap.lamps) if (l.x > camL - 130 && l.x < camR + 130 && l.y > camT - 130 && l.y < camB + 130) lamps.push(l);
    } else {
      const c0x = Math.floor(camL / CHUNK), c1x = Math.floor(camR / CHUNK);
      const c0y = Math.floor(camT / CHUNK), c1y = Math.floor(camB / CHUNK);
      for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
        const ch = getChunk(cx, cy);
        const sx = Math.floor(cx * CHUNK - ch.pad - G.cam.x);
        const sy = Math.floor(cy * CHUNK - ch.pad - G.cam.y);
        ctx.drawImage(ch.canvas, sx, sy, ch.canvas.width * PIX, ch.canvas.height * PIX);
        for (const l of ch.lamps) if (l.x > camL && l.x < camR && l.y > camT && l.y < camB) lamps.push(l);
      }
    }
    // ---- 手工地图：立体装饰（y 排序）与水面波光 / 蒸汽 ----
    if (curMap) {
      curMap.drawDecor(ctx, camL, camT, camR, camB, w2sx, w2sy);
      curMap.drawFx(ctx, G.time, w2sx, w2sy, camL, camT, camR, camB, G.cam.x, G.cam.y);
      // ?debug=1 碰撞可视化：BLOCK 格画红色半透明块，核对视觉障碍与实际碰撞一致（地图调试用）
      if (/[?&]debug=1/.test(location.search)) {
        ctx.fillStyle = 'rgba(255,32,64,.5)';
        for (let gy = 0; gy < curMap.gh; gy++) for (let gx = 0; gx < curMap.gw; gx++) {
          if (curMap.grid[gy * curMap.gw + gx] !== MAPS.T.BLOCK) continue;
          const bx0 = gx * MAPS.CELL - G.cam.x, by0 = gy * MAPS.CELL - G.cam.y;
          if (bx0 < -halfW - 90 || by0 < -halfH - 90 || bx0 > halfW + 90 || by0 > halfH + 90) continue;
          ctx.fillRect(bx0, by0, MAPS.CELL, MAPS.CELL);
        }
      }
    }
    const P = G.player;
    // ---- 区域（猫砂）：数量越多整体越淡越简（LOD），地面不被淹没 ----
    const zDim = Math.max(0.45, 1 - G.zones.length / (FX.zoneMax * 1.6));
    const zDots = G.zones.length > 14 ? 3 : 6;
    for (const z of G.zones) {
      const sx = w2sx(z.x), sy = w2sy(z.y);
      if (sx < -halfW - cullP1 || sx > halfW + cullP1 || sy < -halfH - cullP1 || sy > halfH + cullP1) continue;
      ctx.save();
      ctx.globalAlpha = 0.5 * zDim * Math.min(1, z.t / 0.6);
      ctx.fillStyle = '#cfc0a4';
      ctx.beginPath(); ctx.ellipse(sx, sy, z.r, z.r * 0.72, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.35 * zDim * Math.min(1, z.t / 0.6);
      ctx.fillStyle = '#a89878';
      for (let i = 0; i < zDots; i++) {
        const a = i / zDots * TAU + z.r;
        ctx.beginPath(); ctx.arc(sx + Math.cos(a) * z.r * 0.5, sy + Math.sin(a) * z.r * 0.4, 4, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    // ---- 蜗牛黏液带（地面亮泽拖慢区） ----
    for (const s of G.slimes) {
      const sx = w2sx(s.x), sy = w2sy(s.y);
      if (sx < -halfW - cullP1 || sx > halfW + cullP1 || sy < -halfH - cullP1 || sy > halfH + cullP1) continue;
      ctx.save();
      ctx.globalAlpha = 0.38 * Math.min(1, s.t / 0.6);
      ctx.fillStyle = '#a8d890';
      ctx.beginPath(); ctx.ellipse(sx, sy, s.r, s.r * 0.68, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.3 * Math.min(1, s.t / 0.6);
      ctx.fillStyle = '#e8f6d8';
      ctx.beginPath(); ctx.ellipse(sx - s.r * 0.2, sy - s.r * 0.15, s.r * 0.45, s.r * 0.28, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // ---- 老鼠妈妈全屏斩预警：主角脚下红圈收缩 ----
    if (G.mother && !G.mother.dieDone && G.mother.state === 'tele') {
      const k = Math.max(0, Math.min(1, G.mother.st / DATA.CFG.finale.motherTele)); // 1 → 0
      const rr2 = 40 + 70 * k;
      ctx.save();
      ctx.globalAlpha = 0.55 + Math.sin(G.time * 24) * 0.2;
      ctx.strokeStyle = '#ff5f7a'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(w2sx(P.x), w2sy(P.y), rr2, rr2 * 0.6, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    // ---- 猫薄荷光环 ----
    for (const w of P.weapons) {
      if (WEAPONS[w.id].kind !== 'aura') continue;
      const s = wStats(w);
      const r = Math.min(s.radius * mods.areaMult, atkMaxR());
      const sx = w2sx(P.x), sy = w2sy(P.y);
      ctx.save();
      const g = ctx.createRadialGradient(sx, sy, r * 0.2, sx, sy, r);
      g.addColorStop(0, 'rgba(140,220,130,0.20)');
      g.addColorStop(0.8, 'rgba(140,220,130,0.13)');
      g.addColorStop(1, 'rgba(140,220,130,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(170,240,160,0.5)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = -G.time * 30;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    // ---- 鱼干 / 掉落物 / 宝箱 ----
    for (const g of G.gems) {
      const sx = w2sx(g.x), sy = w2sy(g.y);
      if (sx < -halfW - cullP2 || sx > halfW + cullP2 || sy < -halfH - cullP2 || sy > halfH + cullP2) continue;
      const T = DATA.CFG.drops.gemTiers; // 阈值唯一来源：配置表（v≥T[0].v 金 / v≥T[1].v 蓝 / 其余绿）
      const tier = g.val >= T[0].v ? Art.items.gem3 : g.val >= (T[1] ? T[1].v : 0) ? Art.items.gem2 : Art.items.gem1;
      const bob = Math.sin(g.t * 4) * 3;
      ctx.drawImage(tier, sx - tier.width / 2, sy - tier.height / 2 + bob);
    }
    for (const p of G.pickups) {
      const sx = w2sx(p.x), sy = w2sy(p.y);
      if (sx < -halfW - cullP2 || sx > halfW + cullP2 || sy < -halfH - cullP2 || sy > halfH + cullP2) continue;
      const spr = p.kind === 'coin' ? Art.items.coin : p.kind === 'milk' ? Art.items.milk : p.kind === 'firework' ? Art.items.firework : Art.items.vacuum;
      const bob = Math.sin(p.t * 3.4) * 4;
      if (p.kind !== 'coin') { ctx.save(); ctx.globalAlpha = 0.6; ctx.drawImage(Art.glows.gem, sx - 20, sy + bob - 20, 40, 40); ctx.restore(); }
      ctx.drawImage(spr, sx - spr.width / 2, sy - spr.height / 2 + bob);
    }
    for (const c of G.chests) {
      const sx = w2sx(c.x), sy = w2sy(c.y);
      const bob = Math.sin(c.t * 3) * 4;
      // 宝箱 3x 后光圈与居中都跟随精灵实际尺寸（旧 -36/-30 是按 canvas 版 72x60 写死的）
      ctx.drawImage(Art.glows.chest, sx - 80, sy - 80 + bob, 160, 160);
      const cs = Art.items.chestClosed;
      ctx.drawImage(cs, sx - cs.width / 2, sy - cs.height / 2 + bob);
    }
    // ---- 实体（y 排序） ----
    const drawList = [];
    for (const e of G.enemies) {
      if (e.x < camL || e.x > camR || e.y < camT || e.y > camB) continue;
      drawList.push(e);
    }
    drawList.push(P);
    drawList.sort((a, b) => a.y - b.y);
    for (const e of drawList) {
      if (e === P) drawPlayer();
      else drawEnemy(e);
    }
    // ---- 环绕毛线 ----
    for (const w of P.weapons) {
      if (WEAPONS[w.id].kind !== 'orbit' || w.state !== 1) continue;
      const s = wStats(w);
      const R = Math.min(s.radius * mods.areaMult, atkMaxR() * 0.8);
      const spr = w.evolved ? Art.projs.yarnBig : Art.projs.yarn;
      const nOrb = s.amount + mods.amountBonus;
      for (let i = 0; i < nOrb; i++) {
        const a = (w.ang || 0) + i * TAU / nOrb;
        const bx = P.x + Math.cos(a) * R, by = P.y + Math.sin(a) * R * 0.72;
        const sx = w2sx(bx), sy = w2sy(by);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(G.time * 6 + i);
        ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
        ctx.restore();
      }
    }
    // ---- 子弹 ----
    for (const p of G.projs) {
      const sx = w2sx(p.x), sy = w2sy(p.y);
      if (sx < -halfW - cullP3 || sx > halfW + cullP3 || sy < -halfH - cullP3 || sy > halfH + cullP3) continue;
      ctx.save();
      if (p.kind === 'note') {
        ctx.translate(sx, sy); ctx.rotate(p.rot || 0);
        ctx.drawImage(Art.projs.note, -18, -20);
      } else if (p.kind === 'fish') {
        ctx.translate(sx, sy); ctx.rotate(p.rot || 0);
        ctx.drawImage(Art.projs.fishProj, -24, -15);
      } else if (p.kind === 'axe') {
        ctx.save(); ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(sx, w2sy(p.startY) + 6, 12, 4, 0, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.translate(sx, sy); ctx.rotate(p.rot || 0);
        ctx.drawImage(Art.projs.axe, -26, -26);
      } else if (p.kind === 'litter') {
        ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(w2sx(p.tx), w2sy(p.ty), 10, 4, 0, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.translate(sx, sy); ctx.rotate(p.rot || 0);
        ctx.drawImage(Art.projs.litter, -22, -18);
      }
      ctx.restore();
    }
    // ---- 敌方羽毛弹（意见6：鸽子远程） ----
    for (const p of G.eprojs) {
      const sx = w2sx(p.x), sy = w2sy(p.y);
      if (sx < -halfW - cullP3 || sx > halfW + cullP3 || sy < -halfH - cullP3 || sy > halfH + cullP3) continue;
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(p.rot + Math.sin(p.t * 12) * 0.18);
      ctx.fillStyle = '#f2f0e4';
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 4, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(110,100,80,.75)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(9, 0); ctx.stroke();
      ctx.restore();
    }
    // ---- 爪击 ----
    for (const s of G.slashes) {
      const a = Math.atan2(s.fy, s.fx);
      ctx.save();
      ctx.translate(w2sx(s.x), w2sy(s.y));
      ctx.rotate(a);
      const k = s.t / s.life;
      ctx.globalAlpha = Math.sin(Math.min(1, k) * Math.PI);
      const sc = 0.8 + k * 0.5;
      ctx.drawImage(Art.slash, -30, -50 * sc, 150 * sc, 100 * sc);
      ctx.restore();
    }
    // ---- 粒子 ----
    for (const p of G.parts) {
      const sx = w2sx(p.x), sy = w2sy(p.y);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      if (p.kind === 'bolt') {
        Art.drawLightning(ctx, w2sx(p.x1), w2sy(p.y1), w2sx(p.x2), w2sy(p.y2), p.col);
      } else if (p.kind === 'ring') {
        const r = p.size * (0.4 + (p.t / p.life) * 1.2);
        ctx.strokeStyle = p.col; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.stroke();
      } else if (p.kind === 'star') {
        ctx.translate(sx, sy); ctx.rotate(p.rot + p.t * p.vr);
        ctx.fillStyle = p.col;
        const s2 = p.size * (1 - p.t / p.life * 0.5);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a2 = i * Math.PI / 2;
          ctx.lineTo(Math.cos(a2) * s2, Math.sin(a2) * s2);
          ctx.lineTo(Math.cos(a2 + Math.PI / 4) * s2 * 0.4, Math.sin(a2 + Math.PI / 4) * s2 * 0.4);
        }
        ctx.closePath(); ctx.fill();
      } else if (p.kind === 'heart') {
        ctx.translate(sx, sy); ctx.scale(p.size / 7, p.size / 7);
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.moveTo(0, 3);
        ctx.bezierCurveTo(-7, -4, -3, -10, 0, -5);
        ctx.bezierCurveTo(3, -10, 7, -4, 0, 3);
        ctx.fill();
      } else if (p.kind === 'leaf') {
        ctx.translate(sx, sy); ctx.rotate(p.rot + p.t * p.vr);
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, TAU); ctx.fill();
      } else if (p.kind === 'beam') {
        const k = p.t / p.life;
        const h = 280 * (0.35 + 0.65 * (1 - k));
        const w2 = p.size * (1 - k * 0.4);
        const gb = ctx.createLinearGradient(0, sy - h, 0, sy + 8);
        gb.addColorStop(0, 'rgba(255,255,255,0)');
        gb.addColorStop(0.75, p.col);
        gb.addColorStop(1, '#ffffff');
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.fillStyle = gb;
        ctx.fillRect(sx - w2 / 2, sy - h, w2, h + 8);
      } else {
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(sx, sy, p.size * (1 - p.t / p.life * 0.6), 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    // ---- 飘字（屏幕层：字号不随 zoom 缩小，保证小屏可读） ----
    setScreenXf();
    ctx.textAlign = 'center';
    for (const d of G.dmgs) {
      const sx = w2sxA(d.x), sy = w2syA(d.y) + d.vy * d.t * zoom;
      const k = d.t / d.life;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = (d.crit ? '900 22px' : '700 15px') + ' "Fusion Pixel","ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(30,20,40,.8)';
      ctx.strokeText(d.txt, sx, sy);
      ctx.fillStyle = d.col || (d.crit ? '#ffd34d' : '#fff');
      ctx.fillText(d.txt, sx, sy);
      ctx.globalAlpha = 1;
    }
    // ---- 樱花瓣氛围（屏幕层） ----
    setScreenXf();
    ctx.save();
    for (const pt of G.petals) {
      const sx2 = pt.x * (vw + 80) - 40;
      const sy2 = pt.y * (vh + 40) - 20 + Math.sin(pt.ph) * 14;
      ctx.save();
      ctx.translate(sx2, sy2);
      ctx.rotate(pt.ph * 1.4);
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#ffc3da';
      ctx.beginPath(); ctx.ellipse(0, 0, pt.sz, pt.sz * 0.6, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // ---- 夜幕 & 灯光 ----
    ctx.fillStyle = 'rgba(18,16,52,0.32)';
    ctx.fillRect(0, 0, vw, vh);
    setWorldXf();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const LG = curMap ? MAPS.glow() : null;
    for (const l of lamps) {
      const sx = w2sx(l.x), sy = w2sy(l.y);
      const g = l.g === 'lantern' ? LG.lantern : l.g !== 'lamp' ? Art.glows[l.g] : Art.glows.lamp;
      ctx.drawImage(g || Art.glows.lamp, sx - 110, sy - 110);
    }
    // 霓虹招牌微光（仅无限街区）
    if (!curMap) {
      const c0x2 = Math.floor(camL / CHUNK), c1x2 = Math.floor(camR / CHUNK);
      const c0y2 = Math.floor(camT / CHUNK), c1y2 = Math.floor(camB / CHUNK);
      for (let cy2 = c0y2; cy2 <= c1y2; cy2++) for (let cx2 = c0x2; cx2 <= c1x2; cx2++) {
        const ch = chunkCache.get(cx2 + ',' + cy2);
        if (!ch) continue;
        for (const s of ch.signs) {
          const sx = w2sx(s.x), sy = w2sy(s.y);
          const g = Art.glows[s.c];
          ctx.drawImage(g, sx - 80, sy - 80);
        }
      }
    }
    ctx.drawImage(Art.glows.player, w2sx(P.x) - 90, w2sy(P.y) - 90);
    ctx.restore();
    // 萤火虫（在最上，屏幕层）
    setScreenXf();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of G.flies) {
      const sx = ((f.x % (vw + 200)) + vw + 200) % (vw + 200) - 100;
      const sy = ((f.y % (vh + 200)) + vh + 200) % (vh + 200) - 100;
      const a = 0.4 + Math.sin(f.ph * 3) * 0.3;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#d8f7b8';
      ctx.beginPath(); ctx.arc(sx, sy, 2.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // ---- 受击红闪 & 低血量 & 老鼠妈妈全屏斩紫边 & 暗角 ----
    if (G.flash > 0) {
      ctx.fillStyle = `rgba(255,60,80,${G.flash * 0.5})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (G.motherFxT > 0) { // 全屏斩命中：0.3 秒即散的短促紫边，不做长驻覆盖
      const k = G.motherFxT / 0.3;
      const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.25, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.55);
      g.addColorStop(0, 'rgba(170,100,235,0)');
      g.addColorStop(1, `rgba(170,100,235,${0.4 * k})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    }
    if (G.lowHpPulse > 0) {
      const a = 0.14 + Math.sin(G.lowHpPulse * 6) * 0.08;
      const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.55);
      g.addColorStop(0, 'rgba(255,40,60,0)');
      g.addColorStop(1, `rgba(255,40,60,${a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    }
    ctx.drawImage(vignette, 0, 0);
    drawHUD();
    drawJoystick();
  }

  // 老鼠妈妈的老巢（意见10）：手绘怪房子，可破坏地标；捣毁后呈废墟（残骸仍挡路）
  function drawHouse(e, sx, sy) {
    const W = 120;
    ctx.save();
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(sx, sy + 32, 62, 15, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    if (!e.ruined) {
      const bw = 96, bh = 52, bx = sx - bw / 2, by = sy + 26 - bh; // 墙体
      ctx.fillStyle = e.flash > 0 ? '#e8d9c4' : '#8a6f4d';
      Art.rr(ctx, bx, by, bw, bh, 6); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#4a3b2a'; Art.rr(ctx, bx, by, bw, bh, 6); ctx.stroke();
      ctx.strokeStyle = 'rgba(74,59,42,.45)'; ctx.lineWidth = 1.5; // 木板纹
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(bx + 4, by + i * bh / 4); ctx.lineTo(bx + bw - 4, by + i * bh / 4); ctx.stroke(); }
      ctx.strokeStyle = '#3a2d1e'; ctx.lineWidth = 2.5; // 抓痕（老鼠妈妈的爪功）
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(bx + 14 + i * 9, by + 12); ctx.lineTo(bx + 8 + i * 9, by + 34); ctx.stroke(); }
      ctx.fillStyle = '#241a10'; // 门洞（鼠洞）
      ctx.beginPath(); ctx.arc(sx + 22, sy + 26, 13, Math.PI, 0); ctx.lineTo(sx + 35, sy + 26); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd34d'; // 暖光小窗
      Art.rr(ctx, bx + 60, by + 12, 22, 18, 4); ctx.fill();
      ctx.strokeStyle = '#4a3b2a'; ctx.lineWidth = 2.5; Art.rr(ctx, bx + 60, by + 12, 22, 18, 4); ctx.stroke();
      ctx.fillStyle = e.flash > 0 ? '#f0b7bc' : '#a8494f'; // 屋顶
      ctx.beginPath();
      ctx.moveTo(sx - W / 2 - 8, by); ctx.lineTo(sx, by - 44); ctx.lineTo(sx + W / 2 + 8, by);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#5f272b'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = '#d98a8f';
      ctx.beginPath(); ctx.moveTo(sx - 26, by - 33); ctx.lineTo(sx + 26, by - 33); ctx.stroke();
    } else {
      ctx.fillStyle = '#6b573c'; // 塌落的断墙
      ctx.beginPath(); ctx.moveTo(sx - 54, sy + 30); ctx.lineTo(sx - 30, sy - 14); ctx.lineTo(sx - 4, sy + 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a6f4d';
      ctx.beginPath(); ctx.moveTo(sx + 2, sy + 30); ctx.lineTo(sx + 34, sy - 6); ctx.lineTo(sx + 56, sy + 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#a8494f'; // 掉落的半片屋顶
      ctx.beginPath(); ctx.moveTo(sx - 44, sy + 2); ctx.lineTo(sx - 16, sy - 26); ctx.lineTo(sx + 2, sy + 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#4a3b2a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx - 20, sy + 18); ctx.lineTo(sx + 14, sy + 30); ctx.stroke();
      ctx.fillStyle = '#4a3b2a'; // 碎屑
      for (const [dx, dy, r2] of [[-40, 28, 4], [18, 26, 3], [40, 24, 5], [-6, 30, 3]]) {
        ctx.beginPath(); ctx.arc(sx + dx, sy + dy, r2, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
    if (!e.ruined) { // 血条：满血也常驻显示，方便远距离发现老巢
      const w2 = 96, barY = sy - 74;
      ctx.save();
      ctx.fillStyle = 'rgba(20,12,34,.6)';
      Art.rr(ctx, sx - w2 / 2, barY, w2, 9, 4.5); ctx.fill();
      ctx.fillStyle = '#c48ef5';
      Art.rr(ctx, sx - w2 / 2 + 1.5, barY + 1.5, Math.max(3, (w2 - 3) * Math.max(0, e.hp / e.maxHp)), 6, 3); ctx.fill();
      ctx.restore();
    }
  }
  function drawEnemy(e) {
    if (e.house) { drawHouse(e, w2sx(e.x), w2sy(e.y)); return; }
    const set = Art.E[e.type];
    const white = Art.EW[e.type];
    const blinkSpr = Art.EB[e.type] ? Art.EB[e.type][0] : null;
    const hurtSpr = Art.EH[e.type] ? Art.EH[e.type][0] : null;
    const sc = e.scale;
    const sx = w2sx(e.x), sy = w2sy(e.y);
    const sprW = e.mother ? 192 : e.boss ? 128 : 64;
    let yOff = 0, entryK = 0;
    if (e.boss && e.state === 'entry') { // 从天而降
      entryK = Math.max(0, e.entryT / (e.entryD || 0.9));
      yOff = -entryK * entryK * 460;
    }
    const fi = Math.floor(G.time * 7 + e.phase) % 2;
    const bob = Math.sin(G.time * 9 + e.phase) * 2.4 * sc + (e.landT > 0 ? Math.sin(e.landT / 0.28 * Math.PI) * 5 : 0);
    ctx.save();
    // 精英 / Boss 光环
    if (e.elite || e.boss) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (e.elite ? 0.4 : 0.5) + Math.sin(G.time * 5) * 0.12;
      const g = e.boss ? Art.glows.boss : Art.glows.chest;
      const gs = (e.mother ? 420 : e.boss ? 250 : 140) * sc;
      ctx.drawImage(g, sx - gs / 2, sy - gs / 2, gs, gs);
      ctx.restore();
    }
    // 影子（登场时缩小）
    ctx.save();
    ctx.globalAlpha = 0.28 * (1 - entryK * 0.7);
    ctx.fillStyle = '#000';
    const shw = (e.mother ? 44 : e.boss ? 30 : 17) * sc * (1 - entryK * 0.5);
    ctx.beginPath();
    ctx.ellipse(sx, sy + 24 * sc, shw, shw * 0.36, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    // 本体
    ctx.translate(sx, sy + bob + yOff);
    ctx.scale(sc, sc);
    if (e.landT > 0) ctx.scale(1.12, 0.88); // 落地压扁
    if (G.player.x < e.x) ctx.scale(-1, 1);
    let spr;
    if (e.boss && e.state === 'tele') spr = set.tele;
    else if (e.faceT > 0 && hurtSpr) spr = hurtSpr;
    else if (e.blinkA > 0 && blinkSpr) spr = blinkSpr;
    else spr = set.walk[fi];
    ctx.drawImage(spr, -sprW / 2, -sprW * 0.62, sprW, sprW);
    if (e.flash > 0) {
      ctx.globalAlpha = Math.min(1, e.flash / 0.12);
      ctx.drawImage(white[fi], -sprW / 2, -sprW * 0.62, sprW, sprW);
    }
    ctx.restore();
    // 精英金冠
    if (e.elite) {
      ctx.save();
      const k = 1 + Math.sin(G.time * 4 + e.phase) * 0.08;
      ctx.translate(sx, sy - 52 * sc + Math.sin(G.time * 2.6 + e.phase) * 3);
      ctx.scale(k, k);
      ctx.drawImage(Art.eliteCrown, -14, -12, 28, 22);
      ctx.restore();
    }
    // Boss 蓄力前摇提示
    if (e.boss && e.state === 'tele') {
      ctx.save();
      const k = 1 + Math.sin(G.time * 20) * 0.12;
      ctx.translate(sx, sy - (e.mother ? 165 : 78 * sc));
      ctx.scale(k, k);
      ctx.fillStyle = '#ff6b81';
      ctx.font = '900 ' + (e.mother ? 44 : 30) + 'px "Fusion Pixel","ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 6; ctx.strokeStyle = '#fff';
      ctx.strokeText('!', 0, 0);
      ctx.fillText('!', 0, 0);
      ctx.restore();
    }
    // Boss / 精英血条
    if ((e.boss || e.elite) && e.hp < e.maxHp && e.state !== 'entry') {
      const w2 = e.mother ? 130 : e.boss ? 90 : 60;
      const barY = e.mother ? sy - 128 : sy - 52 * sc;
      ctx.save();
      ctx.fillStyle = 'rgba(20,12,34,.6)';
      Art.rr(ctx, sx - w2 / 2, barY, w2, 8, 4); ctx.fill();
      if (e.hp > 0) {
        ctx.fillStyle = e.boss ? '#ff6b81' : '#ffd34d';
        Art.rr(ctx, sx - w2 / 2 + 1.5, barY + 1.5, Math.max(3, (w2 - 3) * Math.max(0, e.hp / e.maxHp)), 5, 2.5); ctx.fill();
      }
      ctx.restore();
    }
  }
  function drawPlayer() {
    const P = G.player;
    const F = Art.playerFrames;
    const sx = w2sx(P.x), sy = w2sy(P.y);
    const dead = G.state === 'dying' || G.state === 'over';
    ctx.save();
    if (P.iframes > 0 && Math.floor(G.time * 18) % 2 === 0) ctx.globalAlpha = 0.45;
    // 影子
    ctx.save();
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(sx, sy + 30, 19, 6.5, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.translate(sx, sy);
    if (P.flip) ctx.scale(-1, 1);
    if (dead) {
      ctx.drawImage(F.dead, -48, -58, 96, 96);
    } else {
      const squash = P.moving ? 1 + Math.sin(P.walkT * 16) * 0.035 : 1;
      ctx.scale(2 - squash, squash);
      let spr;
      if (P.hurtT > 0) spr = F.hurt;
      else if (P.moving) spr = F.walk[Math.floor(P.walkT * 9) % 4];
      else if (P.blinkA > 0) spr = F.blink;
      else spr = F.idle[Math.sin(G.time * 2.2) > 0 ? 0 : 1];
      const bob = P.moving ? Math.abs(Math.sin(P.walkT * 9)) * 3.5 : Math.sin(G.time * 2.5) * 1.5;
      ctx.drawImage(spr, -48, -60 - bob, 96, 96);
      if (P.hurtT > 0) {
        ctx.globalAlpha = P.hurtT / 0.25;
        ctx.drawImage(Art.playerWhite, -48, -60, 96, 96);
      }
    }
    ctx.restore();
  }
  function drawJoystick() {
    if (!joy.on) return;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 44, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(joy.ox + joy.x * 40, joy.oy + joy.y * 40, 20, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ================= HUD ================= */
  function drawHUD() {
    const P = G.player;
    if (G.state === 'menu') return;
    // XP 条（圆润 + 小鱼图标 + 连击）
    const need = DATA.xpNeed(P.lv || 1);
    const xpk = U.clamp((P.xp || 0) / need, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(12,10,34,.78)';
    ctx.fillRect(0, 0, vw, 22);
    Art.rr(ctx, 6, 5, vw - 12, 12, 6); ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fill();
    if (xpk > 0.01) {
      const g = ctx.createLinearGradient(0, 0, vw, 0);
      g.addColorStop(0, '#4fc3f7'); g.addColorStop(1, '#8ff0e0');
      Art.rr(ctx, 6, 5, Math.max(8, (vw - 12) * xpk), 12, 6); ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      Art.rr(ctx, 6, 5, Math.max(8, (vw - 12) * xpk), 5, 3); ctx.fill();
    }
    ctx.drawImage(Art.items.gem2, vw - 34, 0, 26, 22);
    if (G.gemCombo >= 5 && G.gemComboT > 0) {
      const pop = 1 + Math.max(0, G.gemComboT - 0.85) * 1.6;
      ctx.translate(vw - 48, 36); ctx.scale(pop, pop);
      ctx.font = '700 15px "Fusion Pixel","ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,14,40,.85)';
      ctx.strokeText('🐟 ×' + G.gemCombo, 0, 0);
      ctx.fillStyle = '#a8ecff';
      ctx.fillText('🐟 ×' + G.gemCombo, 0, 0);
    }
    ctx.restore();
    // 等级徽章
    ctx.save();
    ctx.fillStyle = '#ff8fb5';
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(vw - 34, 30, 21, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '900 19px "Fusion Pixel","ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Lv' + (P.lv || 1), vw - 34, 31);
    ctx.restore();
    // 计时：总存活时长（跨轮累计）
    const inBossFight = G.bossWarn > 0 || (G.boss && !G.boss.dieDone);
    const tstr = U.fmtTime(G.time);
    ctx.save();
    ctx.font = '900 34px "Fusion Pixel","ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(20,14,40,.85)';
    ctx.strokeText(tstr, vw / 2, 40);
    ctx.fillStyle = inBossFight ? '#ff6b81' : '#fff';
    if (inBossFight && Math.floor(G.time * 3) % 2 === 0) ctx.fillStyle = '#ffd34d';
    ctx.fillText(tstr, vw / 2, 40);
    ctx.restore();
    // 击杀 & 金币（图标 + 数字）：数字右对齐向左生长，图标按实测文本宽度排在数字左侧，大数字不再重叠（意见9）
    ctx.save();
    ctx.font = '700 18px "Fusion Pixel","ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,14,40,.85)';
    const kStr = '' + G.kills, gStr = '' + G.gold;
    ctx.strokeText(kStr, vw - 66, 30);
    ctx.fillStyle = '#ffe9c4';
    ctx.fillText(kStr, vw - 66, 30);
    ctx.strokeText(gStr, vw - 66, 62);
    ctx.fillStyle = '#ffd34d';
    ctx.fillText(gStr, vw - 66, 62);
    const kTw = ctx.measureText(kStr).width, gTw = ctx.measureText(gStr).width;
    ctx.textAlign = 'center';
    ctx.drawImage(Art.icons.paw, vw - 66 - kTw - 8 - 22, 19, 22, 22);
    ctx.drawImage(Art.items.coin, vw - 66 - gTw - 8 - 22, 51, 22, 22);
    // 轮次 / 批次指示
    const R2 = DATA.ROUNDS;
    const batchTxt = G.batch >= R2.batchCount ? '轮Boss战！' : '批次 ' + (G.batch + 1) + '/' + R2.batchCount;
    const mapTxt = curMap ? ' · ' + curMap.meta.emoji + curMap.meta.name : ' · 无尽街区';
    ctx.textAlign = 'right';
    ctx.font = '700 15px "Fusion Pixel","ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
    ctx.strokeText('第 ' + G.round + ' 轮 · ' + batchTxt + mapTxt, vw - 66, 88);
    ctx.fillStyle = '#c9b8ff';
    ctx.fillText('第 ' + G.round + ' 轮 · ' + batchTxt + mapTxt, vw - 66, 88);
    ctx.restore();
    // 武器/被动栏（带冷却指示）；眩晕/缴械时武器栏点暗提示
    let ix = 12, iy = 30;
    for (const w of P.weapons) {
      const frac = w.cdMax > 0 ? U.clamp(w.t / w.cdMax, 0, 1) : 0;
      drawItemSlot(ix, iy, Art.icons[w.evolved ? WEAPONS[w.id].iconEvo : WEAPONS[w.id].icon], w.evolved ? 8 : w.lv, 8, w.evolved, frac);
      ix += 34;
    }
    if (P.stunT > 0 || P.disarmT > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(20,12,34,.5)';
      Art.rr(ctx, 8, 26, Math.max(1, P.weapons.length) * 34 + 4, 30, 8); ctx.fill();
      ctx.fillStyle = '#ff8fb5';
      ctx.font = '700 12px "Fusion Pixel","ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(P.stunT > 0 ? '眩晕!' : '无法攻击', 12, 41);
      ctx.restore();
    }
    ix = 12; iy += 38;
    for (const p of P.passives) {
      drawItemSlot(ix, iy, Art.icons[PASSIVES[p.id].icon], p.lv, PASSIVES[p.id].maxLv, false);
      ix += 34;
    }
    // 猫爪印栏（跨轮累计、无上限；满 10 层金框微光）
    const affs = P.affixes || [];
    if (affs.length) {
      ix = 12; iy += 38;
      for (const af of affs) {
        drawStampChip(ix, iy, af);
        ix += 34;
      }
    }
    // 血条（猫头顶小药丸）
    const hx = w2sxA(P.x), hy = w2syA(P.y) - 50;
    ctx.save();
    ctx.fillStyle = 'rgba(20,12,34,.55)';
    ctx.fillRect(hx - 25, hy, 50, 9);
    const hpk = U.clamp(P.hp / P.maxHp, 0, 1);
    if (hpk > 0.02) {
      ctx.fillStyle = hpk < 0.3 ? '#ff6b81' : hpk < 0.6 ? '#ffd166' : '#8fd982';
      ctx.fillRect(hx - 24, hy + 1.5, Math.max(3, 48 * hpk), 6);
    }
    ctx.restore();
    // Boss 血条
    if (G.boss && !G.boss.dieDone && G.boss.state !== 'entry') {
      const b = G.boss;
      const bw = Math.min(520, vw * 0.6);
      ctx.save();
      ctx.fillStyle = 'rgba(20,12,34,.65)';
      Art.rr(ctx, vw / 2 - bw / 2, 74, bw, 18, 9); ctx.fill();
      const hpw = Math.max(0, (bw - 4) * Math.max(0, b.hp / b.maxHp));
      if (hpw > 0) {
        const g2 = ctx.createLinearGradient(vw / 2 - bw / 2, 0, vw / 2 + bw / 2, 0);
        g2.addColorStop(0, '#ff8ba0'); g2.addColorStop(1, '#f0506b');
        Art.rr(ctx, vw / 2 - bw / 2 + 2, 76, Math.max(6, hpw), 14, 7);
        ctx.fillStyle = g2; ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.25)';
        Art.rr(ctx, vw / 2 - bw / 2 + 2, 76, Math.max(6, hpw), 6, 3); ctx.fill();
      }
      ctx.font = '700 15px "Fusion Pixel","ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,12,34,.8)';
      const bossTitle = '👑 鼠王·铁须' + (b.affixes && b.affixes.length ? '【' + affixNames(b) + '】' : '');
      ctx.strokeText(bossTitle, vw / 2, 72);
      ctx.fillStyle = '#ffd9e6';
      ctx.fillText(bossTitle, vw / 2, 72);
      ctx.restore();
    }
    // 鼠王降临警告：红屏脉动
    if (G.bossWarn > 0) {
      const a = 0.15 + Math.sin(G.realTime * 10) * 0.08;
      ctx.save();
      const g3 = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.25, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.55);
      g3.addColorStop(0, 'rgba(255,40,60,0)');
      g3.addColorStop(1, 'rgba(255,40,60,' + a.toFixed(3) + ')');
      ctx.fillStyle = g3; ctx.fillRect(0, 0, vw, vh);
      ctx.restore();
    }
    // 横幅提示（圆角药丸底）
    if (G.banner) {
      const k = Math.min(1, G.banner.t / 0.4);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.font = '900 24px "Fusion Pixel","ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const y = 122;
      const tw = ctx.measureText(G.banner.txt).width;
      ctx.fillStyle = 'rgba(20,14,40,.75)';
      Art.rr(ctx, vw / 2 - tw / 2 - 18, y - 22, tw + 36, 44, 22); ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(20,14,40,.85)';
      ctx.strokeText(G.banner.txt, vw / 2, y);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(G.banner.txt, vw / 2, y);
      ctx.restore();
    }
    // 操作提示（前 20 秒）
    if (G.time < 18 && G.state === 'play') {
      ctx.save();
      ctx.globalAlpha = Math.min(1, 18 - G.time) * 0.8;
      ctx.font = '600 15px "Fusion Pixel","ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#cfd0ff';
      ctx.fillText(IS_TOUCH ? '按住屏幕拖动＝摇杆移动 · 武器全自动' : 'WASD / 方向键移动 · 武器全自动 · P 暂停 · M 静音', vw / 2, vh - 26);
      ctx.restore();
    }
  }
  function drawItemSlot(x, y, icon, lv, max, isEvo, cdFrac) {
    ctx.save();
    ctx.fillStyle = 'rgba(16,13,38,.78)';
    Art.rr(ctx, x, y, 30, 30, 9); ctx.fill();
    if (isEvo) {
      ctx.strokeStyle = 'rgba(255,143,181,' + (0.7 + Math.sin(G.time * 5) * 0.3).toFixed(3) + ')';
      ctx.lineWidth = 2.5; Art.rr(ctx, x, y, 30, 30, 9); ctx.stroke();
    }
    if (cdFrac !== undefined && cdFrac > 0) ctx.globalAlpha = 0.45; // 冷却中图标变暗
    ctx.drawImage(icon, x + 3, y + 3, 24, 24);
    ctx.globalAlpha = 1;
    if (cdFrac !== undefined && cdFrac > 0) { // 冷却转圈
      ctx.beginPath();
      ctx.moveTo(x + 15, y + 15);
      ctx.arc(x + 15, y + 15, 15.5, -Math.PI / 2, -Math.PI / 2 + TAU * cdFrac);
      ctx.closePath();
      ctx.fillStyle = 'rgba(10,8,30,.55)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 15, y + 15, 15.5, -Math.PI / 2 + TAU * cdFrac, -Math.PI / 2 + TAU * Math.min(1, cdFrac + 0.06));
      ctx.strokeStyle = 'rgba(255,233,168,.8)'; ctx.lineWidth = 1.6; ctx.stroke();
    }
    for (let i = 0; i < Math.min(max, 8); i++) {
      ctx.fillStyle = i < lv ? '#ffd34d' : 'rgba(255,255,255,.18)';
      ctx.fillRect(x + 2 + i * 3.5, y + 25.5, 2.4, 3.2);
    }
    ctx.restore();
  }
  function drawStampChip(x, y, af) {
    const meta = STAMP_META[af.id];
    ctx.save();
    ctx.fillStyle = 'rgba(30,20,52,.85)';
    Art.rr(ctx, x, y, 30, 30, 9); ctx.fill();
    const hot = af.stacks >= 10; // 里程碑：×10 起金框呼吸
    ctx.strokeStyle = 'rgba(255,211,77,' + (hot ? (0.55 + Math.sin(G.time * 5) * 0.25).toFixed(3) : '0.35') + ')';
    ctx.lineWidth = 1.6;
    Art.rr(ctx, x, y, 30, 30, 9); ctx.stroke();
    ctx.drawImage(Art.icons[meta.icon], x + 4, y + 4, 22, 22);
    ctx.font = '900 10px "Fusion Pixel","ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,14,40,.9)';
    ctx.strokeText('×' + af.stacks, x + 15, y + 25.5);
    ctx.fillStyle = '#ffd34d';
    ctx.fillText('×' + af.stacks, x + 15, y + 25.5);
    ctx.restore();
  }

  /* ================= 键盘全局 ================= */
  function handleKey(code) {
    if (code === 'KeyM') { // M 静音快捷键：与 ⚙ 抽屉顶部音效按钮共用同一真源（改完经 meow-toggles 广播刷新）
      toggleMuted();
      return;
    }
    if (G.state === 'levelup' && ['Digit1', 'Digit2', 'Digit3'].includes(code)) {
      chooseCard(Number(code.slice(-1)) - 1);
      return;
    }
    // 意见1/2（第三版）：-/= 调缩放、0 复位；对局中 1/2/3 直接设加速档（升级三选一时优先选卡）
    if (code === 'Minus' || code === 'NumpadSubtract') { cycleZoom(-1); return; }
    if (code === 'Equal' || code === 'NumpadAdd') { cycleZoom(1); return; }
    if (code === 'Digit0' || code === 'Numpad0') { setZoom(1); return; }
    if (G.state === 'play' && ['Digit1', 'Digit2', 'Digit3'].includes(code)) {
      setSpeed(Number(code.slice(-1)));
      return;
    }
    if (code === 'KeyP' || code === 'Escape') {
      if (G.state === 'play') pauseGame();
      else if (G.state === 'pause') resumeGame();
      return;
    }
    if (G.state === 'menu' && (code === 'Enter' || code === 'Space')) { startRun(); return; }
    if (DEV) {
      if (G.state !== 'play') return;
      if (code === 'KeyL') { // 秒升 1 级：按经验乘数（难度 xpGain × 动态节流 xpMul）折算差额
        const mul = DATA.DIFF.xpGain * ((G.roundMods && G.roundMods.xpMul) || 1);
        addXp((DATA.xpNeed(G.player.lv || 1) - (G.player.xp || 0)) / mul);
      }
      else if (code === 'KeyC') { G.chests.push({ x: G.player.x + 40, y: G.player.y, t: 0, taken: false }); }
      else if (code === 'KeyB') { G.bossSpawned = true; spawnBoss(); }
      else if (code === 'KeyH') { G.motherActive = true; G.motherWarnT = 0.01; } // 秒召老鼠妈妈（压轴测试）
      else if (code === 'KeyK') { for (const e of [...G.enemies]) if (!e.boss) killEnemy(e); }
      else if (code === 'KeyT') { G.time += 60; G.roundTime += 60; G.waveT += 60; }
      else if (code === 'KeyI') { G.player.hp = G.player.maxHp; }
      else if (code === 'KeyO') { damagePlayer(99999); }
      else if (code === 'KeyG') { // 随机 +1 层猫爪印（手测用）
        const id = U.pick(STAMP_ORDER);
        const af = G.player.affixes.find(a => a.id === id);
        if (af) af.stacks++;
        else G.player.affixes.push({ id, stacks: 1 });
        calcMods();
        banner('🐾 ' + STAMP_META[id].name + ' ×' + stampStacks(id) + '｜' + stampEffectText(id, stampStacks(id)), 2);
      }
      else if (code === 'KeyU') {
        for (const w of G.player.weapons) if (!w.evolved) w.lv = WEAPONS[w.id].maxLv;
        for (const w of G.player.weapons) {
          if (G.player.passives.length >= DATA.SLOTS.passive) break;
          const pid = WEAPONS[w.id].evoPassive;
          if (!G.player.passives.find(p => p.id === pid)) G.player.passives.push({ id: pid, lv: 1 });
        }
        calcMods();
      }
    }
  }

  /* ================= 流程控制 ================= */
  // 地图选择：主菜单卡片，记住上次选择
  G.mapId = U.storage.get('meow_map', MAPS.defaultId);
  if (!MAPS.get(G.mapId)) G.mapId = MAPS.defaultId;
  if (DEV) { // ?map=oldtown / ?map=endless 指定地图（测试用）
    const mp = new URLSearchParams(location.search).get('map');
    if (mp && (mp === 'endless' || MAPS.get(mp))) G.mapId = mp;
  }
  function buildMapChips() {
    const row = $('map-row');
    row.innerHTML = '';
    for (const m of MAPS.list) {
      const chip = document.createElement('button');
      chip.className = 'map-chip' + (m.id === G.mapId ? ' on' : '');
      chip.title = (m.meta && m.meta.desc) || '';
      const pv = document.createElement('canvas');
      pv.className = 'map-pv';
      pv.width = 96; pv.height = 72;
      chip.appendChild(pv);
      const nm = document.createElement('span');
      nm.className = 'map-nm';
      nm.textContent = m.meta.emoji + m.meta.name;
      chip.appendChild(nm);
      chip.addEventListener('click', () => {
        Sfx.ensure(); Sfx.sfx.click();
        G.mapId = m.id;
        U.storage.set('meow_map', m.id);
        buildMapChips();
      });
      row.appendChild(chip);
      m.preview(pv);
    }
  }
  buildMapChips();
  function startRun() {
    Sfx.ensure();
    resetRun();
    for (const k in screens) show(screens[k], false);
    document.body.classList.remove('help-open'); // 玩法说明若开着，同步收回放开过的纵向触摸
    G.state = 'play';
    Sfx.bgmStart(G.mapId); // 意见5：每张地图一首 BGM
    const mName = curMap ? curMap.meta.emoji + curMap.meta.name + ' · ' : '';
    banner('🌙 第 1 轮 · ' + mName + '夜巡开始！击溃 4 个批次头目，讨伐鼠王！', 3);
  }
  function pauseGame() {
    G.state = 'pause';
    show(screens.pause, true);
  }
  function resumeGame() {
    G.state = 'play';
    show(screens.pause, false);
  }
  function toMenu() {
    G.state = 'menu';
    Sfx.bgmStop();
    document.body.classList.remove('help-open');
    for (const k in screens) show(screens[k], k === 'menu');
    updateBestLine();
  }
  function updateBestLine() {
    const b = U.storage.get('meow_best', null);
    $('best-line').textContent = b && b.time ? `最佳纪录 · 坚持 ${U.fmtTime(b.time)} · 最远第 ${b.rounds || 1} 轮` : '今晚的喵都，等一只勇敢的猫 🐾';
  }

  $('btn-start').addEventListener('click', startRun);
  // 玩法说明：打开时给 body 挂 help-open 放开纵向触摸（面板内部滚动需要），关闭/开局收回
  $('btn-help').addEventListener('click', () => {
    Sfx.ensure(); Sfx.sfx.click();
    show(screens.help, true);
    document.body.classList.add('help-open');
  });
  $('btn-help-close').addEventListener('click', () => {
    Sfx.sfx.click();
    show(screens.help, false);
    document.body.classList.remove('help-open');
  });
  $('btn-resume').addEventListener('click', () => { Sfx.sfx.click(); resumeGame(); });
  $('btn-restart').addEventListener('click', () => { Sfx.sfx.click(); startRun(); });
  $('btn-quit').addEventListener('click', () => {
    Sfx.sfx.click();
    if (G.state === 'pause' && G.time > 0) { // 夜巡中途收工：进入与失败同一张结算（成功版）
      show(screens.pause, false);
      Sfx.bgmStop();
      showResult(true);
      return;
    }
    toMenu();
  });
  // 暂停面板「⚙ 平衡设置」保留纯配置功能；音效钮在暂停面板（#cfg-mute-btn，接线见下方对外接口区）
  $('btn-chest-ok').addEventListener('click', () => {
    Sfx.sfx.click();
    show(screens.chest, false);
    G.state = 'play';
    if (G.evoPending) { // 进化全屏演出
      G.evoPending = false;
      const PP = G.player;
      G.flash = 0.5; G.timeScale = 0.35; G.slowmoT = 0.7;
      beamAt(PP.x, PP.y - 6, '#ffbfe0');
      part({ x: PP.x, y: PP.y, life: 0.9, size: 110, col: '#ff9dc3', kind: 'ring' });
      part({ x: PP.x, y: PP.y, life: 1.1, size: 70, col: '#ffe9a8', kind: 'ring' });
      popStars(PP.x, PP.y, '#ff9dc3', 26);
      addShake(8, true);
    }
    if (G.pendingLv > 0) openLevelUp();
  });
  $('btn-again').addEventListener('click', () => { Sfx.sfx.click(); show(screens.over, false); startRun(); });
  $('btn-menu').addEventListener('click', () => { Sfx.sfx.click(); show(screens.over, false); toMenu(); });
  $('btn-save-img').addEventListener('click', () => { Sfx.sfx.click(); Result.saveImage(); });
  // 「继续夜巡」：讨伐老鼠妈妈后的成功结算 → 无缝续玩第 4 轮起的无限模式（一切保留）
  $('btn-continue').addEventListener('click', () => {
    Sfx.sfx.click();
    show(screens.over, false);
    G.motherActive = false; G.mother = null;
    G.timeScale = 1; G.slowmoT = 0; G.flash = 0; G.motherFxT = 0;
    startRound(G.round + 1);
    G.state = 'play';
    Sfx.bgmStart(G.mapId);
  });
  window.addEventListener('blur', () => { if (G.state === 'play') pauseGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') pauseGame(); });

  /* ================= 主循环 ================= */
  // 意见5（第五版）：对局相关状态（play/升级三选一/开宝箱/暂停/倒地）隐藏右上角 ⚙ 入口
  // （改走暂停面板的「⚙ 平衡设置」），主菜单/结算/玩法说明/更新日志等非对局界面保持可见。
  // 状态切换点较散，就收口在帧循环里做脏检查：只在变化的那一刻写一次 DOM，不每帧碰
  const GEAR_HIDE_STATES = ['play', 'levelup', 'chest', 'pause', 'dying'];
  let gearHidden = false; // 与 HTML 初始可见一致，首帧免写
  function syncGearBtn() {
    const hide = GEAR_HIDE_STATES.includes(G.state);
    if (hide === gearHidden) return;
    gearHidden = hide;
    $('btn-cfg').hidden = hide;
  }
  let lastT = performance.now();
  function loop(t) {
    requestAnimationFrame(loop);
    syncGearBtn(); // ⚙ 齿轮可见性随对局状态切换（脏检查）
    // 视口自愈：旋转/地址栏收展/分屏拖动在某些浏览器不发 resize 事件，每帧廉价比对一次
    if (window.innerWidth !== vw || window.innerHeight !== vh) resize();
    const realDt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    let dt = realDt;
    if (G.slowmoT > 0) { G.slowmoT -= realDt; if (G.slowmoT <= 0) G.timeScale = 1; }
    dt *= G.timeScale;
    G.realTime = t / 1000;
    if (G.state === 'play') {
      // 意见2：加速档把缩放后的 dt 拆成 ≤1/30s 的子步推进——3X 高速下移动/碰撞依旧逐帧稳定
      if (gameSpeed === 1) update(dt);
      else {
        let remain = dt * gameSpeed;
        while (remain > 1e-6) { const s2 = Math.min(remain, 1 / 30); update(s2); remain -= s2; }
      }
    }
    else if (G.state === 'dying') { updateDying(dt); updateParticlesOnly(dt); }
    if (G.state !== 'menu') render();
    else renderMenuBg();
    if (DEV && G.state !== 'menu') drawDevPanel();
  }
  // ?dev=1 性能小面板：实时观测震屏/猫砂区域/粒子/投射物/飘字/敌人/音效频率（中后期过载排查）
  function drawDevPanel() {
    setScreenXf();
    ctx.font = '11px Consolas,monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.fillText('shake ' + G.shake.toFixed(1) + '  zones ' + G.zones.length + '  parts ' + G.parts.length +
      '  projs ' + G.projs.length + '  dmgs ' + G.dmgs.length + '  enemies ' + G.enemies.length +
      '  waveT ' + Math.round(G.waveT) + '  warp ' + G.warps + '  sfx/s ' + Sfx.sfxRate(), 8, vh - 8);
  }
  function updateFx(dt) {
    for (const p of G.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.grav) p.vy += p.grav * dt; }
    for (let i = G.parts.length - 1; i >= 0; i--) if (G.parts[i].t >= G.parts[i].life) U.swapRemove(G.parts, i);
    for (const d of G.dmgs) d.t += dt;
    for (let i = G.dmgs.length - 1; i >= 0; i--) if (G.dmgs[i].t >= G.dmgs[i].life) U.swapRemove(G.dmgs, i);
  }
  function updateParticlesOnly(dt) {
    updateFx(dt);
    G.flash = Math.max(0, G.flash - dt);
    G.motherFxT = Math.max(0, G.motherFxT - dt);
    G.shake = Math.max(0, G.shake - dt * FX.shakeDecay);
  }
  // 菜单背景：渐变夜空 + 闪烁星星 + 月亮 + 云 + 城市剪影 + 路灯
  const stars = [];
  for (let i = 0; i < 110; i++) stars.push({ x: Math.random(), y: Math.random() * 0.62, r: U.rand(0.6, 1.8), ph: U.rand(0, TAU), sp: U.rand(0.5, 1.6) });
  let menuCam = 0;
  function renderMenuBg() {
    menuCam += 0.3;
    setScreenXf();
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#0d0e26');
    g.addColorStop(0.45, '#232050');
    g.addColorStop(0.75, '#3a2c5e');
    g.addColorStop(1, '#59395e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
    // 星星
    ctx.save();
    for (const s of stars) {
      const a = 0.35 + Math.sin(G.realTime * s.sp + s.ph) * 0.3;
      ctx.globalAlpha = Math.max(0.05, a);
      const fsz = Math.max(2, Math.round(s.r));
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x * vw - fsz / 2, s.y * vh - fsz / 2, fsz, fsz);
    }
    ctx.restore();
    // 月亮
    ctx.drawImage(Art.sky.moon, vw - 250, 24, 200, 200);
    // 云
    const cl1 = ((menuCam * 0.35) % (vw + 500)) - 250;
    const cl2 = ((menuCam * 0.22 + 600) % (vw + 500)) - 250;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(Art.sky.cloud1, cl1, vh * 0.14, 300, 112);
    ctx.drawImage(Art.sky.cloud2, cl2, vh * 0.3, 240, 90);
    ctx.globalAlpha = 1;
    // 城市剪影（缓慢视差）
    const slH = 210, y0 = vh - slH - vh * 0.16;
    const off1 = -((menuCam * 0.5) % 1024);
    for (let x2 = off1 - 1024; x2 < vw + 1024; x2 += 1024) ctx.drawImage(Art.sky.skyline, x2, y0);
    // 地面
    const g2 = ctx.createLinearGradient(0, vh - vh * 0.16, 0, vh);
    g2.addColorStop(0, '#232441');
    g2.addColorStop(1, '#191a30');
    ctx.fillStyle = g2;
    ctx.fillRect(0, vh - vh * 0.16, vw, vh * 0.16);
    // 路灯洒光
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lx = ((menuCam * 0.5) % 400);
    for (let x3 = -lx; x3 < vw + 220; x3 += 400) ctx.drawImage(Art.glows.lamp, x3 - 110, vh - 160);
    ctx.restore();
    ctx.drawImage(vignette, 0, 0);
    // 主视觉猫（摆尾 / 挥爪 / 眨眼）
    const mc = $('menu-art').getContext('2d');
    mc.imageSmoothingEnabled = true; // 4x 烘焙猫平滑缩放（绘本风非像素精灵；关平滑会锯齿糊）
    mc.clearRect(0, 0, 640, 560);
    const blink = (G.realTime % 4.6) < 0.14;
    const frame = Math.floor(G.realTime * 1.6) % 2;
    const spr = blink ? Art.menuCatBlink : Art.menuCat[frame];
    mc.drawImage(spr, 70, 40, 500, 500);
  }

  updateBestLine();
  // 🔊/🔍/⏩ 对外接口：暂停面板三钮（config_panel.js 负责发起循环与刷新文字）用它们循环档位、读取当前值；
  // 值变化由 setZoom/setSpeed/toggleMuted → updateToggleBtns 以 meow-toggles 事件广播
  window.MeowView = {
    cycleZoom: dir => cycleZoom(dir || 1),
    cycleSpeed: () => cycleSpeed(),
    get: () => ({ zoom: userZoom, speed: gameSpeed, muted: Sfx.isMuted() })
  };
  // ⚙ 平衡设置面板
  CfgPanel.init({
    onClose: () => { if (G.state === 'pause') show(screens.pause, true); }
  });
  updateToggleBtns(); // 事件监听就位后，广播一次当前音效/缩放/加速状态
  // 暂停面板三钮一行的音效钮接线（原 #btn-mute 逻辑，id 沿用 #cfg-mute-btn）；
  // 单击切换 → meow-toggles 广播 → config_panel.js 刷新按钮文字，真源仍在 toggleMuted
  $('cfg-mute-btn').addEventListener('click', () => { Sfx.sfx.click(); toggleMuted(); });
  const openCfg = () => {
    Sfx.ensure(); Sfx.sfx.click();
    if (G.state === 'play') pauseGame();
    show(screens.pause, false);
    CfgPanel.open();
  };
  $('btn-cfg').addEventListener('click', openCfg);
  $('btn-cfg-pause').addEventListener('click', openCfg);
  if (DEV) window.__MS = { G, calcMods, DATA, getMods: () => mods, buildPool, hitEnemy, spawnEnemy,
    updateStuck, warpStuckPoint, getCurMap: () => curMap,
    getZoom: () => ({ userZoom, zoom, worldW, worldH }), getSpeed: () => gameSpeed };
  // 自动化测试钩子（仅 ?dev=1&auto=... 生效）
  if (AUTO) {
    window.addEventListener('error', e => {
      let d = document.getElementById('auto-err');
      if (!d) {
        d = document.createElement('div');
        d.id = 'auto-err';
        d.style.cssText = 'position:fixed;top:36%;left:6%;right:6%;z-index:999;background:#a00;color:#fff;font:14px monospace;padding:12px;border-radius:8px;white-space:pre-wrap';
        document.body.appendChild(d);
      }
      d.textContent += 'ERR: ' + ((e.error && e.error.stack) || e.message || e.type) + '\n';
    });
    setTimeout(() => {
      startRun();
      // &at=x,y：截图/调试用传送（带 at 时 auto=play 不再撒怪，画面干净）
      const at = new URLSearchParams(location.search).get('at');
      if (at) {
        const [ax, ay] = at.split(',').map(Number);
        if (isFinite(ax) && isFinite(ay)) {
          const p = curMap ? curMap.nearWalk(ax, ay, true, 400) : { x: ax, y: ay };
          G.player.x = p.x; G.player.y = p.y;
          G.cam.x = p.x; G.cam.y = p.y;
        }
      }
      if (AUTO === 'play') {
        setTimeout(() => {
          G.player.weapons.push({ id: 'note', lv: 2, t: 0.3, state: 0 }, { id: 'fish', lv: 2, t: 0.3, state: 0 });
          if (at) return;
          for (let i = 0; i < 42; i++) {
            const a = U.rand(0, TAU), d = U.rand(230, 620);
            spawnEnemy(U.chance(0.8) ? 'rat' : 'sparrow', G.player.x + Math.cos(a) * d, G.player.y + Math.sin(a) * d, false);
          }
        }, 700);
      } else if (AUTO === 'over') {
        setTimeout(() => { G.kills = 233; G.gold = 88; gameOver(); }, 700);
      } else if (AUTO === 'cfg') {
        // 意见5：对局中 ⚙ 齿轮已隐藏，直接走 openCfg（与旧「点击 #btn-cfg」等价：同样先暂停再开抽屉）
        setTimeout(() => { openCfg(); }, 800);
      } else if (AUTO === 'cfgpreset') {
        setTimeout(() => { openCfg(); setTimeout(() => {
          const b = document.querySelector('#cfg-presets button[data-preset="easy"]');
          if (b) b.click();
        }, 400); }, 800);
      } else if (AUTO === 'pause') { // 暂停面板截图/自动化（音效/缩放/加速三钮与「继续夜巡」同级的验证入口）
        setTimeout(() => { pauseGame(); }, 800);
      } else if (AUTO === 'lvl') {
        setTimeout(() => { addXp(60); }, 900);
      } else if (AUTO === 'chest') {
        setTimeout(() => {
          G.player.weapons.push({ id: 'note', lv: 8, t: 1, state: 0 });
          G.player.passives.push({ id: 'alarm', lv: 1 });
          calcMods();
          openChest();
        }, 900);
      } else if (AUTO === 'boss') {
        G.player.weapons = [
          { id: 'claw', lv: 8, evolved: true, t: 0, state: 0 },
          { id: 'orbit', lv: 8, evolved: true, t: 0, state: 0 },
          { id: 'fish', lv: 8, evolved: true, t: 0, state: 0 },
          { id: 'aura', lv: 8, evolved: true, t: 0, state: 0 },
          { id: 'zap', lv: 8, t: 0, state: 0 },
          { id: 'note', lv: 8, t: 0, state: 0 }
        ];
        G.player.passives = [{ id: 'catnip', lv: 3 }, { id: 'gloves', lv: 2 }, { id: 'yarnball', lv: 3 }, { id: 'alarm', lv: 2 }, { id: 'milk', lv: 2 }];
        G.player.affixes = [{ id: 'dmg', stacks: 3 }, { id: 'pierce', stacks: 2 }, { id: 'amount', stacks: 1 }];
        calcMods();
        G.roundTime = 899.4; G.batch = 3; G.batchBossSpawned = true;
        for (let i = 0; i < 16; i++) {
          const a = U.rand(0, TAU), d = U.rand(260, 520);
          spawnEnemy(U.pick(['rat', 'sparrow', 'bat']), G.player.x + Math.cos(a) * d, G.player.y + Math.sin(a) * d, false);
        }
        spawnBoss(pickAffixes(G.roundMods.bossAffix || 0, [], true));
        G.boss.x = G.player.x + 350; G.boss.y = G.player.y - 40;
      } else if (AUTO === 'mother') { // 老鼠妈妈压轴战（截图/自动化测试）
        G.player.weapons = [
          { id: 'claw', lv: 8, evolved: true, t: 0, state: 0 },
          { id: 'orbit', lv: 8, evolved: true, t: 0, state: 0 },
          { id: 'fish', lv: 8, evolved: true, t: 0, state: 0 },
          { id: 'aura', lv: 8, evolved: true, t: 0, state: 0 },
          { id: 'litter', lv: 8, evolved: true, t: 0, state: 0 },
          { id: 'zap', lv: 8, t: 0, state: 0 }
        ];
        G.player.passives = [{ id: 'catnip', lv: 3 }, { id: 'yarnball', lv: 3 }, { id: 'milk', lv: 3 }];
        calcMods();
        G.motherActive = true;
        G.motherWarnT = 1.2;
      }
    }, 400);
  }
  const startLoop = () => requestAnimationFrame(loop);
  if (window.__PIXEL_GATE) window.__PIXEL_GATE.then(startLoop);
  else startLoop();
})();
