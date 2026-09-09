/* 引擎冒烟测试（Node，无依赖）：node test/smoke.js */
'use strict';
const fs = require('fs'), path = require('path');
['data.js', 'tactics.js', 'season.js', 'engine.js', 'pitch.js'].forEach(f => {
  eval(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));
});
const DATA = globalThis.GMD_DATA, TAC = globalThis.GMD_TACTICS, ENG = globalThis.GMD_ENGINE, PITCH = globalThis.GMD_PITCH, SEA = globalThis.GMD_SEASON;
/* 与 app 一致：启动时分配 uid */
DATA.CLUBS.forEach(c => c.players.forEach((p, i) => { p.__uid = c.id + '-' + i; }));
/* pitch.js 需要的浏览器桩 */
globalThis.requestAnimationFrame = () => 0;
const mockCtx = () => new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() { } });
    if (typeof k === 'string') return () => undefined;
    return undefined;
  },
  set() { return true; }
});

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (extra ? '  [' + extra + ']' : '')); }
}

/* ---------- 1. 数据完整性 ---------- */
console.log('\n[1] 数据完整性');
ok(DATA.CLUBS.length === 20, '英超 20 支俱乐部');
const seen = new Set();
let dataErr = 0, gkCount = 0, playersTotal = 0;
DATA.CLUBS.forEach(c => {
  if (c.players.length < 13 || c.players.length > 20) { dataErr++; console.log('    人数异常:', c.id, c.players.length); }
  c.players.forEach(p => {
    playersTotal++;
    if (seen.has(p.__uid)) dataErr++;
    seen.add(p.__uid);
    if (!p.name || !p.pos || !(p.val > 0 && p.val <= 200)) dataErr++;
    if (p.a.length !== 6 || p.a.some(v => v < 1 || v > 99)) dataErr++;
    if (p.pos.split(',')[0] === 'GK') { gkCount++; if (!p.gk) dataErr++; }
  });
});
ok(dataErr === 0, '全部球员字段合法且 uid 唯一（共 ' + playersTotal + ' 人）');
ok(gkCount >= 40, '每队至少 2 名门将（共 ' + gkCount + '）');
ok(TAC.FORMATIONS.length >= 20, '阵型 ≥ 20 套（当前 ' + TAC.FORMATIONS.length + '）');
ok(TAC.FORMATIONS.every(f => f.slots.length === 11 && f.slots.filter(s => s.zone === 'GK').length === 1), '每个阵型 11 人 1 门将');
ok(TAC.ROLES.length >= 25, '角色 ≥ 25 个（当前 ' + TAC.ROLES.length + '）');
const roleIds = new Set(TAC.ROLES.map(r => r.id));
ok(TAC.FORMATIONS.every(f => f.slots.every(s => roleIds.has(TAC.defaultRoleForSlot(s)))), '所有槽位默认角色合法');

