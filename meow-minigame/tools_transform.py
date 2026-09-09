# -*- coding: utf-8 -*-
# 小游戏版 main.js 生成器：从 miaomiao-deploy/js/main.js fork 出去 DOM 化的定制版。
# 每处替换都断言唯一命中，任何失配立即报错退出，防止静默漏改。
import io, re, sys

SRC = r'C:\Users\gavin\Desktop\Games\miaomiao-deploy\js\main.js'
DST = r'C:\Users\gavin\Desktop\Games\meow-minigame\src\main.js'

s = io.open(SRC, encoding='utf-8').read()
fails = []

def rep(old, new, label):
    global s
    n = s.count(old)
    if n != 1:
        fails.append('%s (count=%d)' % (label, n))
        return
    s = s.replace(old, new)

def splice(start_mark, end_mark, new, label, include_end=True):
    global s
    i = s.find(start_mark)
    if i < 0:
        fails.append(label + ' start-not-found')
        return
    j = s.find(end_mark, i)
    if j < 0:
        fails.append(label + ' end-not-found')
        return
    if include_end:
        j += len(end_mark)
    s = s[:i] + new + s[j:]

# ① 头部 DEV/AUTO
rep("""  const DEV = /[?&]dev=1/.test(location.search);
  const AUTO = DEV ? new URLSearchParams(location.search).get('auto') : null;""",
"""  const DEV = typeof window !== 'undefined' && !!window.__DEV__; // 小游戏版：测试桩里置真开 dev
  const AUTO = null; // 小游戏版自动化走 __MS 调试钩子""", 'header')

# ② 画布
rep("  const cv = document.getElementById('game');",
    "  const cv = __platform.screenCanvas(); // 适配层：wx.createCanvas 首调即屏幕画布", 'canvas')

# ③ resize 同步 MUI 视口
rep("""    vw = window.innerWidth; vh = window.innerHeight;
    if (vw < 2 || vh < 2) return; // 旋转/分屏切换瞬间 innerWidth 可能短暂为 0，等下一帧自愈检查再量""",
"""    vw = window.innerWidth; vh = window.innerHeight;
    MUI.setViewport(vw, vh);
    if (vw < 2 || vh < 2) return; // 旋转/分屏切换瞬间 innerWidth 可能短暂为 0，等下一帧自愈检查再量""", 'resize-mui')

# ④ $ / screens / show
rep("""  const $ = id => document.getElementById(id);
  const screens = {
    menu: $('screen-menu'), levelup: $('screen-levelup'), chest: $('screen-chest'),
    pause: $('screen-pause'), over: $('screen-over'), help: $('help-panel')
  };
  const show = (el, on) => el.classList[on ? 'remove' : 'add']('hidden');""",
"""  // 小游戏版：无 DOM，界面全部走 MUI（Canvas 覆盖层）""", 'screens')

# ⑤ updateToggleBtns（第五版+：单一真源广播 meow-toggles 事件给 ⚙ 抽屉；小游戏侧直连 MUI）
rep("""  function updateToggleBtns() {
    try {
      if (typeof document.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        document.dispatchEvent(new CustomEvent('meow-toggles', { detail: { zoom: userZoom, speed: gameSpeed, muted: Sfx.isMuted() } }));
      }
    } catch (e) { /* 无头测试桩等环境没有 CustomEvent 时静默跳过 */ }
  }""",
"""  function updateToggleBtns() { MUI.setZoomLv(userZoom + 'X'); MUI.setSpeedLv(gameSpeed + 'X'); }""", 'toggle-btns')

# ⑥⑦⑧ 触摸路由
rep("""  cv.addEventListener('touchstart', e => {
    onAnyInput();
    if (G.state !== 'play') return;
    const t = e.changedTouches[0];""",
"""  cv.addEventListener('touchstart', e => {
    onAnyInput();
    const t = e.changedTouches[0];
    if (MUI.touch('start', t.clientX, t.clientY)) return; // 覆盖层 / HUD 按钮吃掉
    if (G.state !== 'play') return;""", 'touch-start')

