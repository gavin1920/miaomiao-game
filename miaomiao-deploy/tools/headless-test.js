/* 无头逻辑冒烟测试：用 DOM/Canvas 桩在 Node 里跑完整游戏流程
   用法: node tools/headless-test.js  （需先启动，不依赖浏览器） */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* ---------- DOM / Canvas 桩 ---------- */
function makeCtx(canvas) {
  const target = {
    canvas,
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    measureText: () => ({ width: 42 })
  };
  return new Proxy(target, {
    get(o, k) {
      if (k in o) return o[k];
      return () => undefined;
    },
    set(o, k, v) { o[k] = v; return true; }
  });
}
const elRegistry = new Map();
let elCount = 0;
function makeEl(tag) {
  const el = {
    _id: ++elCount, tag, style: { cssText: '' }, children: [],
    _cls: new Set(),
    classList: {
      add: c => el._cls.add(c),
      remove: c => el._cls.delete(c),
      toggle: (c, f) => (f === undefined ? !el._cls.has(c) : f) ? el._cls.add(c) : el._cls.delete(c),
      contains: c => el._cls.has(c)
    },
    _handlers: {},
    addEventListener(t, f) { (el._handlers[t] = el._handlers[t] || []).push(f); },
    removeEventListener() {},
    appendChild(c) { el.children.push(c); return c; },
    querySelector() { return makeEl('canvas'); },
    click() { (el._handlers.click || []).forEach(f => f({ preventDefault() {} })); },
    set innerHTML(v) { el._html = v; el.children.length = 0; },
    get innerHTML() { return el._html || ''; },
    textContent: '',
    width: 0, height: 0,
    getContext() { return makeCtx(el); }
  };
  Object.defineProperty(el, 'id', { value: '' });
  return el;
}
const keyHandlers = [];
const windowHandlers = {};
const documentStub = {
  hidden: false,
  body: makeEl('body'),
  fonts: null,
  getElementById(id) {
    if (!elRegistry.has(id)) elRegistry.set(id, makeEl('div#' + id));
    return elRegistry.get(id);
  },
  createElement(tag) { return makeEl(tag); },
  addEventListener(t, f) { (windowHandlers['doc:' + t] = windowHandlers['doc:' + t] || []).push(f); }
};
const gameCanvas = makeEl('canvas');
elRegistry.set('game', gameCanvas);

let rafCb = null;
const sandbox = {
  console,
  performance,
  URLSearchParams,
  setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)), // 加速测试中的延时钩子
  clearTimeout,
  setInterval: (fn, ms) => 0, // BGM 定时器直接忽略（无音频）
  clearInterval: () => {},
  requestAnimationFrame: cb => { rafCb = cb; return 1; },
  localStorage: { getItem: () => null, setItem() {} },
  location: { search: '?dev=1', href: 'http://localhost/test' },
  navigator: { userAgent: 'node' },
  document: documentStub,
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
  addEventListener(t, f) { (windowHandlers[t] = windowHandlers[t] || []).push(f); },
  removeEventListener() {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of ['js/util.js', 'js/audio.js', 'js/art.js', 'js/maps.js', 'js/game_config.js', 'js/data.js', 'js/config_panel.js', 'js/result.js', 'js/main.js']) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
  console.log('loaded', f);
}

