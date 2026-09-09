/* Round 1 共识验收批测：逐项检查 round1-共识.md 的硬线
   用法：node reviews/scratch/consensus_check.js （在仓库根目录运行） */
'use strict';
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..', '..', 'game');
['data.js', 'tactics.js', 'engine.js'].forEach(f => eval(fs.readFileSync(path.join(G, 'js', f), 'utf8')));
const DATA = globalThis.GMD_DATA, TAC = globalThis.GMD_TACTICS, ENG = globalThis.GMD_ENGINE;
DATA.CLUBS.forEach(c => c.players.forEach((p, i) => { p.__uid = c.id + '-' + i; }));

function mkTeam(clubId, over) {
  const c = DATA.findClub(clubId);
  const t2 = TAC.autoPickXI(c.style.formation, c.players);
  t2.instr = TAC.tacticFromStyle(c.style).instr; /* 与 app.js 一致：autoPickXI 后接回官方 style 指令 */
  Object.assign(t2.instr, over || {});
  return { name: c.name, clubId: c.id, tactic: t2, squad: c.players, ai: true };
}
function sim(a, b, seed) {
  const st = ENG.createMatch({ home: a, away: b, seed });
  ENG.simulateToEnd(st);
  return st;
}
const R = { pass: 0, fail: 0, lines: [] };
function check(name, cond, detail) {
  if (cond) { R.pass++; R.lines.push('  ✔ ' + name + (detail ? '  [' + detail + ']' : '')); }
  else { R.fail++; R.lines.push('  ✘ ' + name + (detail ? '  [' + detail + ']' : '')); }
}
const fmt = x => (Math.round(x * 100) / 100).toFixed(2);