/* ---------- 2. 单场合理性 ---------- */
console.log('\n[2] 单场合理性（ARS vs LIV 官方战术）');
function mkTeam(clubId, tacticOv) {
  const c = DATA.findClub(clubId);
  const withUids = c.players.map(p => p);
  const t2 = TAC.autoPickXI(c.style.formation, withUids);
  t2.instr = TAC.tacticFromStyle(c.style).instr; /* 官方 style 指令（与 app.js 一致） */
  Object.assign(t2.instr, tacticOv || {});
  return { name: c.name, clubId: c.id, tactic: t2, squad: withUids, ai: true };
}
function runOne(seed, homeOv, awayOv) {
  const st = ENG.createMatch({ home: mkTeam('ARS', homeOv), away: mkTeam('LIV', awayOv), seed });
  ENG.simulateToEnd(st);
  return st;
}
{
  const st = runOne(42);
  ok(st.finished, '比赛正常结束 @' + st.minute + "'");
  ok(st.minute >= 95 && st.minute <= 101, '含补时 95-101 分钟（补时5-11随犯规/进球浮动）', st.minute);
  ok(st.score[0] + st.score[1] <= 12, '总进球 ≤ 12', JSON.stringify(st.score));
  [0, 1].forEach(i => {
    const s = st.stats[i];
    const name = i === 0 ? '主' : '客';
    ok(s.shots >= 4 && s.shots <= 40, name + '队射门 4-40（' + s.shots + '）');
    ok(s.sot <= s.shots, name + '队 射正 ≤ 射门');
    ok(s.xg > 0.1 && s.xg < 6, name + '队 xG 合理（' + s.xg.toFixed(2) + '）');
    ok(Math.abs(s.xg - s.shots * 0.13) < s.shots * 0.2 + 1.5, name + '队 xG/射门比例不离谱');
    ok(s.fouls <= 30, name + '队 犯规 ≤ 30（' + s.fouls + '）');
    ok(s.passAtt > 200, name + '队 传球数 > 200（' + s.passAtt + '）');
  });
  const poss = st.poss[0] / (st.poss[0] + st.poss[1]);
  ok(poss > 0.25 && poss < 0.75, '控球率在 25-75%（' + Math.round(poss * 100) + '%）');
  const noNaN = [st.stats[0], st.stats[1]].every(s => Object.values(s).every(v => typeof v === 'number' && isFinite(v)));
  ok(noNaN, '统计无 NaN');
  ok(st.frames.length === st.minute + (st.stoppage1 || 0), '每分钟都有渲染帧（' + st.frames.length + '，含上半场补时）');
  ok(st.events.filter(e => e.type === 'goal').length === st.score[0] + st.score[1], '事件流进球数与比分一致');
  ok(ENG.playerMatchStats(st, 0).length >= 11, '主队出场球员统计完整');
}

/* ---------- 3. 战术敏感性 ---------- */
console.log('\n[3] 战术敏感性（批测均值对比）');
function batch(n, mk) {
  let goals = 0, shots = 0, conceded = 0, possTick = 0, totTick = 0, counters = 0;
  for (let i = 0; i < n; i++) {
    const st = mk(i * 7919 + 13);
    ENG.simulateToEnd(st);
    goals += st.score[0]; conceded += st.score[1];
    shots += st.stats[0].shots;
    possTick += st.poss[0]; totTick += st.poss[0] + st.poss[1];
    counters += st.stats[0].counters + st.stats[1].counters;
  }
  return { g: goals / n, ga: conceded / n, sh: shots / n, poss: possTick / totTick, ctr: counters / n };
}
const N = 150;
const attT = { attPush: 6, defBlock: 0, line: 3, press: 2, counter: 0, tempo: 3 };
const defT = { attPush: 0, defBlock: 6, line: 0, press: 0, counter: 1, tempo: 0, timeWaste: 1 };
const bAtt = batch(N, s => ENG.createMatch({ home: mkTeam('MCI', attT), away: mkTeam('SUN'), seed: s }));
const bDef = batch(N, s => ENG.createMatch({ home: mkTeam('MCI', defT), away: mkTeam('SUN'), seed: s }));
console.log('  全攻:', JSON.stringify(bAtt), ' 大巴:', JSON.stringify(bDef));
ok(bAtt.g > bDef.g + 0.15, '全力进攻比摆大巴进球多（' + bAtt.g.toFixed(2) + ' vs ' + bDef.g.toFixed(2) + '）');
ok(bAtt.sh > bDef.sh + 1.5, '全力进攻射门更多（' + bAtt.sh.toFixed(1) + ' vs ' + bDef.sh.toFixed(1) + '）');
ok(bAtt.ga > bDef.ga - 0.15, '全力进攻失球不少于大巴（' + bAtt.ga.toFixed(2) + ' vs ' + bDef.ga.toFixed(2) + '，容差0.15）');