/* ---------- 场景 0：配置系统 ---------- */
const CFGOK = (() => {
  const c = sandbox.window.GAME_CONFIG;
  if (!c) throw new Error('GAME_CONFIG 未加载');
  if (!c.weapons || !c.weapons.claw || c.weapons.claw.dmg.length !== 8) throw new Error('武器配置数组异常');
  if (!c.enemies || !c.enemies.rat) throw new Error('敌人配置缺失');
  if (!Array.isArray(c.waves) || c.waves.length < 30) throw new Error('波次表异常');
  // 取同上下文的顶层词法绑定（const 声明不挂 window）
  const { DATA, CfgPanel } = vm.runInContext('({ DATA: DATA, CfgPanel: CfgPanel })', sandbox);
  if (!DATA || !CfgPanel) throw new Error('DATA/CfgPanel 未定义');
  // data.js 装配应与配置一致
  if (DATA.ENEMIES.rat.hp !== c.enemies.rat.hp) throw new Error('敌人基础值未从配置读取');
  if (DATA.WEAPONS.claw.stats(3).dmg !== c.weapons.claw.dmg[2]) throw new Error('武器数值未从配置读取');
  if (DATA.xpNeed(2) !== Math.round(c.growth.xpBase + c.growth.xpPerLv + 1)) throw new Error('经验公式未从配置读取');
  if (DATA.BOSS_T !== c.rounds.parTime) throw new Error('轮时长未从配置读取');
  if (typeof DATA.roundMods !== 'function') throw new Error('roundMods 未导出');
  // 意见1（第二版）：被动最高等级提高（猫薄荷/弹力毛线/牛奶盒10 · 小闹钟/小铃铛8 · 手套5 · 锦鲤20+暴击）
  if (c.passives.catnip.maxLv !== 10 || c.passives.catnip.might.length !== 10) throw new Error('猫薄荷未升到 10 级');
  if (c.passives.alarm.maxLv !== 8 || c.passives.alarm.cdMult.length !== 8) throw new Error('小闹钟未升到 8 级');
  if (c.passives.yarnball.maxLv !== 10) throw new Error('弹力毛线未升到 10 级');
  if (c.passives.bell.maxLv !== 8) throw new Error('小铃铛未升到 8 级');
  if (c.passives.gloves.maxLv !== 5 || c.passives.gloves.amount.length !== 5) throw new Error('猫爪手套未升到 5 级');
  if (c.passives.milk.maxLv !== 10) throw new Error('牛奶盒未升到 10 级');
  if (c.passives.magnetfish.maxLv !== 5 || c.passives.magnetfish.pickMult[4] !== 2.0) throw new Error('磁铁鱼应为 +20%/级');
  if (c.passives.koi.maxLv !== 20 || c.passives.koi.luck.length !== 20 || c.passives.koi.crit.length !== 20) throw new Error('幸运锦鲤应为 20 级 + 暴击词条');
  if (Math.abs(c.passives.koi.crit[19] - 0.05) > 1e-9) throw new Error('锦鲤 20 级应累计 +5% 暴击');
  // 意见1（第二版）：猫爪印 70 级解锁且只通过宝箱发放；70/80 级成长规则
  if (c.stamps.minLevel !== 70) throw new Error('猫爪印解锁等级应为 70');
  if (!c.postLevel || c.postLevel.autoFrom !== 70 || c.postLevel.chestOnlyFrom !== 80) throw new Error('postLevel 配置缺失');
  if (!DATA.CFG.postLevel || DATA.CFG.postLevel.hpPerLv !== 0.02) throw new Error('postLevel 未装配进 DATA');
  // 意见2（第二版）：轮间指数成长 3/2/1.1
  if (c.growth.roundHpMul !== 3 || c.growth.roundDmgMul !== 2 || Math.abs(c.growth.roundSpdMul - 1.1) > 1e-9) throw new Error('轮间指数成长配置缺失');
  // 意见3（第二版）：老鼠妈妈 500 万血 / 移速 100
  if (c.enemies.mother.hp !== 5000000 || c.enemies.mother.spd !== 100) throw new Error('老鼠妈妈应为 500 万血 / 移速 100');
  // 意见6/7（第三版）：敌人行为特性 + 精英宝箱概率配置
  if (!c.enemyTraits || !c.enemyTraits.dash || !c.enemyTraits.ranged || !c.enemyTraits.steal || !c.enemyTraits.slime)
    throw new Error('enemyTraits 特性参数缺失');
  if (!c.enemies.calico.dash || !c.enemies.pigeon.ranged || !c.enemies.raccoon.steal || !c.enemies.snail.slime)
    throw new Error('敌人行为特性标记缺失');
  if (DATA.ENEMIES.calico.dash !== 1 || DATA.ENEMIES.snail.slime !== 1) throw new Error('特性标记未装配进 DATA.ENEMIES');
  if (typeof DATA.CFG.enemyTraits.slime.slow !== 'number') throw new Error('黏液减速参数未装配');
  if (c.elite.chestBase !== 0.5 || c.elite.chestLuck !== 0.06) throw new Error('精英宝箱概率配置缺失');
  // 老版导出配置（无特性标记）走真实 data.js 装配应被逐项兜底，不丢行为
  {
    const ctx3 = { window: { GAME_CONFIG: { enemies: { snail: { hp: 55 } } } } };
    vm.createContext(ctx3);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8'), ctx3, { filename: 'data-oldcfg.js' });
    const D3 = vm.runInContext('({ DATA })', ctx3).DATA;
    if (D3.ENEMIES.snail.slime !== 1 || D3.ENEMIES.snail.hp !== 55) throw new Error('老配置特性兜底失效');
    if (!D3.CFG.enemyTraits || !D3.CFG.enemyTraits.dash) throw new Error('老配置缺 enemyTraits 时未用默认兜底');
    if (D3.CFG.elite.chestBase !== 0.5) throw new Error('老配置缺 elite.chestBase 时未用默认兜底');
  }
  // 意见1：v3 分段抛物线升级曲线（30 级前与旧曲线一致，30/40/50 台阶变慢，50 级起每 10 级更慢）
  const XP3 = [[10, 97], [20, 208], [30, 395], [40, 741], [50, 1501], [60, 2367], [70, 3677],
    [80, 5655], [90, 8640], [100, 13132], [110, 19872], [120, 29961], [150, 100815]];
  for (const [lv, v] of XP3) {
    if (Math.abs(DATA.xpNeed(lv) - v) > 0.5) throw new Error('xpNeed(' + lv + ')=' + DATA.xpNeed(lv) + '，预期 ' + v);
  }
  console.log('✓ 升级曲线 v3：30级=' + DATA.xpNeed(30) + ' 50级=' + DATA.xpNeed(50) +
    ' 100级=' + DATA.xpNeed(100) + '（分段抛物线对照全通过）');
  // 轮次难度：第 1 轮=固定表首行（基准教学轮）
  const r1 = DATA.roundMods(1, null);
  if (r1.hp !== c.rounds.fixed[0].hp) throw new Error('固定难度表未生效');
  // 意见2：第 2 轮起进入动态难度（读第 1 轮实测），且 mixMin/词条按轮爬坡不瞬间跳怪
  const prev1 = { mods: r1, stats: { actualTime: 600, bossTTK: 12, avgHpFrac: 0.9, lvGain: 9 } };
  const r2dyn = DATA.roundMods(2, prev1);
  if (!(r2dyn.hp > 1 && r2dyn.hp <= 1.71)) throw new Error('第 2 轮动态难度未生效: hp=' + r2dyn.hp);
  if (r2dyn.mixMin !== 2.5) throw new Error('第 2 轮怪种未按轮爬坡: mixMin=' + r2dyn.mixMin);
  if (r2dyn.bbAffix !== 0 || r2dyn.bossAffix !== 0) throw new Error('第 2 轮词条数未按轮爬坡');
  const r2slow = DATA.roundMods(2, { mods: r1, stats: { actualTime: 1500, bossTTK: 60, avgHpFrac: 0.3, lvGain: 2 } });
  if (!(r2slow.hp < r2dyn.hp && r2slow.dmg < r2dyn.dmg)) throw new Error('第 2 轮动态难度未随表现回落');
  console.log('✓ 动态难度从第 2 轮开始：打得快 hp×' + r2dyn.hp.toFixed(2) + ' / 打得慢 hp×' + r2slow.hp.toFixed(2));
  // 传入上一轮数据应得到动态推算
  const prev = { mods: r1, stats: { actualTime: 600, bossTTK: 12, avgHpFrac: 0.9, lvGain: 9 } };
  const r7 = DATA.roundMods(7, prev);
  if (!(r7.hp > r1.hp && r7.bossHp > r1.bossHp)) throw new Error('动态难度未推算');
  const r7slow = DATA.roundMods(7, { mods: r1, stats: { actualTime: 1500, bossTTK: 60, avgHpFrac: 0.3, lvGain: 4 } });
  if (r7slow.hp >= r7.hp || r7slow.dmg >= r7.dmg) throw new Error('动态难度未随表现回落');
  // 连锁推演 2→16 轮：难度应平稳复利，任何单轮增幅不超钳制上限
  let chainPrev = { mods: r1, stats: { actualTime: 850, bossTTK: 16, avgHpFrac: 0.6, lvGain: 8 } };
  let lastHp = r1.hp;
  for (let rr = 2; rr <= 16; rr++) {
    const m = DATA.roundMods(rr, chainPrev);
    if (!(m.hp > lastHp)) throw new Error('难度未递增 @轮' + rr);
    if (m.hp / lastHp > 1.71) throw new Error('单轮增幅超上限 @轮' + rr + ': ×' + (m.hp / lastHp).toFixed(2));
    lastHp = m.hp;
    chainPrev = { mods: m, stats: { actualTime: 850, bossTTK: 16, avgHpFrac: 0.6, lvGain: 8 } };
  }
  console.log('✓ 动态难度：16 轮连锁推演平稳，末轮威胁 ×' + lastHp.toFixed(1));
  // 预设快照应可序列化并重新求值
  const snap = CfgPanel.snapshot(DATA.CFG, 'easy');
  if (!/enemyHp: 0.7/.test(snap)) throw new Error('预设序列化缺少难度值');
  if (!/stamps: \{/.test(snap) || !/chestDrop: 0.001/.test(snap)) throw new Error('导出配置缺少 stamps/杂兵宝箱字段');
  const ctx2 = vm.createContext({ window: {}, U: { fmtTime: () => '0:00' } });
  vm.runInContext(snap.replace('window.GAME_CONFIG', 'window.GAME_CONFIG'), ctx2, { filename: 'snapshot' });
  if (ctx2.window.GAME_CONFIG.difficulty.enemyHp !== 0.7) throw new Error('导出的配置无法还原');
  if (!ctx2.window.GAME_CONFIG.stamps || ctx2.window.GAME_CONFIG.stamps.share !== 0.5) throw new Error('导出的配置丢失 stamps 块');
  if (!ctx2.window.GAME_CONFIG.lottery || !Array.isArray(ctx2.window.GAME_CONFIG.lottery.tiers) || ctx2.window.GAME_CONFIG.lottery.tiers.length !== 6) throw new Error('导出的配置丢失 lottery 档位表');
  if (ctx2.window.GAME_CONFIG.growth.countRoundMul !== 2) throw new Error('导出的配置丢失杂兵数量乘数');
  console.log('✓ 配置系统：加载/装配/预设序列化 全部一致（含 stamps/杂兵宝箱/lottery/数量乘数字段）');
  return true;
})();


function key(code, down = true) {
  const hs = windowHandlers['keydown'];
  if (down) for (const f of hs || []) f({ code, repeat: false, preventDefault() {} });
  else for (const f of windowHandlers['keyup'] || []) f({ code });
}
// 升级 3 选 1 会挡住 DEV 作弊键，先清空弹窗回到 play
function dismissLevelup() {
  for (let i = 0; i < 10 && state() === 'levelup'; i++) { key('Digit' + (1 + (i % 3))); pump(0.3); }
}
function click(id) {
  const el = elRegistry.get(id);
  if (!el) throw new Error('no element ' + id);
  el.click();
}

/* ---------- 驱动帧循环 ---------- */
let now = performance.now();
const G = () => sandbox.window.__MS.G;
const state = () => G() ? G().state : 'loading';
function pump(sec, opts = {}) {
  const stepMs = 33;
  let t = 0;
  const t0 = Date.now();
  while (t < sec * 1000) {
    now += stepMs; t += stepMs;
    const cb = rafCb; rafCb = null;
    if (!cb) throw new Error('rAF chain broken');
    const before = state();
    try { cb(now); } catch (e) { console.error('EXCEPTION during frame at state', before, '\n', e.stack); process.exit(1); }
    if (opts.keepAlive) opts.keepAlive(t / 1000);
    if (Date.now() - t0 > 60000) throw new Error('pump timeout at state ' + state());
    if (opts.until && opts.until() && t > 300) return t / 1000;
  }
  return sec;
}
function waitForState(target, maxSec, label) {
  pump(maxSec, { until: () => state() === target });
  if (state() !== target) throw new Error(`Expected state ${target} (${label}), got ${state()}`);
  console.log(`✓ state=${target} (${label})`);
}

/* ---------- 场景 0.5：音效防过载冒烟（同帧 100 连发 hit 只应通过极少数） ---------- */
const SfxT = vm.runInContext('Sfx', sandbox);
for (let i = 0; i < 100; i++) SfxT.sfx.hit(); // 同帧连发：70ms 按名节流只应放行 1 次
pump(1.2); // 菜单态空转 1 秒，让节流统计窗口翻页
if (SfxT.sfxRate() > 8) throw new Error('音效节流未生效: ' + SfxT.sfxRate() + '/s');
console.log('✓ 音效节流：同帧 100 连发 hit 被限流，播发率 ' + SfxT.sfxRate() + '/s');

/* ---------- 场景 1：菜单 → 开局 ---------- */
console.log('== 初始状态:', state());
if (state() !== 'menu') throw new Error('not on menu');
key('Enter');
waitForState('play', 3, 'Enter 开局');

/* ---------- 场景 2：战斗 20 秒，敌人接近后被武器击杀 ---------- */
// 视野 4 倍后（意见6）：野怪从屏幕外走到身边的路程翻倍，20 秒内自然接敌不可靠——补一组近点测试怪
const MS2 = sandbox.window.__MS;
for (let i = 0; i < 24; i++) {
  const a = Math.random() * Math.PI * 2, d = 240 + Math.random() * 300;
  MS2.spawnEnemy(Math.random() < 0.8 ? 'rat' : 'sparrow',
    MS2.G.player.x + Math.cos(a) * d, MS2.G.player.y + Math.sin(a) * d, false);
}
pump(20);
const G1 = G();
console.log(`✓ 20s: enemies=${G1.enemies.length} kills=${G1.kills} gems=${G1.gems.length} xp=${G1.player.xp || 0}`);
if (G1.kills < 1) throw new Error('20 秒内没有击杀');
const progressed = G1.gems.length > 0 || (G1.player.xp || 0) > 0 || (G1.player.lv || 1) > 1 ||
  state() === 'levelup' || G1.pendingLv > 0;
if (!progressed) throw new Error('没有掉落经验/成长迹象');

/* ---------- 场景 3：升级 3 选 1 ---------- */
for (let i = 0; i < 4; i++) {
  key('KeyL'); // 时刻在 play 态才会生效
  pump(0.3);
  if (state() === 'levelup') break;
}
waitForState('levelup', 3, '作弊升级弹出 3 选 1');
const cardBox = elRegistry.get('lvl-cards');
if (!cardBox.children.length) throw new Error('升级卡片未渲染');
key('Digit1');
waitForState('play', 3, '选卡后恢复游戏');

/* ---------- 场景 4：多次升级 + 被动生效 ---------- */
for (let i = 0; i < 12; i++) {
  key('KeyL');
  pump(0.25);
  if (state() === 'levelup') { key('Digit' + (1 + (i % 3))); }
  pump(0.25);
}
console.log('✓ 累计升级后 lv =', G().player.lv, 'weapons =', G().player.weapons.map(w => w.id + ':' + w.lv).join(','));
if (G().player.lv < 8) throw new Error('多次升级后等级异常');

/* ---------- 场景 5：宝箱（无进化） ---------- */
dismissLevelup(); // 路上捡到鱼干可能自然升级；弹窗开着时作弊键不生效
key('KeyC'); // 身旁生成宝箱
key('KeyD'); // 向右走吃宝箱
pump(5, { until: () => state() === 'chest', keepAlive: () => { key('KeyI'); if (state() === 'levelup') key('Digit1'); } });
key('KeyD', false);
if (state() !== 'chest') throw new Error('宝箱未触发 state=' + state());
const rewardBox = elRegistry.get('chest-rewards');
if (!rewardBox.children.length) throw new Error('宝箱奖励行未渲染');
console.log('✓ 宝箱奖励:', rewardBox.children.map(c => (c.children[1] && '') + '').length, '行');
click('btn-chest-ok');
waitForState('play', 3, '关闭宝箱');

/* ---------- 场景 6：满级 + 进化宝箱 ---------- */
key('KeyU'); // 全武器满级 + 补齐进化被动
pump(0.2);
key('KeyL'); pump(0.2); // 清掉可能的经验
dismissLevelup(); // 连环升级弹窗要全部点掉，否则 KeyC 不生效
key('KeyC');
key('KeyD');
pump(5, { until: () => state() === 'chest', keepAlive: () => { key('KeyI'); if (state() === 'levelup') key('Digit1'); } });
key('KeyD', false);
if (state() !== 'chest') throw new Error('进化宝箱未触发 state=' + state());
const evoRows = elRegistry.get('chest-rewards').children.filter(c => (c._html || '').includes('→'));
if (!evoRows.length) throw new Error('进化奖励未出现');
console.log('✓ 进化宝箱内容含 “→” 标记');
click('btn-chest-ok');
waitForState('play', 3, '关闭进化宝箱');
const evoCount = G().player.weapons.filter(w => w.evolved).length;
console.log('✓ 已进化武器数:', evoCount);
if (evoCount < 1) throw new Error('没有武器被进化');

/* ---------- 场景 7：战斗 60 秒（进化后火力全开，波次/精英推进） ---------- */
// 自动驾驶：持续回血 + 自动关宝箱/选卡（杂兵宝箱会在怪群聚集处掉落，会被顺路捡到）
const keepAlive = () => {
  key('KeyI');
  const s = state();
  if (s === 'chest') click('btn-chest-ok');
  else if (s === 'levelup') key('Digit1');
};
pump(60, { keepAlive });
console.log(`✓ 60s 后: time=${G().time.toFixed(0)}s kills=${G().kills} enemies=${G().enemies.length} lv=${G().player.lv} gold=${G().gold}`);

/* ---------- 场景 7.5：批次头目降临 → 讨伐后下一批立即来袭 ---------- */
dismissLevelup();
key('KeyT'); // 快进 60s，越过第 1 批头目的降临点（batchFrac×batchLen = 162s）
key('KeyT');
// 满级火力下头目几秒内就会被击杀，必须逐帧轮询它出现的瞬间
let bb = null;
pump(4, { keepAlive, until: () => !!(bb = G().enemies.find(e => e.batchBoss)) });
if (!bb) throw new Error('批次头目未降临');
console.log('✓ 批次头目降临:', bb.def.name, '血量', Math.round(bb.hp), '词条:', (bb.affixes || []).join(',') || '无');
if (Math.abs(bb.maxHp - 11000 * 0.07) > 1) throw new Error('头目生命未按 bossHpFracs 计算: ' + bb.maxHp);
key('KeyK'); // 讨伐全部非Boss敌人（含头目）
pump(0.5, { keepAlive });
if (G().batch !== 1) throw new Error('讨伐头目后批次未推进: batch=' + G().batch);
console.log('✓ 头目被讨伐，批次推进到 2（下一头目要等 bossFrac 进度才降临）');
// 意见4：内容时间轴快进——头目被讨伐后 waveT 跳到下一批起点，打得快整轮更短
if (G().waveT < 224.9) throw new Error('讨伐头目后内容时间轴未快进: waveT=' + G().waveT.toFixed(1));
console.log('✓ 内容时间轴快进: waveT=' + Math.round(G().waveT) + '（≥ 下一批起点 225，越快打越早迎来下一批）');
if (!G().chests.length) throw new Error('批次头目被讨伐后未掉落宝箱');
console.log('✓ 头目宝箱已掉落:', G().chests.length, '个');
if (G().enemies.find(e => e.batchBoss && !e.dieDone)) throw new Error('下一批头目不应立刻存在（要等 bossFrac 进度）');
dismissLevelup();

/* ---------- 场景 8：轮Boss战 → 讨伐后进入下一轮 ---------- */
dismissLevelup();
// 稳定装置：固定一套满级火力（升级抽卡随机，避免 Boss 击杀用时波动导致超时）
sandbox.window.__MS.G.player.weapons = [
  { id: 'claw', lv: 8, evolved: true, t: 0, state: 0 },
  { id: 'aura', lv: 8, t: 0, state: 0 },
  { id: 'fish', lv: 8, t: 0, state: 0 },
  { id: 'note', lv: 8, t: 0, state: 0 },
  { id: 'axe', lv: 8, t: 0, state: 0 }
];
sandbox.window.__MS.calcMods();
key('KeyB');
pump(2);
if (!G().boss) throw new Error('Boss 未生成');
if (G().boss.state === 'entry') throw new Error('Boss 登场未结束（entry 卡住）');
if (!G().boss.landT && G().boss.state !== 'chase') throw new Error('Boss 状态异常: ' + G().boss.state);
console.log('✓ Boss 生成，状态', G().boss.state, '血量', Math.round(G().boss.hp));
pump(400, { keepAlive, until: () => G().round >= 2 || state() === 'over' });
if (state() === 'over') throw new Error('轮Boss战中玩家先死了');
if (G().round < 2) throw new Error('讨伐鼠王后未进入第 2 轮');
if (G().roundTime > 20) throw new Error('第 2 轮轮内时间未重置: ' + G().roundTime.toFixed(1));
if (G().countMul !== 2) throw new Error('第 2 轮杂兵数量乘数未生效: ' + G().countMul);
const r2mods = G().roundMods;
if (!r2mods || !(r2mods.hp > 1.0 && r2mods.hp <= 1.71)) throw new Error('第 2 轮动态难度未生效: ' + (r2mods && r2mods.hp));
if (r2mods.mixMin !== 2.5) throw new Error('第 2 轮怪种未按轮爬坡: ' + r2mods.mixMin);
console.log(`✓ 进入第 2 轮（动态难度提前生效 + 杂兵数量×2）：威胁 ×${r2mods.hp} mixMin=${r2mods.mixMin} countMul=${G().countMul} 存活=${G().time.toFixed(0)}s`);
// 意见2（第二版）：轮间指数成长——第 2 轮杂兵 血×3 / 伤×2 / 速×1.1（叠在轮内曲线与动态难度之上）
const MS8 = sandbox.window.__MS;
const rpRat = MS8.spawnEnemy('rat', G().player.x + 320, G().player.y, false);
const Gw2 = MS8.DATA.CFG.growth;
const expHp2 = 8 * MS8.DATA.hpMult(G().roundTime) * G().roundMods.hp * Gw2.roundHpMul;
if (Math.abs(rpRat.maxHp - expHp2) > 0.5) throw new Error('轮间血量指数成长未生效: ' + rpRat.maxHp + ' vs ' + expHp2);
const expDmg2 = 8 * MS8.DATA.dmgMult(G().roundTime) * G().roundMods.dmg * Gw2.roundDmgMul;
if (Math.abs(rpRat.dmg - expDmg2) > 0.2) throw new Error('轮间攻击指数成长未生效: ' + rpRat.dmg + ' vs ' + expDmg2);
const expSpd2 = 62 * MS8.DATA.spdMult(G().roundTime) * Gw2.roundSpdMul;
if (Math.abs(rpRat.spd / expSpd2 - 1) > 0.09) throw new Error('轮间移速指数成长未生效: ' + rpRat.spd.toFixed(1) + ' vs ' + expSpd2.toFixed(1));
rpRat.dieDone = true; // 样本用完即弃，不参与后续战斗
console.log('✓ 轮间指数成长：第 2 轮杂兵 血×' + Gw2.roundHpMul + ' 伤×' + Gw2.roundDmgMul + ' 速×' + Gw2.roundSpdMul + '（叠在既有机制上）');

/* ---------- 场景 8.5：第 2 轮再讨伐一次 → 第 3 轮（轮次可无限推进） ---------- */
dismissLevelup();
key('KeyB');
pump(2);
if (!G().boss) throw new Error('第 2 轮 Boss 未生成');
pump(400, { keepAlive, until: () => G().round >= 3 || state() === 'over' });
if (state() === 'over') throw new Error('第 2 轮轮Boss战中玩家先死了');
const b3 = G().enemies.find(e => e.boss && !e.dieDone);
if (G().round < 3) throw new Error('未进入第 3 轮: state=' + state() + ' bossHp=' + (b3 ? Math.round(b3.hp) : 'gone') +
  ' bossState=' + (b3 ? b3.state : '-') + ' dist=' + (b3 ? Math.round(Math.hypot(b3.x - G().player.x, b3.y - G().player.y)) : '-') +
  ' stun=' + G().player.stunT.toFixed(2) + ' w0t=' + (G().player.weapons[0] ? G().player.weapons[0].t.toFixed(2) : '-'));
console.log('✓ 第 3 轮已开始（威胁 ×' + G().roundMods.hp.toFixed(2) + '）');

/* ---------- 场景 8.7：猫爪印——乘法叠层 / 会心汲血穿透 / 无上限 ---------- */
const MS = sandbox.window.__MS;
if (!MS.getMods) throw new Error('__MS 调试钩子不完整');
if (MS.DATA.SLOTS.weapon !== 4) throw new Error('slots.weapon 应为 4（不含默认猫爪）');
if (MS.DATA.STAMP_ORDER.length !== 7 || !MS.DATA.STAMP_META.pierce) throw new Error('猫爪印种类/元信息异常');
if (MS.DATA.DROPS.chestDrop !== 0.001) throw new Error('杂兵宝箱概率未从配置读取');
const mods0 = MS.getMods();
const might0 = mods0.might;
G().player.affixes.push({ id: 'dmg', stacks: 2 });
MS.calcMods();
if (Math.abs(MS.getMods().might - might0 * Math.pow(1.12, 2)) > 1e-9) throw new Error('锐爪印乘法叠层错误');
if (MS.getMods().pierceBonus !== 0) throw new Error('pierceBonus 初始应为 0');
G().player.affixes.push({ id: 'pierce', stacks: 3 }, { id: 'crit', stacks: 10 }, { id: 'lifesteal', stacks: 5 });
MS.calcMods();
const m1 = MS.getMods();
if (m1.pierceBonus !== 3) throw new Error('贯穿印未按层累加');
// 锦鲤自带 +0.25%/级 暴击：与拾取印前的基线比较
if (Math.abs(m1.crit - (mods0.crit + 0.4)) > 1e-9) throw new Error('会心印未按层累加: ' + m1.crit);
if (Math.abs(m1.lifesteal - (mods0.lifesteal + 0.02)) > 1e-9) throw new Error('汲血印未按层累加: ' + m1.lifesteal);
// 无上限：大量叠层后数值按公式持续增长，不被任何饱和线钳制
const mBefore = MS.getMods();
G().player.affixes.push({ id: 'cd', stacks: 30 }, { id: 'amount', stacks: 20 }, { id: 'area', stacks: 25 }, { id: 'crit', stacks: 20 });
MS.calcMods();
const m2 = MS.getMods();
const alarmMul = mBefore.cdMult; // 叠印前的冷却倍率（含已拥有的小闹钟）
if (Math.abs(m2.cdMult - alarmMul * Math.pow(0.94, 30)) > 1e-9) throw new Error('疾风印应无上限按公式累乘: ' + m2.cdMult);
if (m2.amountBonus !== mBefore.amountBonus + 20) throw new Error('影分印应无上限累加: ' + m2.amountBonus);
const areaNoYarn = m2.areaMult / (mBefore.areaMult || 1);
if (Math.abs(areaNoYarn - Math.pow(1.10, 25)) > 1e-6) throw new Error('广域印应无上限按公式累乘: ' + m2.areaMult);
if (Math.abs(m2.crit - (mBefore.crit + 0.8)) > 1e-9) throw new Error('会心印应无上限累加（>100% 即必暴击）: ' + m2.crit);
// 引擎底线仍在：单武器冷却不低于 minCd（在 updateWeapons 生效，这里验证配置存在）
if (MS.DATA.CFG.stamps.minCd !== 0.10) throw new Error('引擎底线 minCd 缺失');
console.log('✓ 猫爪印：乘法叠层/会心汲血穿透/全部无上限 正确（伤害 ×' + m2.might.toFixed(2) +
  ' 冷却 ×' + m2.cdMult.toFixed(3) + ' 范围 ×' + m2.areaMult.toFixed(2) + ' 暴击 ' + Math.round(m2.crit * 100) + '%）');

/* ---------- 场景 8.8：武器上限（猫爪外最多 4 种） ---------- */
if (state() === 'chest') { click('btn-chest-ok'); pump(0.3); }
dismissLevelup();
G().player.weapons = [
  { id: 'claw', lv: 1, t: 0, state: 0 }, { id: 'note', lv: 1, t: 0, state: 0 },
  { id: 'fish', lv: 1, t: 0, state: 0 }, { id: 'axe', lv: 1, t: 0, state: 0 },
  { id: 'orbit', lv: 1, t: 0, state: 0 }
];
MS.DATA.CFG.stamps.minLevel = 999; // 暂时关闭印卡，隔离测试武器上限
key('KeyL'); pump(0.3);
if (state() !== 'levelup') throw new Error('升级面板未弹出(武器上限测试)');
const cards1 = elRegistry.get('lvl-cards').children.map(c => c._html || '').join('|');
if (cards1.includes('新武器')) throw new Error('已有猫爪+4 把武器，不应再出现新武器卡');
if (!cards1.includes('Lv')) throw new Error('已选武器的升级卡应照常出现');
dismissLevelup();
G().player.weapons = [{ id: 'claw', lv: 1, t: 0, state: 0 }];
// 池子里必须还有新武器（卡面 3 选 1 是抽样，直接验证池子才是确定性的）
const poolHasNewW = MS.buildPool().some(c => c.kind === 'w' && !c.cur && c.id !== 'claw');
if (!poolHasNewW) throw new Error('仅猫爪时，新武器应进入卡池');
for (let i = 0; i < 12 && state() !== 'levelup'; i++) { key('KeyL'); pump(0.3); }
if (state() !== 'levelup') throw new Error('升级面板未弹出(对照测试)');
let sawNewW = (elRegistry.get('lvl-cards').children.map(c => c._html || '').join('|')).includes('新武器');
for (let i = 0; i < 12 && !sawNewW; i++) { // 抽样重试，排除 3 张卡恰好全没抽到新武器的随机性
  key('Digit1'); pump(0.25); key('KeyL'); pump(0.3);
  if (state() === 'levelup') sawNewW = (elRegistry.get('lvl-cards').children.map(c => c._html || '').join('|')).includes('新武器');
}
if (!sawNewW) throw new Error('仅猫爪时多次抽卡仍未出现新武器卡');
dismissLevelup();
MS.DATA.CFG.stamps.minLevel = 70;
console.log('✓ 武器上限：猫爪外最多 4 种，选满后新武器卡消失');

/* ---------- 场景 8.9：猫爪印发放渠道——三选一永不出印卡；70 级起只在宝箱出现 ---------- */
MS.DATA.CFG.stamps.share = 1000; // 即便印卡类别概率拉满，三选一也不应再出印卡（发放渠道已移入宝箱）
G().player.lv = 40;
key('KeyL'); pump(0.3);
if (state() !== 'levelup') throw new Error('升级面板未弹出(印卡渠道测试 lv40)');
const cardsNoStamp = elRegistry.get('lvl-cards').children.map(c => c._html || '').join('|');
if (cardsNoStamp.includes('猫爪印') || /印 ×\d/.test(cardsNoStamp)) throw new Error('三选一不应再出现猫爪印卡（只通过宝箱发放）');
key('Digit1'); pump(0.3);
dismissLevelup();
// 宝箱门槛：无可升级项 + chestAffix 拉满 → lv69 金币兜底、lv71 必出印
G().player.weapons = [{ id: 'claw', lv: 8, evolved: true, t: 0, state: 0 }];
G().player.passives = []; G().player.affixes = []; MS.calcMods();
G().player.hp = G().player.maxHp; G().player.iframes = 99999;
G().gems.length = 0; G().pickups.length = 0;
MS.DATA.CFG.chest.p5 = 0; MS.DATA.CFG.chest.p3 = 0; // 固定 1 个奖励位
MS.DATA.CFG.stamps.chestAffix = 1;
G().player.lv = 69; MS.calcMods();
key('KeyC'); key('KeyD');
pump(5, { until: () => state() === 'chest', keepAlive: () => { if (state() === 'levelup') key('Digit1'); } });
if (state() !== 'chest') throw new Error('宝箱未打开(印卡门槛 lv69)');
const rows69 = elRegistry.get('chest-rewards').children.map(c => c._html || '').join('|');
if (/印 ×\d/.test(rows69)) throw new Error('70 级前宝箱不应出现猫爪印: ' + rows69);
if (!rows69.includes('金币 ×1')) throw new Error('70 级前宝箱无可升级项时应给金币: ' + rows69);
click('btn-chest-ok'); pump(0.3);
G().player.lv = 71; MS.calcMods();
key('KeyC'); key('KeyD');
pump(5, { until: () => state() === 'chest', keepAlive: () => { if (state() === 'levelup') key('Digit1'); } });
if (state() !== 'chest') throw new Error('宝箱未打开(印卡门槛 lv71)');
const rows71 = elRegistry.get('chest-rewards').children.map(c => c._html || '').join('|');
if (!/印 ×\d/.test(rows71)) throw new Error('lv71 宝箱应出现猫爪印: ' + rows71);
click('btn-chest-ok'); pump(0.3);
MS.DATA.CFG.stamps.chestAffix = 0.6;
MS.DATA.CFG.chest.p5 = 0.02; MS.DATA.CFG.chest.p3 = 0.12;
MS.DATA.CFG.stamps.share = 0.5;
dismissLevelup();
console.log('✓ 猫爪印渠道：三选一永不出印卡；70 级起只通过宝箱发放（lv69 金币兜底 / lv71 出印）');

/* ---------- 场景 8.10：专有被动门槛（无对应武器不出现；武器选满后绝迹） ---------- */
MS.DATA.CFG.stamps.minLevel = 999; // 关闭印卡，隔离变量
G().player.passives = []; G().player.affixes = []; MS.calcMods();
const PAIRED_OFF = ['alarm', 'bell', 'yarnball', 'gloves', 'milk']; // note/fish/axe+litter/orbit+zap/aura 的进化被动
G().player.weapons = [{ id: 'claw', lv: 1, t: 0, state: 0 }];
let ppool = MS.buildPool().filter(c => c.kind === 'p').map(c => c.id);
for (const id of PAIRED_OFF) if (ppool.includes(id)) throw new Error('无对应武器时不应出现专有被动: ' + id);
for (const id of ['catnip', 'magnetfish', 'koi']) if (!ppool.includes(id)) throw new Error('应出现的被动缺失: ' + id);
G().player.weapons = [{ id: 'claw', lv: 1, t: 0, state: 0 }, { id: 'aura', lv: 1, t: 0, state: 0 }];
ppool = MS.buildPool().filter(c => c.kind === 'p').map(c => c.id);
if (!ppool.includes('milk')) throw new Error('拥有猫薄荷光环后，牛奶盒应进入卡池');
G().player.weapons = [
  { id: 'claw', lv: 1, t: 0, state: 0 }, { id: 'note', lv: 1, t: 0, state: 0 },
  { id: 'fish', lv: 1, t: 0, state: 0 }, { id: 'axe', lv: 1, t: 0, state: 0 },
  { id: 'litter', lv: 1, t: 0, state: 0 }
];
ppool = MS.buildPool().filter(c => c.kind === 'p').map(c => c.id);
if (ppool.includes('milk') || ppool.includes('gloves')) throw new Error('武器选满后，未拥有武器的专有被动不应出现');
if (!ppool.includes('alarm') || !ppool.includes('bell') || !ppool.includes('yarnball')) throw new Error('已拥有武器的专有被动应照常出现');
// 卡面抽查一次：仅猫爪时，弹出的三选一里不应出现专有被动名
G().player.weapons = [{ id: 'claw', lv: 1, t: 0, state: 0 }];
key('KeyL'); pump(0.3);
if (state() === 'levelup') {
  const html10 = elRegistry.get('lvl-cards').children.map(c => c._html || '').join('|');
  for (const nm of ['小闹钟', '小铃铛', '弹力毛线', '猫爪手套', '牛奶盒']) {
    if (html10.includes(nm)) throw new Error('卡面出现未解锁的专有被动: ' + nm);
  }
}
dismissLevelup();
MS.DATA.CFG.stamps.minLevel = 70;
console.log('✓ 专有被动门槛：无对应武器不出现；武器选满后未拥有武器的专有被动绝迹');

/* ---------- 场景 8.11：金币经验规则（%档位表）+ 宝箱重复奖励/金币位 ---------- */
dismissLevelup();
G().player.passives = []; G().player.affixes = []; G().player.lv = 20; MS.calcMods();
const LOT = MS.DATA.CFG.lottery;
if (!LOT || !Array.isArray(LOT.tiers) || LOT.tiers.length !== 6) throw new Error('lottery 档位表未装配');
const TIERS0 = LOT.tiers;
// 隔离装置：清空武器（无击杀→无噪音掉落）、无敌帧（防围殴）、清场
// （清怪防挤开：高轮次压力波会把玩家撞出 26px 拾取圈，金币装置曾偶发拾取失败）
const isoSetup = () => {
  G().player.weapons = []; MS.calcMods();
  G().player.hp = G().player.maxHp; G().player.iframes = 99999;
  G().gems.length = 0; G().pickups.length = 0;
  G().enemies.length = 0; G().projs.length = 0;
  // 松开此前场景遗留的方向键（如吃宝箱时的 KeyD）：玩家原地不动，金币才稳定落在拾取圈内
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) key(k, false);
};
// 80% 封顶档：概率拉满 → 单枚金币 = 当前等级所需 × 80%（实际到账再乘经验乘数 xpMul）
isoSetup();
LOT.tiers = [{ pct: 0.8, p: 1 }];
const need20 = MS.DATA.xpNeed(G().player.lv);
const xpMul = MS.DATA.DIFF.xpGain * ((G().roundMods && G().roundMods.xpMul) || 1);
const xpJ0 = G().player.xp || 0;
G().gold = 0;
G().pickups.push({ x: G().player.x, y: G().player.y, kind: 'coin', t: 0 });
pump(0.3);
if (G().gold <= 0) throw new Error('金币未被拾取（测试装置失效）');
if (Math.abs((G().player.xp || 0) - xpJ0 - Math.round(need20 * 0.8) * xpMul) > 0.01) {
  throw new Error('80% 档未按公式到账: +' + ((G().player.xp || 0) - xpJ0) + ' 预期 ' + (Math.round(need20 * 0.8) * xpMul).toFixed(2));
}
// 1% 最小档
LOT.tiers = [{ pct: 0.01, p: 1 }];
G().gems.length = 0; G().pickups.length = 0;
const xpB2 = G().player.xp || 0;
G().pickups.push({ x: G().player.x, y: G().player.y, kind: 'coin', t: 0 });
pump(0.3);
if (Math.abs((G().player.xp || 0) - xpB2 - Math.max(1, Math.round(need20 * 0.01)) * xpMul) > 0.01) {
  throw new Error('1% 档未按公式到账: +' + ((G().player.xp || 0) - xpB2));
}
LOT.tiers = TIERS0;
dismissLevelup();
console.log('✓ 金币经验规则：80% 封顶档 +' + Math.round(need20 * 0.8) + '、1% 最小档 +' + Math.max(1, Math.round(need20 * 0.01)) + '（按 xpNeed 百分比到账）');

