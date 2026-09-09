/* ============================================================
 * FM 2027 Matchday - 游戏主流程
 * 开局(预算) → 转会市场 → 选对手 → 首发阵型 → 战术板 → 比赛日 → 复盘
 * ============================================================ */
(function () {
  'use strict';
  var DATA = window.GMD_DATA, TAC = window.GMD_TACTICS, ENG = window.GMD_ENGINE, PITCH = window.GMD_PITCH, SEA = window.GMD_SEASON;
  var $ = function (id) { return document.getElementById(id); };

  var App = {
    budget: 600, teamName: '梦想联',
    signed: [],            /* uid 数组 */
    opponent: null,        /* 俱乐部对象 */
    tactic: null,
    benchUids: [],
    match: null,           /* 引擎 state */
    speed: 2, timer: null, paused: true,
    smart: true, smartHold: 0,
    actionLog: [],         /* 本场用户动作日志（含 tick 序号，刷新续打重放用） */
    tickCount: 0,          /* stepMinute 调用计数：续打按 tick 记账（HT 回拨不失真） */
    season: null,          /* 赛季状态（10 轮迷你 / 42 轮完整双循环） */
    myHome: true,          /* 本场我是否主场（mySide 抽象：引擎侧 0 恒为我，homeAdvSide 决定优势归属） */
    persona: 'fire',       /* 解说人格 */
    personaN: {}, lastPersonaMin: -10,
    matchSeedUsed: null, lastGrudge: null,
    stage: 'welcome',
    selSlot: -1, subOut: null, subIn: null
  };
  var MY_COLOR = '#2dd4a7';
  var SAVE_KEY = 'gmd_save_v1', PRESET_KEY = 'gmd_presets_v1';
  var SEASON_MINI = 10, SEASON_FULL = 42, MY_ID = '__ME__';

  var BUDGETS = [
    { name: '精打细算', money: 450, desc: '€4.5亿 —— 数据派总监玩法，性价比至上', stars: 3 },
    { name: '标准经理', money: 600, desc: '€6.0亿 —— 一个豪窗的真实预算', stars: 2 },
    { name: '石油豪门', money: 800, desc: '€8.0亿 —— 硬刚曼城利物浦全主力', stars: 1 }
  ];

  /* ---------------- 工具 ---------------- */
  function fmtM(v) { return v >= 1000 ? '€' + (v / 1000).toFixed(2) + '亿' : '€' + v + 'M'; }
  function uidPlayer(uid) {
    for (var i = 0; i < DATA.CLUBS.length; i++) {
      var c = DATA.CLUBS[i];
      for (var j = 0; j < c.players.length; j++) if (c.players[j].__uid === uid) return c.players[j];
    }
    return null;
  }
  function uidClub(uid) {
    return uid.split('-')[0];
  }
  function mySquad() { return App.signed.map(uidPlayer); }
  function spent() { return App.signed.reduce(function (s, uid) { var p = uidPlayer(uid); return s + (p ? p.val : 0); }, 0); }
  function clubAvailable(clubId) {
    var c = DATA.findClub(clubId);
    return c.players.filter(function (p) { return App.signed.indexOf(p.__uid) < 0; });
  }
  function squadCounts() {
    var n = { GK: 0, DF: 0, MF: 0, FW: 0 };
    mySquad().forEach(function (p) { n[DATA.posClass(p.pos)]++; });
    return n;
  }
  function squadValid() {
    if (App.signed.length < 16 || App.signed.length > 23) return false;
    var n = squadCounts();
    return n.GK >= 2 && n.DF >= 5 && n.MF >= 4 && n.FW >= 2 && spent() <= App.budget;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toast(msg) {
    var t = $('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);background:#232c3a;border:1px solid #46536a;color:#e8edf4;padding:10px 18px;border-radius:10px;z-index:200;font-size:13px;box-shadow:0 6px 24px #000a;transition:.25s;opacity:0';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t.__tm);
    t.__tm = setTimeout(function () { t.style.opacity = '0'; }, 1800);
  }

  /* ---------------- 屏幕切换 ---------------- */
  var STEP_ORDER = ['welcome', 'market', 'opponent', 'lineup', 'tactic', 'match', 'result'];
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    $('screen-' + id).classList.add('active');
    App.stage = id;
    document.querySelectorAll('#flowSteps span').forEach(function (sp) {
      var st = sp.getAttribute('data-step');
      sp.className = st === id ? 'cur' : STEP_ORDER.indexOf(st) < STEP_ORDER.indexOf(id) ? 'done' : '';
    });
    if (id !== 'welcome') updateBudgetChip();
    saveGame();
  }
  function updateBudgetChip() {
    $('budgetChip').textContent = '预算 ' + fmtM(App.budget - spent()) + ' / ' + fmtM(App.budget) + ' · 阵容 ' + App.signed.length + ' 人';
  }

  /* ---------------- 存档 ---------------- */
  function saveGame() {
    if (App.stage === 'welcome') return;
    try {
      var live = null;
      if (App.stage === 'match' && App.match && !App.match.finished) {
        /* 比赛续打（共识 B7/R3-6）：seed + tick 序号 + 动作日志 → 确定性重放 */
        live = { seed: App.match.seed, tick: App.tickCount, speed: App.speed, actionLog: App.actionLog, myHome: App.myHome };
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        budget: App.budget, teamName: App.teamName, signed: App.signed,
        opponentId: App.opponent ? App.opponent.id : null,
        tactic: App.tactic, benchUids: App.benchUids, stage: App.stage,
        season: App.season, live: live, persona: App.persona
      }));
    } catch (e) { }
  }
  /* 存档清洗：数据迭代后旧存档的失效 uid / 非法字段不至于白屏 */
  function sanitizeSave(sv) {
    if (!sv || typeof sv !== 'object' || !Array.isArray(sv.signed)) return null;
    sv.signed = sv.signed.filter(function (u) { return uidPlayer(u); });
    var f = TAC.findFormation(sv.tactic && sv.tactic.formation ? sv.tactic.formation : '4-2-3-1');
    var slotsOk = sv.tactic && Array.isArray(sv.tactic.slots) && sv.tactic.slots.length === 11 &&
      sv.tactic.slots.every(function (s) {
        return s && typeof s === 'object' && typeof s.zone === 'string' && typeof s.code === 'string' &&
          TAC.findRole(s.role) && ['D', 'S', 'A'].indexOf(s.duty) >= 0 &&
          isFinite(+s.x) && isFinite(+s.y) &&
          (!s.playerId || !!uidPlayer(s.playerId));
      });
    if (!slotsOk) {
      sv.tactic = TAC.emptyTactic(f.id);
    } else {
      sv.tactic.formation = f.id;
      sv.tactic.slots.forEach(function (s) {
        s.x = clampN(s.x, 0, 100); s.y = clampN(s.y, 0, 100);
        if (s.playerId && !uidPlayer(s.playerId)) s.playerId = null;
      });
    }
    var base = TAC.emptyTactic(f.id).instr;
    var instr = sv.tactic.instr || {};
    /* R3-1 双轴兼容：旧存档只有 mentality → 攻压/防稳同值起步 */
    if (instr.attPush == null && instr.mentality != null) { instr.attPush = instr.mentality; instr.defBlock = instr.mentality; }
    if (instr.attPush == null) instr.attPush = 3;
    if (instr.defBlock == null) instr.defBlock = 3;
    Object.keys(base).forEach(function (k) {
      var v = instr[k];
      if (typeof base[k] === 'number') {
        var max = TAC.INSTR[k] ? TAC.INSTR[k].opts.length - 1 : 6;
        instr[k] = (typeof v === 'number' && isFinite(v)) ? clampN(Math.round(v), 0, max) : base[k];
      } else if (TAC.INSTR[k] && TAC.INSTR[k].values) {
        instr[k] = TAC.INSTR[k].values.indexOf(v) >= 0 ? v : base[k];
      } else {
        instr[k] = (typeof v === typeof base[k]) ? v : base[k];
      }
    });
    sv.tactic.instr = Object.assign(base, instr);
    sv.tactic.setPiece = sv.tactic.setPiece || { corner: null, fk: null, pen: null };
    sv.benchUids = (Array.isArray(sv.benchUids) ? sv.benchUids : []).filter(function (u) { return uidPlayer(u); });
    sv.budget = +sv.budget > 0 ? +sv.budget : 600;
    /* 赛季数据清洗：无效 club id 直接剔除 */
    if (sv.season && typeof sv.season === 'object') {
      var s = sv.season;
      var valid = { __ME__: 1 };
      DATA.CLUBS.forEach(function (c) { valid[c.id] = 1; });
      if (s.table && typeof s.table === 'object') Object.keys(s.table).forEach(function (k) { if (!valid[k]) delete s.table[k]; }); else s.table = {};
      s.fixtures = Array.isArray(s.fixtures) ? s.fixtures.map(function (round) {
        return (Array.isArray(round) ? round : []).filter(function (f) { return f && valid[f.h] && valid[f.a]; });
      }) : [];
      s.results = Array.isArray(s.results) ? s.results : [];
      /* v0.3 新字段默认值（旧存档兼容）：轮数按现存赛程推断 */
      s.round = isFinite(+s.round) ? Math.max(0, Math.min(s.fixtures.length || SEASON_MINI, +s.round)) : 0;
      s.scorers = (s.scorers && typeof s.scorers === 'object') ? s.scorers : {};
      s.inj = (s.inj && typeof s.inj === 'object') ? s.inj : {};
      s.news = Array.isArray(s.news) ? s.news : [];
      s.fresh = (s.fresh && typeof s.fresh === 'object') ? s.fresh : {};
      Object.keys(s.inj).forEach(function (uid) { if (!uidPlayer(uid)) delete s.inj[uid]; });
      Object.keys(s.fresh).forEach(function (uid) { if (!uidPlayer(uid)) delete s.fresh[uid]; });
      s.done = !!s.done || s.round >= (s.fixtures.length || SEASON_MINI);
    } else sv.season = null;
    if (sv.live && (!isFinite(+sv.live.seed) || (!isFinite(+sv.live.tick) && !isFinite(+sv.live.minute)))) sv.live = null;
    if (sv.persona && !SEA.PERSONAS.some(function (p) { return p.id === sv.persona; })) sv.persona = 'fire';
    return sv;
  }
  function clampN(v, lo, hi) { v = +v; if (!isFinite(v)) return lo; return v < lo ? lo : v > hi ? hi : v; }
  function strHash(s2) { var h = 2166136261; for (var i = 0; i < s2.length; i++) { h ^= s2.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 1; }

  /* ---------------- 赛季伤病（v0.3）：uid → 缺阵至某轮（不含该轮） ---------------- */
  function injMap() { return (App.season && App.season.inj) || {}; }
  function isOutNow(uid) { return !!(App.season && !App.season.done && (injMap()[uid] || 0) > App.season.round); }
  function availSquad() { return mySquad().filter(function (p) { return !isOutNow(p.__uid); }); }

  /* ---------------- 解说人格（呈现层声音层，v0.3） ----------------
     只追加弹幕不改写引擎文案；随机源 viewRng（呈现层独立流）不污染仿真确定性 */
  function personaText(key, vars) {
    var m = App.match;
    if (!m) return null;
    var idx = (App.personaN[key] = (App.personaN[key] || 0) + 1);
    var line = SEA.personaLine(SEA.findPersona(App.persona), key, idx - 1 + Math.floor(m.viewRng() * 89));
    if (!line) return null;
    if (vars) Object.keys(vars).forEach(function (k) { line = line.split('{' + k + '}').join(vars[k] == null ? '' : String(vars[k])); });
    return line;
  }
  function personaSay(key, vars) {
    var line = personaText(key, vars);
    if (line && App.match) pushFeed({ min: App.match.minute, type: 'persona', text: line });
    return line;
  }
  /* 非进球类弹幕的冷却+概率门（进球必评） */
  function personaGate(minGap, prob) {
    var m = App.match;
    if (!m || m.minute - App.lastPersonaMin < minGap) return false;
    if (m.viewRng() >= prob) return false;
    App.lastPersonaMin = m.minute;
    return true;
  }

  function loadSave() {
    try { return sanitizeSave(JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')); } catch (e) { return null; }
  }

  /* 确定性重放：从 seed+tick+动作日志重建到中断时刻（共识 B7 / R3-6 按 tick 记账） */
  function replayTo(seed, tickN, actionLog, myHome) {
    var squad = mySquad();
    var me = { name: App.teamName, clubId: null, tactic: App.tactic, squad: squad, benchUids: App.benchUids, ai: false };
    if (App.season && !App.season.done && App.season.fresh) me.fresh = App.season.fresh;
    var avail = clubAvailable(App.opponent.id);
    var otac = TAC.autoPickXI(App.opponent.style.formation, avail);
    otac.instr = TAC.tacticFromStyle(App.opponent.style).instr;
    applyIntelShrink(otac, avail);
    var gr = SEA.grudgeFor(squad, App.opponent.id);
    SEA.applyGrudge(otac, gr.count);
    var st = ENG.createMatch({ home: me, away: { name: App.opponent.name, clubId: App.opponent.id, tactic: otac, squad: avail, ai: true }, seed: seed, homeAdvSide: myHome === false ? 1 : 0 });
    var acts = (actionLog || []).slice().sort(function (a, b) { return (a.tick || a.min || 0) - (b.tick || b.min || 0); });
    var ai = 0;
    for (var t = 1; t <= tickN && !st.finished; t++) {
      ENG.stepMinute(st);
      while (ai < acts.length && (acts[ai].tick || acts[ai].min || 0) <= t) {
        var act = acts[ai++];
        if (act.type === 'sub') ENG.substitute(st, 0, act.out, act.inn);
        else if (act.type === 'patch') ENG.patchTactic(st, 0, act.patch);
      }
    }
    return st;
  }

  /* ---------------- 开局 ---------------- */
  function renderWelcome() {
    var box = $('budgetChoice');
    box.innerHTML = BUDGETS.map(function (b, i) {
      return '<div class="budget-card' + (App.budget === b.money ? ' sel' : '') + '" data-i="' + i + '">' +
        '<h4>' + b.name + '</h4>' +
        '<div class="money">' + fmtM(b.money) + '</div><p>难度 <span class="st">' + '★'.repeat(b.stars) + '</span></p><p>' + b.desc + '</p></div>';
    }).join('');
    box.querySelectorAll('.budget-card').forEach(function (c) {
      c.onclick = function () { App.budget = BUDGETS[+c.getAttribute('data-i')].money; renderWelcome(); };
    });
    var sv = loadSave();
    $('btnContinue').style.display = sv && sv.signed && sv.signed.length ? '' : 'none';
    $('dataNote').textContent = DATA.DATA_NOTE + ' 本游戏为单机离线网页游戏，数据仅供娱乐参考。';
  }

  /* ---------------- 转会市场 ---------------- */
  /* 球探推荐阵容（共识 B4）：按位置需求+性价比一键组队，玩家可再微调 */
  function scoutRecommend() {
    var remain = App.budget - spent();
    var targets = { GK: 2, DF: 5, MF: 4, FW: 2 };
    var have = squadCounts();
    var pool = [];
    DATA.CLUBS.forEach(function (c) {
      c.players.forEach(function (p) {
        if (App.signed.indexOf(p.__uid) >= 0) return;
        pool.push({ p: p, cls: DATA.posClass(p.pos) });
      });
    });
    var clubLoad = {};
    App.signed.forEach(function (u) { var c = uidClub(u); clubLoad[c] = (clubLoad[c] || 0) + 1; });
    function trySign(p) {
      if (spent() + p.val > App.budget) return false;
      var cid = uidClub(p.__uid);
      if (clubAvailable(cid).length - 1 < 13) return false; /* 俱乐部 13 人下限 */
      clubLoad[cid] = (clubLoad[cid] || 0) + 1;
      App.signed.push(p.__uid);
      return true;
    }
    ['GK', 'DF', 'MF', 'FW'].forEach(function (cls) {
      var need = targets[cls] - have[cls];
      if (need <= 0) return;
      /* 价值加权排序（R3-8：系数降到 0.12 让预算真实约束三档难度） */
      var cands = pool.filter(function (x) { return x.cls === cls; })
        .sort(function (a, b) { return (TAC.overallOf(b.p) - b.p.val * 0.12) - (TAC.overallOf(a.p) - a.p.val * 0.12); });
      for (var i = 0; i < cands.length && need > 0; i++) {
        /* 预算保护：至少给剩余需求留 €15M/人 的兜底空间 */
        var remainingAfter = targets.GK - have.GK + targets.DF - have.DF + targets.MF - have.MF + targets.FW - have.FW - 1;
        if (spent() + cands[i].p.val > App.budget - remainingAfter * 15) continue;
        if (trySign(cands[i].p)) { need--; have[cls]++; }
      }
    });
    /* 补到 18 人：补强薄弱位置，性价比优先，门将不超配 */
    var total = App.signed.length;
    var rest = pool.filter(function (x) { return App.signed.indexOf(x.p.__uid) < 0 && have[x.cls] < (x.cls === 'GK' ? 2 : 6); })
      .sort(function (a, b) {
        var w = function (x) { return TAC.overallOf(x.p) - x.p.val * 0.2 + (6 - Math.min(6, have[x.cls])) * 3; };
        return w(b) - w(a);
      });
    for (var i = 0; i < rest.length && total < 18; i++) {
      if (trySign(rest[i].p)) { total++; have[rest[i].cls]++; }
    }
  }

  function renderMarket() {
    var sel = $('clubFilter');
    sel.innerHTML = '<option value="">全部 20 家英超俱乐部</option>' + DATA.CLUBS.map(function (c) {
      return '<option value="' + c.id + '"' + (sel.value === c.id ? ' selected' : '') + '>' + c.name + '</option>';
    }).join('');
    renderGrid();
    renderSquad();
  }
  function renderGrid() {
    var cf = $('clubFilter').value, pf = $('posFilter').value, af = $('affordFilter').value, q = $('nameSearch').value.trim();
    var remain = App.budget - spent();
    var rows = [];
    DATA.CLUBS.forEach(function (c) {
      if (cf && c.id !== cf) return;
      c.players.forEach(function (p) {
        if (App.signed.indexOf(p.__uid) >= 0) return;
        if (pf && DATA.posClass(p.pos) !== pf) return;
        if (af === '1' && p.val > remain) return;
        if (q && p.name.indexOf(q) < 0) return;
        rows.push({ p: p, c: c });
      });
    });
    rows.sort(function (a, b) { return b.p.val - a.p.val; });
    var ATTR_NAMES = ['速', '射', '传', '盘', '防', '体'];
    $('playerGrid').innerHTML = rows.slice(0, 400).map(function (r) {
      var p = r.p, ovr = TAC.overallOf(p), afford = p.val <= remain;
      var bars = p.a.map(function (v, i) {
        return '<div class="bar' + (v < 60 ? ' low' : '') + '"><i style="height:' + v + '%"></i><span>' + ATTR_NAMES[i] + v + '</span></div>';
      }).join('');
      var gk = '';
      if (p.gk) gk = '<div class="p-mid"><span class="tag">扑救 ' + p.gk.ref + '</span><span class="tag">单刀 ' + p.gk.one + '</span><span class="tag">指挥 ' + p.gk.cmd + '</span><span class="tag">出球 ' + p.gk.kic + '</span></div>';
      return '<div class="pcard" data-uid="' + p.__uid + '">' +
        '<div class="p-top"><span class="p-name">' + esc(p.name) + '</span><span class="p-ovr">' + ovr + '</span></div>' +
        '<div class="p-mid"><span class="tag">' + p.pos.replace(',', '/') + '</span><span class="tag">' + p.age + '岁</span><span class="tag club">' + r.c.short + '</span></div>' +
        gk +
        '<div class="bars">' + bars + '</div>' +
        '<div class="p-val"><span>' + fmtM(p.val) + '</span><em>' + (afford ? '点击签下 ↓' : '超出预算') + '</em></div>' +
        '</div>';
    }).join('') || '<p class="hint">没有符合条件的球员。</p>';
    $('playerGrid').querySelectorAll('.pcard').forEach(function (el) {
      el.onclick = function () { signPlayer(el.getAttribute('data-uid')); };
    });
  }
  function signPlayer(uid) {
    var p = uidPlayer(uid);
    if (!p) return;
    if (spent() + p.val > App.budget) { toast('预算不足！还剩 ' + fmtM(App.budget - spent())); return; }
    var clubId = uidClub(uid);
    var left = clubAvailable(clubId).length - 1;
    if (left < 13) { toast(clubId + ' 阵容将被挖到不足 13 人，转会委员会拒绝了这笔交易！'); return; }
    App.signed.push(uid);
    toast('✅ 签下 ' + p.name + '（' + fmtM(p.val) + '）——他将从原俱乐部除名');
    renderGrid(); renderSquad(); updateBudgetChip(); saveGame();
  }
  function removePlayer(uid) {
    App.signed = App.signed.filter(function (u) { return u !== uid; });
    renderGrid(); renderSquad(); updateBudgetChip(); saveGame();
  }
  function renderSquad() {
    var n = squadCounts(), remain = App.budget - spent();
    $('squadCount').textContent = '(' + App.signed.length + '人)';
    $('budgetFill').style.width = Math.min(100, spent() / App.budget * 100) + '%';
    $('budgetFill').className = spent() > App.budget ? 'over' : '';
    $('budgetText').textContent = '已花费 ' + fmtM(spent()) + '，剩余 ' + fmtM(remain);
    $('squadList').innerHTML = mySquad().map(function (p) {
      return '<div class="squad-item"><span class="pos">' + p.pos.split(',')[0] + '</span><span class="nm">' + esc(p.name) + '</span><span class="cl">' + DATA.findClub(uidClub(p.__uid)).short + '</span><span class="vl">' + fmtM(p.val) + '</span><button class="rm" data-uid="' + p.__uid + '" title="出售">✕</button></div>';
    }).join('');
    $('squadList').querySelectorAll('.rm').forEach(function (b) { b.onclick = function () { removePlayer(b.getAttribute('data-uid')); }; });
    var checks = [
      { ok: App.signed.length >= 16 && App.signed.length <= 23, t: '总人数 16-23 人（当前 ' + App.signed.length + '）' },
      { ok: n.GK >= 2, t: '门将 ≥ 2（当前 ' + n.GK + '）' },
      { ok: n.DF >= 5, t: '后卫 ≥ 5（当前 ' + n.DF + '）' },
      { ok: n.MF >= 4, t: '中场 ≥ 4（当前 ' + n.MF + '）' },
      { ok: n.FW >= 2, t: '前锋 ≥ 2（当前 ' + n.FW + '）' },
      { ok: spent() <= App.budget, t: '预算内（剩余 ' + fmtM(remain) + '）' }
    ];
    $('squadCheck').innerHTML = checks.map(function (c) { return '<div class="' + (c.ok ? 'ok' : 'no') + '">' + (c.ok ? '✔' : '✘') + ' ' + c.t + '</div>'; }).join('');
    $('btnToOpponent').disabled = !squadValid();
  }

  /* ---------------- 选择对手 ---------------- */
  function styleDesc(style) {
    var m = ['摆大巴', '防守反击', '谨慎控场', '均衡', '主动压制', '全攻全守', '全员压上'][style.mentality];
    var pr = ['松散逼抢', '标准逼抢', '高强度逼抢', '疯抢'][style.press];
    return TAC.findFormation(style.formation).name + ' · ' + m + ' · ' + pr + (style.counter ? ' · 偷家反击' : '') + (style.gegen ? ' · 就地反抢' : '');
  }
  function clubStrength(c) {
    var avail = clubAvailable(c.id);
    var top = avail.map(function (p) { return TAC.overallOf(p); }).sort(function (a, b) { return b - a; }).slice(0, 14);
    return top.length ? Math.round(top.reduce(function (s, v) { return s + v; }, 0) / top.length) : 0;
  }
  function renderOpponents() {
    var grid = $('clubGrid');
    grid.innerHTML = DATA.CLUBS.map(function (c) {
      var str = clubStrength(c);
      var stars = Math.max(1, Math.min(5, Math.round((str - 58) / 5)));
      var stolen = c.players.length - clubAvailable(c.id).length;
      return '<div class="ccard" data-id="' + c.id + '">' +
        '<div class="c-head"><div class="c-badge" style="background:' + c.color + '">' + c.id + '</div>' +
        '<div><div class="c-name">' + c.name + '</div><div class="c-en">' + (DATA.EN_NAMES[c.id] || '') + '</div></div></div>' +
        '<div class="c-str">阵容强度 <b>' + str + '</b>' + (stolen ? ' · <span style="color:#ff9b9e">已被你挖走 ' + stolen + ' 人</span>' : '') + '</div>' +
        '<div class="c-style">' + styleDesc(c.style) + '</div>' +
        '<div class="c-stars">难度 <span class="st">' + '★'.repeat(stars) + '☆'.repeat(5 - stars) + '</span></div>' +
        '</div>';
    }).join('');
    grid.querySelectorAll('.ccard').forEach(function (el) {
      el.onclick = function () {
        App.opponent = DATA.findClub(el.getAttribute('data-id'));
        App.myHome = true; /* 单场邀请赛固定主场；赛季主客由赛程决定 */
        /* 战术保护（共识 B1）：已有战术就原样保留，绝不静默重置 */
        if (!App.tactic) {
          App.tactic = TAC.emptyTactic('4-2-3-1');
        }
        /* 全空首发兜底（R2 玩家 P2）：战术存在但一个球员都没排 → 自动排兵一次 */
        if (App.tactic.slots.every(function (s) { return !s.playerId; })) {
          App.tactic = TAC.autoPickXI(App.tactic.formation || '4-2-3-1', availSquad());
        }
        if (!TAC.findFormation(App.tactic.formation)) App.tactic.formation = '4-2-3-1';
        App.reuseTactic = false;
        autoBench();
        toast('对手已选定：' + App.opponent.name);
        renderLineup();
        showScreen('lineup');
      };
    });
  }

  /* ---------------- 首发与阵型 ---------------- */
  /* 换阵型做槽位迁移（共识 B1）：同 code+zone 优先搬人，其次同 zone，玩家排布不丢 */
  function changeFormation(formationId) {
    var old = App.tactic;
    var nu = TAC.emptyTactic(formationId);
    var used = {};
    nu.slots.forEach(function (sl, i) {
      var best = -1, bestFit = -1;
      old.slots.forEach(function (osl, j) {
        if (used[j] || !osl.playerId) return;
        var fit = (osl.code === sl.code && osl.zone === sl.zone) ? 3 : (osl.zone === sl.zone ? 2 : 0);
        if (fit > bestFit) { bestFit = fit; best = j; }
      });
      if (best >= 0 && bestFit > 0) {
        used[best] = 1;
        var osl = old.slots[best];
        sl.playerId = osl.playerId;
        sl.role = TAC.rolesForZone(sl.zone).some(function (r) { return r.id === osl.role; }) ? osl.role : sl.role;
        sl.duty = osl.duty || sl.duty;
      }
    });
    if (old.instr) nu.instr = old.instr;
    if (old.setPiece) nu.setPiece = old.setPiece;
    if (old.captain != null) nu.captain = old.captain;
    App.tactic = nu;
    App.selSlot = -1;
  }
  /* autoBench 只补缺（共识 B1）：手动选择的替补不再被整体重置；伤员不入替补席 */
  function autoBench() {
    var xi = {};
    App.tactic.slots.forEach(function (s) { if (s.playerId) xi[s.playerId] = 1; });
    var kept = App.benchUids.filter(function (uid) {
      var p = uidPlayer(uid);
      return p && !xi[uid] && !isOutNow(uid);
    });
    if (kept.length >= 9) { App.benchUids = kept.slice(0, 9); return; }
    var have = xi;
    kept.forEach(function (u) { have[u] = 1; });
    var extra = availSquad().filter(function (p) { return !have[p.__uid]; })
      .sort(function (a, b) { return TAC.overallOf(b) - TAC.overallOf(a); })
      .slice(0, 9 - kept.length).map(function (p) { return p.__uid; });
    App.benchUids = kept.concat(extra);
  }
  function fitLabel(fit) {
    return fit >= 0.98 ? '<span class="fit fit0">天然位置</span>' : fit >= 0.88 ? '<span class="fit fit1">可客串</span>' : fit >= 0.75 ? '<span class="fit fit2">勉强</span>' : '<span class="fit fit3">不擅长</span>';
  }
  function renderLineup() {
    var fs = $('formationSelect');
    fs.innerHTML = TAC.FORMATIONS.map(function (f) { return '<option value="' + f.id + '"' + (f.id === App.tactic.formation ? ' selected' : '') + '>' + f.name + ' — ' + f.desc + '</option>'; }).join('');
    drawStaticPitch($('lineupPitch'), App.tactic, mySquad());
    var slotsHtml = App.tactic.slots.map(function (sl, i) {
      var p = sl.playerId ? uidPlayer(sl.playerId) : null;
      var fit = p ? TAC.slotFit(p, sl, sl.role) : 0;
      return '<div class="slot-row' + (p ? '' : ' empty') + '" data-i="' + i + '">' +
        '<span class="pos">' + sl.code + '</span>' +
        '<span class="nm">' + (p ? esc(p.name) : '—— 空缺，点击安排 ——') + '</span>' +
        '<span>' + TAC.findRole(sl.role).name + '·' + ({ D: '防', S: '衡', A: '攻' }[sl.duty]) + '</span>' +
        (p ? fitLabel(fit) : '') + '</div>';
    }).join('');
    $('slotDetail').innerHTML = slotsHtml;
    $('slotDetail').querySelectorAll('.slot-row').forEach(function (el) {
      el.onclick = function () { pickSlotPlayer(+el.getAttribute('data-i')); };
    });
    var xi = {};
    App.tactic.slots.forEach(function (s) { if (s.playerId) xi[s.playerId] = 1; });
    var rest = mySquad().filter(function (p) { return !xi[p.__uid]; })
      .sort(function (a, b) { return TAC.overallOf(b) - TAC.overallOf(a); });
    $('benchList').innerHTML = rest.map(function (p) {
      var inBench = App.benchUids.indexOf(p.__uid) >= 0;
      var out = isOutNow(p.__uid);
      var freshV = (App.season && App.season.fresh) ? App.season.fresh[p.__uid] : null;
      var tags = out
        ? ' <span style="color:var(--danger);font-size:10.5px">🩹 缺阵（还差 ' + ((injMap()[p.__uid] || 0) - App.season.round) + ' 轮）</span>'
        : (freshV != null && freshV < 85 ? ' <span style="color:#e08842;font-size:10.5px">⚡体能 ' + freshV + '</span>' : '');
      return '<div class="slot-row' + (out ? ' injured' : '') + '" data-uid="' + p.__uid + '"><span class="pos">' + p.pos.split(',')[0] + '</span><span class="nm">' + esc(p.name) + ' <small style="color:#5b6b82">' + TAC.overallOf(p) + '</small>' + tags + '</span><button class="btn small ' + (inBench ? 'active' : '') + '"' + (out ? ' disabled' : '') + '>' + (out ? '伤缺' : inBench ? '替补 ✓' : '入替') + '</button></div>';
    }).join('');
    $('benchList').querySelectorAll('.slot-row').forEach(function (el) {
      el.onclick = function () {
        var uid = el.getAttribute('data-uid');
        if (isOutNow(uid)) { toast('这名球员还在伤病名单上'); return; }
        var i = App.benchUids.indexOf(uid);
        if (i >= 0) App.benchUids.splice(i, 1);
        else {
          if (App.benchUids.length >= 9) { toast('替补席最多 9 人'); return; }
          App.benchUids.push(uid);
        }
        renderLineup();
      };
    });
    renderOppIntel();
  }
  function pickSlotPlayer(i) {
    var sl = App.tactic.slots[i];
    var xi = {};
    App.tactic.slots.forEach(function (s) { if (s.playerId) xi[s.playerId] = 1; });
    var cands = availSquad().filter(function (p) { return !xi[p.__uid] || p.__uid === sl.playerId; })
      .map(function (p) { return { p: p, fit: TAC.slotFit(p, sl, sl.role) }; })
      .sort(function (a, b) { return (b.fit * 100 + TAC.overallOf(b.p)) - (a.fit * 100 + TAC.overallOf(a.p)); });
    var html = '<div class="sub-h">选择 ' + sl.code + '（' + TAC.findRole(sl.role).name + '）的球员：</div>';
    html += '<div style="max-height:46vh;overflow-y:auto">' + cands.map(function (c) {
      return '<div class="slot-row" data-uid="' + c.p.__uid + '"><span class="pos">' + c.p.pos.split(',')[0] + '</span><span class="nm">' + esc(c.p.name) + '</span>' + fitLabel(c.fit) + '<span style="color:#5b6b82;font-size:11px">' + TAC.overallOf(c.p) + '</span></div>';
    }).join('') + '</div><button class="btn small" id="btnClearSlot" style="margin-top:8px">清空该位置</button>';
    $('slotDetail').innerHTML = html;
    $('slotDetail').querySelectorAll('.slot-row').forEach(function (el) {
      el.onclick = function () {
        sl.playerId = el.getAttribute('data-uid');
        App.tactic.slots[i] = sl;
        autoBench(); renderLineup();
      };
    });
    var clr = $('btnClearSlot');
    if (clr) clr.onclick = function () { sl.playerId = null; renderLineup(); };
  }
  function renderOppIntel() {
    if (!App.opponent) return;
    var opp = App.opponent;
    var avail = clubAvailable(opp.id);
    var fwCount = avail.filter(function (p) { return DATA.posClass(p.pos) === 'FW'; }).length;
    var otac = TAC.autoPickXI(opp.style.formation, avail);
    var names = otac.slots.map(function (sl) {
      var p = sl.playerId ? avail.filter(function (x) { return x.__uid === sl.playerId; })[0] : null;
      return sl.code + ' ' + (p ? p.name : '—');
    });
    var warn = fwCount < 2 ? '<p class="adv warn" style="margin:8px 0">⚠ ' + esc(opp.name) + ' 锋线已被你挖空（仅 ' + fwCount + ' 名前锋）——对方教练将被迫收缩防线、调低心态。</p>' : '';
    var gr = SEA.grudgeFor(mySquad(), opp.id);
    if (gr.count >= 2) warn += '<p class="adv warn" style="margin:8px 0">🧨 ' + esc(SEA.grudgeLine(opp.name, gr.names)) + '</p>';
    $('oppIntel').innerHTML = warn +
      '<p style="font-size:12.5px;line-height:1.8">' + opp.name + ' 预计首发（' + TAC.findFormation(opp.style.formation).name + '）：<br>' +
      names.map(esc).join(' · ') + '</p><p class="hint">' + styleDesc(opp.style) + '。对方教练会根据比分临场调整。</p>';
  }
  function drawStaticPitch(cv, tactic, squad) {
    var ctx = cv.getContext('2d');
    var W = cv.width, H = cv.height, pad = 20;
    var fx = function (x) { return pad + x / 100 * (W - pad * 2); };
    var fy = function (y) { return pad + y / 100 * (H - pad * 2); };
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1e7a34'); g.addColorStop(1, '#156228');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(fx(0), fy(0), fx(100) - fx(0), fy(100) - fy(0));
    ctx.beginPath(); ctx.moveTo(fx(50), fy(0)); ctx.lineTo(fx(50), fy(100)); ctx.stroke();
    ctx.beginPath(); ctx.arc(fx(50), fy(50), (W - pad * 2) * 0.09, 0, Math.PI * 2); ctx.stroke();
    [[0, 1], [100, -1]].forEach(function (e) {
      var boxW = 16.5 / 105 * 100, boxH = 40.3 / 68 * 100;
      ctx.strokeRect(fx(e[0]), fy(50 - boxH / 2), e[1] * (boxW / 100) * (W - pad * 2), (boxH / 100) * (H - pad * 2));
    });
    tactic.slots.forEach(function (sl, i) {
      var p = sl.playerId ? squad.filter(function (x) { return x.__uid === sl.playerId; })[0] : null;
      var x = fx(sl.x), y = fy(sl.y);
      ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(18,24,34,.92)'; ctx.fill();
      ctx.lineWidth = 2;
      var fit = p ? TAC.slotFit(p, sl, sl.role) : 0;
      ctx.strokeStyle = !p ? '#e5484d' : fit >= 0.98 ? MY_COLOR : fit >= 0.88 ? '#f4b942' : '#e08842';
      ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(sl.code, x, y - 3);
      ctx.font = '9px sans-serif'; ctx.fillStyle = '#aebccb';
      ctx.fillText(p ? p.name.slice(0, 5) : '空缺', x, y + 8);
      ctx.font = '8.5px sans-serif'; ctx.fillStyle = '#f4b942';
      ctx.fillText(TAC.findRole(sl.role).name, x, y + 26 > H - 8 ? y - 24 : y + 26);
    });
  }

  /* ---------------- 战术板 ---------------- */
  function renderTacticScreen() {
    var fs = $('tacticFormation');
    fs.innerHTML = TAC.FORMATIONS.map(function (f) { return '<option value="' + f.id + '"' + (f.id === App.tactic.formation ? ' selected' : '') + '>' + f.name + '</option>'; }).join('');
    renderInstr(); renderToggles(); renderSetPieces(); renderTokens(); renderAdvice(); renderPresets();
  }
  function renderInstr() {
    var grid = $('instrGrid');
    grid.innerHTML = Object.keys(TAC.INSTR).filter(function (k) { return !TAC.INSTR[k].legacy; }).map(function (k) {
      var cfg = TAC.INSTR[k];
      var cur = App.tactic.instr[k];
      return '<div class="instr-item"><label>' + cfg.name + '</label><select data-k="' + k + '">' +
        cfg.opts.map(function (o, i) {
          var val = cfg.values ? cfg.values[i] : i;
          return '<option value="' + i + '"' + (val === cur ? ' selected' : '') + '>' + o + '</option>';
        }).join('') +
        '</select></div>';
    }).join('');
    grid.querySelectorAll('select').forEach(function (s) {
      s.onchange = function () {
        var k = s.getAttribute('data-k');
        var cfg = TAC.INSTR[k];
        /* focus 等字符串型指令写入规范值（balanced/left/middle/right/flanks），其余写索引 */
        App.tactic.instr[k] = cfg.values ? cfg.values[+s.value] : +s.value;
        renderAdvice(); saveGame();
      };
    });
  }
  function renderToggles() {
    var grid = $('toggleGrid');
    grid.innerHTML = TAC.TOGGLES.map(function (t) {
      var on = !!App.tactic.instr[t.id];
      return '<div class="tg' + (on ? ' on' : '') + '" data-k="' + t.id + '"><span class="sw"></span><span>' + t.name + '<small>' + t.desc + '</small></span></div>';
    }).join('');
    grid.querySelectorAll('.tg').forEach(function (el) {
      el.onclick = function () {
        var k = el.getAttribute('data-k');
        App.tactic.instr[k] = App.tactic.instr[k] ? 0 : 1;
        el.classList.toggle('on');
        renderAdvice(); saveGame();
      };
    });
  }
  function renderSetPieces() {
    var xiNames = App.tactic.slots.map(function (sl, i) {
      var p = sl.playerId ? uidPlayer(sl.playerId) : null;
      return p ? { uid: sl.playerId, name: p.name + '（' + sl.code + '）' } : null;
    }).filter(Boolean);
    var sp = App.tactic.setPiece;
    var mk = function (key, label) {
      return '<div class="instr-item"><label>' + label + '</label><select data-sp="' + key + '"><option value="">自动</option>' +
        xiNames.map(function (n) { return '<option value="' + n.uid + '"' + (sp[key] === n.uid ? ' selected' : '') + '>' + esc(n.name) + '</option>'; }).join('') + '</select></div>';
    };
    $('setPieceGrid').innerHTML = mk('corner', '角球主罚') + mk('fk', '任意球主罚') + mk('pen', '点球主罚') +
      '<div class="instr-item"><label>队长（未指定点球手时由队长主罚）</label><select data-sp="captain"><option value="">无</option>' +
      xiNames.map(function (n) { return '<option value="' + n.uid + '"' + (App.tactic.captain === n.uid ? ' selected' : '') + '>' + esc(n.name) + '</option>'; }).join('') + '</select></div>';
    $('setPieceGrid').querySelectorAll('select').forEach(function (s) {
      s.onchange = function () {
        var k = s.getAttribute('data-sp');
        if (k === 'captain') App.tactic.captain = s.value || null;
        else App.tactic.setPiece[k] = s.value || null;
        saveGame();
      };
    });
  }
  function renderTokens() {
    var wrap = $('tacticPitch');
    var box = $('tacticTokens');
    box.innerHTML = '';
    var squad = mySquad();
    var canvas = $('tacticPitchCv');
    drawStaticPitch(canvas, App.tactic, squad);
    App.tactic.slots.forEach(function (sl, i) {
      var p = sl.playerId ? squad.filter(function (x) { return x.__uid === sl.playerId; })[0] : null;
      var fit = p ? TAC.slotFit(p, sl, sl.role) : 1;
      var el = document.createElement('div');
      el.className = 'token' + (App.selSlot === i ? ' sel' : '') + (fit < 0.88 ? (fit < 0.75 ? ' fit3' : ' fit2') : '');
      el.style.left = sl.x + '%'; el.style.top = sl.y + '%';
      el.setAttribute('data-i', i);
      el.innerHTML = '<div class="t-code">' + sl.code + '</div>' +
        '<div class="t-name">' + (p ? esc(p.name) : '空缺') + '</div>' +
        '<div class="t-role">' + TAC.findRole(sl.role).name + '·' + ({ D: '防', S: '衡', A: '攻' }[sl.duty]) + '</div>' +
        (p && fit < 0.88 ? '<div class="t-fit">' + (fit < 0.75 ? '位置不适' : '客串') + '</div>' : '');
      box.appendChild(el);
      attachDrag(el, i);
      el.addEventListener('click', function (e) {
        if (el.__moved) { el.__moved = false; return; }
        App.selSlot = i;
        renderSlotPanel(i); renderTokens();
      });
    });
  }
  function attachDrag(el, i) {
    var wrap = $('tacticPitch');
    var startX, startY, origX, origY, dragging = false, moved = false;
    el.addEventListener('pointerdown', function (e) {
      dragging = true; moved = false;
      startX = e.clientX; startY = e.clientY;
      origX = App.tactic.slots[i].x; origY = App.tactic.slots[i].y;
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var r = wrap.getBoundingClientRect();
      var dx = (e.clientX - startX) / r.width * 100;
      var dy = (e.clientY - startY) / r.height * 100;
      if (Math.abs(dx) + Math.abs(dy) > 0.6) moved = true;
      var sl = App.tactic.slots[i];
      sl.x = Math.max(6, Math.min(92, origX + dx));
      sl.y = Math.max(4, Math.min(96, origY + dy));
      if (sl.zone === 'GK') { sl.x = 4; sl.y = 50; }
      el.style.left = sl.x + '%'; el.style.top = sl.y + '%';
    });
    el.addEventListener('pointerup', function () {
      dragging = false;
      if (moved) {
        el.__moved = true;
        drawStaticPitch($('tacticPitchCv'), App.tactic, mySquad());
        renderSlotPanel(App.selSlot === i ? i : App.selSlot);
        renderAdvice(); saveGame();
      }
    });
  }
  function renderSlotPanel(i) {
    if (i < 0) { $('tacticSlotDetail').innerHTML = '<p class="hint">点击场上球员token进行配置</p>'; return; }
    var sl = App.tactic.slots[i];
    var p = sl.playerId ? uidPlayer(sl.playerId) : null;
    var roles = TAC.rolesForZone(sl.zone);
    var fit = p ? TAC.slotFit(p, sl, sl.role) : 0;
    $('tacticSlotDetail').innerHTML =
      '<p style="margin-bottom:8px"><b>' + sl.code + '</b> · ' + (p ? esc(p.name) : '<span style="color:var(--danger)">空缺</span>') +
      (p ? ' <span style="color:#5b6b82;font-size:12px">' + p.pos + ' · ' + p.age + '岁 · ' + fmtM(p.val) + '</span>' : '') + '</p>' +
      (p ? '<p style="font-size:12px;margin-bottom:8px">位置契合：' + fitLabel(fit) + '（' + Math.round(fit * 100) + '% 影响发挥）</p>' : '') +
      '<div class="instr-item"><label>角色（' + roles.length + ' 种可选）</label><select id="roleSel">' +
      roles.map(function (r) { return '<option value="' + r.id + '"' + (r.id === sl.role ? ' selected' : '') + '>' + r.name + (r.desc ? ' — ' + r.desc : '') + '</option>'; }).join('') + '</select></div>' +
      '<div class="instr-item" style="margin-top:8px"><label>职责</label><div style="display:flex;gap:6px">' +
      TAC.DUTIES.map(function (d) {
        return '<button class="btn small' + (d.id === sl.duty ? ' active' : '') + '" data-duty="' + d.id + '">' + d.name + '</button>';
      }).join('') + '</div></div>';
    $('roleSel').onchange = function () {
      sl.role = $('roleSel').value;
      renderTokens(); renderAdvice(); saveGame();
    };
    document.querySelectorAll('#tacticSlotDetail [data-duty]').forEach(function (b) {
      b.onclick = function () {
        sl.duty = b.getAttribute('data-duty');
        renderSlotPanel(i); renderTokens(); renderAdvice(); saveGame();
      };
    });
  }
  function renderAdvice() {
    var out = [];
    if (App.opponent) {
      out = TAC.tacticAdvice(App.tactic, mySquad(), TAC.oppProfile(App.opponent));
    } else {
      out = TAC.tacticAdvice(App.tactic, mySquad(), null);
    }
    var xiFilled = App.tactic.slots.every(function (s) { return s.playerId; });
    var html = out.map(function (a) { return '<div class="adv ' + a.level + '">' + (a.level === 'warn' ? '⚠ ' : 'ℹ ') + esc(a.text) + '</div>'; }).join('');
    html += xiFilled
      ? '<div class="adv good">✔ 首发齐整，指令结构完整，可以出征。</div>'
      : '<div class="adv warn">⚠ 首发还有空缺位置。</div>';
    $('adviceList').innerHTML = html;
  }
  function renderPresets() {
    var presets = [];
    try { presets = JSON.parse(localStorage.getItem(PRESET_KEY) || '[]'); } catch (e) { }
    $('presetSelect').innerHTML = '<option value="">载入预设…</option>' + presets.map(function (p, i) {
      return '<option value="' + i + '">' + esc(p.name) + '（' + p.tactic.formation + '）</option>';
    }).join('');
    $('presetSelect').onchange = function () {
      var v = $('presetSelect').value;
      if (v === '') return;
      var p = presets[+v];
      var keepPlayers = App.tactic.slots.map(function (s) { return s.playerId; });
      App.tactic = TAC.cloneTactic(p.tactic);
      /* 球员按原顺序尽量保留 */
      App.tactic.slots.forEach(function (s, i) { s.playerId = keepPlayers[i] || null; });
      App.selSlot = -1;
      renderTacticScreen();
      toast('已载入预设：' + p.name);
    };
  }

  /* ---------------- 比赛 ---------------- */
  /* 挖空响应最低配（共识 B8）：对手锋线被挖空 → 官方战术自动收缩一档 */
  function applyIntelShrink(otac, avail) {
    var fwCount = avail.filter(function (p) { return DATA.posClass(p.pos) === 'FW'; }).length;
    if (fwCount < 2) {
      otac.instr.mentality = Math.max(0, otac.instr.mentality - 1);
      otac.instr.line = Math.max(0, otac.instr.line - 1);
      return true;
    }
    return false;
  }
  function buildMatch() {
    /* 玩家（引擎侧 0 恒为我；homeAdvSide 决定主场优势归属） */
    var squad = mySquad();
    var me = { name: App.teamName, clubId: null, tactic: App.tactic, squad: squad, benchUids: App.benchUids, ai: false };
    if (App.season && !App.season.done && App.season.fresh) me.fresh = App.season.fresh; /* 体能延续（轮换压力） */
    /* 对手 */
    var avail = clubAvailable(App.opponent.id);
    var otac = TAC.autoPickXI(App.opponent.style.formation, avail);
    otac.instr = TAC.tacticFromStyle(App.opponent.style).instr;
    applyIntelShrink(otac, avail);
    /* 挖空恩怨（v0.3）：挖走 ≥2 人 → 官方战术怒气强化（走既有指令通道） */
    var gr = SEA.grudgeFor(squad, App.opponent.id);
    App.lastGrudge = SEA.applyGrudge(otac, gr.count) ? gr : null;
    var aiTeam = { name: App.opponent.name, clubId: App.opponent.id, tactic: otac, squad: avail, ai: true };
    /* Seed 对决（v0.3）：留空随机；同 seed 同战术 = 同一场比赛（一次性语义，用后即清） */
    var seedIn = (($('seedInput') && $('seedInput').value) || '').trim();
    if ($('seedInput')) $('seedInput').value = '';
    var seed = seedIn ? (isFinite(+seedIn) ? (Math.abs(+seedIn | 0) || 1) : strHash(seedIn)) : ((Date.now() % 1000000000) + Math.floor(Math.random() * 999));
    App.matchSeedUsed = seed;
    App.actionLog = [];
    App.tickCount = 0;
    App.personaN = {}; App.lastPersonaMin = -10;
    App.match = ENG.createMatch({ home: me, away: aiTeam, seed: seed, homeAdvSide: App.myHome ? 0 : 1 });
    App.paused = true; App.speed = 2; App.smartHold = 0;
    renderMatchShell();
    startTimer();
  }
  function renderMatchShell() {
    var m = App.match;
    $('sbHome').innerHTML = '<div class="sb-badge" style="background:' + MY_COLOR + '">我</div><span>' + esc(App.teamName) + '</span><span class="venue-tag' + (App.myHome ? '' : ' away') + '">' + (App.myHome ? '主' : '客') + '</span>';
    $('sbAway').innerHTML = '<span class="venue-tag' + (App.myHome ? ' away' : '') + '">' + (App.myHome ? '客' : '主') + '</span><span>' + esc(App.opponent.name) + '</span><div class="sb-badge" style="background:' + App.opponent.color + '">' + App.opponent.id + '</div>';
    $('sbScore').textContent = '0 - 0';
    $('sbClock').textContent = "00'";
    $('feed').innerHTML = '';
    pushFeed({ min: 0, type: 'info', text: '比赛日！' + App.teamName + '（你）' + (App.myHome ? '在主场' : '客场') + '迎战 ' + App.opponent.name + '。开球！' }, true);
    if (App.lastGrudge) pushFeed({ min: 0, type: 'info', text: '🧨 ' + SEA.grudgeLine(App.opponent.name, App.lastGrudge.names) }, true);
    renderPersonaSel();
    PITCH.init($('matchPitch'), MY_COLOR, App.opponent.color);
    if (m.frames.length) PITCH.applyFrame(m.frames[m.frames.length - 1]);
    updateLiveStats();
    renderSubsPanel(); renderLiveTactic('liveTacticPanel', 'mt_');
    setSpeed(App.speed);
    syncSpeedUI();
    $('btnPause').textContent = '⏸ 暂停';
  }
  function renderPersonaSel() {
    var sel = $('personaSel');
    if (!sel) return;
    sel.innerHTML = SEA.PERSONAS.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === App.persona ? ' selected' : '') + '>' + p.name + '</option>';
    }).join('');
  }
  function pushFeed(ev, top) {
    var feed = $('feed');
    var d = document.createElement('div');
    d.className = 'fitem ' + (ev.type || '');
    d.innerHTML = '<span class="fm">' + (ev.min ? ev.min + "'" : '') + '</span><span>' + esc(ev.text) + '</span>';
    if (top) feed.insertBefore(d, feed.firstChild);
    else {
      var clock = ev.min;
      var ref = feed.querySelector('.fitem');
      /* 顺序插入：找到最后一个 min <= ev.min 的元素之后 */
      var items = feed.querySelectorAll('.fitem');
      var inserted = false;
      for (var i = 0; i < items.length; i++) {
        var im = items[i].querySelector('.fm').textContent;
        var n = parseInt(im) || 0;
        if (n > clock) { feed.insertBefore(d, items[i]); inserted = true; break; }
      }
      if (!inserted) feed.appendChild(d);
    }
    if (feed.children.length > 120) feed.removeChild(feed.children[feed.children.length - 1]);
    feed.scrollTop = feed.scrollHeight; /* 解说流自动滚到最新事件 */
  }
  function setSpeed(sp) {
    App.speed = sp;
    if (App.timer) { clearTimeout(App.timer); App.timer = null; }
    if (!App.paused) startTimer();
  }
  function syncSpeedUI() {
    document.querySelectorAll('#speedGroup .btn').forEach(function (b) {
      b.classList.toggle('active', +b.getAttribute('data-speed') === App.speed);
    });
  }
  function speedInterval() {
    return Math.round(1500 / App.speed);
  }
  function startTimer() {
    App.paused = false;
    if (App.timer) { clearTimeout(App.timer); App.timer = null; }
    scheduleTick();
    $('btnPause').textContent = '⏸ 暂停';
  }
  /* 智能节奏（共识 B5）：无事件快进，射门/进球/红黄牌放慢两拍，带开关 */
  function scheduleTick() {
    if (App.timer) clearTimeout(App.timer);
    var delay = speedInterval();
    if (App.smart && App.smartHold > 0) {
      delay = Math.max(delay, 1500);
      App.smartHold--;
    }
    App.timer = setTimeout(function () { App.timer = null; tickMinute(); if (!App.paused && App.match && !App.match.finished) scheduleTick(); }, delay);
  }
  function pauseTimer() {
    App.paused = true;
    if (App.timer) { clearTimeout(App.timer); App.timer = null; }
    $('btnPause').textContent = '▶ 继续';
  }
  var NOTABLE_HARD = { goal: 1, pen: 1, red: 1 };   /* 大事件：全量慢放 */
  var NOTABLE_SOFT = { save: 1, miss: 1, yellow: 1, sub: 1, injury: 1 }; /* 小事件：轻缓 */
  function tickMinute() {
    var m = App.match;
    if (!m || m.finished) { pauseTimer(); return; }
    App.tickCount++;
    var beforeEvents = m.events.length;
    var prevHalf = m.half;
    ENG.stepMinute(m);
    var notable = 0;
    var scoreTxt = function () { return m.score[0] + ' - ' + m.score[1]; };
    for (var i = beforeEvents; i < m.events.length; i++) {
      var ev = m.events[i];
      if (ev.type === 'goal') {
        pushFeed(ev); notable = 2; bounceScore();
        /* 解说人格：进球必评（呈现层弹幕，viewRng 随机源） */
        personaSay(ev.team === 0 ? 'goal' : 'oppGoal', { A: ev.who || '', S: scoreTxt() });
        App.lastPersonaMin = m.minute;
      }
      else if (['save', 'miss', 'yellow', 'red', 'sub', 'info', 'offside', 'pen', 'ht', 'ft', 'injury'].indexOf(ev.type) >= 0) {
        pushFeed(ev);
        if (NOTABLE_HARD[ev.type]) notable = 2;
        else if (NOTABLE_SOFT[ev.type] && notable < 1) notable = 1;
        if (ev.type === 'save' && personaGate(4, 0.4)) personaSay('save', { A: ev.who || '' });
        else if (ev.type === 'red' && personaGate(2, 0.9)) personaSay('red', { A: ev.who || '' });
        else if (ev.type === 'injury' && personaGate(2, 0.8)) personaSay('injury', { A: ev.who || '' });
      }
    }
    if (App.smart) {
      if (notable === 2) App.smartHold = 3;      /* 进球/点球/红牌：慢放三拍（≈2.5s） */
      else if (notable === 1) App.smartHold = Math.max(App.smartHold, 1);
    }
    $('sbScore').textContent = m.score[0] + ' - ' + m.score[1];
    /* 时钟：上半场补时显示 45+X，下半场补时显示 90+X */
    var dm = ENG.displayMin(m);
    $('sbClock').textContent = (m.half === 1 && m.minute > 45) ? "45+'" + (m.minute - 45) : (m.minute > 90 ? "90+'" + (m.minute - 90) : dm + "'");
    if (m.frames.length) PITCH.applyFrame(m.frames[m.frames.length - 1]);
    updateLiveStats();
    if (App.stage === 'match') {
      if (!$('tab-subs').classList.contains('active')) { /* 省性能 */ } else renderSubsPanel();
    }
    saveGame();
    if (prevHalf === 1 && m.half === 2 && !m.finished) {
      pauseTimer();
      showHT();
    }
    if (m.finished) {
      pauseTimer();
      showFT();
    }
  }
  /* 续打后恢复记分牌/时钟/解说流（R3-6） */
  var FEEDABLE = ['goal', 'save', 'miss', 'yellow', 'red', 'sub', 'info', 'offside', 'pen', 'ht', 'ft', 'injury'];
  function restoreMatchUI() {
    var m = App.match;
    $('sbScore').textContent = m.score[0] + ' - ' + m.score[1];
    var dm = ENG.displayMin(m);
    $('sbClock').textContent = (m.half === 1 && m.minute > 45) ? "45+'" + (m.minute - 45) : (m.minute > 90 ? "90+'" + (m.minute - 90) : dm + "'");
    m.events.forEach(function (ev) { if (FEEDABLE.indexOf(ev.type) >= 0) pushFeed(ev); });
    updateLiveStats();
  }
  function bounceScore() {
    var el = $('sbScore');
    el.classList.remove('bounce');
    void el.offsetWidth; /* 重置动画 */
    el.classList.add('bounce');
  }
  function statRow(label, h, a, pct) {
    var total = (h + a) || 1;
    var hp = pct ? Math.round(h / total * 100) : Math.min(100, h / Math.max(h, a, 1) * 100);
    return '<div class="stat-row"><span class="sv h">' + h + '</span><span class="sn">' + label + '</span><span class="sv a">' + a + '</span></div>' +
      (pct ? '<div class="stat-bar"><i style="width:' + hp + '%"></i><i class="aw" style="width:' + (100 - hp) + '%"></i></div>' : '');
  }
  function statTableHtml(m) {
    var s0 = m.stats[0], s1 = m.stats[1];
    var poss0 = m.poss[0] + m.poss[1] ? Math.round(m.poss[0] / (m.poss[0] + m.poss[1]) * 100) : 50;
    var rows = [
      ['控球%', poss0, 100 - poss0, true],
      ['射门', s0.shots, s1.shots],
      ['射正', s0.sot, s1.sot],
      ['xG（预期进球）', Math.round(s0.xg * 10) / 10, Math.round(s1.xg * 10) / 10],
      ['绝佳机会', s0.bigChances, s1.bigChances],
      ['反击次数', s0.counters, s1.counters],
      ['传中射门', s0.crossShots, s1.crossShots],
      ['角球', s0.corners, s1.corners],
      ['犯规', s0.fouls, s1.fouls],
      ['黄牌', s0.yellow, s1.yellow],
      ['红牌', s0.red, s1.red],
      ['越位', s0.offsides, s1.offsides],
      ['传球成功率%', s0.passAtt ? Math.round(s0.passOk / s0.passAtt * 100) : 0, s1.passAtt ? Math.round(s1.passOk / s1.passAtt * 100) : 0]
    ];
    return rows.map(function (r) { return statRow(r[0], r[1], r[2], r[3]); }).join('');
  }
  function updateLiveStats() {
    var m = App.match;
    var poss0 = m.poss[0] + m.poss[1] ? Math.round(m.poss[0] / (m.poss[0] + m.poss[1]) * 100) : 50;
    var pace = App.smart ? (App.smartHold > 0 ? ' · ⚡慢放' : ' · ⚡快进') : '';
    $('liveMini').textContent = '控球 ' + poss0 + '% - ' + (100 - poss0) + '% · 射门 ' + m.stats[0].shots + '-' + m.stats[1].shots + pace;
    $('liveStats').innerHTML =
      '<div class="ls"><div class="k">控球%</div><div class="v">' + poss0 + '</div></div>' +
      '<div class="ls"><div class="k">射门</div><div class="v">' + m.stats[0].shots + '-' + m.stats[1].shots + '</div></div>' +
      '<div class="ls"><div class="k">射正</div><div class="v">' + m.stats[0].sot + '-' + m.stats[1].sot + '</div></div>' +
      '<div class="ls"><div class="k">xG</div><div class="v">' + (Math.round(m.stats[0].xg * 10) / 10) + '-' + (Math.round(m.stats[1].xg * 10) / 10) + '</div></div>' +
      '<div class="ls"><div class="k">角球</div><div class="v">' + m.stats[0].corners + '-' + m.stats[1].corners + '</div></div>' +
      '<div class="ls"><div class="k">红黄牌</div><div class="v">' + (m.stats[0].yellow + m.stats[0].red) + '-' + (m.stats[1].yellow + m.stats[1].red) + '</div></div>';
  }
  function renderSubsPanel(containerId) {
    var root = $(containerId || 'subsPanel');
    if (!root) return;
    var m = App.match;
    if (!m) { root.innerHTML = ''; return; }
    var team = m.teams[0];
    var htNow = m.half === 2 && m.minute === 45; /* 半场休息：换人不占窗口 */
    var noWindow = !htNow && team.subsWindows <= 0;
    var on = team.rt.filter(function (r) { return r.on; });
    var off = team.rt.filter(function (r) { return !r.on && !r.used; }); /* 被换下者不可再登场 */
    var stamCls = function (s) { return s > 65 ? 'hi' : s > 40 ? 'mid' : 'lo'; };
    var html = '<div class="sub-h">场上球员（点击选择换下）· 名额 ' + team.subsUsed + '/5 · 窗口 ' + team.subsWindows + '/3' + (htNow ? ' · <b style="color:var(--acc)">半场换人不占窗口</b>' : '') + '</div>';
    if (noWindow) html += '<div class="adv warn" style="margin-bottom:8px">⚠ 换人窗口已用完（3 个）——只能等半场休息时换人。</div>';
    html += on.map(function (r) {
      return '<div class="sub-out' + (App.subOut === r.uid ? ' sel' : '') + '" data-uid="' + r.uid + '"><span>' + esc(r.p.name) + '</span><span style="color:#5b6b82;font-size:11px">' + r.slot.code + ' · ' + TAC.findRole(r.slot.role).name + '</span><span class="stam ' + stamCls(r.stamina) + '">体能 ' + Math.round(r.stamina) + '</span></div>';
    }).join('');
    html += '<div class="sub-h">替补席（点击换上）</div>';
    html += off.map(function (r) {
      return '<div class="sub-in' + (App.subIn === r.uid ? ' sel' : '') + '" data-uid="' + r.uid + '"><span>' + esc(r.p.name) + '</span><span style="color:#5b6b82;font-size:11px">' + r.p.pos.split(',')[0] + ' · 综合' + TAC.overallOf(r.p) + '</span></div>';
    }).join('');
    html += '<button class="btn primary wide" id="btnDoSub" style="margin-top:10px" ' + (App.subOut && App.subIn && !noWindow ? '' : 'disabled') + '>确认换人</button>';
    root.innerHTML = html;
    root.querySelectorAll('.sub-out').forEach(function (el) {
      el.onclick = function () { App.subOut = el.getAttribute('data-uid'); refreshSubPanels(); };
    });
    root.querySelectorAll('.sub-in').forEach(function (el) {
      el.onclick = function () { App.subIn = el.getAttribute('data-uid'); refreshSubPanels(); };
    });
    var btn = root.querySelector('#btnDoSub');
    if (btn) btn.onclick = function () {
      var res = ENG.substitute(m, 0, App.subOut, App.subIn);
      if (!res.ok) { toast(res.msg); refreshSubPanels(); return; }
      App.actionLog.push({ min: m.minute, tick: App.tickCount, type: 'sub', out: App.subOut, inn: App.subIn });
      toast(htNow ? '半场换人完成（不占窗口）' : '换人完成（窗口剩 ' + m.teams[0].subsWindows + ' 个）');
      App.subOut = App.subIn = null;
      refreshSubPanels();
      saveGame();
    };
  }
  function refreshSubPanels() {
    renderSubsPanel('subsPanel');
    if ($('htModal').classList.contains('show')) renderSubsPanel('htSubs');
  }
  function renderLiveTactic(containerId, pfx) {
    var m = App.match;
    var root = $(containerId);
    if (!root) return;
    var i = m.teams[0].tactic.instr;
    var axNames = TAC.INSTR.attPush.opts, dbNames = TAC.INSTR.defBlock.opts;
    var id = function (k) { return pfx + k; };
    var mkSlider = function (key, names, label) {
      var html = '<div class="live-tactic-row"><label>' + label + '</label><input type="range" id="' + id(key) + '" min="0" max="6" step="1" value="' + i[key] + '"><span class="lv" id="' + id(key + 'V') + '">' + names[i[key]] + '</span></div>';
      return html;
    };
    var html = mkSlider('attPush', axNames, '攻压') + mkSlider('defBlock', dbNames, '防稳');
    html += '<div class="live-tactic-row"><label>逼抢强度</label><select id="' + id('Press') + '">' + TAC.INSTR.press.opts.map(function (o, ix) { return '<option value="' + ix + '"' + (ix === i.press ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>';
    html += '<div class="live-tactic-row"><label>防线高度</label><select id="' + id('Line') + '">' + TAC.INSTR.line.opts.map(function (o, ix) { return '<option value="' + ix + '"' + (ix === i.line ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>';
    html += '<div class="live-tactic-row"><label>节奏</label><select id="' + id('Tempo') + '">' + TAC.INSTR.tempo.opts.map(function (o, ix) { return '<option value="' + ix + '"' + (ix === i.tempo ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>';
    html += '<div class="toggle-grid">';
    TAC.TOGGLES.forEach(function (t) {
      html += '<div class="tg small' + (i[t.id] ? ' on' : '') + '" data-lt="' + t.id + '" data-root="' + containerId + '"><span class="sw"></span><span>' + t.name + '</span></div>';
    });
    html += '</div>';
    root.innerHTML = html;
    var logAxis = function (key) {
      App.actionLog.push({ min: m.minute, tick: App.tickCount, type: 'patch', patch: (function (o) { o[key] = i[key]; return o; })({}) });
      ENG.patchTactic(m, 0, (function (o) { o[key] = i[key]; return o; })({}));
      saveGame();
    };
    /* 逐个挂事件（避免循环闭包混淆）；滑杆 id 与 instr 键名统一为小写 */
    [['attPush', axNames, 'attPush'], ['defBlock', dbNames, 'defBlock']].forEach(function (pair) {
      var slider = root.querySelector('#' + id(pair[0]));
      var valEl = root.querySelector('#' + id(pair[0] + 'V'));
      slider.oninput = function () {
        i[pair[2]] = +slider.value;
        valEl.textContent = pair[1][i[pair[2]]];
      };
      slider.onchange = function () {
        logAxis(pair[2]);
        pushFeed({ min: m.minute, type: 'info', text: '你将' + (pair[2] === 'attPush' ? '攻压' : '防稳') + '调整为「' + pair[1][i[pair[2]]] + '」。' });
      };
    });
    [['Press', 'press'], ['Line', 'line'], ['Tempo', 'tempo']].forEach(function (pair) {
      var sel = root.querySelector('#' + id(pair[0]));
      sel.onchange = function () {
        i[pair[1]] = +sel.value;
        ENG.patchTactic(m, 0, {});
        App.actionLog.push({ min: m.minute, tick: App.tickCount, type: 'patch', patch: { instr: (function (o) { o[pair[1]] = +sel.value; return o; })({}) } });
        pushFeed({ min: m.minute, type: 'info', text: '临场调整生效：' + TAC.INSTR[pair[1]].name + ' → ' + TAC.INSTR[pair[1]].opts[i[pair[1]]] });
        saveGame();
      };
    });
    root.querySelectorAll('[data-lt]').forEach(function (el) {
      el.onclick = function () {
        var k = el.getAttribute('data-lt');
        i[k] = i[k] ? 0 : 1;
        el.classList.toggle('on');
        ENG.patchTactic(m, 0, {});
        App.actionLog.push({ min: m.minute, tick: App.tickCount, type: 'patch', patch: { instr: (function (o) { o[k] = i[k]; return o; })({}) } });
        pushFeed({ min: m.minute, type: 'info', text: '临场调整：' + (TAC.TOGGLES.filter(function (t) { return t.id === k; })[0] || { name: k }).name + (i[k] ? ' 开启' : ' 关闭') });
        saveGame();
      };
    });
  }
  function showHT() {
    var m = App.match;
    $('htStats').innerHTML = statTableHtml(m);
    renderLiveTactic('htInstr', 'ht_');
    App.subOut = App.subIn = null;
    renderSubsPanel('htSubs'); /* 半场换人（共识 B3），不占换人窗口 */
    var hl = personaSay('ht', { S: m.score[0] + ' - ' + m.score[1] });
    if (hl) $('htStats').innerHTML = '<div class="persona-quote">🎙 ' + esc(hl) + '</div>' + $('htStats').innerHTML;
    $('htModal').classList.add('show');
  }
  function showFT() {
    var m = App.match;
    var my = m.score[0], op = m.score[1];
    var res = my > op ? '🎉 ' + App.teamName + ' 获胜！' : my < op ? '😔 输掉了比赛' : '🤝 双方战平';
    $('ftTitle').textContent = '全场结束 ' + my + ' - ' + op;
    /* MOTM 单独庆祝（共识 A14） */
    var allRows = [0, 1].map(function (side) {
      return ENG.playerMatchStats(m, side).sort(function (a, b) { return b.rating - a.rating; });
    });
    var motm = allRows[0][0].rating >= allRows[1][0].rating ? { side: 0, row: allRows[0][0] } : { side: 1, row: allRows[1][0] };
    var motmQuote = personaText('motm', { A: motm.row.name });
    $('ftMotm').innerHTML = '<div class="motm-banner" style="font-size:16px">⭐ 全场最佳：' + esc(motm.row.name) + '（' + esc(m.teams[motm.side].name) + '）<b style="color:var(--acc2);font-size:20px"> ' + motm.row.rating.toFixed(1) + '</b>' +
      (motm.row.stats.goals ? ' · ⚽' + motm.row.stats.goals : '') + (motm.row.stats.assists ? ' · 🅰' + motm.row.stats.assists : '') + '</div>' +
      (motmQuote ? '<div class="persona-quote">🎙 ' + esc(motmQuote) + '</div>' : '');
    var ftQuote = personaSay(my > op ? 'ftWin' : my < op ? 'ftLoss' : 'ftDraw', { S: my + ' - ' + op });
    $('ftSummary').innerHTML = '<p style="font-size:16px;margin-bottom:10px">' + res + '</p>' +
      (ftQuote ? '<div class="persona-quote">🎙 ' + esc(ftQuote) + '</div>' : '') + statTableHtml(m);
    $('ftModal').classList.add('show');
  }
  /* 复盘时间轴（v0.3）：进球/红黄牌/换人/伤退按分钟定位，我方上线、对方下线 */
  var TL_ICON = { goal: '⚽', red: '🟥', yellow: '🟨', sub: '🔁', injury: '🩹' };
  function renderTimeline(m) {
    var root = $('matchTimeline');
    if (!root) return;
    var maxMin = Math.max(m.minute, 90);
    var evs = m.events.filter(function (e) { return TL_ICON[e.type]; });
    var ticks = [0, 15, 30, 45, 60, 75, 90, maxMin].filter(function (v, i, a) { return a.indexOf(v) === i && v <= maxMin; });
    var html = '<div class="tl-axis">' + ticks.map(function (mm) {
      return '<span class="tl-tick" style="left:' + (mm / maxMin * 100) + '%">' + mm + "'</span>";
    }).join('') + '</div><div class="tl-lane">';
    html += evs.map(function (e) {
      var left = Math.max(0, Math.min(97, e.min / maxMin * 100));
      var label = (e.min > 90 ? "90+'" + (e.min - 90) : e.min > 45 && m.half === 1 ? '45+' + (e.min - 45) : e.min) + "' " + e.text;
      return '<span class="tl-mark t' + e.team + (e.type === 'goal' ? ' big' : '') + '" style="left:' + left + '%" title="' + esc(label) + '">' + TL_ICON[e.type] + '</span>';
    }).join('');
    html += '</div><div class="tl-legend"><span class="t0-dot"></span>' + esc(App.teamName) + '（上）　<span class="t1-dot"></span>' + esc(App.opponent.name) + '（下）· 悬停查看事件详情</div>';
    root.innerHTML = html;
  }
  function fallbackCopy(txt, done) {
    var ta = document.createElement('textarea');
    ta.value = String(txt);
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，Seed：' + txt); }
    document.body.removeChild(ta);
  }
  function renderSeedLine(m) {
    var el = $('seedLine');
    if (!el) return;
    el.innerHTML = '<span class="seed-chip">🎲 Seed <code>' + m.seed + '</code> <button class="btn small" id="btnCopySeed">📋 复制</button></span>' +
      '<span class="hint" style="display:inline;margin-left:8px">同 seed + 同阵容同战术 = 完全相同的比赛——发给朋友，同 seed 异策，公平对决。</span>';
    $('btnCopySeed').onclick = function () {
      var done = function () { toast('Seed 已复制：' + m.seed); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(String(m.seed)).then(done, function () { fallbackCopy(m.seed, done); });
      else fallbackCopy(m.seed, done);
    };
  }
  function renderResult() {
    var m = App.match;
    var my = m.score[0], op = m.score[1];
    $('resultTitle').textContent = '赛后复盘：' + App.teamName + ' ' + my + ' - ' + op + ' ' + App.opponent.name;
    $('statTable').innerHTML = statTableHtml(m);
    renderTimeline(m);
    renderSeedLine(m);
    var review = ENG.tacticalReview(m);
    var reviewHtml = review.map(function (r) { return '<div class="rev">🔍 ' + esc(r) + '</div>'; }).join('');
    var inj = m.injuries || [];
    if (inj.length) {
      var injTxt = inj.map(function (x) { return x.name + '（' + (x.side === 0 ? '我方' : App.opponent.name) + '，缺 ' + x.weeks + ' 轮）'; }).join('、');
      reviewHtml = '<div class="rev" style="border-left-color:var(--danger)">🩹 伤情：' + esc(injTxt) + (App.season && !App.season.done ? '——已列入赛季伤病名单，注意轮换与补强。' : '') + '</div>' + reviewHtml;
    }
    $('reviewList').innerHTML = reviewHtml;
    /* 迷你赛季进行中：显示返回赛季按钮 */
    var inSeason = !!(App.season && !App.season.done);
    $('btnSeasonBack').style.display = inSeason ? '' : 'none';
    $('btnAgain').style.display = inSeason ? 'none' : '';
    /* 评分 */
    var allRows = [0, 1].map(function (side) {
      return ENG.playerMatchStats(m, side).sort(function (a, b) { return b.rating - a.rating; });
    });
    var motm = allRows[0][0].rating >= allRows[1][0].rating ? { side: 0, row: allRows[0][0] } : { side: 1, row: allRows[1][0] };
    var cols = [0, 1].map(function (side) {
      var team = m.teams[side];
      var rows = allRows[side];
      var html = '<h4 style="margin-bottom:8px">' + esc(team.name) + '</h4>';
      html += '<table class="rt-table"><tr><th>球员</th><th>位置</th><th>关键数据</th><th>体能</th><th>评分</th></tr>';
      rows.forEach(function (r) {
        var key = [];
        if (r.stats.goals) key.push('⚽' + r.stats.goals);
        if (r.stats.assists) key.push('🅰' + r.stats.assists);
        if (r.stats.shots) key.push('射' + r.stats.shots);
        if (r.stats.saves) key.push('扑' + r.stats.saves);
        if (r.stats.tackles) key.push('抢' + r.stats.tackles);
        if (r.stats.yellow) key.push('🟨');
        if (r.stats.red) key.push('🟥');
        var rtCls = r.rating >= 7.5 ? 'rt-hi' : r.rating <= 5.8 ? 'rt-lo' : '';
        html += '<tr><td>' + esc(r.name) + (r.on ? '' : ' <small style="color:#5b6b82">(下)</small>') + '</td><td>' + r.slot.code + '</td><td>' + key.join(' ') + '</td><td>' + r.stamina + '</td><td class="rt ' + rtCls + '">' + r.rating.toFixed(1) + '</td></tr>';
      });
      return html + '</table>';
    });
    $('ratingsCols').innerHTML =
      '<div class="motm-banner">⭐ 全场最佳：' + esc(motm.row.name) + '（' + m.teams[motm.side].name + '，' + motm.row.rating + ' 分）</div>' +
      cols[0] + cols[1];
  }

  /* ---------------- 赛季（v0.3：10 轮迷你 / 42 轮完整双循环 + 新闻/金靴/伤病/恩怨） ---------------- */
  function seasonStart(len) {
    if (!squadValid()) { toast('先在转会市场确定 16-23 人的合法阵容，再来开启赛季！'); return; }
    var teams = [MY_ID].concat(DATA.CLUBS.map(function (c) { return c.id; }));
    /* 占位轮空圈法（修复奇数队自对战）：迷你=前 10 轮；完整=42 轮双循环，每队 40 战 + 2 轮空 */
    var fixtures = SEA.buildFixtures(teams, len);
    App.season = { fixtures: fixtures, round: 0, table: {}, results: [], currentRound: null, done: false, scorers: {}, inj: {}, news: [], fresh: {} };
    teams.forEach(function (id) { App.season.table[id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; });
    renderSeason();
    showScreen('season');
    saveGame();
  }
  function seasonName(id) {
    return id === MY_ID ? App.teamName : DATA.findClub(id).name;
  }
  function seasonColor(id) {
    return id === MY_ID ? MY_COLOR : DATA.findClub(id).color;
  }
  /* AI vs AI：同一引擎快速仿真（转会感知：使用被挖空后的可用阵容；恩怨同样生效） */
  function seasonSimAI(homeId, awayId) {
    function mk(id) {
      var c = DATA.findClub(id);
      var avail = clubAvailable(id);
      var t = TAC.autoPickXI(c.style.formation, avail);
      t.instr = TAC.tacticFromStyle(c.style).instr;
      applyIntelShrink(t, avail);
      SEA.applyGrudge(t, SEA.grudgeFor(mySquad(), id).count); /* 你挖空谁，谁就对任何人更凶 */
      return { name: c.name, clubId: c.id, tactic: t, squad: avail, ai: true };
    }
    return ENG.simulateToEnd(ENG.createMatch({ home: mk(homeId), away: mk(awayId), seed: (Math.random() * 1e9) | 0 }));
  }
  function seasonApply(hId, aId, hs, as) {
    var t = App.season.table;
    t[hId].p++; t[aId].p++;
    t[hId].gf += hs; t[hId].ga += as; t[aId].gf += as; t[aId].ga += hs;
    if (hs > as) { t[hId].w++; t[aId].l++; t[hId].pts += 3; }
    else if (hs < as) { t[aId].w++; t[hId].l++; t[aId].pts += 3; }
    else { t[hId].d++; t[aId].d++; t[hId].pts++; t[aId].pts++; }
  }
  /* 本轮我的比赛（或轮空）打完后：结算积分 → 射手榜 → 伤病入库 → 体能延续 → 新闻 */
  function seasonSettleRound(myMatch) {
    var s = App.season;
    if (!s) return;
    var round = s.currentRound || s.fixtures[s.round] || [];
    var myFix = round.filter(function (f) { return f.h === MY_ID || f.a === MY_ID; })[0] || null;
    var ranksBefore = SEA.rankMap(s.table);
    var results = [], myInjuries = [], hs = 0, as = 0;
    s.results = s.results || [];
    if (myFix && myMatch) {
      var mineHome = myFix.h === MY_ID;
      hs = mineHome ? myMatch.score[0] : myMatch.score[1]; /* 引擎侧 0 恒为我 */
      as = mineHome ? myMatch.score[1] : myMatch.score[0];
      seasonApply(myFix.h, myFix.a, hs, as);
      results.push({ h: myFix.h, a: myFix.a, hs: hs, as: as });
      /* 金靴：双方进球者入榜 */
      SEA.addScorers(s.scorers, SEA.collectScorers(myMatch, 0, App.teamName));
      SEA.addScorers(s.scorers, SEA.collectScorers(myMatch, 1, DATA.findClub(mineHome ? myFix.a : myFix.h).name));
      /* 伤病入库：缺阵至 第(当前轮+weeks) 轮结束 */
      (myMatch.injuries || []).forEach(function (inj) {
        if (inj.side === 0) {
          s.inj[inj.uid] = s.round + 1 + inj.weeks;
          myInjuries.push({ name: inj.name, weeks: inj.weeks });
        }
      });
      /* 体能延续：出场球员以 终盘体能+45 进入下一轮（周间恢复；轮换压力但不至于惩罚性过强） */
      var fresh = {};
      myMatch.teams[0].rt.forEach(function (r) {
        if (r.on || r.used) fresh[r.uid] = Math.min(100, Math.round(r.stamina) + 45);
      });
      s.fresh = fresh;
    } else {
      /* 轮空周：全队深度恢复 */
      var fresh2 = {};
      mySquad().forEach(function (p) {
        var v = (s.fresh || {})[p.__uid];
        fresh2[p.__uid] = Math.min(100, (v != null ? v : 100) + 65);
      });
      s.fresh = fresh2;
    }
    round.filter(function (f) { return f.h !== MY_ID && f.a !== MY_ID; }).forEach(function (f) {
      var st = seasonSimAI(f.h, f.a);
      seasonApply(f.h, f.a, st.score[0], st.score[1]);
      results.push({ h: f.h, a: f.a, hs: st.score[0], as: st.score[1] });
      SEA.addScorers(s.scorers, SEA.collectScorers(st, 0, seasonName(f.h)));
      SEA.addScorers(s.scorers, SEA.collectScorers(st, 1, seasonName(f.a)));
    });
    s.results[s.round] = results;
    /* 新闻引擎（含下一轮恩怨预告） */
    var nextOppId = null;
    if (s.fixtures[s.round + 1]) {
      var nx = s.fixtures[s.round + 1].filter(function (f) { return f.h === MY_ID || f.a === MY_ID; })[0];
      if (nx) nextOppId = nx.h === MY_ID ? nx.a : nx.h;
    }
    var news = SEA.makeNews({
      round: s.round, results: results, ranksBefore: ranksBefore, table: s.table,
      myId: MY_ID, myFix: myFix && myMatch ? { h: myFix.h, a: myFix.a, hs: hs, as: as } : null,
      myName: App.teamName, scorers: s.scorers, injuries: myInjuries,
      nextOppId: nextOppId, grudge: nextOppId ? SEA.grudgeFor(mySquad(), nextOppId) : null, nm: seasonName
    });
    s.news = (s.news || []).concat(news.map(function (n) { n.round = s.round + 1; return n; })).slice(-40);
  }
  function seasonAfterSettle(msg) {
    var s = App.season;
    s.round++;
    s.currentRound = null;
    if (s.round >= s.fixtures.length) s.done = true;
    renderSeason();
    showScreen('season');
    saveGame();
    if (msg) toast(msg);
  }
  /* 我的比赛打完 → 结算本轮（复盘屏「返回赛季」按钮） */
  function seasonFinishMyMatch() {
    if (!App.season) return;
    seasonSettleRound(App.match);
    seasonAfterSettle('本轮战报已归档，积分榜已更新');
  }
  function renderSeason() {
    var s = App.season;
    if (!s) return;
    var total = s.fixtures.length;
    var full = total > SEASON_MINI;
    $('seasonTitle').innerHTML = (full ? '完整赛季 · 双循环 40 战' : '迷你赛季') + ' · 第 ' + Math.min(s.round + 1, total) + '/' + total + ' 轮 <small>' +
      (full ? '42 个比赛周：每队 40 战 + 2 轮空，任意对手主客各交手一次，冠军只有一个' : '10 轮联赛：你 + 19 支英超球队，冠军只有一个') + '</small>';
    var rows = Object.keys(s.table).map(function (id) { return { id: id, o: s.table[id] }; })
      .sort(function (x, y) { return y.o.pts - x.o.pts || (y.o.gf - y.o.ga) - (x.o.gf - x.o.ga) || y.o.gf - x.o.gf; });
    var champ = s.done ? rows[0] : null;
    var html = '<table class="season-table"><tr><th>#</th><th>球队</th><th>赛</th><th>胜</th><th>平</th><th>负</th><th>进</th><th>失</th><th>分</th></tr>';
    rows.forEach(function (r, i) {
      var cls = (r.id === MY_ID ? 'mine ' : '') + (champ && champ.id === r.id ? 'champ' : '');
      html += '<tr class="' + cls + '"><td>' + (i + 1) + '</td><td class="st-name"><span class="sb-badge" style="display:inline-block;width:16px;height:16px;font-size:8px;background:' + seasonColor(r.id) + ';vertical-align:-3px;margin-right:5px">' + (r.id === MY_ID ? '我' : r.id) + '</span>' + esc(seasonName(r.id)) + '</td>' +
        '<td>' + r.o.p + '</td><td>' + r.o.w + '</td><td>' + r.o.d + '</td><td>' + r.o.l + '</td><td>' + r.o.gf + '</td><td>' + r.o.ga + '</td><td><b>' + r.o.pts + '</b></td></tr>';
    });
    html += '</table>';
    if (champ) html = '<div class="season-champ-banner">🏆 ' + total + ' 轮战罢：冠军是 <b>' + esc(seasonName(champ.id)) + '</b>（' + champ.o.pts + ' 分）' + (champ.id === MY_ID ? '——是你的球队！传奇！' : '') + '</div>' + html;
    $('seasonTable').innerHTML = html;
    /* 下一轮卡片（主客/恩怨/伤缺一目了然） */
    var nc = '';
    if (!s.done) {
      var curRound = s.fixtures[s.round] || [];
      var myFix = curRound.filter(function (f) { return f.h === MY_ID || f.a === MY_ID; })[0];
      if (myFix) {
        var oppId = myFix.h === MY_ID ? myFix.a : myFix.h;
        var gr = SEA.grudgeFor(mySquad(), oppId);
        var outList = mySquad().filter(function (p) { return isOutNow(p.__uid); });
        nc = '<div class="season-next-card">🗓 <b>第 ' + (s.round + 1) + ' 轮</b> · ' + (myFix.h === MY_ID ? '🏠 主场' : '✈ 客场') + '迎战 <b>' + esc(seasonName(oppId)) + '</b>' +
          (gr.count >= 2 ? '<div class="grudge-warn">🧨 恩怨之战：' + esc(SEA.grudgeLine(seasonName(oppId), gr.names)) + '</div>' : '') +
          (outList.length ? '<div class="inj-warn">🩹 伤缺 ' + outList.length + ' 人：' + esc(outList.slice(0, 4).map(function (p) { return p.name; }).join('、')) + (outList.length > 4 ? ' 等' : '') + '</div>' : '') +
          '</div>';
      } else {
        nc = '<div class="season-next-card">🏖 <b>第 ' + (s.round + 1) + ' 轮轮空</b>——全队获得额外恢复时间，是追分路上难得的喘息。</div>';
      }
    }
    $('seasonNextCard').innerHTML = nc;
    /* 赛程与战报 */
    var fx = '';
    s.fixtures.forEach(function (round, ri) {
      var myFix = round.filter(function (f) { return f.h === MY_ID || f.a === MY_ID; })[0];
      var label = myFix
        ? '<b>R' + (ri + 1) + '</b> vs ' + esc(seasonName(myFix.h === MY_ID ? myFix.a : myFix.h)) + (myFix.h === MY_ID ? '（主）' : '（客）')
        : '<b>R' + (ri + 1) + '</b> 轮空';
      if (ri < s.round) {
        var res = s.results && s.results[ri];
        var myRes = myFix && Array.isArray(res) ? res.filter(function (r) { return r.h === MY_ID || r.a === MY_ID; })[0] : null;
        fx += '<div class="season-fix"><span>' + label + '</span><span>' + (myRes ? myRes.hs + ' - ' + myRes.as : (myFix ? '已赛' : '🏖')) + '</span></div>';
      } else if (ri === s.round) {
        fx += '<div class="season-fix"><span>' + label + '</span><span class="vs">' + (myFix ? '接下来' : '轮空周') + '</span></div>';
      }
    });
    $('seasonFixtures').innerHTML = fx;
    /* 更衣室新闻墙 */
    var newsHtml = (s.news || []).slice().reverse().map(function (n) {
      return '<div class="news-item"><span class="n-icon">' + (n.icon || '📰') + '</span><div class="n-body"><div class="n-title">' + esc(n.title) + ' <small>R' + (n.round || '') + '</small></div><div class="n-text">' + esc(n.text) + '</div></div></div>';
    }).join('') || '<p class="hint">还没有新闻——踢完第一轮，头条就来了。</p>';
    $('seasonNews').innerHTML = newsHtml;
    /* 金靴榜 */
    var tops = SEA.topScorers(s.scorers || {}, 10);
    $('seasonScorers').innerHTML = tops.length
      ? '<table class="rt-table"><tr><th>#</th><th>球员</th><th>球队</th><th>⚽</th></tr>' + tops.map(function (t, i) {
        return '<tr' + (t.clubLabel === App.teamName ? ' class="mine"' : '') + '><td>' + (i + 1) + '</td><td>' + esc(t.name) + '</td><td>' + esc(t.clubLabel) + '</td><td><b>' + t.goals + '</b></td></tr>';
      }).join('') + '</table>'
      : '<p class="hint">赛季还没有进球表演。</p>';
    /* 伤病名单 */
    var injRows = mySquad().filter(function (p) { return isOutNow(p.__uid); })
      .map(function (p) { return '<div class="inj-row">🩹 ' + esc(p.name) + '<span>还缺 ' + ((injMap()[p.__uid] || 0) - s.round) + ' 轮</span></div>'; });
    $('seasonInjuries').innerHTML = injRows.length ? injRows.join('') : '<p class="hint">全员健康 ✅</p>';
    /* 主按钮 */
    var byeWeek = !s.done && !(s.fixtures[s.round] || []).some(function (f) { return f.h === MY_ID || f.a === MY_ID; });
    $('btnSeasonPlay').textContent = s.done ? '赛季已结束' : byeWeek ? '⏩ 轮空周：结算本轮' : (s.round === 0 ? '▶ 开始第 1 轮' : '▶ 开始第 ' + (s.round + 1) + ' 轮');
    $('btnSeasonPlay').disabled = s.done;
  }
  function seasonNext() {
    var s = App.season;
    if (!s || s.done) return;
    var round = s.fixtures[s.round];
    var myFix = round.filter(function (f) { return f.h === MY_ID || f.a === MY_ID; })[0];
    if (!myFix) { /* 轮空周：直接结算本轮 AI 比赛 */
      seasonSettleRound(null);
      seasonAfterSettle('轮空周结束——全队体能已深度恢复');
      return;
    }
    s.currentRound = round; /* R3-7：持久化本轮对阵，刷新后续打可安全结算 */
    App.opponent = DATA.findClub(myFix.h === MY_ID ? myFix.a : myFix.h);
    App.seasonMyHome = myFix.h === MY_ID;
    App.myHome = App.seasonMyHome;
    if (!App.tactic) App.tactic = TAC.emptyTactic('4-2-3-1');
    /* 伤员不得出现在首发：自动移出槽位 */
    var cleared = 0;
    App.tactic.slots.forEach(function (sl) { if (sl.playerId && isOutNow(sl.playerId)) { sl.playerId = null; cleared++; } });
    if (cleared) toast('有 ' + cleared + ' 名伤员被移出首发，请重新排兵');
    autoBench();
    renderLineup();
    showScreen('lineup');
    var gr = SEA.grudgeFor(mySquad(), App.opponent.id);
    toast('第 ' + (s.round + 1) + ' 轮' + (App.myHome ? '主场' : '客场') + '对阵 ' + App.opponent.name + (gr.count >= 2 ? '（🧨 恩怨之战！）' : ''));
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    $('btnStart').onclick = function () {
      App.teamName = $('teamNameInput').value.trim() || '梦想联';
      App.signed = []; App.opponent = null; App.tactic = null;
      renderMarket();
      showScreen('market');
    };
    $('btnContinue').onclick = function () {
      var sv = loadSave();
      if (!sv) return;
      App.budget = sv.budget; App.teamName = sv.teamName; App.signed = sv.signed || [];
      App.opponent = sv.opponentId ? DATA.findClub(sv.opponentId) : null;
      App.tactic = sv.tactic || TAC.emptyTactic('4-2-3-1'); App.benchUids = sv.benchUids || [];
      App.season = sv.season || null;
      App.persona = sv.persona || 'fire';
      renderMarket(); updateBudgetChip();
      /* 比赛续打（共识 B7/R3-6）：确定性重放 + UI 状态恢复 */
      if (sv.live && App.opponent && sv.live.seed != null) {
        App.myHome = sv.live.myHome !== false;
        App.match = replayTo(sv.live.seed, sv.live.tick || sv.live.minute || 0, sv.live.actionLog, App.myHome);
        App.tickCount = sv.live.tick || 0;
        App.actionLog = sv.live.actionLog || [];
        App.speed = sv.live.speed || 2;
        App.subOut = App.subIn = null;
        App.personaN = {}; App.lastPersonaMin = -10;
        renderMatchShell();
        restoreMatchUI();
        showScreen('match');
        toast('已恢复到第 ' + ENG.displayMin(App.match) + ' 分钟的比赛');
        return;
      }
      var stage = sv.stage;
      if (!App.opponent || stage === 'match' || stage === 'result' || stage === 'welcome') stage = App.opponent ? 'opponent' : 'market';
      if (stage === 'season' && !App.season) stage = 'opponent';
      if (stage === 'opponent') renderOpponents();
      if (stage === 'lineup') renderLineup();
      if (stage === 'tactic') renderTacticScreen();
      if (stage === 'season') renderSeason();
      showScreen(stage);
    };
    ['clubFilter', 'posFilter', 'affordFilter'].forEach(function (id) { $(id).onchange = renderGrid; });
    $('nameSearch').oninput = renderGrid;
    $('btnScoutXI').onclick = function () {
      scoutRecommend();
      renderGrid(); renderSquad(); updateBudgetChip(); saveGame();
      toast('球探已按 18 人框架推荐阵容，可继续微调');
    };
    $('btnToOpponent').onclick = function () { renderOpponents(); showScreen('opponent'); };
    $('btnSeasonStart').onclick = function () { seasonStart(SEASON_MINI); };
    $('btnSeasonFull').onclick = function () { seasonStart(SEASON_FULL); };
    $('btnSeasonPlay').onclick = seasonNext;
    $('btnSeasonQuit').onclick = function () {
      App.season = null;
      renderOpponents();
      showScreen('opponent');
      saveGame();
    };
    $('btnSeasonBack').onclick = function () {
      seasonFinishMyMatch();
    };
    $('btnBackMarket').onclick = function () { renderMarket(); showScreen('market'); };
    $('formationSelect').onchange = function () {
      changeFormation($('formationSelect').value);
      autoBench(); renderLineup();
    };
    $('btnAutoXI').onclick = function () {
      App.tactic = TAC.autoPickXI(App.tactic.formation, availSquad());
      autoBench(); renderLineup(); toast('已自动排兵（伤员已排除）');
    };
    $('btnLineupBack').onclick = function () {
      if (App.season) { renderSeason(); showScreen('season'); }
      else { renderOpponents(); showScreen('opponent'); }
    };
    $('btnToTactic').onclick = function () {
      var miss = App.tactic.slots.filter(function (s) { return !s.playerId; }).length;
      if (miss) { toast('还有 ' + miss + ' 个位置没有安排球员！'); return; }
      var outInXI = App.tactic.slots.filter(function (s) { return s.playerId && isOutNow(s.playerId); });
      if (outInXI.length) { toast('首发中有伤员（' + outInXI.map(function (s) { return uidPlayer(s.playerId).name; }).join('、') + '），请先调整！'); return; }
      if (!App.benchUids.length) autoBench();
      App.selSlot = -1;
      renderTacticScreen();
      showScreen('tactic');
    };
    $('tacticFormation').onchange = function () {
      changeFormation($('tacticFormation').value);
      autoBench();
      renderTacticScreen();
    };
    $('btnAutoTacticXI').onclick = function () {
      App.tactic = TAC.autoPickXI(App.tactic.formation, availSquad());
      App.selSlot = -1; renderTacticScreen(); toast('已重新自动排兵（伤员已排除）');
    };
    $('btnSavePreset').onclick = function () {
      var name = prompt('战术预设名称：', App.tactic.formation + ' 高位逼抢');
      if (!name) return;
      var presets = [];
      try { presets = JSON.parse(localStorage.getItem(PRESET_KEY) || '[]'); } catch (e) { }
      presets.push({ name: name, tactic: App.tactic });
      try { localStorage.setItem(PRESET_KEY, JSON.stringify(presets)); } catch (e) { }
      renderPresets();
      toast('预设已保存');
    };
    $('btnKickoff').onclick = function () {
      var miss = App.tactic.slots.filter(function (s) { return !s.playerId; }).length;
      if (miss) { toast('还有 ' + miss + ' 个位置没有安排球员！'); return; }
      var outInXI = App.tactic.slots.filter(function (s) { return s.playerId && isOutNow(s.playerId); });
      if (outInXI.length) { toast('首发中有伤员，不能出场！'); return; }
      buildMatch();
      showScreen('match');
    };
    $('personaSel').onchange = function () {
      App.persona = $('personaSel').value;
      App.lastPersonaMin = -10;
      saveGame();
      toast('解说人格：' + SEA.findPersona(App.persona).name);
    };
    $('btnPause').onclick = function () {
      if (App.match.finished) return;
      if (App.paused) startTimer(); else pauseTimer();
    };
    $('btnSmart').onclick = function () {
      App.smart = !App.smart;
      $('btnSmart').textContent = App.smart ? '⚡ 智能节奏：开' : '⚡ 智能节奏：关';
      $('btnSmart').classList.toggle('active', App.smart);
      App.smartHold = 0;
    };
    document.querySelectorAll('#speedGroup .btn').forEach(function (b) {
      b.onclick = function () {
        setSpeed(+b.getAttribute('data-speed'));
        syncSpeedUI();
      };
    });
    /* 比赛日键位（v0.3）：空格暂停/继续 · 1/2/3/4 倍速 · S 智能节奏 */
    document.addEventListener('keydown', function (e) {
      if (App.stage !== 'match' || !App.match || App.match.finished) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ($('htModal').classList.contains('show') || $('ftModal').classList.contains('show')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (App.paused) startTimer(); else pauseTimer();
      } else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4') {
        setSpeed([1, 2, 4, 12][+e.code.slice(-1) - 1]);
        syncSpeedUI();
      } else if (e.key === 's' || e.key === 'S') {
        $('btnSmart').onclick();
      }
    });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.onclick = function () {
        document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
        document.querySelectorAll('.tab-pane').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        $('tab-' + t.getAttribute('data-tab')).classList.add('active');
        if (t.getAttribute('data-tab') === 'subs') renderSubsPanel();
      };
    });
    $('btnResume2nd').onclick = function () {
      $('htModal').classList.remove('show');
      startTimer();
    };
    $('btnToResult').onclick = function () {
      $('ftModal').classList.remove('show');
      renderResult();
      showScreen('result');
    };
    $('btnAgain').onclick = function () {
      App.reuseTactic = true; /* 保留上一场的阵型/角色/指令 */
      renderOpponents();
      showScreen('opponent');
      toast('已保留上一场战术，直接挑选下一个对手');
    };
    $('btnRestart').onclick = function () {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { }
      App.signed = []; App.opponent = null; App.tactic = null; App.season = null; App.actionLog = [];
      renderWelcome();
      showScreen('welcome');
    };
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    DATA.CLUBS.forEach(function (c) {
      c.players.forEach(function (p, i) { p.__uid = c.id + '-' + i; });
    });
    App.tactic = TAC.emptyTactic('4-2-3-1');
    /* 调试/测试钩子（不影响正常游玩） */
    window.GMD_DEBUG = { app: App, showFT: showFT, showHT: showHT, tick: tickMinute, sanitizeSave: sanitizeSave, uidPlayer: uidPlayer, seasonSettle: seasonSettleRound, renderTimeline: renderTimeline, personaSay: personaSay };
    renderWelcome();
    bind();
    showScreen('welcome');
  }
  document.addEventListener('DOMContentLoaded', init);
})();
