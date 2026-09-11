/* 喵都幸存者 - 数值装配层：把 js/game_config.js 的可调数值装配成运行时数据表
   （武器/被动的名称与文案、行为类型在这里；所有"数字"都在 game_config.js） */
'use strict';
const DATA = (() => {
  const CFG = (function load() {
    const user = (typeof window !== 'undefined' && window.GAME_CONFIG) || {};
    // 与内置默认深度合并：用户文件缺字段时用默认值兜底，避免改坏文件导致崩游戏
    const def = {
      difficulty: { enemyHp: 1, enemyDmg: 1, enemySpd: 1, spawnRate: 1, eliteHp: 1, bossHp: 1, playerHp: 1, xpGain: 1, goldGain: 1 },
      player: { hp: 100, speed: 172, r: 16, pickupR: 55, iframes: 0.55, regenBase: 0 },
      growth: { xpBase: 7, xpPerLv: 8, xpPow: 1.32, xpPow30: 1.5, xpPow40: 1.65, xpPow50: 1.8,
        xpPowStep: 0.05, xpPowMax: 2.4,
        hpPerMin: 0.55, hpLatePerMin: 0.38, hpLateFromMin: 8,
        dmgPerMin: 0.045, spdPerMin: 0.012, spdMax: 1.28, capBase: 38, capPerMin: 16.5, capMax: 265,
        spawnBase: 1.05, spawnPerMin: 0.055, spawnMin: 0.24, batchPerMin: 2.2, despawnR: 1.6,
        countRoundMul: 2, countHardMax: 480, countBatchPerTick: 64,
        screenCap: 150, capResume: 100,
        roundHpMul: 3, roundDmgMul: 2, roundSpdMul: 1.1 },
      // 70 级后成长规则：autoFrom 级起升级自动+属性；chestOnlyFrom 级起只能靠宝箱升级
      postLevel: { autoFrom: 70, chestOnlyFrom: 80, hpPerLv: 0.02, spdPerLv: 0.01 },
      slots: { weapon: 4, passive: 6 },
      stamps: {
        minLevel: 70, share: 0.5, chestAffix: 0.6,
        dmg: 0.12, cd: 0.06, area: 0.10, amount: 1, pierce: 1, crit: 0.04, lifesteal: 0.004,
        amountWeight: 0.7, pierceWeight: 0.8, minCd: 0.10
      },
      elite: { hpMul: 40, dmgMul: 1.8, scale: 1.55, spdMul: 0.92, chestBase: 0.5, chestLuck: 0.06 },
      // 意见6（第三版）：敌人行为特性参数（enemies 表的 slime/steal/dash/ranged 标记启用）
      enemyTraits: {
        dash:   { cd: 3.4, range: 460, windup: 0.5, mul: 3.6, time: 0.26 },
        ranged: { cd: 2.6, range: 430, speed: 300, dmgMul: 0.7, life: 2.2 },
        steal:  { radius: 250, keep: 170, eatR: 22 },
        slime:  { gap: 0.55, life: 2.8, r: 15, slow: 0.55, max: 70 }
      },
      // 反卡死兜底（流场寻路之上的最后一道保险）：想追却持续原地累计满阈值 → 瞬移进主角视野贴屏幕边缘
      antiStuck: {
        trashT: 2.5, bossT: 3.0, frac: 0.25, engageR: 26,
        reWarpCd: 6, warpStun: 1.2, edgeInset: 56, minPlayerD: 190, samples: 24
      },
      // 老鼠妈妈的老巢（意见10）：每张手工地图边缘一座，捣毁后妈妈提前降临
      motherHouse: { hp: 1000000, r: 48, gold: 50 },
      rounds: {
        parTime: 900, batchCount: 4, bossFrac: 0.72, dynamicStartRound: 2, motherEndsRun: true,
        batchBossTypes: ['goose', 'raccoon', 'bulldog', 'calico'],
        batchBossHpFracs: [0.07, 0.13, 0.25, 0.45],
        batchBossScale: 1.85,
        fixed: [
          { hp: 1.0, dmg: 1.0,  spawn: 1.0,  eliteHp: 1.0, bossHp: 1.0, mixMin: 0,    eventMul: 1,   bbAffix: 0, bossAffix: 0 },
          { hp: 1.5, dmg: 1.10, spawn: 0.90, eliteHp: 1.6, bossHp: 1.7, mixMin: 2.5,  eventMul: 1,   bbAffix: 0, bossAffix: 0 },
          { hp: 2.2, dmg: 1.20, spawn: 0.83, eliteHp: 2.4, bossHp: 2.8, mixMin: 5,    eventMul: 1.5, bbAffix: 0, bossAffix: 1 },
          { hp: 3.2, dmg: 1.30, spawn: 0.76, eliteHp: 3.5, bossHp: 4.2, mixMin: 7.5,  eventMul: 1.5, bbAffix: 1, bbAffixIds: ['tough'], bossAffix: 1 },
          { hp: 4.6, dmg: 1.40, spawn: 0.70, eliteHp: 5.0, bossHp: 6.0, mixMin: 10,   eventMul: 2,   bbAffix: 1, bbAffixIds: ['swift'], bossAffix: 1 },
          { hp: 6.5, dmg: 1.52, spawn: 0.65, eliteHp: 7.0, bossHp: 8.2, mixMin: 12.5, eventMul: 2.5, bbAffix: 2, bbAffixIds: ['swift', 'split'], bossAffix: 2 }
        ],
        dynamic: { hpK: 1.45, hpClamp: [1.25, 1.7], dmgK: 1.08, dmgClamp: [1.04, 1.13],
          denK: 1.12, denClamp: [1.06, 1.18], spawnFloor: 0.5, bossK: 1.2, bossKClamp: [0.85, 1.7],
          parBossTTK: 15, hpLow: 0.35, dmgRelief: 0.9, hpHigh: 0.85, dmgTighten: 1.1,
          lvLow: 5, lvHigh: 12, xpClamp: [0.8, 1.2], softCapRound: 12, hpStep: 1.2 },
        affixes: { swift: { name: '迅捷', spd: 1.28 }, tough: { name: '铁壁', dmgTaken: 0.8, kbRes: 0.5 },
          enrage: { name: '狂暴', atFrac: 0.3, spd: 1.3, dmg: 1.35 }, split: { name: '分裂', n: 3, hpMul: 4 } }
      },
      finale: { bossWarn: 2.8, bossSummonN: 6, bossSummonCd: 8, bossChargeDist: 420,
        bossTeleTime: 0.65, bossChargeTime: 0.85, bossChargeMul: 3.4, bossSummonHpMul: 3,
        motherWarn: 3.2, motherSkillCd: 10, motherTele: 0.6, motherHpFrac: 0.5,
        motherHpFloor: 1, motherStun: 1, motherDisarm: 1, motherSlowT: 2, motherSlowMul: 0.55, motherGold: 500,
        motherCoinN: 30, motherChestN: 5 },
      fx: { shakeMax: 14, shakeMinorCap: 4, shakeDecay: 34, zoneMax: 28, particleLodAt: 450 },
      // 老鼠妈妈兜底：旧版导出的 game_config.js 可能没有 mother 条目，避免压轴 Boss 消失
      motherFallback: { hp: 5000000, spd: 100, dmg: 80, r: 66, xp: 0, mass: 200, boss: 1, mother: 1 },
      drops: { coin: 0.035, milk: 0.012, firework: 0.0045, vacuum: 0.0045, milkHeal: 30, fireworkDmg: 150,
        gemMax: 330, chestDrop: 0.001, chestLuck: 0.0016,
        gemTiers: [{ v: 25, tier: 3 }, { v: 5, tier: 2 }, { v: 1, tier: 1 }] },
      chest: { radius: 40, p5: 0.02, p3: 0.12, luckP5: 0.06, luckP3: 0.14 },
      lottery: { // 金币经验规则：单枚金币 = 档位% × 当前等级升级所需经验（80% 封顶）
        tiers: [
          { pct: 0.80, p: 0.0001 }, { pct: 0.50, p: 0.0009 }, { pct: 0.30, p: 0.009 },
          { pct: 0.10, p: 0.04 }, { pct: 0.05, p: 0.1 }, { pct: 0.01, p: 0.85 }
        ],
        luckBoost: 1
      },
    };
    const out = {};
    for (const k in def) out[k] = Object.assign({}, def[k], user[k] || {});
    out.weapons = user.weapons || {};
    out.passives = user.passives || {};
    // 敌人表逐项兜底：老版导出的 game_config.js 缺新特性标记（slime/steal/dash/ranged）时行为不丢
    //（mother 整项兜底同理；用户显式改过的字段以用户为准）
    const TRAIT_FLAGS = { snail: { slime: 1 }, raccoon: { steal: 1 }, calico: { dash: 1 }, pigeon: { ranged: 1 } };
    out.enemies = Object.assign({ mother: def.motherFallback }, user.enemies || {});
    for (const id in TRAIT_FLAGS) {
      if (!out.enemies[id]) continue;
      for (const k in TRAIT_FLAGS[id]) if (out.enemies[id][k] === undefined) out.enemies[id][k] = TRAIT_FLAGS[id][k];
    }
    out.waves = Array.isArray(user.waves) && user.waves.length ? user.waves : [{ rat: 1 }];
    out.elites = user.elites || [];
    out.events = user.events || [];
    out.difficulty = Object.assign(out.difficulty, user.difficulty || {});
    // rounds 是嵌套结构，做一层定向深合并，用户文件缺块时用默认兜底
    out.rounds = Object.assign({}, def.rounds, user.rounds || {});
    out.rounds.dynamic = Object.assign({}, def.rounds.dynamic, (user.rounds || {}).dynamic || {});
    out.rounds.affixes = Object.assign({}, def.rounds.affixes, (user.rounds || {}).affixes || {});
    if (!Array.isArray(out.rounds.fixed) || !out.rounds.fixed.length) out.rounds.fixed = def.rounds.fixed;
    if (!Array.isArray(out.rounds.batchBossTypes) || !out.rounds.batchBossTypes.length) out.rounds.batchBossTypes = def.rounds.batchBossTypes;
    if (!Array.isArray(out.rounds.batchBossHpFracs) || !out.rounds.batchBossHpFracs.length) out.rounds.batchBossHpFracs = def.rounds.batchBossHpFracs;
    return out;
  })();
  const DIFF = CFG.difficulty;

  /* ---------- 武器：行为/名称/图标（数值见 game_config.js） ---------- */
  const W_META = {
    claw:  { kind: 'claw',  name: '猫爪连击', evo: 'sakura', evoName: '樱花爆爪', icon: 'claw', iconEvo: 'sakura',
             desc: '朝面向方向挥出大大的猫爪！', descEvo: '樱花瓣爆裂双爪！暴击吸血，猫见猫怕。' },
    note:  { kind: 'homing', name: '喵喵音波', evo: 'ultra', evoName: '超声波', icon: 'note', iconEvo: 'ultra',
             desc: '音符 ♪ 自动飞向最近的敌人。', descEvo: '超声波冲击！超高频穿透音浪。' },
    fish:  { kind: 'knife', name: '飞鱼干', evo: 'fishstorm', evoName: '千鱼风暴', icon: 'fish', iconEvo: 'fishStorm',
             desc: '朝面向方向甩出小鱼干，又快又直。', descEvo: '千鱼风暴！扇形鱼干弹幕！' },
    axe:   { kind: 'axe',   name: '鱼头斧', evo: 'tunarain', evoName: '金枪鱼雨', icon: 'axe', iconEvo: 'tunaRain',
             desc: '把咸鱼斧头抛上天，砸穿一片敌人。', descEvo: '金枪鱼雨！巨无霸金枪鱼从天而降！' },
    orbit: { kind: 'orbit', name: '毛线环绕', evo: 'planet', evoName: '星球毛线', icon: 'yarn', iconEvo: 'planet',
             desc: '毛线球绕着大橘转，撞飞靠近的敌人。', descEvo: '星球毛线！六颗巨大毛线行星的引力护罩！' },
    aura:  { kind: 'aura',  name: '猫薄荷光环', evo: 'aurastorm', evoName: '猫薄荷风暴', icon: 'aura', iconEvo: 'auraStorm',
             desc: '猫薄荷香气环绕，靠近的敌人持续掉血。', descEvo: '猫薄荷风暴！大型香气领域并减速敌人。' },
    litter:{ kind: 'lobzone', name: '猫砂弹', evo: 'littermeteor', evoName: '猫砂流星雨', icon: 'litter', iconEvo: 'litterRain',
             desc: '抛出猫砂团，炸开并留下伤害区域。', descEvo: '猫砂流星雨！大片持续伤害区域！' },
    zap:   { kind: 'zap',   name: '炸毛静电', evo: 'thunderpuff', evoName: '雷霆炸毛', icon: 'zap', iconEvo: 'thunderPuff',
             desc: '炸毛啦！闪电随机劈中敌人。', descEvo: '雷霆炸毛！链式闪电风暴！' }
  };
  const WEAPON_ORDER = ['claw', 'note', 'fish', 'axe', 'orbit', 'aura', 'litter', 'zap'];

  // 把配置数组包装成 stats(l)（l 从 1 开始）
  function mkStats(cw) {
    return l => {
      const i = Math.min(cw.maxLv, Math.max(1, l)) - 1;
      const s = {};
      for (const k in cw) {
        if (k === 'maxLv' || k === 'evo' || k === 'evoPassive' || k === 'statsEvo') continue;
        const v = cw[k];
        s[k] = Array.isArray(v) ? v[i] : v;
      }
      if ('both' in s) s.both = !!s.both;
      return s;
    };
  }
  const WEAPONS = {};
  for (const id of WEAPON_ORDER) {
    const cw = CFG.weapons[id];
    if (!cw) continue;
    WEAPONS[id] = Object.assign({}, W_META[id], cw, {
      stats: mkStats(cw),
      statsEvo: Object.assign({}, cw.statsEvo, { both: !!(cw.statsEvo && cw.statsEvo.both) })
    });
  }

  /* ---------- 升级文案：按相邻两级数值差自动生成（改数值文案自动跟着变） ---------- */
  const STAT_LABEL = {
    dmg: '伤害', cd: '冷却', area: '范围', amount: '数量', waves: '段数', speed: '弹速',
    pierce: '穿透', radius: '半径', tick: '跳伤间隔', slow: '减速', zoneR: '区域', zoneT: '持续',
    active: '旋转持续', hitCd: '碰撞间隔', spread: '散布', strikes: '落雷', chain: '连链', kb: '击退'
  };
  const PCT_KEYS = { area: 1, radius: 1, zoneR: 1, slow: 1, might: 1 };
  function fmtV(v) {
    if (v === true) return '有';
    if (v === false) return '无';
    return '' + (Math.round(v * 100) / 100);
  }
  function statGain(k, a, b) {
    if (b === a) return null;
    if (k === 'both') return b ? '前后双向爪击！' : null;
    if (typeof b === 'boolean') return b ? (STAT_LABEL[k] || k) + '！' : null;
    if (PCT_KEYS[k] && a > 0) {
      const p = Math.round((b / a - 1) * 100);
      if (p !== 0) return STAT_LABEL[k] + (p > 0 ? ' +' : ' ') + p + '%';
      return null;
    }
    if (k === 'slow') return b > (a || 0) ? '减速 ' + Math.round(b * 100) + '%' : null;
    if (k === 'cd') return '冷却 ' + fmtV(a) + '→' + fmtV(b) + ' 秒';
    if (k === 'waves') return b > a ? '第 ' + b + ' 段爪击！' : null;
    if (k === 'chain') return b ? '闪电连链 ×' + b + '！' : null;
    if (k === 'crit') return '暴击 ' + Math.round(b * 100) + '%！';
    if (k === 'lifesteal') return b ? '攻击吸血！' : null;
    return STAT_LABEL[k] + ' ' + fmtV(a) + '→' + fmtV(b);
  }
  const GAIN_FLAVOR = { // 个别等级的定制文案（覆盖自动生成）
    'claw:5': '伤害 24 → 30',
    'claw:8': '伤害 30 → 38，范围 +21%'
  };
  function genGains(id) {
    const def = WEAPONS[id];
    const arr = ['攻击 ' + fmtV(def.stats(1).dmg)];
    for (let l = 2; l <= def.maxLv; l++) {
      const a = def.stats(l - 1), b = def.stats(l);
      if (GAIN_FLAVOR[id + ':' + l]) { arr.push(GAIN_FLAVOR[id + ':' + l]); continue; }
      const parts = [];
      for (const k in b) {
        if (k === 'kb' || k === 'hitCd' || k === 'tick' || k === 'spread') continue; // 手感细节不上文案
        const g = statGain(k, a[k], b[k]);
        if (g) parts.push(g);
      }
      arr.push(parts.length ? parts.join('，') : '微调强化');
    }
    return arr;
  }
  for (const id in WEAPONS) WEAPONS[id].gain = genGains(id);

  /* ---------- 被动道具 ---------- */
  const P_META = {
    catnip:     { name: '猫薄荷', icon: 'catnip', desc: '所有伤害 +10%' },
    alarm:      { name: '小闹钟', icon: 'clock', desc: '武器冷却 -7%' },
    yarnball:   { name: '弹力毛线', icon: 'yarnBall', desc: '攻击范围 +10%' },
    bell:       { name: '小铃铛', icon: 'bell', desc: '投掷物速度 +12%' },
    gloves:     { name: '猫爪手套', icon: 'glove', desc: '投掷物数量 +1' },
    milk:       { name: '牛奶盒', icon: 'milkIcon', desc: '最大生命 +15%，回复 +0.5/秒' },
    magnetfish: { name: '磁铁鱼', icon: 'magnetFish', desc: '拾取范围 +20%' },
    koi:        { name: '幸运锦鲤', icon: 'koi', desc: '幸运 +15%，暴击率 +0.25%（全武器）' }
  };
  const PASSIVE_ORDER = ['catnip', 'alarm', 'yarnball', 'bell', 'gloves', 'milk', 'magnetfish', 'koi'];
  // 把逐级数组变成 mod(l)（l 从 1 开始）
  function mkMod(cp) {
    return l => {
      const i = Math.min(cp.maxLv, Math.max(1, l)) - 1;
      const m = {};
      for (const k in cp) {
        if (k === 'maxLv') continue;
        const v = cp[k];
        if (Array.isArray(v)) m[k === 'amount' ? 'amountBonus' : k] = v[i];
      }
      return m;
    };
  }
  const PASSIVES = {};
  for (const id of PASSIVE_ORDER) {
    const cp = CFG.passives[id];
    if (!cp) continue;
    PASSIVES[id] = Object.assign({}, P_META[id], cp, { mod: mkMod(cp) });
  }

  /* ---------- 猫爪印（玩家侧全武器词条） ----------
     每层数值 = CFG.stamps[id]；ch = 加成通道（mods 字段）。
     mode: mulUp = 逐层 ×(1+v) / mulDown = 逐层 ×(1-v) / add = 逐层 +v。
     7 枚印全部无上限；引擎底线：单武器冷却 minCd、场上投射物总量 480（在 main.js）。
     weightKey：个别印在印池里的相对权重（默认 1）。 */
  const STAMP_META = {
    dmg:       { name: '锐爪印', icon: 'stampDmg',    ch: 'might',       mode: 'mulUp',   desc: '全武器伤害 +12%/层（乘法，无上限）' },
    cd:        { name: '疾风印', icon: 'stampCd',     ch: 'cdMult',      mode: 'mulDown', desc: '全武器冷却 -6%/层（乘法）' },
    area:      { name: '广域印', icon: 'stampArea',   ch: 'areaMult',    mode: 'mulUp',   desc: '攻击范围 +10%/层（乘法）' },
    amount:    { name: '影分印', icon: 'stampAmount', ch: 'amountBonus', mode: 'add',     desc: '投射物数量 +1/层', weightKey: 'amountWeight' },
    pierce:    { name: '贯穿印', icon: 'stampPierce', ch: 'pierceBonus', mode: 'add',     desc: '投射物穿透 +1/层（无上限）', weightKey: 'pierceWeight' },
    crit:      { name: '会心印', icon: 'stampCrit',   ch: 'crit',        mode: 'add',     desc: '暴击率 +4%/层（暴伤 ×2）' },
    lifesteal: { name: '汲血印', icon: 'stampLife',   ch: 'lifesteal',   mode: 'add',     desc: '攻击吸血 +0.4%/层' }
  };
  const STAMP_ORDER = ['dmg', 'cd', 'area', 'amount', 'pierce', 'crit', 'lifesteal'];

  /* ---------- 敌人（基础值；难度倍率在生成时应用） ---------- */
  const E_META = {
    rat: '灰灰鼠', sparrow: '小麻雀', snail: '蜗牛仔', goose: '大白鹅', bat: '蝙蝠仔',
    raccoon: '浣熊团子', bulldog: '斗牛犬', calico: '三花姐', pigeon: '鸽子咕咕', boss: '鼠王·铁须',
    mother: '老鼠妈妈'
  };
  const ENEMIES = {};
  for (const id in E_META) {
    const ce = CFG.enemies[id];
    if (!ce) continue;
    ENEMIES[id] = Object.assign({ id, name: E_META[id], mass: 1, kbRes: 1 }, ce);
  }

  /* ---------- 成长曲线（读取 growth 配置） ---------- */
  const G = CFG.growth;
  function mixAt(t) {
    const idx = Math.min(CFG.waves.length - 1, Math.floor(t / 30));
    return CFG.waves[idx] || CFG.waves[CFG.waves.length - 1];
  }
  function hpMult(t) {
    const m = t / 60;
    return 1 + m * G.hpPerMin + (m > G.hpLateFromMin ? (m - G.hpLateFromMin) * G.hpLatePerMin : 0);
  }
  function dmgMult(t) { return 1 + (t / 60) * G.dmgPerMin; }
  function spdMult(t) { return Math.min(G.spdMax, 1 + (t / 60) * G.spdPerMin); }
  function aliveCap(t) { return Math.min(G.capMax, G.capBase + (t / 60) * G.capPerMin); }
  function spawnEvery(t) { return Math.max(G.spawnMin, G.spawnBase - (t / 60) * G.spawnPerMin) / DIFF.spawnRate; }
  function spawnBatch(t) { return 1 + Math.floor((t / 60) / G.batchPerMin); }
  // 分段抛物线升级曲线：前期快，30/40/50 三档台阶变慢，50 级起每 10 级指数递增（加速变慢）
  function xpPowAt(lv) {
    if (lv < 30) return G.xpPow;
    if (lv < 40) return G.xpPow30;
    if (lv < 50) return G.xpPow40;
    return Math.min(G.xpPowMax, G.xpPow50 + G.xpPowStep * Math.floor((lv - 50) / 10));
  }
  function xpNeed(lv) { return Math.round(G.xpBase + (lv - 1) * G.xpPerLv + Math.pow(lv - 1, xpPowAt(lv))); }

  /* ---------- 轮次难度：dynamicStartRound 之前查固定表，之后按上一轮实测数据动态推算 ----------
     prev = { mods: 上一轮难度对象, stats: { actualTime 实际用时, bossTTK 头目等效击杀秒,
              avgHpFrac 平均血线, lvGain 本轮升级数 } }
     返回 { hp, dmg, spawn, eliteHp, bossHp, mixMin, eventMul, bossAffix, bbAffix, bbAffixIds, xpMul } */
  function roundMods(round, prev) {
    const R = CFG.rounds;
    const D = R.dynamic;
    const startAt = Math.max(2, R.dynamicStartRound || (R.fixed.length + 1));
    if (round < startAt) {
      const r = R.fixed[Math.min(round, R.fixed.length) - 1];
      return {
        round, hp: r.hp, dmg: r.dmg, spawn: r.spawn, eliteHp: r.eliteHp, bossHp: r.bossHp,
        mixMin: r.mixMin || 0, eventMul: r.eventMul || 1,
        bossAffix: r.bossAffix || 0, bbAffix: r.bbAffix || 0, bbAffixIds: r.bbAffixIds || [], xpMul: 1
      };
    }
    const pm = (prev && prev.mods) || roundMods(startAt - 1, null);
    const st = (prev && prev.stats) || { actualTime: R.parTime, bossTTK: D.parBossTTK, avgHpFrac: 0.7, lvGain: Math.round((D.lvLow + D.lvHigh) / 2) };
    // 压力轴：清场越快 → 下轮越难（钳制保证单轮增幅有上限）
    const clear = Math.min(2, Math.max(0.5, R.parTime / Math.max(120, st.actualTime)));
    const kHp = Math.min(D.hpClamp[1], Math.max(D.hpClamp[0], D.hpK * (0.75 + 0.25 * clear)));
    let kDmg = Math.min(D.dmgClamp[1], Math.max(D.dmgClamp[0], D.dmgK * (0.85 + 0.15 * clear)));
    const kDen = Math.min(D.denClamp[1], Math.max(D.denClamp[0], D.denK * (0.85 + 0.15 * clear)));
    // 生存轴：平均血线常年红 → 伤害喘息；毫发无伤 → 收紧
    if (st.avgHpFrac < D.hpLow) kDmg *= D.dmgRelief;
    else if (st.avgHpFrac > D.hpHigh) kDmg *= D.dmgTighten;
    // DPS轴：头目等效击杀用时贴着 parBossTTK 恒温（防海绵/防磨洋工）
    const kB = Math.min(D.bossKClamp[1], Math.max(D.bossKClamp[0],
      D.bossK * Math.min(1.7, Math.max(0.7, D.parBossTTK / Math.max(3, st.bossTTK)))));
    let hp, eliteHp, bossHp;
    if (round >= D.softCapRound) { // 软上限：杂兵血改加法步进，头目血缓涨，防指数爆墙
      hp = pm.hp + D.hpStep;
      const k2 = 1 + (kB - 1) * 0.5;
      eliteHp = pm.eliteHp * k2; bossHp = pm.bossHp * k2;
    } else {
      hp = pm.hp * kHp;
      eliteHp = pm.eliteHp * (1 + (kB - 1) * 0.35); // 宝箱精英无恒温，涨幅打折
      bossHp = pm.bossHp * kB;
    }
    // 经验节流：升级太快 → 下轮经验打折；太慢 → 补贴
    let xpMul = pm.xpMul || 1;
    if (st.lvGain > D.lvHigh) xpMul = Math.max(D.xpClamp[0], xpMul * 0.85);
    else if (st.lvGain < D.lvLow) xpMul = Math.min(D.xpClamp[1], xpMul * 1.15);
    // 怪种组合按轮次线性爬坡（封顶为固定表最大值）：动态提前开动也不会瞬间跳到最强怪
    let maxMix = 0;
    for (const r of R.fixed) maxMix = Math.max(maxMix, r.mixMin || 0);
    const mixMin = Math.min(maxMix, (round - 1) * 2.5);
    // 头目/鼠王词条数同样按轮次爬坡
    const bbAffix = round >= 6 ? 2 : round >= 4 ? 1 : 0;
    const bossAffix = round >= 6 ? 2 : round >= 3 ? 1 : 0;
    return {
      round, hp, dmg: pm.dmg * kDmg,
      // spawn 是「刷怪间隔倍率」，越小越密 → 密度增长用除法，并保住性能下限
      spawn: Math.max(D.spawnFloor, pm.spawn / kDen),
      eliteHp, bossHp, mixMin,
      eventMul: Math.min(3, Math.max(1, pm.eventMul * Math.sqrt(kDen))),
      bossAffix, bbAffix, bbAffixIds: [], xpMul
    };
  }

  /* ---------- 时间轴 / 掉落 / 其他 ---------- */
  const ELITES = CFG.elites;
  const EVENTS = CFG.events;
  const BOSS_T = CFG.rounds.parTime;
  const ROUNDS = Object.assign({ batchLen: CFG.rounds.parTime / Math.max(1, CFG.rounds.batchCount) }, CFG.rounds);
  const DROPS = { coin: CFG.drops.coin, milk: CFG.drops.milk, firework: CFG.drops.firework, vacuum: CFG.drops.vacuum,
    chestDrop: CFG.drops.chestDrop || 0, chestLuck: CFG.drops.chestLuck || 0 };
  const GEM_TIERS = (CFG.drops.gemTiers || []).slice().sort((a, b) => b.v - a.v);
  const SLOTS = CFG.slots;
  const LOTTERY = CFG.lottery;
  const DIFF_ = DIFF;
  const PLAYER = {
    hp: Math.round(CFG.player.hp * DIFF.playerHp), speed: CFG.player.speed, r: CFG.player.r,
    pickupR: CFG.player.pickupR, iframes: CFG.player.iframes, regenBase: CFG.player.regenBase || 0
  };

  return {
    CFG, DIFF: DIFF_,
    WEAPONS, WEAPON_ORDER, PASSIVES, PASSIVE_ORDER, ENEMIES,
    STAMP_META, STAMP_ORDER,
    mixAt, hpMult, dmgMult, spdMult, aliveCap, spawnEvery, spawnBatch,
    ELITES, EVENTS, BOSS_T, ROUNDS, roundMods, DROPS, GEM_TIERS, xpNeed, SLOTS, LOTTERY, PLAYER
  };
})();