/* —— 宝箱重复奖励：逐行显示递进等级 Lv1→2 / Lv2→3 / Lv3→4，每次真实+1级 —— */
MS.DATA.CFG.stamps.minLevel = 999; // 关闭印卡，隔离变量
MS.DATA.CFG.chest.p5 = 0; MS.DATA.CFG.chest.p3 = 1; MS.DATA.CFG.chest.chestAffix = 0; // 固定 3 个奖励位
G().player.weapons = [{ id: 'claw', lv: 1, t: 0.4, state: 0 }];
G().player.passives = []; G().player.affixes = []; MS.calcMods();
G().player.hp = G().player.maxHp; G().player.iframes = 99999;
key('KeyC'); key('KeyD');
pump(5, { until: () => state() === 'chest', keepAlive: () => { if (state() === 'levelup') key('Digit1'); } });
if (state() !== 'chest') throw new Error('宝箱未打开(重复奖励测试)');
const dupRows = elRegistry.get('chest-rewards').children.map(c => c._html || c.textContent || '').join('|');
for (const seg of ['Lv 1 → 2', 'Lv 2 → 3', 'Lv 3 → 4']) {
  if (!dupRows.includes(seg)) throw new Error('重复奖励未按递进等级逐行显示: ' + dupRows);
}
if (G().player.weapons[0].lv !== 4) throw new Error('重复奖励未逐级生效: lv=' + G().player.weapons[0].lv);
console.log('✓ 宝箱重复奖励：逐行显示 Lv1→2 / Lv2→3 / Lv3→4，实际连升 3 级');
click('btn-chest-ok');
pump(0.3);