rep("""  cv.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {""",
"""  cv.addEventListener('touchmove', e => {
    const t0 = e.changedTouches[0];
    if (MUI.touch('move', t0.clientX, t0.clientY)) { e.preventDefault(); return; }
    for (const t of e.changedTouches) {""", 'touch-move')

rep("""  const endTouch = e => {
    for (const t of e.changedTouches) if (t.identifier === joy.id) { joy.on = false; joy.x = 0; joy.y = 0; }
  };""",
"""  const endTouch = e => {
    const t0 = e.changedTouches[0];
    if (t0) MUI.touch('end', t0.clientX, t0.clientY);
    for (const t of e.changedTouches) if (t.identifier === joy.id) { joy.on = false; joy.x = 0; joy.y = 0; }
  };""", 'touch-end')

# ⑨ KeyM 静音：网页版已重构为 toggleMuted() 单一真源（无 DOM 依赖），fork 原样保留，无需替换

# ⑩ 老鼠妈妈结算
rep("""    data.best = saveBest();
    Result.open(data);
    Sfx.sfx.victory(); Sfx.meow('happy');
    show(screens.over, true);""",
"""    data.best = saveBest();
    showResultPanel(data);
    Sfx.sfx.victory(); Sfx.meow('happy');""", 'mother-result')

# ⑪ 普通结算
rep("""    const b = saveBest();
    data.best = b;
    Result.open(data);
    if (win) { Sfx.sfx.victory(); Sfx.meow('happy'); }
    show(screens.over, true);""",
"""    const b = saveBest();
    data.best = b;
    showResultPanel(data);
    if (win) { Sfx.sfx.victory(); Sfx.meow('happy'); }""", 'show-result')