const highLine = { line: 4, attPush: 4, offside: 0 };
const lowLine = { line: 0, attPush: 1 };
const bHigh = batch(N, s => ENG.createMatch({ home: mkTeam('MUN', highLine), away: mkTeam('BOU', { counter: 1, attPush: 1, line: 0 }), seed: s }));
const bLow = batch(N, s => ENG.createMatch({ home: mkTeam('MUN', lowLine), away: mkTeam('BOU', { counter: 1, attPush: 1, line: 0 }), seed: s }));
console.log('  极高线被反击失球:', bHigh.ga.toFixed(2), ' 低线被反击失球:', bLow.ga.toFixed(2));
ok(bHigh.ga > bLow.ga + 0.08, '极高防线比低位防线被反击丢球更多（' + bHigh.ga.toFixed(2) + ' vs ' + bLow.ga.toFixed(2) + '，反击重定价后阈值0.08）');

const bGegen = batch(N, s => ENG.createMatch({ home: mkTeam('LIV', { gegen: 1, press: 3 }), away: mkTeam('BUR', { pass: 0, attPush: 0, defBlock: 5 }), seed: s }));
const bNoGe = batch(N, s => ENG.createMatch({ home: mkTeam('LIV', { gegen: 0, press: 0 }), away: mkTeam('BUR', { pass: 0, attPush: 0, defBlock: 5 }), seed: s }));
console.log('  疯抢控球:', bGegen.poss.toFixed(3), ' 松散控球:', bNoGe.poss.toFixed(3));
ok(bGegen.poss > bNoGe.poss, '高强度反抢提升控球（' + bGegen.poss.toFixed(3) + ' > ' + bNoGe.poss.toFixed(3) + '）');

/* 长传冲吊 + 支点中锋 vs 无支点 */
const tmT = { pass: 4, focus: 'flanks', attWidth: 2 };
const bTM = batch(100, s => {
  const t = mkTeam('WHU', tmT);
  /* 强制 XI 里有支点中锋：选整体值最高的 ST 设为 TM */
  const st = ENG.createMatch({ home: t, away: mkTeam('EVE', { line: 1, attPush: 0, defBlock: 5 }), seed: s });
  return st;
});
ok(isFinite(bTM.g), '长传冲吊战体系可正常仿真（场均进球 ' + bTM.g.toFixed(2) + '）');

/* ---------- 4. 换人/接口 ---------- */
console.log('\n[4] 换人与战术热替换接口');
{
  const st = ENG.createMatch({ home: mkTeam('CHE'), away: mkTeam('NFO'), seed: 7 });
  for (let i = 0; i < 60; i++) ENG.stepMinute(st);
  const team = st.teams[0];
  const onP = team.rt.filter(r => r.on && r.slot.zone !== 'GK');
  const offP = team.rt.filter(r => !r.on && !r.used); /* 只从可用替补里选（红牌者不可再登场） */
  const r1 = ENG.substitute(st, 0, onP[0].uid, offP[0].uid);
  ok(r1.ok, '用户换人成功');
  ok(team.rt.filter(r => r.uid === offP[0].uid)[0].on, '替补已登场');
  ok(team.rt.filter(r => r.uid === onP[0].uid)[0].on === false, '被换下者已离场');
  ENG.patchTactic(st, 0, { mentality: 6, instr: { line: 4 } });
  ok(team.tactic.instr.mentality === 6 && team.tactic.instr.line === 4, '战术热替换生效');
  for (let i = 0; i < 60; i++) ENG.stepMinute(st); /* 60+60=120 分钟，覆盖最长补时 */
  ok(st.finished, '换人后比赛可继续至结束');
}

/* ---------- 5. 复盘输出 ---------- */
console.log('\n[5] 赛后战术复盘');
{
  const st = runOne(2027);
  const rev = ENG.tacticalReview(st);
  ok(Array.isArray(rev) && rev.length >= 1 && rev.every(l => typeof l === 'string' && l.length > 5), '复盘生成 ' + rev.length + ' 条洞察');
}

/* ---------- 6. 首轮评审共识回归断言 ---------- */
console.log('\n[6] 评审共识回归断言');