/* —— 宝箱金币位：恰好 1 枚金币 → 抽奖折算后直接显示 —— */
G().player.weapons = [{ id: 'claw', lv: 8, evolved: true, t: 0, state: 0 }]; // 进化态=无可升级项
MS.calcMods();
MS.DATA.CFG.chest.p3 = 1;
LOT.tiers = [{ pct: 0.01, p: 1 }]; // 强制 1% 档，保证数值确定性
const xpG0 = G().player.xp || 0, lvG0 = G().player.lv;
key('KeyC'); key('KeyD');
pump(5, { until: () => state() === 'chest', keepAlive: () => { if (state() === 'levelup') key('Digit1'); } });
if (state() !== 'chest') throw new Error('宝箱未打开(金币位测试)');
const goldRows = elRegistry.get('chest-rewards').children.map(c => c._html || c.textContent || '').join('|');
if (!goldRows.includes('金币 ×1')) throw new Error('金币位未显示: ' + goldRows);
if (!goldRows.includes('1%')) throw new Error('金币位未显示抽奖折算结果: ' + goldRows);
const goldXp = ((G().player.xp || 0) - xpG0) + (G().player.lv - lvG0) * need20;
if (Math.abs(goldXp - 3 * Math.max(1, Math.round(need20 * 0.01)) * xpMul) > 0.1) throw new Error('金币位抽奖经验未到账: +' + goldXp);
console.log('✓ 宝箱金币位：3×金币 ×1 → 各按抽奖规则折算并显示（共 +' + goldXp + ' 经验）');
click('btn-chest-ok');
pump(0.3);
MS.DATA.CFG.stamps.minLevel = 70;
MS.DATA.CFG.chest.p5 = 0.02; MS.DATA.CFG.chest.p3 = 0.12; MS.DATA.CFG.chest.chestAffix = 0.6;
dismissLevelup();