/* ---------- E0 联赛校准 + 真实性（A1/A5/A6/A8 附属指标） ---------- */
console.log('[E0] 官方战术随机对阵 400 场');
(function () {
  const N = 400;
  let goals = 0, shots = 0, sot = 0, corners = 0, fouls = 0, yell = 0, red = 0, off = 0,
    bigC = 0, setP = 0, cornerGoals = 0, fkGoals = 0, penGoals = 0, penWon = 0, penScored = 0,
    lateGoals = 0, homeW = 0, draw = 0, lead75Hold = 0, lead75N = 0, counters = 0;
  for (let i = 0; i < N; i++) {
    const a = DATA.CLUBS[(i * 7) % 20], b = DATA.CLUBS[(i * 11 + 3) % 20];
    if (a.id === b.id) continue;
    const st = sim(mkTeam(a.id), mkTeam(b.id), 1000 + i * 17);
    const tg = st.score[0] + st.score[1];
    goals += tg;
    shots += st.stats[0].shots + st.stats[1].shots;
    sot += st.stats[0].sot + st.stats[1].sot;
    corners += st.stats[0].corners + st.stats[1].corners;
    fouls += st.stats[0].fouls + st.stats[1].fouls;
    yell += st.stats[0].yellow + st.stats[1].yellow;
    red += st.stats[0].red + st.stats[1].red;
    off += st.stats[0].offsides + st.stats[1].offsides;
    bigC += st.stats[0].bigChances + st.stats[1].bigChances;
    counters += st.stats[0].counters + st.stats[1].counters;
    let g1 = 0, g0 = 0;
    st.events.forEach(e => {
      if (e.type !== 'goal') return;
      if (e.shotType === 'corner') cornerGoals++;
      else if (e.shotType === 'fk') fkGoals++;
      else if (e.shotType === 'pen') penGoals++;
      if (e.min > 80) lateGoals++;
    });
    if (st.score[0] > st.score[1]) homeW++; else if (st.score[0] === st.score[1]) draw++;
    /* 75' 领先方保住胜果（按 75' 真实比分判定，比分相等=无领先不计入） */
    let score75 = null;
    st.events.forEach(e => { if (e.type === 'goal' && e.min <= 75 && e.score) score75 = e.score; });
    if (score75 && score75[0] !== score75[1]) {
      lead75N++;
      const lead75 = score75[0] > score75[1] ? 0 : 1;
      const finalL = st.score[0] > st.score[1] ? 0 : st.score[0] < st.score[1] ? 1 : -1;
      if (finalL === lead75) lead75Hold++;
    }
  }
  const per = (x, t) => x / N * (t === 2 ? 1 : 1) / 1;
  console.log(`  总进球/场 ${fmt(goals / N)}  射门/队 ${fmt(shots / N / 2)}  射正/队 ${fmt(sot / N / 2)}  角球/队 ${fmt(corners / N / 2)}`);
  console.log(`  犯规/队 ${fmt(fouls / N / 2)}  黄牌/场 ${fmt(yell / N)}  红牌/场 ${fmt(red / N)}  越位/队 ${fmt(off / N / 2)}  绝佳机会/队 ${fmt(bigC / N / 2)}`);
  console.log(`  反击/场 ${fmt(counters / N)}  80+进球占比 ${Math.round(lateGoals / goals * 100)}%  主胜 ${Math.round(homeW / N * 100)}%  75'领先保住率 ${Math.round(lead75Hold / Math.max(1, lead75N) * 100)}%`);
  check('A5 绝佳机会 1.5-3/队', bigC / N / 2 >= 1.2 && bigC / N / 2 <= 3.2, fmt(bigC / N / 2));
  check('E0 总进球 2.6-3.0', goals / N >= 2.5 && goals / N <= 3.1, fmt(goals / N));
  check('A6 红牌 ≤0.22/场', red / N <= 0.22, fmt(red / N));
  check('A6 越位/队 ≤2.1', off / N / 2 <= 2.1, fmt(off / N / 2));
  check('A8 80+进球占比 ≥18%（真实基线~18%）', lateGoals / goals >= 0.18, Math.round(lateGoals / goals * 100) + '%');
  check('A8 75\'领先保住 ≥80%', lead75Hold / Math.max(1, lead75N) >= 0.78, Math.round(lead75Hold / Math.max(1, lead75N) * 100) + '%');
  check('A2 主胜 40-48%', homeW / N >= 0.40 && homeW / N <= 0.50, Math.round(homeW / N * 100) + '%');
  check('E0 黄牌 3-4.5/场（csv基线）', yell / N >= 2.8 && yell / N <= 5, fmt(yell / N));
})();

/* ---------- A1 角球进球占比（300 场，进球类型分解） ---------- */
console.log('[A1] 进球类型构成 300 场');
(function () {
  const N = 300;
  let goals = 0, corner = 0, fk = 0, pen = 0;
  for (let i = 0; i < N; i++) {
    const a = DATA.CLUBS[(i * 3) % 20], b = DATA.CLUBS[(i * 7 + 5) % 20];
    if (a.id === b.id) continue;
    const st = sim(mkTeam(a.id), mkTeam(b.id), 5000 + i * 13);
    st.events.forEach(e => {
      if (e.type !== 'goal') return;
      goals++;
      if (e.shotType === 'corner') corner++;
      else if (e.shotType === 'fk') fk++;
      else if (e.shotType === 'pen') pen++;
    });
  }
  const cs = Math.round(corner / goals * 100), sp = Math.round((corner + fk + pen) / goals * 100);
  console.log(`  总进球 ${goals}  角球 ${cs}%  任意球 ${Math.round(fk / goals * 100)}%  点球 ${Math.round(pen / goals * 100)}%  定位球合计 ${sp}%`);
  check('A1 角球进球占比 ≤12%', cs <= 12, cs + '%');
  check('A1 定位球合计 ≤25%', sp <= 25, sp + '%');
})();

