/* ============================================================
 * FM 2027 Matchday - 赛季元系统（v0.3「联赛之心」）
 * 38 轮赛程生成 / 挖空恩怨 / 赛季新闻引擎 / 金靴榜 / 解说人格
 * 纯函数无 DOM 依赖：浏览器与 Node 冒烟测试共用
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 赛程：圈法（奇数队用占位轮空，修复自对战） → 镜像成双循环 ---------- */
  /* teamIds: ['__ME__', 'ARS', ...]（21 队）；len: 10（迷你）| 42（完整双循环）
     返回 fixtures[round] = [{h, a}]；21 队每轮 10 场 + 1 队轮空（'__BYE__' 对局被剔除），
     完整赛季每队 40 战 + 2 轮空，任意两队主客各交手一次；
     玩家的主客由赛程自然决定（mySide 抽象） */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  var BYE = '__BYE__';
  function buildFixtures(teamIds, len) {
    var arr = shuffle(teamIds.slice());
    if (arr.length % 2 === 1) arr = arr.concat([BYE]);
    var m = arr.length, firstHalf = [];
    for (var r = 0; r < m - 1; r++) {
      var list = [arr[m - 1]];
      for (var i = 0; i < m - 1; i++) list.push(arr[(i + r) % (m - 1)]);
      var round = [];
      for (var k = 0; k < m / 2; k++) {
        var h = list[k], a = list[m - 1 - k];
        if (h === BYE || a === BYE) continue;
        round.push(r % 2 === 0 ? { h: h, a: a } : { h: a, a: h });
      }
      firstHalf.push(round);
    }
    shuffle(firstHalf);
    /* 镜像主客 → 双循环：同一对手恰好在上半程交手一次、下半程回访一次 */
    var all = firstHalf.concat(firstHalf.map(function (round) {
      return round.map(function (f) { return { h: f.a, a: f.h }; });
    }));
    return all.slice(0, Math.min(len, all.length));
  }

  /* ---------- 挖空恩怨 ---------- */
  /* squad: 我签下的球员对象数组（有 __uid），clubId: 被挖俱乐部
     返回 {count, names}；count>=2 触发怒气强化 */
  function grudgeFor(squad, clubId) {
    var names = [];
    squad.forEach(function (p) {
      if (String(p.__uid).split('-')[0] === clubId) names.push(p.name);
    });
    return { count: names.length, names: names };
  }
  /* 怒气强化：只走既有指令通道（牌险/犯规/体能代价自然跟随，不引入新公式） */
  function applyGrudge(tactic, stolen) {
    if (stolen < 2 || !tactic || !tactic.instr) return false;
    var i = tactic.instr;
    i.press = Math.min(3, (i.press || 0) + 1);
    i.tackling = 2;
    i.attPush = Math.min(6, (i.attPush != null ? i.attPush : 3) + 1);
    if (i.press >= 2) i.gegen = 1;
    return true;
  }
  function grudgeLine(clubName, names) {
    var who = names.slice(0, 2).join('、') + (names.length > 2 ? ' 等' + names.length + ' 人' : '');
    return clubName + ' 没有忘记你挖走了 ' + who + '——更凶的逼抢、更狠的抢断在等着你。';
  }

  /* ---------- 金靴榜 ---------- */
  /* 从比赛终态收集某侧进球者；clubLabel: 该侧显示名（我的球队用队名） */
  function collectScorers(state, side, clubLabel) {
    var out = [];
    state.teams[side].rt.forEach(function (r) {
      if (r.stats.goals > 0) out.push({ uid: r.uid, name: r.p.name, clubLabel: clubLabel, goals: r.stats.goals });
    });
    return out;
  }
  function addScorers(map, entries) {
    (entries || []).forEach(function (e) {
      var cur = map[e.uid];
      if (cur) cur.goals += e.goals;
      else map[e.uid] = { name: e.name, clubLabel: e.clubLabel, goals: e.goals };
    });
    return map;
  }
  function topScorers(map, n) {
    return Object.keys(map).map(function (uid) { return { uid: uid, name: map[uid].name, clubLabel: map[uid].clubLabel, goals: map[uid].goals }; })
      .sort(function (a, b) { return b.goals - a.goals || (a.name < b.name ? -1 : 1); })
      .slice(0, n || 10);
  }

  /* ---------- 排名快照（冷门/强强对话判定用） ---------- */
  function rankMap(table) {
    var rows = Object.keys(table).map(function (id) { return { id: id, o: table[id] }; })
      .sort(function (x, y) { return y.o.pts - x.o.pts || (y.o.gf - y.o.ga) - (x.o.gf - x.o.ga) || y.o.gf - x.o.gf; });
    var m = {};
    rows.forEach(function (r, i) { m[r.id] = i + 1; });
    return m;
  }

  /* ---------- 赛季新闻引擎 ----------
     按优先级生成 ≤8 条：我的比赛 → 伤情 → 恩怨预告 → 冷门 → 惨案 → 强强对话 → 金靴观察
     ctx: {round, results:[{h,a,hs,as}], ranksBefore:{id:rank}, table, myId, myFix,
           myName, scorers, injuries:[{name,weeks}], nextOppId, grudge:{count,names}|null, nm(id)} */
  function makeNews(ctx) {
    var items = [];
    var r = ctx.round, nm = ctx.nm;
    var pickT = function (arr, salt) { return arr[(r * 7 + salt * 13 + items.length * 5) % arr.length]; };

    /* 我的比赛头条（必发） */
    if (ctx.myFix) {
      var f = ctx.myFix, mine = f.h === ctx.myId;
      var myS = mine ? f.hs : f.as, opS = mine ? f.as : f.hs;
      var oppName = nm(mine ? f.a : f.h);
      var venue = mine ? '主场' : '客场';
      if (myS > opS) {
        items.push({ icon: '✅', title: myS + '-' + opS + ' ' + (mine ? '胜' : '客胜') + oppName + '！', text: pickT([
          ctx.myName + ' ' + venue + ' ' + myS + '-' + opS + ' 击溃 ' + oppName + '，三分稳稳落袋，更衣室里放起了音乐。',
          '一场 ' + myS + '-' + opS + ' 的胜利！' + oppName + ' 没能挡住' + ctx.myName + '的攻势，' + venue + '全取三分。'
        ], 1) });
      } else if (myS < opS) {
        items.push({ icon: '💔', title: myS + '-' + opS + ' 不敌' + oppName, text: pickT([
          ctx.myName + ' ' + venue + ' ' + myS + '-' + opS + ' 败给 ' + oppName + '，主教练在发布会上沉默了很久。',
          oppName + ' 给' + ctx.myName + '上了一课：' + myS + '-' + opS + '，回去还有作业要做。'
        ], 2) });
      } else {
        items.push({ icon: '🤝', title: myS + '-' + opS + ' 战平' + oppName, text: pickT([
          ctx.myName + '在' + venue + '与 ' + oppName + '战成 ' + myS + '-' + opS + '，各拿一分，谁都不太满意。',
          myS + '-' + opS + '，' + ctx.myName + venue + '对阵 ' + oppName + ' 平局收场——积分榜上这一分可能很关键。'
        ], 3) });
      }
    }

    /* 我方伤情 */
    (ctx.injuries || []).forEach(function (inj) {
      items.push({ icon: '🩹', title: inj.name + ' 伤退，预计缺阵 ' + inj.weeks + ' 轮', text: '队医确认：' + inj.name + ' 将缺席约 ' + inj.weeks + ' 轮联赛。阵容深度现在是真的重要了——轮换，或者后悔。' });
    });

    /* 恩怨预告（下一轮） */
    if (ctx.nextOppId && ctx.grudge && ctx.grudge.count >= 2) {
      items.push({ icon: '🧨', title: '火药味预警：下一轮对阵' + nm(ctx.nextOppId), text: grudgeLine(nm(ctx.nextOppId), ctx.grudge.names) });
    }

    /* 惨案 / 冷门 / 强强对话（同一场比赛可同时命中多类） */
    (ctx.results || []).forEach(function (res, idx) {
      if (res.h === ctx.myId || res.a === ctx.myId) return;
      var w = res.hs > res.as ? res.h : res.a, l = res.hs > res.as ? res.a : res.h;
      var margin = Math.abs(res.hs - res.as);
      var rw = ctx.ranksBefore[w] || 10, rl = ctx.ranksBefore[l] || 10;
      if (rw - rl >= 5) {
        items.push({ icon: '💥', title: '冷门！' + nm(w) + ' 掀翻' + nm(l), text: pickT([
          '赛前没人敢想：排名第 ' + rw + ' 的 ' + nm(w) + ' ' + res.hs + '-' + res.as + ' 放倒了第 ' + rl + ' 的 ' + nm(l) + '。',
          '本轮最大冷门诞生——' + nm(w) + '（第' + rw + '）力克 ' + nm(l) + '（第' + rl + '），积分榜要重新洗牌了。'
        ], 5 + idx) });
      }
      if (margin >= 3) {
        items.push({ icon: '🔴', title: nm(w) + ' ' + Math.max(res.hs, res.as) + '-' + Math.min(res.hs, res.as) + ' 血洗' + nm(l), text: pickT([
          nm(w) + ' 打疯了：' + res.hs + '-' + res.as + '，' + nm(l) + ' 的防线被冲得七零八落。',
          '一场惨案！' + nm(w) + ' ' + res.hs + '-' + res.as + ' ' + nm(l) + '，客队更衣室气氛降到了冰点。'
        ], 4 + idx) });
      } else if (rw <= 4 && rl <= 4) {
        items.push({ icon: '🎯', title: '强强对话：' + nm(w) + ' ' + res.hs + '-' + res.as + ' ' + nm(l), text: pickT([
          '前四直接对话，' + nm(w) + ' 笑到最后。这场 ' + res.hs + '-' + res.as + ' 的含金量，会影响到最终的冠军归属。',
          '欧冠级别的较量：' + nm(w) + ' 与 ' + nm(l) + ' 打出 ' + res.hs + '-' + res.as + '，技战术含量拉满的一轮。'
        ], 6 + idx) });
      }
    });

    /* 金靴观察 */
    var top = topScorers(ctx.scorers || {}, 1)[0];
    if (top && top.goals >= 3) {
      items.push({ icon: '👟', title: '金靴观察：' + top.name + ' 已入 ' + top.goals + ' 球', text: top.clubLabel + ' 的 ' + top.name + ' 以 ' + top.goals + ' 球领跑射手榜，各队后防教练的战术板上写满了他的名字。' });
    }
    return items.slice(0, 8);
  }

  /* ---------- 解说人格（呈现层声音层） ----------
     只追加弹幕，不改写引擎事件文本；随机源由 UI 层用 viewRng 提供 */
  var PERSONAS = [
    {
      id: 'off', name: '🔇 标准解说', desc: '原汁原味的赛事播报',
      lines: {}
    },
    {
      id: 'fire', name: '🔥 火焰解说', desc: '激情呐喊，喊到破音',
      lines: {
        goal: ['球进啦！！！{A}！！！这脚射门能把屋顶掀翻！！{S}！', 'GOOOOAL！{A}！！我就知道！我就知道！{S}！', '进了进了进了！！！{A}这球要上明日十佳啊朋友们！！'],
        oppGoal: ['唉……{A}进球了，{S}。看台上一片死寂。', '糟糕！{A}把球送进了大门，{S}，防线得醒一醒了！'],
        save: ['神扑！！这是一次世界级的扑救！', '挡出来了！这个扑救值一张球票钱！'],
        red: ['红牌！！比赛的风向彻底变了！！', '直红！！他下去了，这支球队要为这一刻付出代价！'],
        injury: ['哦不，他倒下了……希望没有大碍。', '队医冲进来了，这次碰撞看着不轻。'],
        ht: ['中场休息！下半场才是真刀真枪的时刻！', '半场哨响！更衣室里的十五分钟会改变什么？'],
        ftWin: ['比赛结束！胜利！！这是属于你们的夜晚！！！', '终场哨响！赢了！把这份喜悦带回家吧！！！'],
        ftDraw: ['全场比赛结束，平局。有遗憾，也有庆幸。', '哨响，双方各拿一分。有些夜晚上半场就该锁定胜局。'],
        ftLoss: ['比赛结束了……输球的滋味，只有踢过的人懂。', '终场哨响，吞下失利。总结，然后向前看。'],
        motm: ['今晚的球场属于{A}！起立鼓掌！', '把掌声送给{A}，他配得上这一切！']
      }
    },
    {
      id: 'cool', name: '📊 数据大师', desc: 'xG 视角，冷静解剖',
      lines: {
        goal: ['{A}破门，{S}。注意这次进攻的推进速度——从夺回球权到完成射门只用了一次传递。', '球进了。{A}的跑位恰好落在防线横移的空当上，教科书级别的反越位。{S}'],
        oppGoal: ['{A}进球，{S}。回放显示造越位线出现了 1.5 米左右的脱节。', '失球了。这次定位球防守中，高点的保护是缺位的。'],
        save: ['一次高质量扑救，射门位置期望进球并不低。', '门将的出击时机拿捏得很准，把一次单刀机会扼杀在了萌芽里。'],
        red: ['红牌。此后十人应战，阵型的横向覆盖率会下降约两成。', '少一人了。接下来教练组必须在阵型结构上做出取舍。'],
        injury: ['被迫换人。注意，这可能打乱原定的换人计划。', '伤退。他的对位替补风格不同，战术权重需要重新分配。'],
        ht: ['半场结束。控球数据只是表象，机会转化率才是下半场的胜负手。', '45 分钟战罢。体能曲线显示，70 分钟前后将是这个阵型的瓶颈期。'],
        ftWin: ['全场比赛结束。数据、过程、结果三者统一，这是一场没有争议的胜利。', '赢下来了。从预期进球的走势看，这个结果完全配得上。'],
        ftDraw: ['终场平局。xG 对比说明，这基本是一场势均力敌的比赛。', '一分收场。控制了过程，但最后一传的质量差了半个档次。'],
        ftLoss: ['输球了。控球占优却输掉比赛——效率，这就是足球的残酷之处。', '失利。防线在由攻转守的 8 秒里两次丢掉结构，这是需要复盘的。'],
        motm: ['全场最佳：{A}。他的数据栏几乎是满的。', '{A}当选最佳，攻防两端的覆盖是决定性的。']
      }
    },
    {
      id: 'poet', name: '🌙 绿茵诗人', desc: '文艺腔，把足球写成诗',
      lines: {
        goal: ['皮球划过的弧线，像写给夜空的情书——{A}，{S}。', '那一刻，时间慢了下来。{A}起脚，网窝轻颤，{S}。', '有些进球是计算，有些是天赋。这一个，属于后者。{A}，{S}。'],
        oppGoal: ['足球有时残忍得像一场告别。{A}进球，{S}。', '叹息声落满看台。{A}把皮球留在了我们的球门里，{S}。'],
        save: ['门将张开双臂，像堤坝拦下了整条河。', '一次扑救，一次挽歌的暂停。他还在。'],
        red: ['红牌像一片秋天的落叶，缓缓飘落，赛季的故事因此改写。', '十一个人的诗，少了一行。'],
        injury: ['他倒下的地方，草皮会记得这次疼痛。', '绿茵场上，伤病是最不受欢迎的注脚。'],
        ht: ['中场休息。十五分钟，足够让一支球队想起自己为什么出发。', '半场哨响，故事翻到一半，悬念才刚醒。'],
        ftWin: ['终场哨响，胜利像晚风一样如约而至。', '九十分钟的跋涉，终点是甜的。'],
        ftDraw: ['平局，一枚硬币的两面，谁也没有输给夜色。', '哨响。有些故事没有结局，只有逗号。'],
        ftLoss: ['夜色收走了三分，但足球明天还会升起。', '失利是一场雨。淋过，然后继续走。'],
        motm: ['把这首夜曲献给{A}。', '{A}，今晚绿茵场上的主角。']
      }
    }
  ];
  function findPersona(id) {
    for (var i = 0; i < PERSONAS.length; i++) if (PERSONAS[i].id === id) return PERSONAS[i];
    return PERSONAS[1];
  }
  function personaLine(persona, key, i) {
    var arr = persona && persona.lines && persona.lines[key];
    if (!arr || !arr.length) return null;
    return arr[((i % arr.length) + arr.length) % arr.length];
  }

  global.GMD_SEASON = {
    buildFixtures: buildFixtures,
    grudgeFor: grudgeFor,
    applyGrudge: applyGrudge,
    grudgeLine: grudgeLine,
    collectScorers: collectScorers,
    addScorers: addScorers,
    topScorers: topScorers,
    rankMap: rankMap,
    makeNews: makeNews,
    PERSONAS: PERSONAS,
    findPersona: findPersona,
    personaLine: personaLine
  };
})(typeof window !== 'undefined' ? window : globalThis);