/* ---------- 场景 8.12：老鼠妈妈压轴战（降临 → 全屏斩 → 讨伐用时结算 → 继续夜巡） ---------- */
const keepMother = () => { // 母亲战期间可能捡到自然掉落的宝箱/弹升级窗，冻住 update——全部关掉
  if (state() === 'chest') click('btn-chest-ok');
  else if (state() === 'levelup') key('Digit1');
};
const backToPlay = () => {
  for (let i = 0; i < 20 && state() !== 'play'; i++) {
    if (state() === 'chest') click('btn-chest-ok');
    else if (state() === 'levelup') key('Digit1');
    else if (state() === 'pause') key('KeyP');
    pump(0.2);
  }
};
dismissLevelup();
backToPlay();
key('KeyH'); // 秒召老鼠妈妈（警告演出 → 天降降临）
let mom = null;
pump(5, { keepAlive: keepMother, until: () => !!(mom = G().enemies.find(e => e.mother && e.state !== 'entry')) });
if (!mom) throw new Error('老鼠妈妈未降临: state=' + state() + ' warnT=' + G().motherWarnT.toFixed(2) +
  ' active=' + G().motherActive + ' done=' + G().motherDone + ' t=' + G().time.toFixed(0) + ' iframes=' + G().player.iframes.toFixed(0));