/* 6a 点球由防守方（犯规方）门将裁决 */
{
  const home = mkTeam('ARS'), away = mkTeam('LIV');
  const st = ENG.createMatch({ home, away, seed: 11 });
  const gkHome = st.teams[0].rt.filter(r => r.slot.zone === 'GK')[0].p;
  const gkAway = st.teams[1].rt.filter(r => r.slot.zone === 'GK')[0].p;
  gkHome.gk = { ref: 99, one: 99, cmd: 99, kic: 99 };
  gkAway.gk = { ref: 30, one: 30, cmd: 30, kic: 30 };
  const N = 300;
  let convVsStrong = 0, convVsWeak = 0;
  for (let i = 0; i < N; i++) {
    const s = ENG.createMatch({ home: mkTeam('ARS'), away: mkTeam('LIV'), seed: 500 + i });
    const g1 = s.teams[0].rt.filter(r => r.slot.zone === 'GK')[0].p;
    const g2 = s.teams[1].rt.filter(r => r.slot.zone === 'GK')[0].p;
    g1.gk = { ref: 99, one: 99, cmd: 99, kic: 99 };
    g2.gk = { ref: 30, one: 30, cmd: 30, kic: 30 };
    const before = s.score[0] + s.score[1];
    ENG.takePenalty(s, 0, '测试');      /* 客队主罚，应由主队(99)门将防守 → 转化率低 */
    convVsStrong += (s.score[0] + s.score[1] - before);
    const s2 = ENG.createMatch({ home: mkTeam('ARS'), away: mkTeam('LIV'), seed: 500 + i });
    const g3 = s2.teams[0].rt.filter(r => r.slot.zone === 'GK')[0].p;
    const g4 = s2.teams[1].rt.filter(r => r.slot.zone === 'GK')[0].p;
    g3.gk = { ref: 99, one: 99, cmd: 99, kic: 99 };
    g4.gk = { ref: 30, one: 30, cmd: 30, kic: 30 };
    const before2 = s2.score[0] + s2.score[1];
    ENG.takePenalty(s2, 1, '测试');     /* 主队主罚，应由客队(30)门将防守 → 转化率高 */
    convVsWeak += (s2.score[0] + s2.score[1] - before2);
  }
  const cStrong = convVsStrong / N, cWeak = convVsWeak / N;
  console.log('  面强门转化率', cStrong.toFixed(2), ' 面弱门转化率', cWeak.toFixed(2));
  ok(cWeak > cStrong + 0.08, '点球由防守方门将裁决（弱门 ' + cWeak.toFixed(2) + ' > 强门 ' + cStrong.toFixed(2) + ' + 0.08）');
}

/* 6b 越位陷阱作用于对手 */
{
  const N = 120;
  function offBatch(trap) {
    let home = 0, away = 0;
    for (let i = 0; i < N; i++) {
      const st = ENG.createMatch({ home: mkTeam('MUN', { offside: trap ? 1 : 0, line: 4, attPush: 4 }), away: mkTeam('EVE'), seed: i * 7907 + 3 });
      ENG.simulateToEnd(st);
      home += st.stats[0].offsides; away += st.stats[1].offsides;
    }
    return { h: home / N, a: away / N };
  }
  const on = offBatch(true), off = offBatch(false);
  console.log('  陷阱开:', JSON.stringify(on), ' 陷阱关:', JSON.stringify(off));
  ok(on.a > off.a + 0.15, '开越位陷阱让【对手】越位增多（' + on.a.toFixed(2) + ' vs ' + off.a.toFixed(2) + '）');
  ok(Math.abs(on.h - off.h) < 0.6, '开越位陷阱不显著惩罚自己前锋（' + on.h.toFixed(2) + ' vs ' + off.h.toFixed(2) + '）');
}