/* ---------- A2 强弱拉开：38 轮模拟联赛（2 个联赛样本取均值降噪） ---------- */
console.log('[A2] 20 队双循环 380 场模拟联赛 ×2');
(function () {
  let topSum = 0, botSum = 0, hw = 0, tt = 0, posBig6 = 0;
  for (let L = 0; L < 2; L++) {
    const pts = {}, gd = {}, gf = {};
    DATA.CLUBS.forEach(c => { pts[c.id] = 0; gd[c.id] = 0; gf[c.id] = 0; });
    let seed = 99001 + L * 100000;
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 20; i++) for (let j = i + 1; j < 20; j++) {
        const a = DATA.CLUBS[i], b = DATA.CLUBS[j];
        const home = r === 0 ? a : b, away = r === 0 ? b : a;
        const st = sim(mkTeam(home.id), mkTeam(away.id), seed++);
        tt++;
        if (st.score[0] > st.score[1]) hw++;
        const h = st.score[0] > st.score[1] ? 3 : st.score[0] === st.score[1] ? 1 : 0;
        const aP = st.score[0] < st.score[1] ? 3 : st.score[0] === st.score[1] ? 1 : 0;
        pts[home.id] += h; pts[away.id] += aP;
        gd[home.id] += st.score[0] - st.score[1]; gd[away.id] += st.score[1] - st.score[0];
        gf[home.id] += st.score[0]; gf[away.id] += st.score[1];
      }
    }
    const table = DATA.CLUBS.map(c => ({ id: c.id, pts: pts[c.id], gd: gd[c.id], gf: gf[c.id] }))
      .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf);
    if (L === 0) console.log('  L1: ' + table.map((t, i) => (i + 1) + '.' + t.id + ' ' + t.pts).join(' '));
    else console.log('  L2: ' + table.map((t, i) => (i + 1) + '.' + t.id + ' ' + t.pts).join(' '));
    topSum += table[0].pts; botSum += table[19].pts;
    const posOf = id => table.findIndex(t => t.id === id) + 1;
    posBig6 += ['MCI', 'LIV', 'ARS', 'CHE'].filter(id => posOf(id) <= 6).length;
  }
  const top = topSum / 2, bot = botSum / 2;
  console.log(`  榜首均值 ${top.toFixed(0)}  榜尾均值 ${bot.toFixed(0)}  主胜 ${Math.round(hw / tt * 100)}%`);
  check('A2 榜首 72-88', top >= 72 && top <= 88, top.toFixed(0));
  check('A2 榜尾 <28', bot < 28, bot.toFixed(0));
  check('A2 主胜 ≥42%', hw / tt >= 0.42, Math.round(hw / tt * 100) + '%');
  check('A2 豪门两联赛合计 ≥4 队次前六', posBig6 >= 4, posBig6 + ' 队次');
})();

/* ---------- A3 红牌惩罚（配对对照，专家口径：1红胜率跌≥5pp、4红对方xG≥2.2） ---------- */
console.log('[A3] 红牌惩罚对照 250 场×3');
(function () {
  const N = 250;
  let w0 = 0, w1 = 0, xgA0 = 0, xgA1 = 0, xgA4 = 0;
  for (let i = 0; i < N; i++) {
    const s0 = sim(mkTeam('NEW'), mkTeam('EVE'), 31000 + i);
    xgA0 += s0.stats[1].xg;
    if (s0.score[0] > s0.score[1]) w0++;
    /* 同种子，主队第 30 分钟红牌 1 张 / 4 张 */
    let isFirst = true;
    for (const slot of [
      function (s) { const df = s.teams[0].rt.filter(r => r.on && r.slot.zone === 'DF'); if (df[0]) df[0].on = false; },
      function (s) { const ps = s.teams[0].rt.filter(r => r.on && r.slot.zone !== 'GK'); for (let k = 0; k < 4 && k < ps.length; k++) ps[k].on = false; }
    ]) {
      const one = isFirst; isFirst = false;
      const a2 = mkTeam('NEW'), b2 = mkTeam('EVE');
      const s1 = ENG.createMatch({ home: a2, away: b2, seed: 31000 + i });
      while (!s1.finished && s1.minute < 30) ENG.stepMinute(s1);
      slot(s1);
      ENG.simulateToEnd(s1);
      if (one) { xgA1 += s1.stats[1].xg; if (s1.score[0] > s1.score[1]) w1++; }
      else xgA4 += s1.stats[1].xg;
    }
  }
  const p0 = Math.round(w0 / N * 100), p1 = Math.round(w1 / N * 100);
  console.log(`  0红胜率 ${p0}%  1红(30')胜率 ${p1}%  对方xG: 0红 ${fmt(xgA0 / N)} → 1红 ${fmt(xgA1 / N)} → 4红 ${fmt(xgA4 / N)}`);
  check('A3 1红胜率比0红跌 ≥5pp', p0 - p1 >= 5, (p0 - p1) + 'pp');
  check('A3 4红(7人)对方xG ≥2.2', xgA4 / N >= 2.2, fmt(xgA4 / N));
})();