# ⑫ updateBestLine → 结算展示/战报保存/日志帮助数据
rep("""  function updateBestLine() {
    const b = U.storage.get('meow_best', null);
    $('best-line').textContent = b && b.time ? `最佳纪录 · 坚持 ${U.fmtTime(b.time)} · 最远第 ${b.rounds || 1} 轮` : '今晚的喵都，等一只勇敢的猫 🐾';
  }""",
"""  // 小游戏版：把结算数据整理成 MUI.showResult 的展示结构（文案规则与 H5 版 result.js 一致）
  let lastResultData = null;
  function showResultPanel(data) {
    lastResultData = data;
    let title, sub;
    if (data.mother) { title = '🐭 老鼠妈妈已讨伐！'; sub = '喵都暂时安全了……但夜巡还长，鼠群仍会再来。'; }
      else if (data.win) { title = '🎉 收工大吉！'; sub = '第 ' + data.round + ' 轮平安归来，喵都为你骄傲！'; }
    else {
      title = '😿 大橘累倒了…';
      sub = data.diedToMother
        ? '在第 ' + data.round + ' 轮倒在了老鼠妈妈面前！她的全屏斩太狠了……再试一次吧！'
        : '在第 ' + data.round + ' 轮被鼠群击倒了！小鱼干被抢走了，再试一次吧！';
    }
    const W = DATA.WEAPONS, PS = DATA.PASSIVES, SM = DATA.STAMP_META;
    const buildRows = [{
      label: '武器',
      chips: data.weapons.map(w => ({ icon: Art.icons[w.evolved ? W[w.id].iconEvo : W[w.id].icon], badge: w.evolved ? '★' : '' + w.lv, kind: w.evolved ? 'evo' : 'w' }))
    }];
    if (data.passives.length) buildRows.push({ label: '被动', chips: data.passives.map(p2 => ({ icon: Art.icons[PS[p2.id].icon], badge: '' + p2.lv, kind: 'p' })) });
    if (data.affixes.length) buildRows.push({ label: '猫爪印', chips: data.affixes.map(a => ({ icon: Art.icons[SM[a.id].icon], badge: '×' + a.stacks, kind: 'stamp' })) });
    const stats = [
      ['' + data.round, '到达轮次'], [U.fmtTime(data.time), '本局时长'], ['' + data.lv, '等级'], ['' + data.kills, '打跑敌人'],
      ['' + data.gold, '金币'], [U.fmtNum(data.dmgTotal), '总伤害'], [U.fmtNum(data.dps), '平均 DPS'], [U.fmtNum(data.peakSec), '最高秒伤']
    ];
    let bestTxt = '最佳纪录 · 坚持 ' + U.fmtTime(data.best.time) + ' · 最远第 ' + (data.best.rounds || 1) + ' 轮';
    if (data.bestMother) bestTxt += ' · 老鼠妈妈最速 ' + U.fmtTime(data.bestMother);
    MUI.showResult({
      title, sub,
      motherLine: data.mother ? '⏱ 讨伐用时 ' + U.fmtTime(data.motherTTK || 0) : '',
      stats, buildRows, bestTxt, continueOffer: !!data.continueOffer,
      contentH: 300 + buildRows.length * 54 + stats.length * 30
    });
  }
  // 小游戏版：保存战报（wx 存相册；浏览器测试桩回退成下载）
  function saveReportImage() {
    if (!lastResultData) return;
    const card = Result.renderCard(lastResultData);
    if (typeof wx === 'undefined' || !wx.canvasToTempFilePath) {
      try {
        card.toBlob(b => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(b); a.download = 'meow-report.png';
          document.body.appendChild(a); a.click(); a.remove();
        });
      } catch (e) { /* 测试桩无 toBlob 时忽略 */ }
      return;
    }
    wx.canvasToTempFilePath({
      canvas: card,
      success: r => wx.saveImageToPhotosAlbum({
        filePath: r.tempFilePath,
        success: () => wx.showToast({ title: '战报已存相册 🐾', icon: 'none' }),
        fail: () => wx.showToast({ title: '未授权相册，保存失败', icon: 'none' })
      }),
      fail: () => wx.showToast({ title: '生成图片失败', icon: 'none' })
    });
  }
  function latestLogEntry() {
    try { return (CHANGELOG && CHANGELOG.entries && CHANGELOG.entries[0]) || null; } catch (e) { return null; }
  }
  const HELP_LINES = [
    '· 大橘要迎接无尽鼠潮：每轮 15 分钟、4 个批次，每批有头目压阵！',
    '· 打倒批次头目，下一批立刻来袭；讨伐鼠王·铁须就进入下一轮——难度节节攀升！',
    '· 第 3 轮讨伐鼠王后，压轴 Boss「老鼠妈妈」降临！打倒她即达成夜巡目标，之后可继续无尽模式！',
    '· 拖动屏幕＝摇杆移动，武器全自动攻击，专心走位！',
    '· 六张夜巡地图任选：老城夜市 / 樱花公园 / 港湾码头 / 雪山温泉 / 幽灵游乐园 / 无尽街区！',
    '· 楼房与水面走不了；草地、沙滩、深雪、落叶会拖慢脚步；🐾 猫道只有你能钻，鼠群进不来！',
    '· 怪物各有脾性：三花姐会蓄力突进、鸽子隔空吐羽毛、浣熊爱扑抢鱼干、蜗牛身后留黏液！',
    '· 打倒敌人捡小鱼干升级，每次 3 选 1 强化；除猫爪外最多 4 种武器，选好构筑！',
    '· 每 2 分钟有精英出没：半数掉宝箱（幸运锦鲤提高概率，否则掉金币），批次头目必掉宝箱！',
    '· 武器满级 + 对应被动，开宝箱触发进化；70 级解锁可无限叠加的猫爪印！',
    '· 右上角按钮：⏸ 暂停 · 🔍 缩放（4X=旧版大画面）· ⏩ 加速（最高 3X）· 🔊 静音'
  ];""", 'result-helpers')

# ⑬ 地图选择块
splice("""  if (DEV) { // ?map=oldtown / ?map=endless 指定地图（测试用）
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
  buildMapChips();\n  function startRun() {""",
"""  buildMapChips();\n  function startRun() {""",
"""  if (DEV && window.__DEV_MAP && (window.__DEV_MAP === 'endless' || MAPS.get(window.__DEV_MAP))) G.mapId = window.__DEV_MAP;\n  function startRun() {""", 'map-chips')

# ⑭ startRun（第五版：缩放/加速悬浮钮已并入 ⚙ 抽屉，进局不再有按钮显隐）
rep("""    for (const k in screens) show(screens[k], false);
    document.body.classList.remove('help-open'); // 玩法说明若开着，同步收回放开过的纵向触摸
    G.state = 'play';
    Sfx.bgmStart(G.mapId); // 意见5：每张地图一首 BGM""",
"""    MUI.setScreen(null);
    G.state = 'play';
    Sfx.bgmStart(G.mapId); // 意见5：每张地图一首 BGM""", 'start-run')