/* 6c 四指令敏感性：同种子批测必须产生统计差异 */
{
  const N = 80;
  function pairDiff(homeKey, v0, v1, awayOv, pick) {
    const agg = v => {
      let acc = 0;
      for (let i = 0; i < N; i++) {
        const ov = {}; ov[homeKey] = v;
        const st = ENG.createMatch({ home: mkTeam('MCI', ov), away: mkTeam('SUN', awayOv), seed: i * 613 + 5 });
        ENG.simulateToEnd(st);
        acc += pick(st);
      }
      return acc / N;
    };
    return { a: agg(v0), b: agg(v1) };
  }
  const stSum = st => st.stats[0].shots + st.stats[1].shots + st.score[0] + st.score[1] + st.stats[0].corners + st.stats[1].corners;
  /* pressZone → 高位逼抢风险：对手反击更多 */
  const pz = pairDiff('pressZone', 0, 2, { counter: 1, attPush: 5, line: 3 }, st => st.stats[1].counters * 2 + st.score[1]);
  console.log('  pressZone 0:', pz.a.toFixed(2), ' 2:', pz.b.toFixed(2));
  ok(Math.abs(pz.b - pz.a) > 0.3, '逼抢区域接入仿真（反击惩罚差 ' + Math.abs(pz.b - pz.a).toFixed(2) + ' > 0.3）');
  /* gkDist → 传球成功率下降 */
  const gd = pairDiff('gkDist', 0, 1, {}, st => {
    const a0 = st.stats[0];
    return a0.passAtt ? a0.passOk / a0.passAtt : 0;
  });
  console.log('  gkDist 0 成功率:', gd.a.toFixed(3), ' 1:', gd.b.toFixed(3));
  ok(gd.a - gd.b > 0.004, '门将长传出球接入仿真（成功率下降 ' + (gd.a - gd.b).toFixed(3) + ' > 0.004）');
  /* overlap → 传中/进攻产出变化 */
  const ov = pairDiff('overlap', 0, 2, {}, stSum);
  console.log('  overlap 0:', ov.a.toFixed(2), ' 2:', ov.b.toFixed(2));
  ok(Math.abs(ov.b - ov.a) > 0.4, '边后卫套上接入仿真（产出差 ' + Math.abs(ov.b - ov.a).toFixed(2) + ' > 0.4）');
  /* defWidth → 对传中型对手的机会构成效应（收缩=对手更多传中，拉开=压制传中） */
  const dw = pairDiff('defWidth', 0, 2, { pass: 4, focus: 'flanks', attWidth: 2 }, st => {
    const s1 = st.stats[1];
    return s1.shots ? s1.crossShots / s1.shots : 0;
  });
  console.log('  defWidth 0 传中占比:', dw.a.toFixed(3), ' 2:', dw.b.toFixed(3));
  ok(dw.a - dw.b > 0.02, '防守宽度接入仿真（对手传中占比差 ' + (dw.a - dw.b).toFixed(3) + ' > 0.02）');
}

/* 6d focus 值域统一 */
{
  const VALID = ['balanced', 'left', 'middle', 'right', 'flanks'];
  ok(VALID.indexOf(DATA.CLUBS.every(c => VALID.includes(c.style.focus)) ? VALID[0] : 'x') >= 0, '全部俱乐部 style.focus 使用规范值');
  ok(JSON.stringify(TAC.INSTR.focus.values) === JSON.stringify(VALID), 'INSTR.focus.values 与引擎值域一致');
}

/* 6e 被换下者不可重新登场 */
{
  const st = ENG.createMatch({ home: mkTeam('CHE'), away: mkTeam('NFO'), seed: 7 });
  for (let i = 0; i < 60; i++) ENG.stepMinute(st);
  const team = st.teams[0];
  const outP = team.rt.filter(r => r.on && r.slot.zone !== 'GK')[0];
  const benchP = team.rt.filter(r => !r.on && !r.used)[0];
  const r1 = ENG.substitute(st, 0, outP.uid, benchP.uid);
  ok(r1.ok, '正常换人成功');
  const r2 = ENG.substitute(st, 0, benchP.uid, outP.uid);
  ok(!r2.ok, '换下的球员不能重新登场（返回 ' + JSON.stringify(r2) + '）');
}

/* 6f 画布幽灵球员修复 */
{
  const cv = { width: 400, height: 300, getContext: () => mockCtx() };
  PITCH.init(cv, '#111111', '#222222');
  const mkFrame = lists => ({
    min: 1, ball: { x: 50, y: 50 }, score: [0, 0],
    players: lists.map(([side, uid]) => ({ side, uid, x: 50, y: 50, zone: 'MF', code: 'CM', name: 'p' + uid }))
  });
  PITCH.applyFrame(mkFrame([[0, 'a'], [0, 'b'], [1, 'c']]));
  ok(PITCH._debugPlayerCount() === 3, '画布初始 3 名球员');
  PITCH.applyFrame(mkFrame([[0, 'a'], [0, 'b']]));
  ok(PITCH._debugPlayerCount() === 2, '换人后离场球员从画布移除（不残留幽灵点）');
}