if (mom.maxHp !== 5000000) throw new Error('老鼠妈妈血量应为固定 500 万: ' + mom.maxHp);
if (mom.dmg !== 80) throw new Error('老鼠妈妈碰撞伤害应为固定 80: ' + mom.dmg);
if (mom.spd !== 100) throw new Error('老鼠妈妈移速应为固定 100: ' + mom.spd);
console.log('✓ 老鼠妈妈降临：HP=' + mom.maxHp + '（固定不吃倍率） 碰撞伤害=' + mom.dmg + ' 移速=' + mom.spd);
// 全屏斩：拨快技能计时 → 0.6s 预警 → 命中。屏蔽杂兵碰撞（无敌帧）以隔离变量；技能直扣体力不受无敌帧影响
G().player.hp = G().player.maxHp;
G().player.iframes = 99999;
mom.skillT = 0.61;
const hp0 = G().player.hp;
pump(1.5, { keepAlive: keepMother });
if (!(G().player.hp < hp0)) throw new Error('全屏斩未扣血: before=' + hp0 + ' after=' + G().player.hp);
if (G().player.hp < 1) throw new Error('全屏斩把主角打死了（应保底 1 点）');
if (!(G().player.slowT > 0 && G().player.slowF <= 0.56)) throw new Error('全屏斩未附带减速');
if (!(G().player.stunT > 0)) throw new Error('全屏斩未附带眩晕（1秒定身）');
if (!(G().player.disarmT > G().player.stunT)) throw new Error('全屏斩未附带缴械（眩晕后仍禁火）');
console.log('✓ 全屏斩：体力 ' + Math.round(hp0) + ' → ' + G().player.hp + '（扣当前 50%、保底生效）+ 眩晕/缴械/减速链');
// 讨伐 → 掉落 30 金币 + 专属宝箱（必 5 件、无金币）→ 成功结算 →「继续夜巡」无缝进第 4 轮
const momNow = G().enemies.find(e => e.mother && !e.dieDone);
// 演出期彻底隔离拾取：把主角临时挪出世界（+600px 仍可能被吸走靠近的金币，曾致 28/30 偶发），断言完再还原
const px0 = G().player.x, py0 = G().player.y;
G().player.x = -99999; G().player.y = -99999;
MS.hitEnemy(momNow, 1e9);
pump(0.4, { keepAlive: keepMother });
const coinDrops = G().pickups.filter(p => p.kind === 'coin').length;
G().player.x = px0; G().player.y = py0;
if (coinDrops < 30) throw new Error('老鼠妈妈死后应掉落 30 枚金币: ' + coinDrops);
const momChest = G().chests.find(c => c.mother);
if (!momChest) throw new Error('老鼠妈妈死后应掉落专属宝箱');
console.log('✓ 压轴掉落：金币 ×' + coinDrops + ' + 专属宝箱已落在地上');
pump(9, { keepAlive: keepMother, until: () => state() === 'over' });
if (state() !== 'over') throw new Error('讨伐老鼠妈妈后结算未弹出: ' + state());
const momTitle = elRegistry.get('over-title').textContent;
if (!momTitle.includes('老鼠妈妈')) throw new Error('结算标题异常: ' + momTitle);
const motherLine = elRegistry.get('over-mother').textContent;
if (!motherLine.includes('讨伐用时')) throw new Error('结算缺少讨伐用时高亮: ' + motherLine);
if (elRegistry.get('btn-continue').hidden) throw new Error('「继续夜巡」按钮未显示');