# ⑮ 暂停 / 恢复 / 回菜单（第五版：toMenu 里的 help-open 收回 / best-line 行都是 DOM 概念，MUI 不需要）
rep("""  function pauseGame() {
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
  }""",
"""  function pauseGame() {
    G.state = 'pause';
    MUI.setScreen('pause');
  }
  function resumeGame() {
    G.state = 'play';
    MUI.setScreen(null);
  }
  function toMenu() {
    G.state = 'menu';
    Sfx.bgmStop();
    MUI.setScreen('menu');
  }""", 'pause-resume-menu')

# ⑯ openLevelUp：整段卡片 DOM → 结构化数据 + MUI
splice("""    const box = $('lvl-cards');
    box.innerHTML = '';
    if (AUTO === 'play' || AUTO === 'boss') setTimeout(() => chooseCard(0), 400);
    lvlChoices.forEach((c, i) => {
      const card = document.createElement('div');
      card.className = 'card';
      let tag, name, desc, iconKey, pips = 0, pipsMax = 0, tagCls = '';""",
"""    show(screens.levelup, true);
  }""",
"""    const cards = lvlChoices.map(c => {
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
      return { kind: c.kind, tag, name, desc, icon: iconKey ? Art.icons[iconKey] : null, pips, pipsMax, tagCls, stacks: c.kind === 's' ? stampStacks(c.id) : 0 };
    });
    MUI.showLevelUp(cards, i => chooseCard(i));
  }""", 'levelup-dom')

# ⑰ chooseCard 关面板
rep("""    G.pendingLv--;
    show(screens.levelup, false);
    if (G.pendingLv > 0) { openLevelUp(); return; }""",
"""    G.pendingLv--;
    MUI.closeLevelUp();
    if (G.pendingLv > 0) { openLevelUp(); return; }""", 'choose-card')

# ⑱ openChest 呈现：整段 DOM → 结构化行 + MUI
splice("""    // 呈现（同一技能抽中多次：逐行显示递进等级 Lv5→6 / Lv6→7 / Lv7→8，每次都是真实+1级）
    G.evoPending = rewards.some(r => r.type === 'evo');
    Sfx.meow('chest');
    const box = $('chest-rewards');
    box.innerHTML = '';
    const applyLater = [];
    const lvlPreview = new Map();
    const stampPreview = new Map();
    const rolls = []; // 老虎机滚动行（与奖励行一一对应）
    rewards.forEach(r => {""",
"""    if (AUTO === 'play' || AUTO === 'boss') setTimeout(() => $('btn-chest-ok').click(), 1500);
  }""",
"""    // 呈现：奖励行 → MUI 宝箱面板（同一奖励抽中多次会逐行显示递进等级，每次都是真实+1级）
    G.evoPending = rewards.some(r => r.type === 'evo');
    Sfx.meow('chest');
    const rows = [];
    const applyLater = [];
    const lvlPreview = new Map();
    const stampPreview = new Map();
    rewards.forEach(r => {
      let name, desc, iconKey;
      if (r.type === 'evo') {
        const def = WEAPONS[r.w.id];
        name = `✨ ${def.name} → ${evoName(r.w.id)} ✨`;
        desc = def.descEvo;
        iconKey = def.iconEvo;
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
      } else { // 金币位：恰好 1 枚金币 → 按金币经验规则抽奖折算，行内直接显示结果
        const pct = rollLotteryTier();
        const v = Math.max(1, Math.round(DATA.xpNeed(P.lv || 1) * pct));
        name = '金币 ×1';
        desc = pct >= 0.10 ? `💥 抽中经验 ${Math.round(pct * 100)}% 大奖！（+${v}）`
                           : `抽奖 → 经验 +${Math.round(pct * 100)}%（+${v}）`;
        iconKey = null;
        applyLater.push(() => applyLottery(pct, P.x, P.y - 10));
      }
      rows.push({ name, desc, icon: iconKey ? (Art.icons[iconKey] || Art.items.gem3) : Art.items.coin });
    });
    // 立即结算属性（与 H5 版一致：统一立即应用）
    for (const f of applyLater) f();
    MUI.showChest(rows, onChestOkPanel);
    if (rewards.some(r => r.type === 'evo')) { setTimeout(() => { Sfx.sfx.evolve(); Sfx.meow('happy'); }, 550); }
  }
  function onChestOkPanel() {
    Sfx.sfx.click();
    MUI.setScreen(null);
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
  }""", 'chest-dom')