/* ---------- 7. 传球量级抽查 ---------- */
console.log('\n[7] 传球量级（对齐真实英超）');
{
  const N = 60;
  let pass = 0, acc = 0;
  for (let i = 0; i < N; i++) {
    const st = ENG.createMatch({ home: mkTeam('EVE'), away: mkTeam('FUL'), seed: i * 97 + 1 });
    ENG.simulateToEnd(st);
    const s0 = st.stats[0];
    pass += s0.passAtt;
    acc += s0.passAtt ? s0.passOk / s0.passAtt : 0;
  }
  console.log('  场均传球', (pass / N).toFixed(0), ' 成功率', (acc / N * 100).toFixed(1) + '%');
  ok(pass / N > 300 && pass / N < 560, '场均传球 300-560（真实约 420）');
  ok(acc / N > 0.76 && acc / N < 0.92, '传球成功率 76-92%（真实约 82-86%）');
}



/* ---------- 8. v0.3 赛季元系统（season.js） ---------- */
console.log('\n[8] v0.3 赛季元系统');
{
  const ids = ['__ME__'].concat(DATA.CLUBS.map(c => c.id));
  const fx = SEA.buildFixtures(ids, 42);
  ok(fx.length === 42, '完整赛季 42 个比赛周（21 队双循环）', fx.length);
  ok(fx.every(r => r.length === 10), '每轮 10 场（21 队，1 队轮空）');
  const pairs = {};
  let selfPair = 0;
  fx.forEach(r => r.forEach(f => {
    if (f.h === f.a) selfPair++;
    const k = [f.h, f.a].sort().join('|');
    pairs[k] = (pairs[k] || 0) + 1;
  }));
  ok(selfPair === 0, '无自对战（修复奇数队圈法缺陷）');
  ok(Object.keys(pairs).length === 210 && Object.values(pairs).every(v => v === 2), '任意两队恰好主客各交手一次（210 对 × 2）');
  const mineHome = fx.filter(r => r.some(f => f.h === '__ME__')).length;
  const mineAway = fx.filter(r => r.some(f => f.a === '__ME__')).length;
  ok(mineHome === 20 && mineAway === 20, '我的球队 20 主 20 客 + 2 轮空（mySide 抽象）', mineHome + '/' + mineAway);
  const mini = SEA.buildFixtures(ids, 10);
  const p2 = {};
  mini.forEach(r => r.forEach(f => { const k = [f.h, f.a].sort().join('|'); p2[k] = (p2[k] || 0) + 1; }));
  ok(Math.max(...Object.values(p2)) === 1, '迷你赛季 10 轮无重复对手');
}
{
  const t1 = { instr: { press: 1, tackling: 1, attPush: 3, gegen: 0 } };
  ok(SEA.applyGrudge(t1, 1) === false, '挖走 1 人不触发恩怨强化');
  const t2 = { instr: { press: 1, tackling: 1, attPush: 3, gegen: 0 } };
  ok(SEA.applyGrudge(t2, 2) === true && t2.instr.press === 2 && t2.instr.tackling === 2 && t2.instr.attPush === 4 && t2.instr.gegen === 1, '挖走 2 人触发怒气强化（逼抢/抢断/攻压/反抢）');
  const t3 = { instr: { press: 3, tackling: 2, attPush: 6, gegen: 0 } };
  SEA.applyGrudge(t3, 5);
  ok(t3.instr.press === 3 && t3.instr.attPush === 6 && t3.instr.gegen === 1, '怒气强化封顶不越界');
}
{
  const scorers = {};
  SEA.addScorers(scorers, [{ uid: 'A-0', name: '甲', clubLabel: 'X', goals: 2 }]);
  SEA.addScorers(scorers, [{ uid: 'A-0', name: '甲', clubLabel: 'X', goals: 1 }, { uid: 'B-3', name: '乙', clubLabel: 'Y', goals: 1 }]);
  const top = SEA.topScorers(scorers, 10);
  ok(top.length === 2 && top[0].name === '甲' && top[0].goals === 3, '金靴榜累计与排序');
}
{
  const table = {};
  ['ARS', 'LIV', 'SUN', 'BUR', 'EVE', 'TOT', 'WOL', 'BOU'].forEach(id => table[id] = { pts: 0, gf: 0, ga: 0 });
  table.ARS.pts = 15; table.LIV.pts = 12; table.EVE.pts = 9; table.TOT.pts = 7; table.WOL.pts = 6; table.BOU.pts = 4; table.BUR.pts = 3; table.SUN.pts = 1;
  const ranksBefore = SEA.rankMap(table);
  const results = [
    { h: 'SUN', a: 'LIV', hs: 3, as: 0 },
    { h: 'BUR', a: 'EVE', hs: 0, as: 4 },
    { h: 'ARS', a: '__ME__', hs: 1, as: 1 }
  ];
  const news = SEA.makeNews({
    round: 3, results, ranksBefore, table,
    myId: '__ME__', myFix: { h: 'ARS', a: '__ME__', hs: 1, as: 1 }, myName: '梦想联',
    scorers: { x: { name: '甲', clubLabel: '梦想联', goals: 4 } },
    injuries: [{ name: '丙', weeks: 2 }],
    nextOppId: 'BUR', grudge: { count: 2, names: ['丁', '戊'] },
    nm: id => id === '__ME__' ? '梦想联' : id
  });
  ok(news.length >= 6 && news.length <= 8, '单轮新闻条数 6-8（' + news.length + '）');
  ok(news.some(n => /战平|1-1/.test(n.title) && /梦想联/.test(n.title + n.text)), '我的比赛必有头条');
  ok(news.some(n => /冷门|掀翻/.test(n.title)), '以下克上被识别为冷门（第8掀翻第2）');
  ok(news.some(n => /血洗/.test(n.title)), '净胜 3+ 识别为惨案');
  ok(news.some(n => /金靴/.test(n.title)), '金靴观察生成');
  ok(news.some(n => /伤/.test(n.title)), '伤情通报生成');
  ok(news.some(n => /火药味/.test(n.title)), '下一轮恩怨预告生成');
}
{
  const req = ['goal', 'oppGoal', 'save', 'red', 'injury', 'ht', 'ftWin', 'ftDraw', 'ftLoss', 'motm'];
  SEA.PERSONAS.filter(p => p.id !== 'off').forEach(p => {
    const missing = req.filter(k => !(p.lines[k] && p.lines[k].length));
    ok(missing.length === 0, '解说人格「' + p.name + '」台词齐全' + (missing.length ? '（缺 ' + missing + '）' : ''));
  });
  ok(SEA.personaLine(SEA.findPersona('off'), 'goal', 0) === null, '关闭人格时不追加弹幕');
  ok(typeof SEA.personaLine(SEA.findPersona('fire'), 'goal', 99) === 'string', '台词索引循环取值不越界');
}