console.log('✓ 压轴结算:', momTitle, '|', motherLine, '| 继续夜巡按钮已显示');
click('btn-continue');
waitForState('play', 3, '继续夜巡');
if (G().round !== 4) throw new Error('继续夜巡后应无缝进入第 4 轮: ' + G().round);
if (G().motherActive) throw new Error('继续夜巡后 motherActive 未清除');
console.log('✓ 继续夜巡：无缝进入第 4 轮（威胁 ×' + G().roundMods.hp.toFixed(2) + '），此后无限模式照旧');
// 专属宝箱内容：必定 5 件奖励且绝不含金币（lv≥70 + 无可升级项 → 金币位由猫爪印兜底）
G().player.lv = 75; MS.calcMods();
G().player.iframes = 99999;
MS.DATA.CFG.stamps.chestAffix = 1; // 印章兜底拉满（无可升级项时），保证断言无随机性
G().player.x = momChest.x; G().player.y = momChest.y;
pump(3, { until: () => state() === 'chest' });
if (state() !== 'chest') throw new Error('专属宝箱未打开: ' + state());
const mRewardRows = elRegistry.get('chest-rewards').children;
const mRowsTxt = mRewardRows.map(c => c._html || '').join('|');
if (mRewardRows.length !== 5) throw new Error('专属宝箱应必含 5 件奖励: ' + mRowsTxt);
if (mRowsTxt.includes('金币 ×1')) throw new Error('专属宝箱不应含金币位: ' + mRowsTxt);
if (!/印 ×\d/.test(mRowsTxt)) throw new Error('专属宝箱金币位应由猫爪印兜底: ' + mRowsTxt);
click('btn-chest-ok'); pump(0.3);
MS.DATA.CFG.stamps.chestAffix = 0.6;
console.log('✓ 专属宝箱：5 件奖励、绝无金币位（印章兜底）');
// 失败路径：母亲战中死亡 → 结算注明倒在老鼠妈妈面前
G().motherDone = false; // 测试装置：本局已讨伐过一次，重置标记以模拟"讨伐前倒下"的常规路径
backToPlay();
key('KeyH');
pump(3, { keepAlive: keepMother, until: () => !!(G().enemies.find(e => e.mother && e.state !== 'entry')) });
G().player.iframes = 0;
key('KeyO');
pump(8, { until: () => state() === 'over', keepAlive: keepMother });
if (!elRegistry.get('over-sub').textContent.includes('老鼠妈妈')) throw new Error('失败结算未注明倒在老鼠妈妈面前: ' + elRegistry.get('over-sub').textContent);
if (!elRegistry.get('btn-continue').hidden) throw new Error('失败结算不应显示继续夜巡');
console.log('✓ 失败路径：讨伐前倒下 → 结算注明「倒在老鼠妈妈面前」，无继续夜巡');
click('btn-menu');
waitForState('menu', 3, '从失败结算回主菜单');

/* ---------- 场景 8.13：70 级后自动成长（+2% 生命/+1% 移速/回满） & 80 级后只能靠宝箱升级 ---------- */
key('Enter');
waitForState('play', 3, '70/80 级规则开局');
dismissLevelup();
const PL13 = MS.DATA.CFG.postLevel;
G().player.passives = []; G().player.affixes = [];
G().player.weapons = []; // 关火隔离：避免击杀掉落干扰等级
G().player.lv = PL13.autoFrom + 1; // 71 级 → 成长层数 1
MS.calcMods();
const BASE_HP13 = MS.DATA.PLAYER.hp;
if (G().player.maxHp !== Math.round(BASE_HP13 * (1 + PL13.hpPerLv))) throw new Error('70+ 生命成长未生效: ' + G().player.maxHp);
if (Math.abs(G().player.spdMul - (1 + PL13.spdPerLv)) > 1e-9) throw new Error('70+ 移速成长未生效: ' + G().player.spdMul);
// 71→72：不弹三选一，直接成长并回满
G().player.xp = 0;
G().player.hp = 1; G().player.iframes = 99999;
key('KeyL'); pump(0.3);
if (G().player.lv !== PL13.autoFrom + 2) throw new Error('升级未生效: lv=' + G().player.lv);
if (state() !== 'play') throw new Error('70 级后升级不应弹出三选一: ' + state());
if (G().player.maxHp !== Math.round(BASE_HP13 * Math.pow(1 + PL13.hpPerLv, 2))) throw new Error('72 级生命成长未生效: ' + G().player.maxHp);
if (G().player.hp !== G().player.maxHp) throw new Error('升级后未回满血: ' + G().player.hp);
console.log('✓ 70 级后自动成长：每级 生命+' + Math.round(PL13.hpPerLv * 100) + '% 移速+' + Math.round(PL13.spdPerLv * 100) + '% 并回满，不再弹三选一');
// 80 级：经验只能攒着，开宝箱才结算升级
G().player.lv = PL13.chestOnlyFrom; MS.calcMods();
G().player.xp = 0;
G().player.hp = G().player.maxHp;
key('KeyL'); pump(0.3);
if (G().player.lv !== PL13.chestOnlyFrom) throw new Error('80 级后经验不应直接升级: lv=' + G().player.lv);
if (!((G().player.xp || 0) > 0)) throw new Error('80 级后的经验应被保留（等待宝箱结算）');
key('KeyC'); key('KeyD');
pump(5, { until: () => state() === 'chest', keepAlive: () => { if (state() === 'levelup') key('Digit1'); } });
if (state() !== 'chest') throw new Error('宝箱未打开(80+ 升级结算)');
if (G().player.lv <= PL13.chestOnlyFrom) throw new Error('开宝箱未结算攒下的经验: lv=' + G().player.lv);
click('btn-chest-ok');
pump(0.3);
if (G().player.hp !== G().player.maxHp) throw new Error('宝箱升级结算后未回满血');
console.log('✓ 80 级后只能通过宝箱升级：攒下经开箱一次结算，升到 lv' + G().player.lv + ' 并回满');