# ⑲ 按钮接线块 → MUI.init
splice("""  $('btn-start').addEventListener('click', startRun);""",
"""  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') pauseGame(); });""",
"""  /* ================= 小游戏 UI 接线 ================= */
  MUI.init({
    maps: MAPS.list,
    vw, vh,
    callbacks: {
      startRun: () => { Sfx.ensure(); Sfx.sfx.click(); startRun(); },
      selectMap: id => { Sfx.ensure(); Sfx.sfx.click(); G.mapId = id; U.storage.set('meow_map', id); },
      getMap: () => G.mapId,
      showHelp: () => { Sfx.ensure(); Sfx.sfx.click(); MUI.setScreen('help'); },
      showLog: () => { Sfx.ensure(); Sfx.sfx.click(); MUI.setScreen('log'); },
      closeOverlay: () => {
        Sfx.sfx.click();
        if (MUI.screen === 'log') { const l = latestLogEntry(); if (l) U.storage.set('meow_log_seen', l.version); }
        MUI.setScreen(G.state === 'menu' ? 'menu' : null);
      },
      hasNewLog: () => { const l = latestLogEntry(); return !!(l && l.version && U.storage.get('meow_log_seen', '') !== l.version); },
      changelog: () => { try { return CHANGELOG.entries || []; } catch (e) { return []; } },
      helpLines: () => HELP_LINES,
      resume: () => { Sfx.sfx.click(); resumeGame(); },
      restart: () => { Sfx.sfx.click(); startRun(); },
      quitToMenu: () => {
        Sfx.sfx.click();
        if (G.state === 'pause' && G.time > 0) { // 夜巡中途收工：进入与失败同一张结算（成功版）
          Sfx.bgmStop();
          MUI.setScreen(null);
          showResult(true);
          return;
        }
        toMenu();
      },
      toggleMute: () => { Sfx.sfx.click(); toggleMuted(); },
      muted: () => Sfx.isMuted(),
      pause: () => { if (G.state === 'play') pauseGame(); },
      cycleZoom: () => { Sfx.ensure(); Sfx.sfx.click(); cycleZoom(1); },
      cycleSpeed: () => { Sfx.ensure(); Sfx.sfx.click(); cycleSpeed(); },
      continueRun: () => {
        // 「继续夜巡」：讨伐老鼠妈妈后的成功结算 → 无缝续玩无限模式（一切保留）
        Sfx.sfx.click();
        MUI.clearOver();
        G.motherActive = false; G.mother = null;
        G.timeScale = 1; G.slowmoT = 0; G.flash = 0; G.motherFxT = 0;
        startRound(G.round + 1);
        G.state = 'play';
        Sfx.bgmStart(G.mapId);
      },
      again: () => { Sfx.sfx.click(); MUI.clearOver(); startRun(); },
      saveImg: () => { Sfx.sfx.click(); saveReportImage(); },
      toMenu: () => { Sfx.sfx.click(); MUI.clearOver(); toMenu(); }
    }
  });
  MUI.setScreen('menu'); // 小游戏版：初始即主菜单（H5 版是 HTML 默认态，这里要显式置入）
  if (typeof wx !== 'undefined' && wx.onHide) wx.onHide(() => { if (G.state === 'play') pauseGame(); });""", 'wiring')

# ⑳ render 末尾接 MUI
rep("""    ctx.drawImage(vignette, 0, 0);
    drawHUD();
    drawJoystick();
  }""",
"""    ctx.drawImage(vignette, 0, 0);
    drawHUD();
    drawJoystick();
    MUI.draw(ctx, G.realTime);
  }""", 'render-mui')

