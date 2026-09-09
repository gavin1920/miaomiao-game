/* Dr.Sim 实验框架：只读 game/，所有实验共用 */
'use strict';
const fs = require('fs'), path = require('path');
const GAME = 'C:/Users/gavin/Desktop/Games/FM 2027 Matchday/game/js/';
[ 'data.js', 'tactics.js', 'engine.js' ].forEach(f => {
  eval(fs.readFileSync(GAME + f, 'utf8'));
});
const DATA = globalThis.GMD_DATA, TAC = globalThis.GMD_TACTICS, ENG = globalThis.GMD_ENGINE;
DATA.CLUBS.forEach(c => c.players.forEach((p, i) => { p.__uid = c.id + '-' + i; }));

function mkTeam(clubId, opts) {
  opts = opts || {};
  const c = DATA.findClub(clubId);
  let squad = c.players;
  const t = TAC.autoPickXI(opts.formation || c.style.formation, squad);
  t.instr = TAC.tacticFromStyle(opts.formation ? Object.assign({}, c.style, { formation: opts.formation }) : c.style).instr;
  if (opts.instr) Object.assign(t.instr, opts.instr);
  const bench = opts.bench === false ? [] : squad.filter(p => !t.slots.some(s => s.playerId === p.__uid)).map(p => p.__uid);
  return { name: opts.name || c.name, clubId: c.id, tactic: t, squad: squad, benchUids: bench, ai: opts.ai !== false };
}
/* 一场：homeClub/awayClub 均为 mkTeam 的返回值 */
function play(homeTeam, awayTeam, seed) {
  const st = ENG.createMatch({ home: homeTeam, away: awayTeam, seed: seed });
  ENG.simulateToEnd(st);
  return st;
}
function summarize(matches, side) {
  side = side || 0;
  let w = 0, d = 0, l = 0, gf = 0, ga = 0, shots = 0, sot = 0, xg = 0, xga = 0,
    counters = 0, countersConc = 0, poss = 0, corners = 0, fouls = 0, yell = 0, reds = 0,
    offs = 0, passAtt = 0, passOk = 0, crossShots = 0, big = 0, pens = 0;
  const gd = [];
  matches.forEach(st => {
    const s = st.stats[side], o = st.stats[1 - side];
    const g = st.score[side], ga1 = st.score[1 - side];
    gf += g; ga += ga1; gd.push(g - ga1);
    if (g > ga1) w++; else if (g === ga1) d++; else l++;
    shots += s.shots; sot += s.sot; xg += s.xg; xga += o.xg;
    counters += s.counters; countersConc += o.counters;
    poss += st.poss[side] / Math.max(1, st.poss[0] + st.poss[1]) * 100;
    corners += s.corners; fouls += s.fouls; yell += s.yellow; reds += s.red; offs += s.offsides;
    passAtt += s.passAtt; passOk += s.passOk; crossShots += s.crossShots; big += s.bigChances;
  });
  const n = matches.length;
  return {
    n, w, d, l,
    winPct: (100 * w / n).toFixed(1),
    gf: (gf / n).toFixed(2), ga: (ga / n).toFixed(2), gd: (gf / n - ga / n).toFixed(2),
    shots: (shots / n).toFixed(1), sot: (sot / n).toFixed(1),
    xg: (xg / n).toFixed(2), xga: (xga / n).toFixed(2),
    counters: (counters / n).toFixed(2), countersConc: (countersConc / n).toFixed(2),
    poss: (poss / n).toFixed(1), corners: (corners / n).toFixed(1), fouls: (fouls / n).toFixed(1),
    yellows: (yell / n).toFixed(2), reds: (reds / n).toFixed(2), offsides: (offs / n).toFixed(2),
    passAcc: (100 * passOk / Math.max(1, passAtt)).toFixed(1),
    crossShots: (crossShots / n).toFixed(1), big: (big / n).toFixed(1),
    gdArr: gd
  };
}
/* 配对种子批量：同一组种子跑 baseline 与 variant，返回两组 summary */
function batch(teamHomeBase, teamAwayBase, n, mut) {
  const seeds = []; for (let i = 0; i < n; i++) seeds.push(1000 + i * 37);
  const runs = { base: [], varp: [] };
  for (let i = 0; i < n; i++) {
    const hB = mkTeam(teamHomeBase.club, { formation: teamHomeBase.formation, instr: teamHomeBase.instr }),
          aB = mkTeam(teamAwayBase.club, { formation: teamAwayBase.formation, instr: teamAwayBase.instr });
    runs.base.push(play(hB, aB, seeds[i]));
    if (mut) {
      const hV = mkTeam(teamHomeBase.club, { formation: teamHomeBase.formation, instr: Object.assign({}, teamHomeBase.instr, mut.home || {}) }),
            aV = mkTeam(teamAwayBase.club, { formation: teamAwayBase.formation, instr: Object.assign({}, teamAwayBase.instr, mut.away || {}) });
      runs.varp.push(play(hV, aV, seeds[i]));
    }
  }
  return runs;
}
module.exports = { DATA, TAC, ENG, mkTeam, play, summarize, batch };
