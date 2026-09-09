/* 实验C：边界与健壮性 —— 无锋/红牌/客串门将/满员换人/确定性/13人俱乐部 */
'use strict';
const H = require('./harness.js');
const { DATA, TAC, ENG, mkTeam, play } = H;

function safe(label, fn) {
  try { const r = fn(); console.log('[OK] ' + label + (r ? ' :: ' + r : '')); return r; }
  catch (e) { console.log('[CRASH] ' + label + ' :: ' + e.message); return null; }
}
const N = 60, seeds = []; for (let i = 0; i < N; i++) seeds.push(88000 + i * 7);

/* C1 无锋阵：4-6-0 无锋阵型，纯MF/AM 班底 */
safe('C1 无锋阵 4-6-0 (EVE) vs WHU官方 ×60', () => {
  let g = 0, ga = 0, err = 0;
  seeds.forEach(s => {
    const st = play(mkTeam('EVE', { formation: '4-6-0' }), mkTeam('WHU', {}), s);
    if (!st.finished) err++;
    g += st.score[0]; ga += st.score[1];
  });
  return '均分 ' + (g / N).toFixed(2) + '-' + (ga / N).toFixed(2) + ' 未完场 ' + err;
});

/* C2 红牌：开赛强制红牌1张/2张（中卫+后腰）后表现 */
function forcedRed(homeClub, nRed) {
  const ms = [];
  seeds.forEach(s => {
    const h = mkTeam(homeClub, {}), a = mkTeam('WHU', {});
    const st = ENG.createMatch({ home: h, away: a, seed: s });
    // 场上非GK球员直接罚下
    const outs = st.teams[0].rt.filter(r => r.on && r.slot.zone !== 'GK').slice(0, nRed);
    outs.forEach(r => { r.on = false; r.stats.red = 1; st.stats[0].red++; });
    st.events.push({ min: 1, type: 'red', team: 0, text: '[实验] 红牌 x' + nRed });
    ENG.simulateToEnd(st);
    ms.push(st);
  });
  let gf = 0, ga = 0, w = 0, d = 0, l = 0, fin = 0;
  ms.forEach(st => { if (st.finished) fin++; gf += st.score[0]; ga += st.score[1]; if (st.score[0] > st.score[1]) w++; else if (st.score[0] === st.score[1]) d++; else l++; });
  return '完场 ' + fin + '/' + N + ' 均分 ' + (gf / N).toFixed(2) + '-' + (ga / N).toFixed(2) + ' 胜/平/负 ' + w + '/' + d + '/' + l;
}
safe('C2a EVE 红牌1张 vs WHU', () => forcedRed('EVE', 1));
safe('C2b EVE 红牌2张 vs WHU', () => forcedRed('EVE', 2));
safe('C2c EVE 红牌3张 vs WHU', () => forcedRed('EVE', 3));
safe('C2d EVE 红牌4张 vs WHU', () => forcedRed('EVE', 4));

/* C3 客串门将：队伍完全无GK */
safe('C3 无GK队伍( outfield only, 16人) vs WHU官方', () => {
  const outs = DATA.findClub('EVE').players.filter(p => p.pos.split(',')[0] !== 'GK').slice(0, 16);
  outs.forEach((p, i) => { p.__uid = 'EVE-X' + i; });
  let gf = 0, ga = 0, gkIsOutfield = 0;
  seeds.forEach(s => {
    const t = TAC.autoPickXI('4-2-3-1', outs);
    t.instr = TAC.tacticFromStyle(DATA.findClub('EVE').style).instr;
    const st = ENG.createMatch({ home: { name: '无门将联', clubId: null, tactic: t, squad: outs, ai: false }, away: mkTeam('WHU', {}), seed: s });
    ENG.simulateToEnd(st);
    const gkRt = st.teams[0].rt.find(r => r.slot.zone === 'GK' && r.on);
    if (gkRt && gkRt.p.name.includes('客串')) gkIsOutfield++;
    gf += st.score[0]; ga += st.score[1];
  });
  return '均分 ' + (gf / N).toFixed(2) + '-' + (ga / N).toFixed(2) + ' 客串门将场次 ' + gkIsOutfield + '/' + N;
});