# ㉑ renderMenuBg 主视觉猫块（MUI 菜单自带）
rep("""    ctx.drawImage(vignette, 0, 0);
    // 主视觉猫（摆尾 / 挥爪 / 眨眼）
    const mc = $('menu-art').getContext('2d');
    mc.imageSmoothingEnabled = false;
    mc.clearRect(0, 0, 640, 560);
    const blink = (G.realTime % 4.6) < 0.14;
    const frame = Math.floor(G.realTime * 1.6) % 2;
    const spr = blink ? Art.menuCatBlink : Art.menuCat[frame];
    mc.drawImage(spr, 70, 40, 500, 500);
  }""",
"""    ctx.drawImage(vignette, 0, 0);
  }""", 'menu-cat')

# ㉒ init 尾部：MeowView/CfgPanel/openCfg/cfg-mute-btn 移除 + __MS 扩充
#    （第五版+：H5 侧音效/缩放/加速档位改由 window.MeowView + ⚙ 设置抽屉消费；小游戏侧 MUI.init 接线已覆盖）
rep("""  updateBestLine();
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
    getZoom: () => ({ userZoom, zoom, worldW, worldH }), getSpeed: () => gameSpeed };""",
"""  updateToggleBtns(); // MUI HUD 就位后，广播一次当前缩放/加速档
  if (DEV) window.__MS = { G, calcMods, DATA, getMods: () => mods, buildPool, hitEnemy, spawnEnemy,
    getZoom: () => ({ userZoom, zoom, worldW, worldH }), getSpeed: () => gameSpeed, addXp, openChest, MUI };""", 'init-tail')

# ㉓ AUTO 自动化块删除（保留与 H5 一致的像素字体启动门 __PIXEL_GATE：等像素素材就绪再开循环）
splice("""  // 自动化测试钩子（仅 ?dev=1&auto=... 生效）
  if (AUTO) {""",
"""  else startLoop();""",
"""  const startLoop = () => requestAnimationFrame(loop);
  if (window.__PIXEL_GATE) window.__PIXEL_GATE.then(startLoop); else startLoop();""", 'auto-block')

# ㉔ 主循环菜单分支接 MUI.draw
rep("""    if (G.state !== 'menu') render();
    else renderMenuBg();
    if (DEV && G.state !== 'menu') drawDevPanel();""",
"""    if (G.state !== 'menu') render();
    else { renderMenuBg(); MUI.draw(ctx, G.realTime); } // 小游戏版：菜单内容画在夜空背景之上
    if (DEV && !window.__NODEV && G.state !== 'menu') drawDevPanel(); // __NODEV：截图模式藏 dev 面板""", 'loop-menu-mui')

# ㉘ 触屏判定：小游戏 window 桩没有 ontouchstart 键，固定按触屏处理（提示文案走手机版）
rep("  const IS_TOUCH = 'ontouchstart' in window; // 手机/平板：提示文案与桌面不同",
    "  const IS_TOUCH = true; // 小游戏版：纯触屏，提示文案固定手机版", 'is-touch')

# ㉙ 离屏画布尺寸必须取整：wx 包装画布的 width/height 是普通属性，不做 WebIDL 整数化，
#    塞进小数（如 innerWidth=1905.33）后 drawImage 会以"类型不合法"拒绝（真机模拟器实测踩雷）
rep("""    vignette = document.createElement('canvas');
    vignette.width = vw; vignette.height = vh;""",
"""    vignette = document.createElement('canvas');
    vignette.width = Math.max(1, Math.round(vw)); vignette.height = Math.max(1, Math.round(vh));""", 'vignette-int')

# ㉚ 视口/dpr 钉死到虚拟值（v3 虚拟视口）：不依赖宿主 window（开发者工具下它是锁死的页面 window，
#    innerWidth=整个页面宽、devicePixelRatio=2，会导致画布 2x 放大后被裁切——真机模拟器实测踩雷）
rep("    dpr = Math.min(2, window.devicePixelRatio || 1);",
    "    dpr = __platform.virtual.dpr;", 'pin-dpr')
rep("    vw = window.innerWidth; vh = window.innerHeight;",
    "    vw = __platform.virtual.vw; vh = __platform.virtual.vh;", 'pin-vwvh')