/* ---------- 场景 9：再来一局 → 死亡流程（统一结算·失败版） ---------- */
click('btn-again');
waitForState('play', 3, '再来一局');
const dismiss = () => { if (state() === 'levelup') key('Digit1'); };
pump(20, { keepAlive: dismissLevelup }); // 先打一会儿，让伤害统计有数据（新局前几秒敌人还在路上）
// 敌人从屏边走进需要时间且随刷怪顺序浮动：有界等待伤害发生，避免"恰好 20 秒还没接战"的随机误报
for (let i = 0; i < 40 && !(G().dmgTotal > 0); i++) pump(1, { keepAlive: dismissLevelup });
const dmgBefore = G().dmgTotal;
if (!(dmgBefore > 0)) throw new Error('20 秒战斗后总伤害统计仍为 0');
if (!(G().peakSec >= 0 && G().secDmg >= 0)) throw new Error('秒伤统计字段缺失');
G().player.iframes = 0; // 战斗中敌人正在打你，清掉受击无敌帧，确保 KeyO 自杀必定生效
key('KeyO'); // 秒杀自己
pump(8, { until: () => state() === 'over', keepAlive: dismissLevelup });
if (state() !== 'over') throw new Error('死亡结算未弹出: ' + state());
console.log('✓ 死亡结算标题:', elRegistry.get('over-title').textContent);
// 统一结算：数据格与构筑清单
const tDmg = elRegistry.get('st-dmg').textContent, tDps = elRegistry.get('st-dps').textContent,
  tPeak = elRegistry.get('st-peak').textContent, tTime = elRegistry.get('st-time').textContent;
if (!tDmg || tDmg === '0') throw new Error('结算总伤害未显示: ' + tDmg);
if (!tDps || !tPeak) throw new Error('结算 DPS/最高秒伤未显示');
if (tTime === '0:00') throw new Error('结算时长未显示');
console.log('✓ 结算数据: 时长=' + tTime + ' 总伤害=' + tDmg + ' DPS=' + tDps + ' 最高秒伤=' + tPeak);
const wChips = elRegistry.get('bchips-w').children;
if (!wChips.length) throw new Error('构筑清单·武器图标未渲染');
console.log('✓ 构筑清单: 武器 ' + wChips.length + ' 枚, 被动行 hidden=' + elRegistry.get('brow-p').hidden +
  ', 猫爪印行 hidden=' + elRegistry.get('brow-s').hidden);
// 战报分享图（Canvas 渲染冒烟）
const Result = vm.runInContext('Result', sandbox);
if (!Result || !Result.renderCard) throw new Error('Result 模块未加载');
const shareCard = Result.renderCard({
  win: true, round: 3, time: 732, lv: 24, kills: 900, gold: 1200,
  dmgTotal: 1234567, dps: 1685, peakSec: 9876,
  weapons: [{ id: 'claw', lv: 8, evolved: true }, { id: 'note', lv: 5, evolved: false }],
  passives: [{ id: 'catnip', lv: 3 }, { id: 'koi', lv: 2 }],
  affixes: [{ id: 'dmg', stacks: 4 }, { id: 'pierce', stacks: 2 }],
  best: { time: 900, rounds: 5 }, date: new Date()
});
if (!shareCard || shareCard.width !== 1080 || shareCard.height < 1100) throw new Error('战报图渲染尺寸异常: ' + (shareCard && shareCard.width + 'x' + shareCard.height));
console.log('✓ 战报分享图渲染 OK（' + shareCard.width + '×' + shareCard.height + '）');

/* ---------- 场景 9.5：夜巡中途收工 → 同一张结算（成功版） ---------- */
click('btn-menu');
if (state() !== 'menu') throw new Error('回主菜单失败');
key('Enter');
waitForState('play', 3, '再次开局');
pump(4, { keepAlive: dismissLevelup });
key('KeyP');
waitForState('pause', 2, '暂停');
click('btn-quit'); // 中途收工
waitForState('over', 3, '收工结算弹出');
const winTitle = elRegistry.get('over-title').textContent;
if (!winTitle.includes('收工')) throw new Error('收工结算标题异常: ' + winTitle);
console.log('✓ 收工结算标题:', winTitle, '| 副标题:', elRegistry.get('over-sub').textContent);
click('btn-menu');
if (state() !== 'menu') throw new Error('从收工结算回主菜单失败');

/* ---------- 场景 10：暂停/恢复 ---------- */
key('Enter');
waitForState('play', 3, '再次开局');
key('KeyP');
waitForState('pause', 2, '暂停');
key('KeyP');
waitForState('play', 2, '恢复');

/* ---------- 场景 11：中后期极端构筑压测（意见3：60~90 级通用属性叠满时的过载治理） ---------- */
click('btn-menu');
if (state() !== 'menu') throw new Error('回主菜单失败(压测)');
key('Enter');
waitForState('play', 3, '压测开局');
dismissLevelup();
// 构造极端构筑：8 武器全部进化满级 + 猫爪印极端叠层（伤害×~7.7 冷却×~0.40 数量+8 穿透+10 必暴击 吸血+3.2%）
G().player.weapons = [
  { id: 'claw', lv: 8, evolved: true, t: 0, state: 0 }, { id: 'note', lv: 8, evolved: true, t: 0, state: 0 },
  { id: 'fish', lv: 8, evolved: true, t: 0, state: 0 }, { id: 'axe', lv: 8, evolved: true, t: 0, state: 0 },
  { id: 'orbit', lv: 8, evolved: true, t: 0, state: 0 }, { id: 'aura', lv: 8, evolved: true, t: 0, state: 0 },
  { id: 'litter', lv: 8, evolved: true, t: 0, state: 0 }, { id: 'zap', lv: 8, evolved: true, t: 0, state: 0 }
];
G().player.passives = [{ id: 'catnip', lv: 5 }, { id: 'alarm', lv: 5 }, { id: 'gloves', lv: 2 }, { id: 'yarnball', lv: 5 }, { id: 'milk', lv: 5 }];
G().player.affixes = [
  { id: 'dmg', stacks: 18 }, { id: 'cd', stacks: 15 }, { id: 'area', stacks: 10 },
  { id: 'amount', stacks: 8 }, { id: 'pierce', stacks: 10 }, { id: 'crit', stacks: 15 }, { id: 'lifesteal', stacks: 8 }
];
G().player.lv = 75;
MS.calcMods();
// 快进 4 分钟（轮内强度成长/同屏上限进入中后期区间）+ 塞满接近同屏上限的敌人
for (let i = 0; i < 4; i++) key('KeyT');
for (let i = 0; i < 200; i++) {
  const a = Math.random() * Math.PI * 2, d = 200 + Math.random() * 500;
  MS.spawnEnemy('rat', G().player.x + Math.cos(a) * d, G().player.y + Math.sin(a) * d, false);
}
// 跑 30 游戏秒，逐秒采样过载指标
const SfxRT = vm.runInContext('Sfx', sandbox);
const FXC = MS.DATA.CFG.fx;
const samples = [];
let sfxPeak = 0, sN = 0;
pump(30, { keepAlive: () => {
  key('KeyI');
  const s = state();
  if (s === 'levelup') key('Digit1');
  else if (s === 'chest') click('btn-chest-ok');
  if (++sN % 30 === 0) {
    samples.push({ shake: G().shake, zones: G().zones.length, parts: G().parts.length, projs: G().projs.length });
    sfxPeak = Math.max(sfxPeak, SfxRT.sfxRate());
  }
}});
if (samples.length < 20) throw new Error('压测采样不足: ' + samples.length);
const maxOf = k => Math.max(...samples.map(s => s[k]));
const maxShake = maxOf('shake'), maxZones = maxOf('zones'), maxParts = maxOf('parts'), maxProjs = maxOf('projs');
console.log('✓ 极端构筑压测 30s: 震屏峰值 ' + maxShake.toFixed(1) + '/' + FXC.shakeMax +
  ' · 猫砂区峰值 ' + maxZones + '/' + FXC.zoneMax + ' · 粒子峰值 ' + maxParts +
  ' · 投射物峰值 ' + maxProjs + ' · 音效峰值 ' + sfxPeak + '/s');
if (maxShake > FXC.shakeMax + 0.01) throw new Error('震屏超过总上限: ' + maxShake);
if (maxZones > FXC.zoneMax) throw new Error('猫砂区域超过上限: ' + maxZones);
if (maxParts > 600) throw new Error('粒子超过上限: ' + maxParts);
if (maxProjs > 480) throw new Error('投射物超过上限: ' + maxProjs);
if (sfxPeak > 150) throw new Error('音效播发率异常失控: ' + sfxPeak + '/s');
console.log('✓ 过载治理生效：屏幕不常驻满幅晃动、地面猫砂有上限、音效有节流与并发预算');

console.log('\n全部无头冒烟场景通过 ✅');
process.exit(0);
