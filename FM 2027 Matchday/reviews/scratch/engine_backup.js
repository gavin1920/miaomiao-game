/* ============================================================
 * FM 2027 Matchday - 比赛引擎（战术驱动，纯函数可无头运行）
 *
 * 每分钟 tick：
 *  1) 把双方战术编译成引擎参数（防线/逼抢/宽度/侧重/角色效率/组合联动）
 *  2) 中场争夺 → 控球方按战术权重生成机会类型 → 属性对抗 → xG → 射门裁决
 *  3) 转换层：反击 / 就地反抢(Gegenpress) / 越位陷阱 / 身后球 vs 高位防线
 *  4) 体能衰减（逼抢/节奏/职责相关）→ 属性衰减 → AI 换人
 *  5) 每分钟输出 pitch frame 供渲染层使用（仿真与呈现分离）
 * ============================================================ */
(function (global) {
  'use strict';
  var TAC = global.GMD_TACTICS, DATA = global.GMD_DATA;

  /* ---------------- RNG（可复现比赛） ---------------- */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function wpick(rng, entries) { /* entries: [{w,v}] */
    var total = 0, i;
    for (i = 0; i < entries.length; i++) total += Math.max(0, entries[i].w);
    var r = rng() * total;
    for (i = 0; i < entries.length; i++) { r -= Math.max(0, entries[i].w); if (r <= 0) return entries[i].v; }
    return entries[entries.length - 1].v;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* ---------------- 球员运行时 ---------------- */
  function mkRt(p, slot, isHome) {
    var fit = TAC.slotFit(p, slot, slot.role);
    return {
      p: p, uid: p.__uid, slot: slot, fit: fit,
      on: true, stamina: 100, rating: 6.5,
      stats: { goals: 0, assists: 0, shots: 0, sot: 0, keyPasses: 0, tackles: 0, passes: 0, passOk: 0, fouls: 0, yellow: 0, red: 0, offsides: 0, saves: 0, xg: 0 },
      x: slot.x, y: slot.y
    };
  }

  /* ---------------- 创建比赛 ---------------- */
  function createMatch(cfg) {
    /* cfg: {home:{name, clubId, tactic, squad, benchUids}, away:{...}, seed} */
    var seed = cfg.seed || 20270227;
    var rng = mulberry32(seed);
    var state = {
      seed: seed, rng: rng,
      viewRng: mulberry32(seed ^ 0x9e3779b9),   /* 呈现层独立随机流：UI 调用不污染仿真确定性 */
      minute: 0, half: 1, stoppage: 0, stoppage1: 0, finished: false,
      score: [0, 0],
      teams: [], events: [], frames: [],
      stats: [emptyStats(), emptyStats()],
      poss: [0, 0],
      insights: { throughHigh: [0, 0, 0], crossNoTarget: [0, 0, 0], pressWins: [0, 0], counters: [0, 0], countersConceded: [0, 0], setPieceGoals: [0, 0], gkLongGoals: [0, 0] },
      lastGoalMin: -10
    };
    [cfg.home, cfg.away].forEach(function (ts, side) {
      var tactic = TAC.cloneTactic(ts.tactic);
      var byUid = {};
      ts.squad.forEach(function (p) { byUid[p.__uid] = p; });
      var rts = tactic.slots.map(function (sl) {
        var p = sl.playerId ? byUid[sl.playerId] : null;
        if (!p) return null;
        return mkRt(p, { x: sl.x, y: sl.y, zone: sl.zone, code: sl.code, role: sl.role, duty: sl.duty }, side === 0);
      });
      /* 空槽自愈：从替补/剩余球员中补齐（客串门将属性大打折扣） */
      var filled = {};
      rts.forEach(function (r) { if (r) filled[r.uid] = 1; });
      var pool = ts.squad.filter(function (p) { return !filled[p.__uid]; });
      rts = rts.map(function (r, i) {
        if (r) return r;
        var p = pool.shift();
        if (!p) return null;
        var sl = tactic.slots[i];
        if (sl.zone === 'GK' && p.pos.split(',')[0] !== 'GK') {
          p = Object.assign({}, p, { gk: { ref: 30 + Math.round(p.a[5] / 4), one: 28, cmd: 26, kic: 30 }, name: p.name + '（客串门将）' });
        }
        return mkRt(p, { x: sl.x, y: sl.y, zone: sl.zone, code: sl.code, role: sl.zone === 'GK' ? 'GK' : sl.role, duty: sl.duty }, side === 0);
      });
      var onRts = rts.filter(Boolean);
      var onUids = {};
      onRts.forEach(function (r) { onUids[r.uid] = 1; });
      var bench = ((ts.benchUids || ts.squad.filter(function (p) { return !onUids[p.__uid]; }).map(function (p) { return p.__uid; }))
        .filter(function (uid) { return byUid[uid]; }) /* 跳过未知 uid，保证旧存档兼容 */)
        .map(function (uid) {
          var r = mkRt(byUid[uid], { x: 0, y: 50, zone: 'MF', code: 'SUB', role: 'CM', duty: 'S' }, side === 0);
          r.on = false;
          return r;
        });
      state.teams.push({
        side: side, name: ts.name, clubId: ts.clubId || null, tactic: tactic,
        rt: rts.concat(bench), benchStart: rts.length, subsUsed: 0, ai: !!ts.ai,
        chaseMode: 0
      });
    });
    return state;
  }
  function emptyStats() {
    return { shots: 0, sot: 0, xg: 0, corners: 0, fouls: 0, yellow: 0, red: 0, offsides: 0, passAtt: 0, passOk: 0, counters: 0, bigChances: 0, crossShots: 0 };
  }

  /* ---------------- 战术编译 → 引擎参数 ---------------- */
  function compileTeam(state, side) {
    var team = state.teams[side], t = team.tactic, i = t.instr;
    var on = team.rt.filter(function (r) { return r.on; });
    /* 人数劣势（红牌/空槽）：全线弱化，红牌不再是净增益（共识 A3/A15） */
    var short = Math.max(0, 11 - on.length);
    var menDef = short * 7.5, menAtt = short * 3;
    var menChance = Math.pow(0.85, short);
    var menPress = Math.pow(0.92, short);
    var eff = function (r, k) {
      var st = 0.62 + 0.38 * clamp(r.stamina, 0, 100) / 100;
      return r.p.a[k] * st * r.fit;
    };
    var byZone = { DF: [], DM: [], MF: [], AM: [], FW: [], GK: [] };
    on.forEach(function (r) {
      var z = r.slot.zone;
      if (!byZone[z]) byZone[z] = [];
      byZone[z].push(r);
    });
    var avgK = function (arr, k) { return arr.length ? arr.reduce(function (s, r) { return s + eff(r, k); }, 0) / arr.length : 55; };

    /* 各线评分：均值 + 人数微调（防守人数>4 有小额奖励）；缺员全线扣减 */
    var dfN = byZone.DF.length, dmN = byZone.DM.length;
    var def = avgK(byZone.DF, 4) * 0.62 + avgK(byZone.DF, 5) * 0.2 + (dmN ? avgK(byZone.DM, 4) * 0.18 : 0) + avgK(byZone.DF, 0) * 0.08;
    def += clamp(dfN + dmN - 4, -1.5, 2.5) * 1.4;
    var midN = byZone.MF.length + byZone.AM.length + dmN;
    var midPool = byZone.MF.concat(byZone.AM, byZone.DM);
    var mid = avgK(midPool, 2) * 0.5 + avgK(midPool, 3) * 0.2 + avgK(midPool, 5) * 0.18 + avgK(midPool, 4) * 0.12;
    var attPool = byZone.FW.concat(byZone.AM);
    var att = avgK(attPool, 1) * 0.42 + avgK(attPool, 0) * 0.24 + avgK(attPool, 3) * 0.22 + avgK(attPool, 5) * 0.12;
    if (!attPool.length) att = mid * 0.8;

    /* 角色加成 */
    var crossW = 0, throughW = 0, cutW = 0, boxW = 0, buildup = 0, holdUp = 0, longShot = 0, attRole = 0;
    on.forEach(function (r) {
      var role = TAC.findRole(r.slot.role), d = r.slot.duty, e = (role && role.eff) || {};
      var dutyAtt = d === 'A' ? 1.25 : d === 'S' ? 1 : 0.8;
      if (e.cross) crossW += e.cross * dutyAtt;
      if (e.cutInside) cutW += e.cutInside * dutyAtt * (r.p.a[3] / 80);
      if (e.box) boxW += e.box;
      if (e.buildup) buildup += e.buildup;
      if (e.holdUp || e.aerial) holdUp += (e.holdUp || 0) + (e.aerial || 0);
      if (e.att) attRole += e.att * dutyAtt;                 /* 角色进攻取向接线（共识 A10） */
      if (e.run) throughW += e.run * 1.4;                    /* 突前前锋跑身后 */
      if (r.slot.zone === 'FW' || r.slot.zone === 'AM') longShot += (r.p.a[1] > 78 ? 1 : 0);
      if (r.slot.role === 'DLP' || r.slot.role === 'AP' || r.slot.role === 'APA' || r.slot.role === 'REG' || r.slot.role === 'F9' || r.slot.role === 'DLF') throughW += 1.1;
      if (r.slot.role === 'SS') throughW += 0.8;
    });
    att += attRole * 0.3;
    crossW += i.overlap * 1.2; /* 指令：边后卫套上 → 传中倾向 */

    /* 职责泛化（共识 A11）：D/S/A 对全体球员的攻防投入生效，不再只影响传中/内切 */
    var dutyAtk = 0, dutyDef = 0;
    on.forEach(function (r) {
      if (r.slot.zone === 'GK') return;
      if (r.slot.duty === 'A') { dutyAtk += 0.55; dutyDef -= 0.25; }
      else if (r.slot.duty === 'D') { dutyDef += 0.5; dutyAtk -= 0.2; }
    });
    att += dutyAtk * 0.5;
    def += dutyDef * 0.6;

    /* 组合联动（配合要求）——指令 overlap（边后卫套上）直接加成边路联动 */
    var link = 0;
    var flankPairs = { L: null, R: null };
    on.forEach(function (r) {
      var left = r.slot.y < 50;
      var key = left ? 'L' : 'R';
      if (r.slot.role === 'WB' || r.slot.role === 'CWB' || (r.slot.code === 'LB' || r.slot.code === 'RB')) {
        var pairV = r.slot.duty === 'A' ? 2 : 1;
        pairV += i.overlap * 0.6; /* 指令：边后卫套上频率 */
        flankPairs[key] = (flankPairs[key] || 0) + pairV;
      }
    });
    on.forEach(function (r) {
      var left = r.slot.y < 50, key = left ? 'L' : 'R';
      if ((r.slot.role === 'W' && (r.slot.duty !== 'D')) && flankPairs[key]) link += flankPairs[key] * 0.5;      /* 边锋+套上边卫 */
      if ((r.slot.role === 'IF' || r.slot.role === 'MEZ') && flankPairs[key]) link += flankPairs[key] * 0.4;      /* 内切+套上拉空间 */
    });
    var hasF9orDLF = on.some(function (r) { return r.slot.role === 'F9' || r.slot.role === 'DLF'; });
    var hasAMbehind = on.some(function (r) { return r.slot.zone === 'AM' && r.slot.y > 25 && r.slot.y < 75; });
    if (hasF9orDLF && hasAMbehind) link += 1.2;    /* 回撤串联+前腰后插上 */
    var hasTM = on.some(function (r) { return r.slot.role === 'TM' || r.slot.role === 'CF'; });
    var hasP = on.some(function (r) { return r.slot.role === 'P'; });
    if (hasTM && hasP) link += 1.0;                 /* 支点+抢点 二人组 */
    if (on.some(function (r) { return r.slot.role === 'DLP'; }) && on.some(function (r) { return r.slot.role === 'BPD'; })) buildup += 2;

    var gkRt = on.filter(function (r) { return r.slot.zone === 'GK'; })[0];
    var gk = gkRt && gkRt.p.gk ? { ref: gkRt.p.gk.ref, one: gkRt.p.gk.one, cmd: gkRt.p.gk.cmd, kic: gkRt.p.gk.kic } : { ref: 60, one: 60, cmd: 60, kic: 60 };

    /* 指令 → 参数（共识 R3-1 双轴心态）：攻压驱动进攻与暴露，防稳真实进防守公式；
       旧存档只有 mentality 时自动映射为双轴同值 */
    var attPush = clamp(i.attPush != null ? i.attPush : (i.mentality != null ? i.mentality : 3), 0, 6);
    var defBlock = clamp(i.defBlock != null ? i.defBlock : attPush, 0, 6);
    var pushF = [0.55, 0.72, 0.86, 1, 1.14, 1.26, 1.38][attPush];   /* 攻压系数：乘己方机会率、喂对方反击 */
    var blockF = [0.55, 0.72, 0.86, 1, 1.14, 1.26, 1.38][defBlock]; /* 防稳系数：真实进入防线评分 */
    var lineX = 22 + i.line * 7 + (attPush - 3) * 1.5 - (defBlock - 3) * 1.2;
    var pressX = 30 + i.pressZone * 18;                               /* 逼抢触发线 */
    var pressI = [0.25, 0.5, 0.78, 1][i.press] * (0.85 + avgK(on, 5) / 400) * menPress;
    var widthA = [38, 50, 62][i.attWidth];
    var widthD = [36, 50, 60][i.defWidth];
    var tempoF = [0.82, 1, 1.14, 1.24][i.tempo];
    var passR = i.pass; /* 0 极短..4 长传 */

    /* 双轴心态（R3-1，R4 终版）：防稳轴正斜率——铁桶真实+防（0→+4.6）；
       攻压=防线透支重税，量级与攻收益等价（全攻 GF+38% 的代价是 GA 同步+30% 左右）——
       弱队全攻不再是无本买卖，高风险高回报而非净赚。
       超轴惩罚：攻压+防稳合计超过均衡(8)时体系失真，双方都付出代价——防止「双满」无脑解。 */
    def += (blockF - 0.55) * 5.5 + (i.defWidth === 0 ? 1.6 : 0) - Math.max(0, pushF - 1) * 32;
    var overAxis = Math.max(0, attPush + defBlock - 8);
    def -= overAxis * 1.3;
    /* 领先方末段收缩（park the bus）：领先越多防线越深，2 球领先不该频繁被翻盘 */
    if (state.minute > 70 && state.score[side] > state.score[1 - side]) {
      def += 2.2 * Math.min(2, state.score[side] - state.score[1 - side]);
    }

    /* 全队均能（R4）：压迫/反抢的干扰力随体能衰减——75' 后高压自然失效 */
    var avgStam = on.reduce(function (s, r) { return s + r.stamina; }, 0) / Math.max(1, on.length);

    return {
      on: on, byZone: byZone, def: def, mid: mid, att: att, gk: gk,
      short: short, menChance: menChance, menPress: menPress,
      attPush: attPush, defBlock: defBlock, pushF: pushF, blockF: blockF,
      avgStam: avgStam,
      lineX: lineX, pressX: pressX, pressI: pressI, widthA: widthA, widthD: widthD,
      defWidth: i.defWidth, attWidth: i.attWidth, gkDist: i.gkDist, overlap: i.overlap,
      tempoF: tempoF, pushF: pushF, passR: passR, buildup: buildup,
      crossW: crossW, throughW: throughW, cutW: cutW, boxW: boxW, holdUp: holdUp,
      longShot: longShot, link: link,
      offsideTrap: !!i.offside,
      counter: !!i.counter, gegen: !!i.gegen, timeWaste: !!i.timeWaste,
      focus: i.focus, tackleAggr: i.tackling
    };
  }

  function effStamina(team) {
    var on = team.rt.filter(function (r) { return r.on; });
    return on.reduce(function (s, r) { return s + r.stamina; }, 0) / Math.max(1, on.length);
  }

  /* ---------------- 机会类型权重（战术敏感） ---------------- */
  function chanceType(state, side, cA, cB, isCounter) {
    var t = state.teams[side].tactic.instr, i = t;
    var entries = [];
    var wCross = 5.5 + cA.crossW * 1.6 + (i.attWidth === 2 ? 6 : i.attWidth === 0 ? -3 : 0) + (i.focus === 'flanks' ? 1 : i.focus === 'balanced' ? 0 : -1);
    var wThrough = 6.5 + cA.throughW * 3.0 + (cA.mid - 70) * 1.0 + (i.focus === 'middle' ? 2 : 0) + cA.link * 1.5
      + (cB.lineX >= 43 ? 6 : cB.lineX <= 29 ? -3 : 0);        /* 对手高位 → 身后球香 */
    /* 门将长传出球：更直接，长传/传中比重上升 */
    if (cA.gkDist) { wCross += 1.5; wThrough += 1; }
    /* 防守宽度对抗：收缩的禁区人堆让传中更难被覆盖（但更少反击空间），
       拉开的宽阵对传中型对手是净吃亏；对渗透仅有小幅补偿 */
    if (cB.defWidth === 0) { wCross += 8; wThrough -= 2; }
    else if (cB.defWidth === 2) { wCross -= 8; wThrough += 1.5; }
    var wCut = 4 + cA.cutW * 3 + (i.attWidth >= 1 ? 1 : 0);
    var wLong = 2.5 + cA.longShot * 0.8 + (cA.attPush >= 5 ? 1 : 0) + (cB.def > cA.att + 6 ? 2 : 0) + (cA.gkDist ? 2 : 0);
    var wBox = 3 + cA.boxW * 1.6;
    var wDribble = 3 + (cA.byZone.FW.concat(cA.byZone.AM).reduce(function (s, r) { return s + r.p.a[3]; }, 0) / Math.max(1, cA.byZone.FW.length + cA.byZone.AM.length) - 75) * 0.25
      + (i.attWidth === 2 ? 1 : 0);
    /* 传球风格接线（共识 A9）：直传/长传走身后是本能，短传靠渗透小补；长传冲吊喂传中 */
    if (i.pass >= 3) { wThrough += 3; wCross += i.pass === 4 ? 2 : 0; wLong += i.pass === 4 ? 1 : 0; }
    else if (i.pass <= 1) wThrough += 1;
    entries.push({ w: Math.max(0.5, wCross), v: 'cross' });
    entries.push({ w: Math.max(0.5, wThrough), v: 'through' });
    entries.push({ w: Math.max(0.5, wCut), v: 'cut' });
    entries.push({ w: Math.max(0.5, wLong), v: 'long' });
    entries.push({ w: Math.max(0.5, wBox), v: 'box' });
    entries.push({ w: Math.max(0.3, wDribble), v: 'dribble' });
    if (isCounter) return 'counter';
    return wpick(state.rng, entries);
  }

  function focusFlank(state, side) {
    var f = state.teams[side].tactic.instr.focus;
    var r = state.rng();
    if (f === 'left') return 'L';
    if (f === 'right') return 'R';
    if (f === 'middle') return 'C';
    if (f === 'flanks') return r < 0.5 ? 'L' : 'R';
    return r < 0.34 ? 'L' : r < 0.68 ? 'C' : 'R';
  }

  function sideOf(r) { return r.slot.y < 45 ? 'L' : r.slot.y > 55 ? 'R' : 'C'; }

  function attackerCandidates(state, side, cA, type, flank) {
    var pool = cA.byZone.FW.concat(cA.byZone.AM);
    if (type === 'long') pool = cA.byZone.MF.concat(cA.byZone.AM, cA.byZone.DM, cA.byZone.FW);
    if (type === 'cross' || type === 'cut') {
      var wide = cA.byZone.FW.concat(cA.byZone.AM, cA.byZone.MF, cA.byZone.DM).filter(function (r) { return sideOf(r) === flank; });
      if (wide.length) pool = wide.concat(cA.byZone.FW);
    }
    if (!pool.length) pool = cA.on;
    return pool;
  }
  function weightedPlayer(state, pool, keyFn) {
    if (!pool || !pool.length) return null;
    return wpick(state.rng, pool.map(function (r) { return { w: Math.max(0.05, keyFn(r)), v: r }; }));
  }

  /* xG 基准（共识 A4/A5）：反击 0.27→0.18 摘掉免费王牌；直塞 0.21→0.30 恢复绝佳机会；
     long/box/cross 压量，重建“少量大机会+大量低质射门”的真实分布 */
  var XG = { cross: 0.13, through: 0.34, cut: 0.24, long: 0.05, box: 0.12, dribble: 0.16, counter: 0.18, corner: 0.06, fk: 0.07, pen: 0.78, chaos: 0.12 };

  /* ---------------- 射门裁决 ---------------- */
  function resolveShot(state, side, type, shooter, cB, qualityMul, note) {
    var st = state.stats[side], team = state.teams[side];
    var xg = clamp(XG[type] * qualityMul, 0.02, 0.95);
    st.shots++; shooter.stats.shots++; shooter.stats.xg += xg; st.xg += xg;
    /* 射门/进球可视化缓冲（共识 B2）：球飞向球门由呈现层播放 */
    (state.pendingShots = state.pendingShots || []).push({
      kind: 'shot', team: side, type: type, uid: shooter.uid, name: shooter.p.name,
      gx: side === 0 ? 99.5 : 0.5, gy: 50 + (state.viewRng() - 0.5) * 10
    });
    if (type === 'cross') st.crossShots++;
    if (xg > 0.25 || type === 'counter') st.bigChances++; /* 反击本身即绝佳机会；其余按 xG 计 */
    var finish = shooter.p.a[1];
    var roleE = (TAC.findRole(shooter.slot.role) || {}).eff || {};
    var onTargetP = clamp(0.38 + (finish - 70) * 0.008 + (roleE.finish ? 0.07 : 0)
      + (type === 'long' ? -0.06 : type === 'pen' ? 0.7 : 0), 0.2, 0.96); /* R5：点球转化回 74-78% */
    var isOn = state.rng() < onTargetP;
    var goalP;
    var ev = { min: state.minute, team: side, type: '', shotType: type, xg: xg, text: '' };
    if (!isOn) {
      st.xg += 0; /* xG 已计，未射正 */
      ev.type = 'miss';
      ev.text = missText(state, side, type, shooter, note);
      state.events.push(ev);
      shooter.rating -= 0.08;
      return ev;
    }
    st.sot++; shooter.stats.sot++;
    var gk = cB.gk;
    var saveP = clamp(0.62 + (gk.ref - 78) * 0.012 - (xg - 0.15) * 0.5 + (type === 'counter' ? -0.06 : 0), 0.12, 0.93);
    if (type === 'pen') saveP = clamp(saveP * 0.3, 0.04, 0.22); /* 点球转化 ~76%（R5：玩家实测 86% 冲过头，上限回调） */
    var beaten = state.rng() > saveP;
    if (beaten) {
      var asst = findAssister(state, side, shooter);
      var wasLead = state.score[side] > state.score[1 - side];
      var wasDraw = state.score[side] === state.score[1 - side];
      state.score[side]++;
      shooter.stats.goals++;
      /* 评分方差（共识 A14）：进球加成递增 + 低 xG 神仙球 + 终盘关键球 */
      shooter.rating += shooter.stats.goals === 1 ? 1.15 : shooter.stats.goals === 2 ? 0.95 : 1.25;
      if (xg < 0.12) shooter.rating += 0.25;
      if (state.minute > 85) shooter.rating += 0.2;
      if (asst) { asst.stats.assists++; asst.rating += 0.55; asst.stats.keyPasses++; }
      ev.type = 'goal';
      ev.score = state.score.slice();
      var ps = state.pendingShots || [];
      if (ps.length) ps[ps.length - 1].kind = 'goal'; /* 本次射门升级为进球演出 */
      ev.text = goalText(state, side, type, shooter, asst, note, wasLead, wasDraw);
      state.events.push(ev);
      state.lastGoalMin = state.minute;
      return ev;
    }
    var gkRt = cB.on.filter(function (r) { return r.slot.zone === 'GK'; })[0];
    if (gkRt) { gkRt.stats.saves++; gkRt.rating += 0.18; }
    ev.type = 'save';
    ev.text = saveText(state, side, type, shooter, cB, note);
    state.events.push(ev);
    shooter.rating += 0.06;
    return ev;
  }

  /* 点球：penSide=主罚方，foulingSide=犯规方（守门方）。主罚人优先指定点球手→队长→权重挑选 */
  function takePenalty(state, foulingSide, foulerName) {
    var penSide = 1 - foulingSide;
    var cP = compileTeam(state, penSide);
    var cD = compileTeam(state, foulingSide);
    var spP = state.teams[penSide].tactic.setPiece || {};
    var penRt = spP.pen ? cP.on.filter(function (r) { return r.uid === spP.pen; })[0] : null;
    if (!penRt && state.teams[penSide].tactic.captain) {
      penRt = cP.on.filter(function (r) { return r.uid === state.teams[penSide].tactic.captain && r.slot.zone !== 'GK'; })[0] || null;
    }
    if (!penRt) {
      penRt = weightedPlayer(state, cP.on.filter(function (r) { return r.slot.zone !== 'GK'; }), function (r) { return r.p.a[1] * 2 + r.p.a[3] * 0.3; });
    }
    if (!penRt) return;
    state.events.push({ min: state.minute, type: 'pen', team: penSide, text: '点球！' + foulerName + ' 禁区内放倒对手，主裁判直指点球点！' + penRt.p.name + ' 主罚……' });
    resolveShot(state, penSide, 'pen', penRt, cD, clamp(0.8 + (penRt.p.a[1] - 75) * 0.012, 0.6, 1.3), '（点球）');
  }

  function findAssister(state, side, shooter) {
    var cA = compileTeam(state, side);
    var pool = cA.on.filter(function (r) { return r !== shooter && r.slot.zone !== 'GK'; });
    if (!pool.length) return null;
    return weightedPlayer(state, pool, function (r) {
      var k = r.p.a[2] / 70;
      var role = TAC.findRole(r.slot.role), e = (role && role.eff) || {};
      if (e.key) k *= 1.8;
      if (e.buildup) k *= 1.3;
      if (r.slot.zone === 'FW' || r.slot.zone === 'AM') k *= 1.2;
      return k;
    });
  }

  /* ---------------- 事件文案（池扩容 + 同场冷却，共识 B8） ---------------- */
  function pickFresh(state, key, arr) {
    var used = state.textUsed || (state.textUsed = {});
    var u = used[key] || (used[key] = {});
    var free = arr.filter(function (t) { return !u[t]; });
    if (!free.length) { used[key] = {}; free = arr; } /* 全用过一轮：重置冷却 */
    var s = pick(state.rng, free);
    u[s] = 1;
    return s;
  }
  function nm(state, side, r) { return r.p.name; }
  function missText(state, side, type, shooter, note) {
    var t = {
      cross: ['传中找到{A}，甩头攻门偏出横梁！', '角球混战里{A}的抢点射门稍稍偏出。', '{A}接到传中凌空抽射，打飞了！', '{A}前点一蹭，皮球滑门而过。', '传中落点极佳，可惜{A}顶高了。', '{A}在人堆里抢到第一点，头球偏出远门柱。'],
      through: ['{A}反越位插入禁区，单刀推射滑门而出！', '直塞撕开防线，{A}的射门被回追后卫干扰偏出。', '{A}获得单刀！晃过角度后推射竟然偏了！', '身后球送到位，{A}的挑射高出门楣。', '{A}单刀赴会，皮球被他踢上了看台！'],
      cut: ['{A}内切兜射远角，皮球擦柱而出！', '{A}肋部起脚，稍稍偏出立柱。', '{A}内切爆射，被防守者用身体挡出底线。', '{A}横向摆脱后打近角，偏出！'],
      long: ['{A}外围突施冷箭，皮球高出横梁。', '{A}远程发炮偏出，看台一片叹息。', '{A}在三十米开外拔脚怒射，打偏了。', '{A}的远射又高又偏，场边教练直摇头。'],
      box: ['{A}禁区混战中捅射，皮球偏出。', '{A}小禁区抢点一脚，滑门而过！', '{A}门前六码仓促出脚，未能形成威胁。', '{A}在门前的乱战中伸腿一捅，偏出立柱！'],
      dribble: ['{A}连过两人后起脚，被防守封堵出底线。', '{A}盘带内切射门偏出远角。', '{A}一路生吃防守队员，最后的射门软绵无力。', '{A}过人如麻，射门却交给了球迷。'],
      counter: ['快速反击！{A}长驱直入推射偏出。', '反击中{A}获得良机，可惜射术欠佳打飞。', '{A}反击中形成半单刀，被回追球员干扰打偏。', '转换进攻风驰电掣，{A}的收尾一击令人扼腕。'],
      pen: ['{A}的点球射失了！门将判断对了方向！', '天哪！{A}把点球踢上了看台！', '{A}的射门被门将神勇扑出，点球不进！']
    }[type] || ['{A}射门偏出。'];
    return pickFresh(state, 'miss' + type, t).replace('{A}', nm(state, side, shooter)) + (note || '');
  }
  function saveText(state, side, type, shooter, cB, note) {
    var t = {
      cross: ['{A}的头球攻门被门将飞身扑出！', '{A}抢点垫射，门将反应神速封出！', '{A}近距离头槌，被门将下意识挡出！', '{A}大力头攻，门将稳稳将球抱住。'],
      through: ['{A}单刀直入，门将出击用身体挡出！', '{A}的推射被门将单掌拒之门外！', '{A}与门将一对一，皮球被神奇的扑救挡出！', '{A}的低射擦着门柱内侧，门将极限救险！'],
      cut: ['{A}的弧线球直奔死角，门将飞身托出横梁！', '{A}内切爆射被门将稳稳没收。', '{A}的兜射角度刁钻，门将单拳化解！'],
      long: ['{A}的远射势大力沉，门将托出横梁！', '{A}远射被门将倒地封住。', '{A}的贴地斩被门将用指尖蹭出底线！'],
      box: ['{A}近距离推射，门将神扑！', '{A}的捅射被门将用腿挡出。', '{A}几乎面对空门，门将竟然闪身挡出！'],
      dribble: ['{A}突破后低射被门将没收。', '{A}的射门被门将挡出底线。', '{A}的冷射被门将温柔收进怀中。'],
      counter: ['反击！{A}的射门被门将神勇扑出！', '{A}单刀球被门将用指尖改变轨迹！', '反击射门势在必进，门将做出世界级扑救！'],
      pen: ['门将扑出点球！{A}抱头难以置信！', '{A}射向中路，被门将双腿挡出！']
    }[type] || ['{A}的射门被没收。'];
    return pickFresh(state, 'save' + type, t).replace('{A}', nm(state, side, shooter)) + (note || '');
  }
  function goalText(state, side, type, shooter, asst, note, wasLead, wasDraw) {
    /* 补时绝杀/扳平专属文案（共识 A8，球迷必加项） */
    if (state.minute > 90 && (wasLead || wasDraw) && type !== 'pen') {
      var late = wasDraw
        ? pickFresh(state, 'lateEq', ['第90+{X}分钟，{A}挺身而出扳平比分！！绝平球让全场沸腾！！', '补时阶段！{A}（第90+{X}分钟）力挽狂澜，绝平入网！！'])
        : pickFresh(state, 'lateW', ['第90+{X}分钟，{A}杀死了比赛！！读秒绝杀！！', '天神下凡！补时第{X}分钟，{A}完成绝杀！！', '第90+{X}分钟！{A}一锤定音，这就是足球该有的剧本！！']);
      return late.replace('{A}', nm(state, side, shooter)).replace('{X}', String(state.minute - 90)) + ' 比分 ' + state.score[0] + '-' + state.score[1] + (note || '');
    }
    var t = {
      cross: ['GOAL！{B}传中，{A}门前抢点破门！！', 'GOAL！角球开出，{A}力压防守头槌入网！！', 'GOAL！{B}精准传中找到{A}，一蹴而就！！', 'GOAL！{A}甩头攻门，皮球应声入网！！', 'GOAL！后点包抄！{A}用身体把球撞进大门！！'],
      through: ['GOAL！{B}送出直塞，{A}单刀冷静推射入网！！', 'GOAL！反越位成功！{A}挑射破门！！', 'GOAL！{A}接身后球长驱直入，面对门将轻松推射得手！！', 'GOAL！手术刀般的直塞！{A}单刀锁定胜局！！'],
      cut: ['GOAL！{A}内切一脚世界波直挂死角！！', 'GOAL！{B}做球，{A}兜射远角得手！！', 'GOAL！{A}内切爆射近角，门将鞭长莫及！！'],
      long: ['GOAL！{A}30米开外重炮轰门直挂死角！！', 'GOAL！{A}的远射穿过人墙窜入网窝！！', 'GOAL！{A}张弓搭箭远射建功，世界波！！'],
      box: ['GOAL！禁区混战，{A}补射入网！！', 'GOAL！{B}做球，{A}门前抢点铲射得手！！', 'GOAL！门前的乱战，{A}最后一击致命！！'],
      dribble: ['GOAL！{A}连过数人后低射破门！！', 'GOAL！{A}内切爆射近角得手！！', 'GOAL！{A}个人能力的极致展现，连过三人推射空门！！'],
      counter: ['GOAL！快速反击！{B}策动，{A}单刀赴会一击致命！！', 'GOAL！防守反击一气呵成，{A}推射空门得手！！', 'GOAL！转换进攻快如闪电，{A}终结了这次奔袭！！'],
      pen: ['GOAL！点球稳稳罚进，{A}骗过门将一蹴而就！！', 'GOAL！{A}顶住十二码的压力，皮球应声入网！！', 'GOAL！{A}的点球势大力沉，门将猜对了方向也无能为力！']
    }[type] || ['GOAL！{A}破门！'];
    var s = pickFresh(state, 'goal' + type, t).replace('{A}', nm(state, side, shooter));
    s = s.replace('{B}', asst ? nm(state, side, asst) : '队友');
    return s + ' 比分 ' + state.score[0] + '-' + state.score[1] + (note || '');
  }

  /* 比赛分钟展示：上半场补时显示 45+X（共识 A8） */
  function displayMin(state) {
    if (state.half === 1 && state.minute > 45) return 45 + (state.minute - 45);
    return state.minute;
  }

  /* ---------------- 每分钟 tick ---------------- */
  function stepMinute(state) {
    if (state.finished) return state;
    state.minute++;
    var m = state.minute;
    if (state.half === 1 && m === 45 && state.stoppage1 === 0) {
      state.stoppage1 = 1 + Math.floor(state.rng() * 3);
      state.events.push({ min: 45, type: 'info', text: '上半场补时 ' + state.stoppage1 + ' 分钟。' });
    }
    /* 中场休息：上半场补时打完 → 体能恢复，分钟回拨到 45，下一 tick 进入 46' */
    if (state.half === 1 && m >= 46 + state.stoppage1) {
      state.half = 2;
      state.minute = 45;
      state.events.push({ min: 45, type: 'ht', text: '半场结束，双方进入更衣室。比分 ' + state.score[0] + '-' + state.score[1] });
      state.teams.forEach(function (team) {
        team.rt.forEach(function (r) { if (r.on) r.stamina = clamp(r.stamina + 10, 0, 100); });
      });
      return state;
    }
    var cA = compileTeam(state, 0), cB = compileTeam(state, 1);

    /* 体能衰减 */
    [0, 1].forEach(function (side) {
      var team = state.teams[side], c = side === 0 ? cA : cB;
      /* 追分分层（共识 A8）：落后越到后面越搏命，扳平后自动回落 */
      var behind = state.score[side] < state.score[1 - side];
      team.chaseMode = behind ? (m >= 75 ? 2 : m >= 60 ? 1 : 0) : 0;
      c.on.forEach(function (r) {
        if (r.slot.zone === 'GK') { r.stamina -= 0.04; return; }
        var d = 0.4 + c.pressI * 0.3 + (c.tempoF > 1.1 ? 0.08 : 0); /* R5 挂牌②：press 体能斜率 0.3（专家处方值） */
        if (c.attPush >= 5) d += 0.08; /* 全攻的体能代价：末段攻击力下滑（R3-4 支配压制） */
        if (r.slot.duty === 'A') d += 0.18;
        var e = (TAC.findRole(r.slot.role) || {}).eff || {};
        var isWideDef = r.slot.code === 'LB' || r.slot.code === 'RB' || r.slot.role === 'WB' || r.slot.role === 'CWB';
        d += (isWideDef ? team.tactic.instr.overlap * 0.07 : 0); /* 指令：边后卫套上消耗体能 */
        d += (e.overlapS || 0) * 0.12 + (e.box || 0) * 0.05;
        d *= (1.35 - r.p.a[5] / 250);
        r.stamina = clamp(r.stamina - d, 0, 100);
      });
    });

    /* AI 经理 */
    [0, 1].forEach(function (side) {
      if (state.teams[side].ai) aiManager(state, side, side === 0 ? cA : cB);
    });

    /* 抢断统计：防守方按防守权重产出抢断数据（约每队每场 14-18 次） */
    [0, 1].forEach(function (side) {
      var c = side === 0 ? cA : cB;
      if (state.rng() < 0.17) {
        var defenders = c.byZone.DF.concat(c.byZone.DM, c.byZone.MF);
        var tackler = weightedPlayer(state, defenders.length ? defenders : c.on, function (r) {
          var e = (TAC.findRole(r.slot.role) || {}).eff || {};
          return r.p.a[4] * 0.06 + (e.tackle || 0) * 0.5;
        });
        if (tackler) { tackler.stats.tackles++; tackler.rating = clamp(tackler.rating + 0.08, 3, 10); }
      }
    });

    /* 中场争夺（共识 A7）：修复 gegen 同分钟 possession 双计；
       传球风格/出球能力进入控球公式（曼城回 60%+，tempo 不再近支配） */
    var homeAdv = 2.2;
    var pA = 0.5 + (cA.mid - cB.mid) * 0.008 + homeAdv * 0.004
      + ((4 - cA.passR) - (4 - cB.passR)) * 0.016
      + (cA.buildup - cB.buildup) * 0.004
      + (cA.tempoF - cB.tempoF) * 0.012;
    /* 反击的隐性成本（R5 挂牌①）：开反击=深位让出球权（-0.04/轴，counter 不再是免费按钮） */
    pA += (state.teams[0].tactic.instr.counter ? -0.04 : 0) + (state.teams[1].tactic.instr.counter ? 0.04 : 0);
    pA = clamp(pA, 0.20, 0.80);
    var attSide = state.rng() < pA ? 0 : 1;
    var cAtt = attSide === 0 ? cA : cB, cDef = attSide === 0 ? cB : cA;

    /* Gegenpress（R3-4/R4）：反抢收益与逼抢强度²挂钩——松散逼抢开反抢不再白得收益；
       抢回球权有体能代价（全队冲刺围抢） */
    var defTeam = state.teams[1 - attSide];
    if (defTeam.tactic.instr.gegen && state.rng() < cDef.pressI * cDef.pressI * 0.28 * (cDef.avgStam || 100) / 100 * (cDef.mid / Math.max(30, cAtt.mid)) * 0.9) {
      state.insights.pressWins[1 - attSide]++;
      cDef.on.forEach(function (r) { if (r.slot.zone !== 'GK') r.stamina = clamp(r.stamina - 0.5, 0, 100); });
      attSide = 1 - attSide; cAtt = cDef; cDef = attSide === 0 ? cA : cB;
      if (state.rng() < 0.08) state.events.push({ min: m, type: 'info', team: attSide, text: (state.teams[attSide].name) + ' 高位反抢立刻夺回球权，攻势再起！' });
    }
    state.poss[attSide]++;

    /* 反击判定（共识 A4 反击经济）：
       - 频率与持球方暴露度（心态/防线/逼抢区域/门将长传）和反击方锋线速度挂钩
       - 质量在 qmul 里随攻方实力衰减（xG 0.18 + 上限 1.15），强队官方补 counter 形成对冲 */
    defTeam = state.teams[1 - attSide]; /* gegen 可能已交换球权，刷新防守方引用 */
    var counterNow = false;
    if (defTeam.tactic.instr.counter && state.minute - state.lastGoalMin > 2) {
      var fwSpd = 0, fwCnt = 0;
      cDef.byZone.FW.forEach(function (r) { fwSpd += r.p.a[0]; fwCnt++; });
      var spdF = fwCnt ? clamp(0.55 + (fwSpd / fwCnt - 70) / 55, 0.35, 1.5) : 0.5;
      var cp = 0.030 * cAtt.pushF * (cAtt.lineX >= 40 ? 1.7 : cAtt.lineX <= 28 ? 0.45 : 1) * spdF;
      cp *= 1 + (cAtt.pressX - 48) * 0.008;   /* 逼抢区域：越高位逼抢，被打穿后的空间越大 */
      cp += cAtt.gkDist * 0.004;              /* 门将长传出球更易被拦截反击 */
      if (state.rng() < cp) counterNow = true;
    }

    if (counterNow) {
      state.stats[1 - attSide].counters++;
      state.insights.counters[1 - attSide]++;
      state.insights.countersConceded[attSide]++;
      var ct = chanceType(state, 1 - attSide, cDef, cAtt, true);
      var pool = cDef.byZone.FW.concat(cDef.byZone.AM, cDef.byZone.MF);
      var shooter = weightedPlayer(state, pool.length ? pool : cDef.on, function (r) {
        return r.p.a[0] * 0.6 + r.p.a[1] * 0.4 + (r.slot.role === 'AF' || r.slot.role === 'P' ? 15 : 0);
      }) || cDef.on[0];
      var qmul = clamp(0.9 + (cDef.att - cAtt.def) * 0.02 + (cAtt.lineX >= 43 ? 0.25 : 0), 0.5, 1.15);
      var ev = resolveShot(state, 1 - attSide, 'counter', shooter, cAtt, qmul, counterNow && cAtt.lineX >= 43 ? '（打穿高位防线）' : '');
      if (cAtt.lineX >= 43 && (ev.type === 'goal')) state.insights.throughHigh[2]++;
    } else {
      attackPhase(state, attSide, cAtt, cDef);
    }

    /* 犯规/牌 */
    [0, 1].forEach(function (side) {
      var team = state.teams[side], c = side === 0 ? cA : cB;
      var chase = state.teams[side].chaseMode ? 1.35 : 1;
      var foulP = 0.05 + c.pressI * 0.06 + (c.tackleAggr - 1) * 0.015;
      if (state.rng() < foulP * chase * (state.minute > 75 ? 1.3 : 1)) {
        var fouler = weightedPlayer(state, c.on.filter(function (r) { return r.slot.zone !== 'GK'; }), function (r) {
          var e = (TAC.findRole(r.slot.role) || {}).eff || {};
          return 1 + (e.tackle || 0) * 0.4 + (c.tackleAggr === 2 ? 1 : 0) + r.p.a[4] / 200;
        });
        var st = state.stats[side];
        if (!fouler) fouler = c.on[0];
        if (fouler) {
        st.fouls++; fouler.stats.fouls++;
        var opp = state.teams[1 - side];
    /* 牌率对齐真实：黄牌 3-4.5/场、红牌（两黄+直接）~0.18/场（共识 A3/A6） */
    var cardP = (c.tackleAggr === 2 ? 0.22 : c.tackleAggr === 0 ? 0.14 : 0.21) * chase;
    var r = state.rng();
    if (m >= 25 && r < 0.003) { /* 恶性犯规直接红牌：开场阶段裁判更宽容（R3-10） */
      /* 恶性犯规直接红牌（破坏单刀级），保持稀有 */
      fouler.stats.red = 1; fouler.on = false; st.red++;
      fouler.rating -= 1.5;
      state.events.push({ min: m, type: 'red', team: side, text: '红牌！' + fouler.p.name + ' 作为最后一名防守球员拉倒对手，主裁判直接出示红牌！' + team.name + ' 十人应战！' });
    } else if (r < cardP) {
      if (fouler.stats.yellow >= 1) {
        if (state.rng() < 0.33) { /* 两黄变红的二次转化折减，压红牌率 */
          fouler.stats.red = 1; fouler.on = false; st.red++;
          fouler.rating -= 1.2;
          state.events.push({ min: m, type: 'red', team: side, text: '红牌！' + fouler.p.name + ' 两黄变一红被罚下！' + team.name + ' 十人应战！' });
        } else {
          state.events.push({ min: m, type: 'foul', team: side, text: '裁判高抬贵手，' + fouler.p.name + ' 逃过第二张黄牌。' });
        }
      } else {
        fouler.stats.yellow++; st.yellow++;
        fouler.rating -= 0.3;
        var ytxt = pickFresh(state, 'yellow', [fouler.p.name + ' 被黄牌警告！', '战术犯规，' + fouler.p.name + ' 吃到黄牌。', '裁判毫不犹豫掏牌，' + fouler.p.name + ' 见黄。', fouler.p.name + ' 铲倒对手，染黄。', '犯规阻止反击，' + fouler.p.name + ' 领取黄牌。']);
        state.events.push({ min: m, type: 'yellow', team: side, text: ytxt });
      }
      } else if (state.rng() < 0.25) {
        state.events.push({ min: m, type: 'foul', team: side, text: fouler.p.name + ' 防守犯规，' + opp.name + ' 获得任意球。' });
      }
        /* 禁区犯规 → 点球 */
        if (state.rng() < 0.016) {
          takePenalty(state, side, fouler.p.name);
        }
        }
      }
    });

    /* 定位球（角球/任意球射门）——尊重玩家指定的主罚人
       角球去水（共识 A1）：频率砍半 + 射门转化 32% + xG 0.06 + 上限 1.4，产量乘攻击线实力 */
    [0, 1].forEach(function (side) {
      var c = side === 0 ? cA : cB;
      var sp = state.teams[side].tactic.setPiece || {};
      var cornerP = (0.018 + c.pushF * 0.011 + (c.crossW > 6 ? 0.008 : 0) + (c.overlap || 0) * 0.0025) * (0.85 + c.att / 400);
      if (state.rng() < cornerP) {
        state.stats[side].corners++;
        if (state.rng() < 0.32) {
          var tgt = weightedPlayer(state, c.on.filter(function (r) { return r.slot.zone !== 'GK'; }), function (r) {
            var e = (TAC.findRole(r.slot.role) || {}).eff || {};
            return 1 + r.p.a[5] / 50 + (e.aerial ? 2 : 0);
          });
          var cornerTaker = sp.corner ? c.on.filter(function (r) { return r.uid === sp.corner; })[0] : null;
          var qm = clamp(0.8 + (tgt.p.a[5] - 75) * 0.02 + c.link * 0.05 + (cornerTaker ? (cornerTaker.p.a[2] - 75) * 0.012 : 0), 0.5, 1.4);
          var ev = resolveShot(state, side, 'corner', tgt, side === 0 ? cB : cA, qm, '（角球进攻' + (cornerTaker ? '，' + cornerTaker.p.name + ' 主罚' : '') + '）');
          if (ev.type === 'goal') state.insights.setPieceGoals[side]++;
        }
      }
      var fkP = 0.004; /* 直接任意球射门：约每队每场 0.35 次 */
      if (state.rng() < fkP) {
        var fkTaker = sp.fk ? c.on.filter(function (r) { return r.uid === sp.fk; })[0] : null;
        var taker = fkTaker || weightedPlayer(state, c.on.filter(function (r) { return r.slot.zone !== 'GK'; }), function (r) { return r.p.a[1] + r.p.a[2]; });
        resolveShot(state, side, 'fk', taker, side === 0 ? cB : cA, clamp(0.8 + (taker.p.a[2] - 75) * 0.015, 0.5, 1.6), '（前场任意球，' + taker.p.name + ' 主罚）');
      }
    });

    /* 越位（共识 A6：全线下调 ~40%）：进攻方 side 的越位风险由对手防线高度与越位陷阱决定 */
    [0, 1].forEach(function (side) {
      var own = side === 0 ? cA : cB;
      var opp = side === 0 ? cB : cA;
      var offP = 0.0068 + (opp.lineX >= 40 ? 0.009 : 0) + (opp.offsideTrap ? 0.013 : 0); /* R3 球迷处方：越位再降 */
      if (state.rng() < offP) {
        var runners = own.byZone.FW.concat(own.byZone.AM);
        var runner = weightedPlayer(state, runners.length ? runners : own.on, function (r) { return r.p.a[0]; });
        if (!runner) return;
        runner.stats.offsides++;
        state.stats[side].offsides++;
        var why = opp.offsideTrap ? '对方越位陷阱得手，' : '';
        state.events.push({ min: m, type: 'offside', team: side, text: why + pickFresh(state, 'offside', [runner.p.name + ' 越位在先，进攻无效。', runner.p.name + ' 启动早了半拍，旗子举起来了。', '又是反越位失败，' + runner.p.name + ' 陷入越位陷阱。', runner.p.name + ' 追上了直塞，可惜越位在先。']) });
      }
    });

    /* 阵地战主动进攻 */
    /* (attackPhase 已在反击分支外调用；此处仅为统计传控) */

    /* 换人窗口/替补影响在 UI 与 aiManager 中处理 */
    /* pitch frame */
    pushFrame(state, cA, cB, attSide);
    /* 终场判定：补时 5-11 分钟，随犯规/进球数浮动（共识 A8，对齐真实 11 分钟量级） */
    if (m === 90 && state.stoppage === 0) {
      state.stoppage = clamp(5 + Math.floor(state.rng() * 4) + Math.floor((state.stats[0].fouls + state.stats[1].fouls) / 15) + Math.floor((state.score[0] + state.score[1]) / 3), 5, 11);
      state.events.push({ min: 90, type: 'info', text: '伤停补时 ' + Math.round(state.stoppage) + ' 分钟。' });
    }
    if (m >= 90 + state.stoppage) {
      state.finished = true;
      state.events.push({ min: m, type: 'ft', text: '全场比赛结束！最终比分 ' + state.score[0] + ' - ' + state.score[1] });
    }
    return state;
  }

  /* 防守方某侧/中路的对抗质量（R4 修正：中路无专人在位时用 DF+DM 全员均值，
     避免 4-2-3-1 类阵型中路带只剩 AM 导致 defQ 被采样成场上最低值） */
  function flankDefQ(cDef, flank) {
    var want = flank === 'L' ? 'L' : flank === 'R' ? 'R' : 'C';
    var dfdm = cDef.byZone.DF.concat(cDef.byZone.DM);
    var arr = dfdm;
    if (want !== 'C') {
      arr = dfdm.filter(function (r) { return sideOf(r) === want; });
      if (!arr.length) arr = dfdm;
    }
    if (!arr.length) return 75;
    return arr.reduce(function (s, r) { return s + r.p.a[4]; }, 0) / arr.length;
  }

  function attackPhase(state, side, cAtt, cDef) {
    var m = state.minute;
    /* 控球传控：传球成功率统计（受逼抢&传球风格&门将出球方式影响）；
       量级对齐真实英超（约每队 400+ 传、82-86% 成功率） */
    var team = state.teams[side];
    var st = state.stats[side];
    var passRisk = [0.085, 0.10, 0.12, 0.15, 0.19][cAtt.passR] + cDef.pressI * 0.12 - cAtt.buildup * 0.005 + cAtt.gkDist * 0.015;
    var passN = 7 + Math.round(state.rng() * 5 * cAtt.tempoF);
    for (var i = 0; i < passN; i++) {
      var passer = weightedPlayer(state, cAtt.on.filter(function (r) { return r.slot.zone !== 'FW' || state.rng() < 0.3; }), function (r) { return r.p.a[2]; });
      st.passAtt++; passer.stats.passes++;
      if (state.rng() > clamp(passRisk, 0.02, 0.3)) { st.passOk++; passer.stats.passOk++; }
    }

    /* 机会生成（共识 A2/A8/A9）：
       - ratio 指数 1.7→2.35 拉开强弱；主场加成强化
       - 末段分钟函数翘尾 + 追分分层，重建真实的时间分布
       - 逼抢/抢断/人数对机会率的真实抑制（死指令接线） */
    var base = 0.124; /* R3-10（球迷处方）：射门量回到真实保级队水平 */
    var blockD = 0;
    /* ratio 以 0.93 居中（防线评分结构性高于攻击线，不居中则高指数把全场进球腰斩） */
    var ratio = ((cAtt.att + cAtt.mid * 0.35) / Math.max(30, cDef.def + blockD + cDef.mid * 0.42)) / 0.87;
    var tempoRisk = cAtt.tempoF > 1.15 ? 1.15 : cAtt.tempoF < 0.9 ? 0.88 : 1;
    var waste = (cAtt.timeWaste && state.score[side] > state.score[1 - side] && m > 75) ? 0.55 : 1;
    if (m > 80 && state.score[side] > state.score[1 - side]) waste = Math.min(waste, 0.72); /* 领先方终盘自然收敛 */
    var chase = team.chaseMode === 2 ? 1.4 : team.chaseMode === 1 ? 1.22 : (state.score[side] < state.score[1 - side] ? 1.05 : 1);
    var minF = 0.9 + 0.58 * Math.max(0, m - 60) / 30;   /* 60' 0.90 → 90' 1.48 */
    if (m > 90) minF *= 0.9; /* 补时段单独降温（R3 球迷处方：90+ 略过热） */
    /* 比分胶着时的末段对攻（双方都想要绝杀） */
    if (m > 75 && state.score[side] === state.score[1 - side]) chase = Math.max(chase, 1.35);
    var homeF = side === 0 ? 1.18 : 0.9;
    /* 领先方末段收缩保护（大巴封堵+拖延）：追分方末段压制力打折 */
    var pChanceGuard = (m > 75 && state.score[1 - side] > state.score[side]) ? 0.87 : 1; /* R3 球迷处方：追分方不败率回真实带 */
    /* 追分方的身后代价：压上抢进攻人数，就有被打反击/打身车的空间（绝杀经济） */
    var oppChase = state.teams[1 - side].chaseMode;
    var chaseCost = oppChase ? 1 + oppChase * 0.14 : 1;
    /* 防守端真实收益接线（R3-2 收益面加强）：逼抢干扰（区域越高越强）、抢断中断、门将长传直供 */
    /* 防守端真实收益接线（R4 终版）：干扰力随压迫方体能衰减（高压 75' 后自然失效）且封顶，
       防止「全压满」堆叠出无解压制 */
    var stamF = clamp((cDef.avgStam || 100) / 80, 0.55, 1.15);
    var disrupt = Math.min(0.24, (cDef.pressI * (0.075 + state.teams[1 - side].tactic.instr.pressZone * 0.025)
      + [0.0, 0.055, 0.11][cDef.tackleAggr]) * stamF); /* R5 挂牌②：disrupt 上限 0.24（专家处方值） */
    var pChance = clamp(base * Math.pow(ratio, 2.45) * cAtt.pushF * tempoRisk * waste * chase * minF * homeF
      * cAtt.menChance * (1 + (cDef.short || 0) * 0.6) * pChanceGuard * chaseCost * (cAtt.gkDist ? 1.03 : 1) * (1 - disrupt), 0.004, 0.48);
    if (state.rng() > pChance) {
      /* 无机会：偶尔播报推进/配合 */
      if (state.rng() < 0.05) {
        var hero = weightedPlayer(state, cAtt.on, function (r) {
          var e = (TAC.findRole(r.slot.role) || {}).eff || {};
          return e.buildup ? 3 : 1;
        });
        state.events.push({ min: m, type: 'info', team: side, text: pickFresh(state, 'info', [
          hero.p.name + ' 组织调度，' + team.name + ' 耐心倒脚寻找空当。',
          team.name + ' 在肋部连续撞墙配合，可惜最后一传质量欠佳。',
          hero.p.name + ' 试图送出直塞，被防守球员识破拦截。',
          team.name + ' 的推进在中场受阻，攻守易势。',
          hero.p.name + ' 尝试远距离调度，落点被防守方控制。',
          team.name + ' 控住球权稳步推进，防线立足未稳的机会还没出现。'
        ]) });
      }
      return;
    }
    var type = chanceType(state, side, cAtt, cDef, false);
    var flank = focusFlank(state, side);
    /* 进攻侧重的对位加成（R3-3 归一）：只有效对手防守弱侧才有收益，
       打强侧为负；balanced 无修正——不再是有侧重就白赚 */
    var fFocus = state.teams[side].tactic.instr.focus;
    var matchup = 0;
    if (fFocus !== 'balanced') {
      if (flank === 'C') {
        var wingAvg = (flankDefQ(cDef, 'L') + flankDefQ(cDef, 'R')) / 2;
        matchup = clamp((wingAvg - flankDefQ(cDef, 'C')) / 180, -0.08, 0.14);
      } else {
        matchup = clamp((flankDefQ(cDef, flank === 'L' ? 'R' : 'L') - flankDefQ(cDef, flank)) / 180, -0.08, 0.14);
      }
    }
    var pool = attackerCandidates(state, side, cAtt, type, flank);
    var shooter;
    var qmul = 1, qmulBase = 0, note = '';
    if (type === 'cross') {
      var crosser = weightedPlayer(state, pool, function (r) {
        var e = (TAC.findRole(r.slot.role) || {}).eff || {};
        return r.p.a[2] * 0.6 + (e.cross || 0) * 3;
      });
      shooter = weightedPlayer(state, cAtt.on.filter(function (r) { return r.slot.zone === 'FW' || r.slot.zone === 'AM' || ((TAC.findRole(r.slot.role) || {}).eff || {}).box; }),
        function (r) { var e = (TAC.findRole(r.slot.role) || {}).eff || {}; return r.p.a[5] * 0.6 + r.p.a[1] * 0.4 + (e.aerial ? 8 : 0); });
      if (!crosser && !shooter) return;
      if (!crosser) crosser = shooter;
      if (!shooter) shooter = crosser;
      var defA = cDef.byZone.DF.reduce(function (s, r) { return s + r.p.a[5]; }, 0) / Math.max(1, cDef.byZone.DF.length);
      /* 防守宽度：收缩的密集禁区更难传中，拉开的宽阵覆盖传中点；
         边后卫套上指令提升传中质量（更多包抄层次） */
      if (cDef.defWidth === 0) qmulBase += 0.16;
      else if (cDef.defWidth === 2) qmulBase -= 0.25;
      qmulBase += (cAtt.overlap || 0) * 0.05;
      qmul = clamp(0.7 + (crosser.p.a[2] - 72) * 0.015 + (shooter ? (shooter.p.a[5] - defA) * 0.008 : 0) + cAtt.link * 0.06 + qmulBase, 0.4, 2);
      qmul *= 1 + matchup;
      /* 传中 vs 无支点 */
      var hasTarget = cAtt.on.some(function (r) { var e = (TAC.findRole(r.slot.role) || {}).eff || {}; return r.slot.zone === 'FW' && (e.aerial || e.holdUp || r.p.a[5] >= 80); });
      if (!hasTarget) {
        state.insights.crossNoTarget[2]++;
        qmul *= 0.72; note = '（禁区内缺乏抢点目标）';
        state.insights.crossNoTarget[side]++;
      }
      resolveShot(state, side, 'cross', shooter || crosser, cDef, qmul, note);
      return;    }
    if (type === 'through') {
      var passer2 = weightedPlayer(state, cAtt.on.filter(function (r) { return r.slot.zone !== 'GK'; }), function (r) {
        var e = (TAC.findRole(r.slot.role) || {}).eff || {};
        return r.p.a[2] + (e.key ? 15 : 0) + (e.buildup ? 8 : 0);
      });
      shooter = weightedPlayer(state, cAtt.byZone.FW.concat(cAtt.byZone.AM).length ? cAtt.byZone.FW.concat(cAtt.byZone.AM) : cAtt.on,
        function (r) { return r.p.a[0] * 0.55 + r.p.a[1] * 0.45; });
      if (!passer2 || !shooter) return;
      /* 直塞 vs 防线：高位被打穿概率、越位陷阱 */
      if (cDef.offsideTrap && state.rng() < 0.30) {
        shooter.stats.offsides++; state.stats[side].offsides++;
        state.events.push({ min: m, type: 'offside', team: side, text: passer2.p.name + ' 送出直塞，但 ' + shooter.p.name + ' 启动稍早，越位！' });
        return;
      }
      var highLine = cDef.lineX >= 43;
      if (highLine) {
        state.insights.throughHigh[2]++; state.insights.throughHigh[side]++;
        note = '（身后球打穿高位防线）';
      }
      /* 防守宽度影响渗透空间 */
      if (cDef.defWidth === 2) qmulBase += 0.06;
      else if (cDef.defWidth === 0) qmulBase -= 0.12;
      var qmul = clamp(0.75 + (passer2.p.a[2] - 74) * 0.02 + (shooter.p.a[0] - cDef.lineX * 1.6) * 0.004 + (highLine ? 0.28 : cDef.lineX <= 29 ? -0.3 : 0) + qmulBase, 0.4, 2.4);
      qmul *= 1 + matchup;
      resolveShot(state, side, 'through', shooter, cDef, qmul, note);
      if (state.rng() < 0.5) {
        var pa = findAssister(state, side, shooter);
        if (pa) { pa.stats.keyPasses++; pa.rating += 0.12; }
      }
      return;
    }
    /* 其余类型统一：cut/long/box/dribble */
    shooter = weightedPlayer(state, pool, function (r) {
      var e = (TAC.findRole(r.slot.role) || {}).eff || {};
      if (type === 'cut') return r.p.a[3] * 0.5 + r.p.a[1] * 0.5 + (e.cutInside ? 12 : 0);
      if (type === 'long') return r.p.a[1] * 0.7 + r.p.a[2] * 0.3;
      if (type === 'dribble') return r.p.a[3] * 0.7 + r.p.a[0] * 0.3;
      return r.p.a[1] * 0.6 + ((e.box || 0) * 6) + r.p.a[5] * 0.2;
    });
    if (!shooter) return;
    var defQ = cDef.def;
    if (type === 'cut') qmul = clamp(0.7 + (shooter.p.a[1] - 74) * 0.02 - (defQ - 76) * 0.012, 0.4, 2);
    if (type === 'long') qmul = clamp(0.8 + (shooter.p.a[1] - 76) * 0.03 - (cDef.gk.ref - 78) * 0.008, 0.3, 2);
    if (type === 'dribble') qmul = clamp(0.75 + (shooter.p.a[3] - 78) * 0.02 + (shooter.p.a[0] - 78) * 0.006 - (defQ - 76) * 0.01, 0.4, 2);
    if (type === 'box') qmul = clamp(0.7 + (shooter.p.a[1] - 72) * 0.018 + cAtt.boxW * 0.04, 0.4, 2);
    qmul *= 1 + matchup;
    resolveShot(state, side, type, shooter, cDef, qmul, note);
  }

  /* ---------------- AI 经理临场（共识 A13 重写） ---------------- */
  function aiShout(state, side, m, text) {
    var team = state.teams[side];
    if (m - (team.__lastMsg || -10) < 4) return; /* 广播冷却，避免刷屏 */
    team.__lastMsg = m;
    state.events.push({ min: m, type: 'info', team: side, text: team.name + ' ' + text });
  }
  function aiManager(state, side, c) {
    var team = state.teams[side];
    var diff = state.score[side] - state.score[1 - side];
    var m = state.minute;
    var short = 11 - c.on.length;
    /* 红牌应对（R3-1 双轴）：少人提防稳、降攻压，只主动调整一档 */
    if (short > 0 && m >= 50 && state.rng() < 0.3) {
      if (!team.__redReacted) {
        team.__redReacted = true;
        if (team.tactic.instr.attPush > 0) team.tactic.instr.attPush--;
        if (team.tactic.instr.defBlock < 6) team.tactic.instr.defBlock++;
        aiShout(state, side, m, '少一人应战，回收心态稳住结构。');
      }
      return;
    }
    /* 换人：体能枯竭或状态低迷（不只看体能单指标） */
    if (m >= 55 && team.subsUsed < 5 && state.rng() < 0.25) {
      var tired = c.on.filter(function (r) { return r.slot.zone !== 'GK' && (r.stamina < 52 || r.rating < 5.4); })
        .sort(function (a, b) { return a.stamina - b.stamina; })[0];
      if (tired) {
        var rep = pickBench(state, side, tired.slot);
        if (rep) { doSub(state, side, tired, rep); return; }
      }
    }
    /* 落后追分（修正版）：换前锋不拆双后腰；两球落后才提攻压 */
    if (diff < 0 && m >= 62 && team.chaseMode && team.subsUsed < 5 && state.rng() < 0.22) {
      var victims = c.on.filter(function (r) { return r.slot.zone === 'MF' || r.slot.zone === 'AM'; })
        .sort(function (a, b) { return b.stamina === a.stamina ? b.rating - a.rating : a.stamina - b.stamina; });
      var fwd = pickBench(state, side, { zone: 'FW', code: 'ST', role: 'AF', duty: 'A', x: 80, y: 50 });
      var out = null;
      for (var vi = 0; vi < victims.length; vi++) { if (victims[vi].slot.zone !== 'DM') { out = victims[vi]; break; } }
      if (out && fwd) {
        fwd.slot = { x: clamp(out.slot.x + 25, 60, 88), y: out.slot.y, zone: 'FW', code: 'ST', role: 'AF', duty: 'A' };
        doSub(state, side, out, fwd);
        if (diff <= -2 && team.tactic.instr.attPush < 6) {
          team.tactic.instr.attPush = clamp(team.tactic.instr.attPush + 1, 0, 6);
          aiShout(state, side, m, '两球落后全力一搏：攻压上调，' + fwd.p.name + ' 替补登场！');
        } else {
          aiShout(state, side, m, '换上进攻手 ' + fwd.p.name + '，保持中场结构寻求扳平。');
        }
      }
    }
    /* 领先保守（R3-1/R3-5）：提防稳+降攻压+拖时间；不再动宽度/防线（避免自伤喂传中） */
    if (diff > 0 && m >= 75 && !team.tactic.instr.timeWaste && state.rng() < 0.2) {
      team.tactic.instr.timeWaste = 1;
      team.tactic.instr.defBlock = clamp(team.tactic.instr.defBlock + 1, 0, 6);
      team.tactic.instr.attPush = clamp(team.tactic.instr.attPush - 1, 0, 6);
      aiShout(state, side, m, '开始控制节奏，全线回收保住胜果。');
    }
  }
  function pickBench(state, side, slot) {
    var team = state.teams[side];
    var bench = team.rt.filter(function (r) { return !r.on && !r.used; });
    var best = null, bs = -1;
    bench.forEach(function (r) {
      var sc = TAC.slotFit(r.p, slot, slot.role) * 100 + TAC.overallOf(r.p) * 0.5;
      if (sc > bs) { bs = sc; best = r; }
    });
    return best;
  }
  function doSub(state, side, outRt, inRt) {
    var team = state.teams[side];
    outRt.on = false; outRt.used = true;
    var keep = inRt.slot && inRt.slot.code !== 'SUB';
    inRt.on = true; inRt.used = true;
    inRt.slot = {
      x: keep ? inRt.slot.x : outRt.slot.x, y: keep ? inRt.slot.y : outRt.slot.y,
      zone: outRt.slot.zone, code: outRt.slot.code,
      role: keep ? inRt.slot.role : outRt.slot.role, duty: keep ? inRt.slot.duty : outRt.slot.duty
    };
    inRt.x = inRt.slot.x; inRt.y = inRt.slot.y;
    team.subsUsed++;
    state.events.push({ min: state.minute, type: 'sub', team: side, text: team.name + ' 换人：' + inRt.p.name + ' 替下 ' + outRt.p.name + '。' });
  }

  /* 用户换人/战术调整接口 */
  function substitute(state, side, outUid, inUid) {
    var team = state.teams[side];
    if (team.subsUsed >= 5) return { ok: false, msg: '换人名额已用完（5 个）' };
    var outRt = team.rt.filter(function (r) { return r.uid === outUid && r.on; })[0];
    var inRt = team.rt.filter(function (r) { return r.uid === inUid && !r.on && !r.used; })[0]; /* 被换下者不可重新登场 */
    if (!outRt || !inRt) return { ok: false, msg: '换人无效（被换下的球员不能再次登场）' };
    doSub(state, side, outRt, inRt);
    pushFrame(state, compileTeam(state, 0), compileTeam(state, 1), 0);
    return { ok: true };
  }
  function patchTactic(state, side, patch) {
    var t = state.teams[side].tactic;
    var changed = false;
    if (patch && patch.instr) {
      Object.keys(patch.instr).forEach(function (k) { t.instr[k] = patch.instr[k]; });
      changed = true;
    }
    if (patch && patch.mentality != null) { t.instr.mentality = patch.mentality; t.instr.attPush = clamp(patch.mentality, 0, 6); t.instr.defBlock = clamp(patch.mentality, 0, 6); changed = true; } /* 旧接口兼容 */
    if (patch && patch.attPush != null) { t.instr.attPush = clamp(patch.attPush, 0, 6); changed = true; }
    if (patch && patch.defBlock != null) { t.instr.defBlock = clamp(patch.defBlock, 0, 6); changed = true; }
    /* 空 patch 早退：UI 的空调用不允许挪动仿真随机流（共识 A12） */
    if (!changed) return { ok: true };
    pushFrame(state, compileTeam(state, 0), compileTeam(state, 1), 0);
    return { ok: true };
  }

  /* ---------------- 渲染帧（全部走 viewRng 独立随机流，共识 A12） ---------------- */
  function pushFrame(state, cA, cB, ballSide) {
    var frame = { min: displayMin(state), ball: ballXY(state, cA, cB, ballSide), players: [], score: state.score.slice() };
    [cA, cB].forEach(function (c, side) {
      var mir = side === 1; /* 客队镜像：右侧半场 */
      var push = (side === 0 ? 1 : -1) * (c.pushF - 1) * 8;
      c.on.forEach(function (r) {
        var ax = r.slot.x, ay = r.slot.y;
        var by = frame.ball.y;
        var px, py;
        if (side === 0) px = ax + (ballSide === 0 ? 10 : -6) * (ax / 100) + push * 0.4;
        else px = 100 - (ax + (ballSide === 1 ? 10 : -6) * (ax / 100) + push * 0.4);
        py = ay + (by - 50) * (r.slot.zone === 'GK' ? 0.1 : 0.34) + (state.viewRng() - 0.5) * 3;
        if (mir) py = 100 - py;
        r.x = clamp(px, 2, 98); r.y = clamp(py, 2, 98);
        frame.players.push({ side: side, uid: r.uid, x: r.x, y: r.y, zone: r.slot.zone, code: r.slot.code, name: r.p.name });
      });
    });
    frame.events = (state.pendingShots || []).splice(0); /* 本分钟射门/进球可视化事件（共识 B2） */
    state.frames.push(frame);
  }
  function ballXY(state, cA, cB, ballSide) {
    /* 球在持球方半场至前场之间随机游走，偏向进攻侧重（呈现层，viewRng） */
    var side = state.teams[ballSide];
    var f = side.tactic.instr.focus;
    var baseX = 30 + state.viewRng() * 45;
    var y = 50 + (state.viewRng() - 0.5) * 70;
    if (f === 'left') y = 20 + state.viewRng() * 25;
    if (f === 'right') y = 55 + state.viewRng() * 25;
    if (f === 'flanks') y = state.viewRng() < 0.5 ? 15 + state.viewRng() * 20 : 65 + state.viewRng() * 20;
    if (f === 'middle') y = 35 + state.viewRng() * 30;
    var x = ballSide === 0 ? baseX : 100 - baseX;
    return { x: clamp(x, 3, 97), y: clamp(y, 3, 97) };
  }

  function simulateToEnd(state, onMinute) {
    var guard = 0;
    while (!state.finished && guard++ < 130) {
      stepMinute(state);
      if (onMinute) onMinute(state);
    }
    return state;
  }

  function playerMatchStats(state, side) {
    var team = state.teams[side];
    return team.rt.filter(function (r) { return r.stats.shots || r.stats.passes || r.on || r.used; })
      .map(function (r) {
        return { uid: r.uid, name: r.p.name, pos: r.p.pos, slot: r.slot, on: r.on, stamina: Math.round(r.stamina), rating: Math.round(clamp(r.rating, 3, 10) * 10) / 10, stats: r.stats };
      });
  }

  /* ---------------- 赛后战术复盘 ---------------- */
  function tacticalReview(state) {
    var lines = [];
    var ins = state.insights;
    var u = state.teams[0], o = state.teams[1];
    [0, 1].forEach(function (side) {
      var t = state.teams[side];
      var n = side === 0 ? '你的球队' : o.name;
      if (ins.throughHigh[side] >= 2) lines.push(n + ' 的身后球 ' + ins.throughHigh[side] + ' 次打穿对方高位防线' + (ins.throughHigh[2] ? '（全场共 ' + ins.throughHigh[2] + ' 次身后球穿透）' : '') + '，高位防线付出了代价。');
      if (ins.crossNoTarget[side] >= 3) lines.push(n + ' 送出大量传中但禁区内缺乏抢点目标，' + ins.crossNoTarget[side] + ' 次传中质量被浪费，建议使用支点中锋或改打地面渗透。');
      if (ins.counters[side] >= 2) lines.push(n + ' 打出 ' + ins.counters[side] + ' 次快速反击' + (ins.countersConceded[1 - side] ? '，对手压上给了空间' : '') + '。');
      if (ins.pressWins[side] >= 2) lines.push(n + ' 的高位反抢 ' + ins.pressWins[side] + ' 次就地断球，用体能换来了球权。');
      if (ins.setPieceGoals[side] >= 1) lines.push(n + ' 通过定位球拿到 ' + ins.setPieceGoals[side] + ' 球，定位球布置见效。');
    });
    var fatigue = u.rt.filter(function (r) { return r.on; }).filter(function (r) { return r.stamina < 40; });
    if (fatigue.length >= 3) lines.push('你的球队终盘有 ' + fatigue.length + ' 人体能低于40（' + fatigue.slice(0, 3).map(function (r) { return r.p.name; }).join('、') + '），高强度逼抢/节奏的代价在75分钟后显现。');
    if (!lines.length) lines.push('双方战术执行平稳，没有出现明显的战术性失误或红利。');
    return lines;
  }

  global.GMD_ENGINE = {
    createMatch: createMatch,
    stepMinute: stepMinute,
    simulateToEnd: simulateToEnd,
    substitute: substitute,
    patchTactic: patchTactic,
    compileTeam: compileTeam,
    playerMatchStats: playerMatchStats,
    tacticalReview: tacticalReview,
    takePenalty: takePenalty,
    XG: XG,
    mulberry32: mulberry32,
    displayMin: displayMin
  };
})(typeof window !== 'undefined' ? window : globalThis);