rep("    if (window.innerWidth !== vw || window.innerHeight !== vh) resize();",
    "    if (__platform.virtual.vw !== vw || __platform.virtual.vh !== vh) resize();", 'pin-selfheal')
# ㉛ 画布 CSS 尺寸 = 真实 pt（虚拟 vw 是绘制坐标系；CSS 若也用虚拟宽度，屏幕上会 2x 放大裁切——实测踩雷）
rep("    cv.style.width = vw + 'px'; cv.style.height = vh + 'px';",
    "    cv.style.width = __platform.sys.windowWidth + 'px'; cv.style.height = __platform.sys.windowHeight + 'px';", 'pin-css')

# ㉜ 金币头奖庆祝层禁用：worldCelebrate 依赖 DOM 覆盖层（#chest-fx），小游戏无 DOM——
#    直接置空函数体。可达链 worldCelebrate→chestFxMount→chestFxStart 会读 fx.cv.width 必崩
#    （≥80% 金币头奖概率性触发，评审抓出）
rep("""  function worldCelebrate() {
    fxTok++; fxTimersClear(); // 新的一场：作废旧演出残留""",
"""  function worldCelebrate() {
    return; // 小游戏版：金币头奖庆祝层依赖 DOM 覆盖层，禁用（世界层粒子/飘字不受影响）
    fxTok++; fxTimersClear(); // 新的一场：作废旧演出残留""", 'world-celebrate-stub')

# ㉝ ⚙ 齿轮显隐脏检查：函数体写 $('btn-cfg').hidden——fork 里 $ 未定义，每次界面切换崩一次
#    （控制台反复报错的真凶）。MUI 界面自管齿轮显隐，保留状态机但去掉 DOM 写入。
rep("""  function syncGearBtn() {
    const hide = GEAR_HIDE_STATES.includes(G.state);
    if (hide === gearHidden) return;
    gearHidden = hide;
    $('btn-cfg').hidden = hide;
  }""",
"""  function syncGearBtn() {
    // 小游戏版：无 ⚙ DOM 按钮（MUI 按界面自管显隐），保留脏检查状态机但去掉 DOM 写入
    const hide = GEAR_HIDE_STATES.includes(G.state);
    if (hide !== gearHidden) { gearHidden = hide; }
  }""", 'sync-gear-btn')

if fails:
    print('TRANSFORM FAILED:')
    for f in fails:
        print('  -', f)
    sys.exit(1)

# 残留 DOM 检查 v3：函数上下文追踪 + 定点豁免 + 非豁免命中即阻断（写入前拦截）。
# 豁免两类：① 桩安全模式 document.createElement('canvas') / document.addEventListener(
#    adapter 的 document 桩对二者分别映射 wx 离屏画布与 no-op，均无害）；
# ② 已确认不可达/浏览器分支专用的函数（ALLOW_FNS）。
ALLOW_FNS = {
    'updateBestLine', 'saveReportImage',
    'worldCelebrate', 'chestFxMount', 'chestFxStart', 'chestFxBoom',
    'chestRollTick', 'chestSettleRow', 'chestFinishShow', 'chestSkipAll',
    'fxStopAll',
}
cur_fn = ''
bad = []
SAFE_PATTERNS = ("document.createElement('canvas')", "document.addEventListener(")
for ln in s.split('\n'):
    m = re.match(r'\s*(?:async\s+)?function\s+(\w+)', ln)
    if m:
        cur_fn = m.group(1)
    if cur_fn in ALLOW_FNS:
        continue
    if '$(' in ln or 'screens.' in ln or 'CfgPanel' in ln or 'updateBestLine' in ln or 'document.' in ln:
        if any(p in ln for p in SAFE_PATTERNS):
            continue
        bad.append(cur_fn + ' :: ' + ln.strip()[:120])
if bad:
    print('LEFTOVER DOM refs outside allowlist（拒绝生成，防止运行时崩溃）:')
    for b in bad[:20]:
        print('  LEFTOVER:', b)
    sys.exit(1)
io.open(DST, 'w', encoding='utf-8', newline='\n').write(s)
print('main.js fork generated:', DST, '(残留 DOM 检查：全部定点豁免/白名单内)')