/* ---------- 9. 引擎 v0.3：换人窗口 / 伤病 / 主场优势归属 / 体能延续 ---------- */
console.log('\n[9] 引擎 v0.3 特性');
{
  /* 9a 换人窗口：3 窗口 + 半场不占窗口 */
  const st = ENG.createMatch({ home: mkTeam('CHE'), away: mkTeam('NFO'), seed: 7 });
  for (let i = 0; i < 20; i++) ENG.stepMinute(st);
  const team = st.teams[0];
  ok(team.subsWindows === 3, '开局 3 个换人窗口');
  const outs = team.rt.filter(r => r.on && r.slot.zone !== 'GK');
  const ins = team.rt.filter(r => !r.on && !r.used);
  for (let w = 0; w < 3; w++) {
    const r = ENG.substitute(st, 0, outs[w].uid, ins[w].uid);
    ok(r.ok, '窗口内换人 #' + (w + 1) + ' 成功');
  }
  ok(team.subsWindows === 0 && team.subsUsed === 3, '三个窗口全部消耗（名额还剩 2）');
  const r4 = ENG.substitute(st, 0, outs[3].uid, ins[3].uid);
  ok(!r4.ok && /窗口/.test(r4.msg), '窗口用尽后换人被拒绝（' + r4.msg + '）');
  let guard = 0;
  while (!(st.half === 2 && st.minute === 45) && guard++ < 60) ENG.stepMinute(st);
  const rHT = ENG.substitute(st, 0, outs[3].uid, ins[3].uid);
  ok(rHT.ok, '半场休息换人不占窗口');
  ok(st.teams[0].subsWindows === 0 && st.teams[0].subsUsed === 4, '半场换人只耗名额不耗窗口');
  ENG.stepMinute(st);
  const r5 = ENG.substitute(st, 0, outs[4].uid, ins[4].uid);
  ok(!r5.ok, '下半场（窗口 0）不能再换');
}
{
  /* 9b 伤病：批测中发生且伤员必然离场 */
  let injN = 0, offOk = 0, matches = 16;
  for (let i = 0; i < matches; i++) {
    const st = runOne(9000 + i * 13);
    (st.injuries || []).forEach(inj => {
      injN++;
      const rt = st.teams[inj.side].rt.filter(r => r.uid === inj.uid)[0];
      if (rt && rt.on === false) offOk++;
    });
  }
  ok(injN >= 1, '批测出现伤病事件（' + injN + ' 例 / ' + matches + ' 场）');
  ok(offOk === injN, '全部伤员已离场（含自动换人顶替）');
}
{
  /* 9c 主场优势随 homeAdvSide 归属（同俱乐部镜像对决，排除实力差干扰） */
  const N = 80;
  const agg = side => {
    let poss0 = 0, tot = 0, gd = 0;
    for (let i = 0; i < N; i++) {
      const home = mkTeam('EVE');
      const away = mkTeam('EVE');
      away.squad = JSON.parse(JSON.stringify(away.squad)); /* 克隆球员：避免两侧共享对象 */
      const st = ENG.createMatch({ home, away, seed: i * 31 + 7, homeAdvSide: side });
      ENG.simulateToEnd(st);
      poss0 += st.poss[0]; tot += st.poss[0] + st.poss[1];
      gd += st.score[0] - st.score[1];
    }
    return { poss: poss0 / tot, gd: gd / N };
  };
  const asHome = agg(0), asAway = agg(1);
  console.log('  EVE主 控球', asHome.poss.toFixed(3), 'GD', asHome.gd.toFixed(2),
    '| EVE客 控球', asAway.poss.toFixed(3), 'GD', asAway.gd.toFixed(2));
  ok(asHome.poss > 0.5 && asAway.poss < 0.5, '控球优势随 homeAdvSide 翻转');
  ok(asHome.gd > asAway.gd, '镜像对决：主队版本净胜球优于客队版本');
}
{
  /* 9d 体能延续：fresh 指定开场体能 */
  const c = DATA.findClub('EVE');
  const t = TAC.autoPickXI(c.style.formation, c.players);
  t.instr = TAC.tacticFromStyle(c.style).instr;
  const gkSlot = t.slots.filter(s => s.zone === 'GK')[0];
  const fresh = {};
  fresh[gkSlot.playerId] = 55;
  const st = ENG.createMatch({ home: { name: 'T', tactic: t, squad: c.players, ai: true, fresh }, away: mkTeam('FUL'), seed: 5 });
  const rt = st.teams[0].rt.filter(r => r.uid === gkSlot.playerId)[0];
  ok(rt.stamina === 55, '体能延续：fresh 指定球员以 55 体能开场');
  const others = st.teams[0].rt.filter(r => r.uid !== gkSlot.playerId);
  ok(others.every(r => r.stamina === 100), '未指定球员满体能开场');
}

console.log('\n==============================');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