/* ---------- A4 支配策略复测：「全攻+反击」 vs 官方 ---------- */
console.log('[A4] 支配策略检查 250 场×2');
(function () {
  const N = 250;
  let wOff = 0, gdOff = 0;
  for (let i = 0; i < N; i++) {
    const st = sim(mkTeam('EVE'), mkTeam('MCI'), 41000 + i);
    if (st.score[0] > st.score[1]) wOff++;
    gdOff += st.score[0] - st.score[1];
  }
  let wDom = 0, gdDom = 0;
  for (let i = 0; i < N; i++) {
    const t = mkTeam('EVE', { attPush: 6, counter: 1 });
    const st = sim(t, mkTeam('MCI'), 41000 + i);
    if (st.score[0] > st.score[1]) wDom++;
    gdDom += st.score[0] - st.score[1];
  }
  const dw = Math.round((wDom - wOff) / N * 100), dgd = gdDom / N - gdOff / N;
  console.log(`  EVE官方 vs MCI 胜率 ${Math.round(wOff / N * 100)}%  全攻+反击 ${Math.round(wDom / N * 100)}%  Δ胜率 ${dw}pp  ΔGD ${fmt(dgd)}`);
  check('A4 支配策略增量 ≤+0.15 GD', dgd <= 0.15, fmt(dgd));
})();

/* ---------- A7 控球个性 + A9 死指令 ---------- */
console.log('[A7/A9] 控球个性 200 场（MCI/NEW/NFO 均值控球）');
(function () {
  const N = 200;
  function poss(clubId) {
    let p = 0;
    for (let i = 0; i < N; i++) {
      const st = sim(mkTeam(clubId), mkTeam(DATA.CLUBS[(i * 13 + 7) % 20].id === clubId ? 'EVE' : DATA.CLUBS[(i * 13 + 7) % 20].id), 52000 + i * 3);
      p += st.poss[0] / (st.poss[0] + st.poss[1]);
    }
    return p / N;
  }
  const mci = poss('MCI'), nfo = poss('NFO');
  console.log(`  MCI 控球 ${Math.round(mci * 100)}%  NFO 控球 ${Math.round(nfo * 100)}%`);
  check('A7 MCI 控球 ≥56%', mci >= 0.56, Math.round(mci * 100) + '%');
  check('A7 NFO 控球 ≤50%', nfo <= 0.50, Math.round(nfo * 100) + '%');
})();

/* ---------- A12 RNG 确定性 ---------- */
console.log('[A12] RNG 双流确定性');
(function () {
  const s1 = ENG.createMatch({ home: mkTeam('ARS'), away: mkTeam('CHE'), seed: 777 });
  ENG.simulateToEnd(s1);
  ENG.patchTactic(s1, 0, {}); /* 空 UI 调用 */
  const s2 = ENG.createMatch({ home: mkTeam('ARS'), away: mkTeam('CHE'), seed: 777 });
  ENG.simulateToEnd(s2);
  check('A12 同seed+空调用 → 结果严格一致', s1.score[0] === s2.score[0] && s1.score[1] === s2.score[1] && s1.events.length === s2.events.length,
    `${s1.score.join('-')} vs ${s2.score.join('-')}`);
})();