/* C4 满员23人 AI 换人上限 */
safe('C4 AI满员23人换人(ARS vs WHU) ×60', () => {
  let maxSubs = 0, minSubs = 99, totSubs = 0;
  seeds.forEach(s => {
    const st = play(mkTeam('ARS', {}), mkTeam('WHU', {}), s);
    st.teams.forEach(t => { maxSubs = Math.max(maxSubs, t.subsUsed); minSubs = Math.min(minSubs, t.subsUsed); totSubs += t.subsUsed; });
  });
  return '单队换人 min ' + minSubs + ' max ' + maxSubs + ' 平均 ' + (totSubs / (2 * N)).toFixed(2);
});

/* C5 同种子确定性 */
safe('C5 同seed跑两遍 diff', () => {
  const a = play(mkTeam('ARS', {}), mkTeam('LIV', {}), 777);
  const b = play(mkTeam('ARS', {}), mkTeam('LIV', {}), 777);
  const ja = JSON.stringify({ s: a.score, e: a.events, f: a.frames.length, st: a.stats });
  const jb = JSON.stringify({ s: b.score, e: b.events, f: b.frames.length, st: b.stats });
  return ja === jb ? '完全一致 (frames=' + a.frames.length + ')' : '不一致!!';
});

/* C5b 中途空patchTactic(=UI点击)是否改变结果（RNG 污染验证） */
safe('C5b 同seed + 中途 patchTactic({}) ×1次', () => {
  const a = play(mkTeam('ARS', {}), mkTeam('LIV', {}), 777);
  const st = ENG.createMatch({ home: mkTeam('ARS', {}), away: mkTeam('LIV', {}), seed: 777 });
  while (!st.finished) {
    ENG.stepMinute(st);
    if (st.minute === 30) ENG.patchTactic(st, 0, {}); // UI"空调整"也会推帧
  }
  return '原比分 ' + a.score + ' vs 干预后 ' + st.score + ' → ' + (JSON.stringify(a.score) === JSON.stringify(st.score) ? '未变' : '被改变(RNG被呈现层消耗)');
});

/* C6 13人俱乐部当对手 */
safe('C6 13人俱乐部(2GK+11) vs ARS ×60', () => {
  const mini = DATA.findClub('BUR').players.slice(0, 13);
  mini.forEach((p, i) => { p.__uid = 'MINI-' + i; });
  let fin = 0, gf = 0, ga = 0, minOn = 99;
  seeds.forEach(s => {
    const t = TAC.autoPickXI('4-4-2', mini);
    t.instr = TAC.tacticFromStyle(DATA.findClub('BUR').style).instr;
    const st = ENG.createMatch({ home: mkTeam('ARS', {}), away: { name: '十三人联', clubId: null, tactic: t, squad: mini, ai: true }, seed: s });
    ENG.simulateToEnd(st);
    if (st.finished) fin++;
    gf += st.score[0]; ga += st.score[1];
    minOn = Math.min(minOn, st.teams[1].rt.filter(r => r.on).length);
  });
  return '完场 ' + fin + '/' + N + ' 均分 ' + (gf / N).toFixed(2) + '-' + (ga / N).toFixed(2) + ' 客队最少场上人数 ' + minOn;
});

/* C7 空槽 XI（玩家只排 7 人）——引擎自愈 */
safe('C7 玩家只排7人(4空槽自愈)', () => {
  const squad = DATA.findClub('EVE').players;
  const t = TAC.autoPickXI('4-2-3-1', squad);
  t.instr = TAC.tacticFromStyle(DATA.findClub('EVE').style).instr;
  // 清空4个槽位
  t.slots[6].playerId = null; t.slots[7].playerId = null; t.slots[8].playerId = null; t.slots[9].playerId = null;
  let fin = 0;
  seeds.forEach(s => {
    const st = ENG.createMatch({ home: { name: '残阵联', clubId: null, tactic: t, squad, ai: false }, away: mkTeam('WHU', {}), seed: s });
    ENG.simulateToEnd(st);
    if (st.finished) fin++;
  });
  return '完场 ' + fin + '/' + N + '（替补会自动顶上，等于没惩罚）';
});

/* C8 追分/领先状态机 & chaseMode 检查 */
safe('C8 落后追分速率(chase 1.3)验证', () => {
  const ms = [];
  seeds.forEach(s => ms.push(play(mkTeam('EVE', {}), mkTeam('ARS', {}), s)));
  // 统计落后方 75-90 分钟进球占比
  let late = 0, tot = 0;
  ms.forEach(st => st.events.forEach(e => {
    if (e.type === 'goal') { tot++; if (e.min > 75) late++; }
  }));
  return '75分钟后进球占比 ' + (100 * late / tot).toFixed(1) + '%（均匀应约16.7%）';
});