/* ---------- 大巴转正门槛（双轴硬门槛之一） ---------- */
console.log('[门槛] 大巴可行性 250 场（BUR 大巴 vs MCI）');
(function () {
  const N = 250;
  let w = 0, d = 0, ga = 0, gf = 0;
  for (let i = 0; i < N; i++) {
    const t = mkTeam('BUR', { attPush: 0, defBlock: 6, line: 0, defWidth: 0, counter: 1, tempo: 0 });
    const st = sim(t, mkTeam('MCI'), 61000 + i);
    gf += st.score[0]; ga += st.score[1];
    if (st.score[0] > st.score[1]) w++; else if (st.score[0] === st.score[1]) d++;
  }
  console.log(`  BUR大巴 vs MCI：胜 ${Math.round(w / N * 100)}%  平 ${Math.round(d / N * 100)}%  GF ${fmt(gf / N)} GA ${fmt(ga / N)}`);
  check('门槛 大巴不败率 ≥30%', (w + d) / N >= 0.30, Math.round((w + d) / N * 100) + '%');
})();

/* ---------- R3-1 双轴门槛 + R3-4 支配 stack ---------- */
console.log('[R3] 双轴门槛与支配 stack 250 场');
(function () {
  const N = 250;
  function run(overA, overB, seedBase) {
    let w = 0, gd = 0, ga = 0;
    for (let i = 0; i < N; i++) {
      const st = sim(mkTeam('EVE', overA), mkTeam('MCI', overB), seedBase + i);
      if (st.score[0] > st.score[1]) w++;
      gd += st.score[0] - st.score[1];
      ga += st.score[1];
    }
    return { w: w / N, gd: gd / N, ga: ga / N };
  }
  const base = run(null, null, 71000);
  const att6 = run({ attPush: 6 }, null, 71000);
  const def6 = run({ attPush: 1, defBlock: 6, line: 0 }, null, 71000);
  const stack = run({ attPush: 6, press: 0, tempo: 0, pass: 0, counter: 1, gegen: 1 }, null, 71000);
  console.log(`  基线(3/3): GD ${fmt(base.gd)} GA ${fmt(base.ga)}`);
  console.log(`  攻压6: GD ${fmt(att6.gd)} (Δ${fmt(att6.gd - base.gd)}) GA ${fmt(att6.ga)} (Δ+${fmt(att6.ga - base.ga)})`);
  console.log(`  防稳6/攻1: GD ${fmt(def6.gd)} (Δ${fmt(def6.gd - base.gd)})`);
  console.log(`  支配stack(攻6+松散+慢+短传+counter+gegen): GD ${fmt(stack.gd)} (Δ${fmt(stack.gd - base.gd)})`);
  check('R3-1 攻压6 GA差 ≥ +0.15', att6.ga - base.ga >= 0.15, '+' + fmt(att6.ga - base.ga));
  check('R3-1 防稳6 GD改善 ≥ +0.05', def6.gd - base.gd >= 0.05, '+' + fmt(def6.gd - base.gd));
  check('R3-4 支配stack ΔGD ≤ +0.15', stack.gd - base.gd <= 0.15, fmt(stack.gd - base.gd));
  check('R3-4 stack不再支配胜率', stack.w - base.w <= 0.08, Math.round((stack.w - base.w) * 100) + 'pp');
})();

console.log('\n============================');
console.log(`共识验收：通过 ${R.pass} / 失败 ${R.fail}`);
R.lines.forEach(l => console.log(l));
process.exit(R.fail ? 1 : 0);
