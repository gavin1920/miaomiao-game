/* 喵都幸存者 - ⚙平衡设置面板：预览 game_config.js / 三档预设参照 / 导出配置
   （预览优先读取真实的 js/game_config.js 文本；本地双击打开(file://)时
   浏览器禁止读文件，则自动改为从当前生效数值生成等价的配置文本） */
'use strict';
const CfgPanel = (() => {
  const PRESETS = {
    easy:   { label: '🍼 简单', vals: { enemyHp: 0.7, enemyDmg: 0.7, enemySpd: 0.92, spawnRate: 0.8, eliteHp: 0.8, bossHp: 0.85, playerHp: 1.3, xpGain: 1.2, goldGain: 1.2 } },
    normal: { label: '🍳 普通', vals: { enemyHp: 1, enemyDmg: 1, enemySpd: 1, spawnRate: 1, eliteHp: 1, bossHp: 1, playerHp: 1, xpGain: 1, goldGain: 1 } },
    hard:   { label: '🌶️ 困难', vals: { enemyHp: 1.4, enemyDmg: 1.35, enemySpd: 1.08, spawnRate: 1.3, eliteHp: 1.25, bossHp: 1.2, playerHp: 0.85, xpGain: 0.9, goldGain: 1 } }
  };

  /* ---------- 生成文件文本用的中文说明 ---------- */
  const SEC_DOC = {
    difficulty: '总难度开关（改一个数 = 全局变难/变简单，倍率 1 = 标准）',
    player: '玩家（大橘）基础属性',
    growth: '成长与刷怪曲线（roundHpMul/roundDmgMul/roundSpdMul = 轮间指数成长：×3^(轮-1)血 ×2^(轮-1)攻 ×1.1^(轮-1)速）',
    postLevel: '70 级后的成长规则（autoFrom 级起升级自动+2%生命/+1%移速并回满；chestOnlyFrom 级起只能靠宝箱升级）',
    rounds: '轮次系统：15分钟一轮·无限轮次（dynamicStartRound=动态难度起始轮，fixed=之前的固定难度表，dynamic=动态难度，affixes=头目词条池）',
    weapons: '8 种武器（数组 = Lv1→Lv8 逐级数值；statsEvo = 进化后数值）',
    passives: '8 种被动道具（数组 = 逐级数值；幸运锦鲤 crit = 每级 +0.25% 全武器暴击）',
    stamps: '猫爪印：全武器被动词条（70 级后只在宝箱中出现、可无限叠加、跨轮累计；区别于 rounds.affixes 头目词条）',
    enemies: '敌人图鉴数值（hp生命 spd速度 dmg伤害 r半径 xp经验 mass质量）',
    slots: '装备槽位',
    waves: '波次表：每 30 秒一格，数字 = 权重（每 30 秒换一行生效）',
    elites: '精英时间轴（打倒掉金宝箱）',
    elite: '精英属性倍率',
    events: '事件演出（ring=环形包围，line=直线冲锋）',
    finale: '终局：鼠王降临、第3轮压轴「老鼠妈妈」与胜利条件',
    fx: '特效/音效治理（震屏上限、猫砂区域上限、粒子LOD）',
    drops: '掉落与经济',
    chest: '宝箱规则',
    lottery: '金币经验规则：单枚金币 = 档位% × 当前等级升级所需经验（80% 封顶）'
  };
  const STAT_DOC = {
    dmg: '伤害', cd: '冷却(秒)', area: '范围倍率', amount: '数量', waves: '连挥段数', speed: '弹速',
    pierce: '穿透数', radius: '半径', tick: '跳伤间隔(秒)', slow: '减速(0~1)', zoneR: '伤害区半径',
    zoneT: '伤害区持续(秒)', active: '每轮旋转持续(秒)', hitCd: '同一敌人被撞间隔(秒)', kb: '击退力度',
    spread: '扇形散布(弧度)', strikes: '落雷道数', chain: '链式跳跃数', maxLv: '最高等级',
    evo: '进化形态代号(勿改)', evoPassive: '进化所需被动 id', statsEvo: '进化后固定数值',
    might: '伤害加成', cdMult: '冷却倍率', areaMult: '范围倍率', spdMult: '弹速倍率',
    amount: '投射物+N', hpMult: '生命倍率', regen: '每秒回复', pickMult: '拾取范围倍率', luck: '幸运加成'
  };
  const ENEMY_KEY_DOC = { hp: '生命', spd: '速度', dmg: '伤害', r: '半径', xp: '经验', mass: '质量(击退)', kbRes: '击退抵抗', zig: '蛇形走位', lunge: '冲锋', erratic: '乱窜', boss: 'Boss标记' };
  const E_NAME = { rat: '灰灰鼠', sparrow: '小麻雀', snail: '蜗牛仔', goose: '大白鹅', bat: '蝙蝠仔', raccoon: '浣熊团子', bulldog: '斗牛犬', calico: '三花姐', pigeon: '鸽子咕咕', boss: '鼠王·铁须', mother: '老鼠妈妈' };
  const KEY_DOC = {
    hp: '初始生命', speed: '移动速度', r: '碰撞半径', pickupR: '拾取范围', iframes: '受击无敌(秒)', regenBase: '自带回血/秒',
    enemyHp: '敌人生命倍率', enemyDmg: '敌人伤害倍率', enemySpd: '敌人速度倍率', spawnRate: '刷怪频率倍率',
    eliteHp: '精英生命倍率', bossHp: '鼠王生命倍率', playerHp: '玩家生命倍率', xpGain: '经验获取倍率', goldGain: '金币获取倍率',
    xpBase: '升级经验基础值', xpPerLv: '每级线性经验', xpPow: '30级前指数',
    xpPow30: '30~39级指数', xpPow40: '40~49级指数', xpPow50: '50级起指数',
    xpPowStep: '50级起每10级指数增量', xpPowMax: '指数封顶',
    hpPerMin: '敌人生命每分钟+比值', hpLatePerMin: '后期每分钟再加', hpLateFromMin: '陡峭成长起始(分)',
    dmgPerMin: '敌人伤害每分钟+比值', spdPerMin: '敌人速度每分钟+比值', spdMax: '敌人速度上限倍率',
    capBase: '开局同屏上限', capPerMin: '上限每分钟+N', capMax: '同屏上限(性能保护)',
    spawnBase: '开局刷怪间隔(秒)', spawnPerMin: '间隔每分钟缩短(秒)', spawnMin: '刷怪间隔下限(秒)',
    batchPerMin: '每过N分钟单次刷怪+1', despawnR: '离屏多少倍屏距回收',
    weapon: '猫爪外可选武器数（场上共1+此值把）', passive: '被动槽',
    hpMul: '精英生命=普通×曲线×此值', dmgMul: '精英伤害倍率', scale: '精英体型倍率', spdMul: '精英速度倍率',
    bossTime: '鼠王降临秒数=总时长', bossWarn: '警告演出时长(秒)', bossSummonN: '召唤小鼠数量', bossSummonCd: '召唤间隔(秒)',
    bossChargeDist: '蓄力冲锋距离', bossTeleTime: '蓄力定身(秒)', bossChargeTime: '冲刺时长(秒)',
    bossChargeMul: '冲刺速度倍率', bossSummonHpMul: '召唤鼠生命倍率',
    motherWarn: '老鼠妈妈降临前警告(秒)', motherSkillCd: '全屏斩间隔(秒)', motherTele: '全屏斩预警(秒)',
    motherHpFrac: '全屏斩扣当前体力比例', motherHpFloor: '全屏斩保底剩余体力', motherSlowT: '全屏斩减速时长(秒)',
    motherSlowMul: '全屏斩减速倍率', motherGold: '讨伐老鼠妈妈奖励金币',
    motherStun: '全屏斩眩晕时长(秒)', motherDisarm: '缴械时长(秒)',
    motherCoinN: '老鼠妈妈死后掉落金币堆数', motherChestN: '专属宝箱奖励件数(必出且不含金币)',
    autoFrom: '该级起升级自动+属性(不弹三选一)', chestOnlyFrom: '该级起升级只能通过宝箱',
    hpPerLv: '每级最大生命+比值', spdPerLv: '每级移速+比值',
    roundHpMul: '轮间敌人生命指数底数', roundDmgMul: '轮间敌人攻击指数底数', roundSpdMul: '轮间敌人移速指数底数',
    shakeMax: '震屏总上限', shakeMinorCap: '高频次震上限', shakeDecay: '震屏每秒衰减',
    zoneMax: '猫砂区域同屏上限', particleLodAt: '粒子LOD阈值',
    countRoundMul: '轮间杂兵数量乘数(×此值^(轮次-1))', countHardMax: '数量乘区后的同屏硬顶',
    countBatchPerTick: '单帧单波刷怪钳制',
    tiers: '经验档位表(pct=比例,p=概率,从大到小)', pct: '经验比例', p: '概率', luckBoost: '幸运放大系数',
    coin: '掉金币概率', milk: '掉牛奶概率', firework: '掉烟花概率', vacuum: '掉吸尘器概率',
    milkHeal: '牛奶回复量', fireworkDmg: '烟花全屏伤害', gemMax: '场上鱼干上限',
    chestDrop: '普通怪掉宝箱基础概率', chestLuck: '幸运每点提高的宝箱概率',
    gemTiers: '经验分层(从大到小)', v: '经验阈值', tier: '鱼干档位',
    radius: '触碰开箱距离',
    p5: '5件奖励概率', p3: '3件奖励概率', luckP5: '幸运→5件系数', luckP3: '幸运→3件系数',
    t: '触发秒数', type: '敌人/类型', enemy: '敌人id', count: '数量', msg: '横幅文案',
    parTime: '每轮标称时长(秒)·动态难度基准', batchCount: '每轮批次数', bossFrac: '头目降临的批次进度比例',
    batchBossTypes: '头目怪类型轮换表', batchBossHpFracs: '头目生命=鼠王基础×此值', batchBossScale: '头目体型倍率'
  };
  const doc = path => KEY_DOC[path] || STAT_DOC[path] || '';

  /* ---------- 序列化：把当前生效配置还原成 game_config.js 文本 ---------- */
  const esc = v => JSON.stringify(v);
  function inlineObj(o) {
    return '{ ' + Object.keys(o).map(k => k + ': ' + (typeof o[k] === 'string' ? esc(o[k]) : o[k])).join(', ') + ' }';
  }
  // 值统一走 JSON（数组/嵌套对象也安全），键名保持不带引号
  function jsonLine(o) {
    return '{ ' + Object.keys(o).map(k => k + ': ' + JSON.stringify(o[k])).join(', ') + ' }';
  }
  function comment(c) { return c ? ' // ' + c : ''; }
  function serialize(cfg, presetKey) {
    const L = [];
    const push = s => L.push(s);
    push('/* ============================================================');
    push('   《喵都幸存者》平衡设置文件  game_config.js');
    if (presetKey && PRESETS[presetKey]) push('   ★ 由游戏内 ⚙ 面板导出的「' + PRESETS[presetKey].label + '」预设档');
    else push('   ★ 由游戏内 ⚙ 面板导出的当前生效配置');
    push('   改法：改数字 → 保存 → 放回游戏目录 js 文件夹覆盖旧文件 → 刷新页面生效');
    push('   ============================================================ */');
    push('window.GAME_CONFIG = {');
    // 难度
    push('  /* ---------- ' + SEC_DOC.difficulty + ' ---------- */');
    push('  difficulty: {');
    const d = cfg.difficulty;
    for (const k of ['enemyHp', 'enemyDmg', 'enemySpd', 'spawnRate', 'eliteHp', 'bossHp', 'playerHp', 'xpGain', 'goldGain']) {
      if (d[k] === undefined) continue;
      push('    ' + k + ': ' + d[k] + ',' + comment(doc(k)));
    }
    push('  },');
    // 玩家 / 成长 / 70级后规则 / 槽位
    for (const [sec, keys] of [
      ['player', ['hp', 'speed', 'r', 'pickupR', 'iframes', 'regenBase']],
      ['growth', ['xpBase', 'xpPerLv', 'xpPow', 'xpPow30', 'xpPow40', 'xpPow50', 'xpPowStep', 'xpPowMax', 'hpPerMin', 'hpLatePerMin', 'hpLateFromMin', 'dmgPerMin', 'spdPerMin', 'spdMax', 'capBase', 'capPerMin', 'capMax', 'spawnBase', 'spawnPerMin', 'spawnMin', 'batchPerMin', 'despawnR', 'countRoundMul', 'countHardMax', 'countBatchPerTick', 'roundHpMul', 'roundDmgMul', 'roundSpdMul']],
      ['postLevel', ['autoFrom', 'chestOnlyFrom', 'hpPerLv', 'spdPerLv']]
    ]) {
      push('  /* ---------- ' + SEC_DOC[sec] + ' ---------- */');
      push('  ' + sec + ': {');
      for (const k of keys) if (cfg[sec][k] !== undefined) push('    ' + k + ': ' + cfg[sec][k] + ',' + comment(doc(k)));
      push('  },');
    }
    // 轮次系统
    if (cfg.rounds) {
      const r = cfg.rounds;
      push('  /* ---------- ' + SEC_DOC.rounds + ' ---------- */');
      push('  rounds: {');
      push('    parTime: ' + r.parTime + ',' + comment(doc('parTime')));
      push('    batchCount: ' + r.batchCount + ',' + comment(doc('batchCount')));
      push('    bossFrac: ' + r.bossFrac + ',' + comment(doc('bossFrac')));
      if (r.dynamicStartRound !== undefined) push('    dynamicStartRound: ' + r.dynamicStartRound + ', // 动态难度起始轮（此前查 fixed 固定表）');
      push('    batchBossTypes: ' + JSON.stringify(r.batchBossTypes) + ',');
      push('    batchBossHpFracs: ' + JSON.stringify(r.batchBossHpFracs) + ',');
      push('    batchBossScale: ' + r.batchBossScale + ',');
      push('    fixed: [');
      for (const row of r.fixed) push('      ' + jsonLine(row) + ',');
      push('    ],');
      push('    dynamic: {');
      for (const k in r.dynamic) push('      ' + k + ': ' + JSON.stringify(r.dynamic[k]) + ',');
      push('    },');
      push('    affixes: {');
      for (const k in r.affixes) push('      ' + k + ': ' + JSON.stringify(r.affixes[k]) + ',');
      push('    }');
      push('  },');
    }
    // 武器
    push('  /* ---------- ' + SEC_DOC.weapons + ' ---------- */');
    push('  weapons: {');
    for (const id of ['claw', 'note', 'fish', 'axe', 'orbit', 'aura', 'litter', 'zap']) {
      const w = cfg.weapons[id];
      if (!w) continue;
      push('    ' + id + ': {');
      push('      maxLv: ' + w.maxLv + ', evo: ' + esc(w.evo) + ', evoPassive: ' + esc(w.evoPassive) + ',');
      for (const k in w) {
        if (['maxLv', 'evo', 'evoPassive', 'statsEvo'].includes(k)) continue;
        const v = w[k];
        if (Array.isArray(v)) push('      ' + k + ': [' + v.join(', ') + '],' + comment(STAT_DOC[k] + '（Lv1→' + w.maxLv + '）'));
        else push('      ' + k + ': ' + v + ',' + comment(STAT_DOC[k]));
      }
      push('      statsEvo: ' + inlineObj(w.statsEvo || {}));
      push('    },');
    }
    push('  },');
    // 被动
    push('  /* ---------- ' + SEC_DOC.passives + ' ---------- */');
    push('  passives: {');
    for (const id of ['catnip', 'alarm', 'yarnball', 'bell', 'gloves', 'milk', 'magnetfish', 'koi']) {
      const p = cfg.passives[id];
      if (!p) continue;
      const parts = ['maxLv: ' + p.maxLv];
      for (const k in p) if (k !== 'maxLv' && Array.isArray(p[k])) parts.push(k + ': [' + p[k].join(', ') + ']');
      push('    ' + id + ': { ' + parts.join(', ') + ' },');
    }
    push('  },');
    // 猫爪印（字段名与武器数值有重合，注释走本段私有表）
    if (cfg.stamps) {
      const SD = {
        minLevel: '解锁等级', share: '印卡概率=常规卡概率×此值', chestAffix: '宝箱无可升级时出印概率',
        dmg: '锐爪印：伤害×(1+值)/层', cd: '疾风印：冷却×(1-值)/层', area: '广域印：范围×(1+值)/层',
        amount: '影分印：投射物+N/层', pierce: '贯穿印：穿透+N/层', crit: '会心印：暴击率+值/层',
        lifesteal: '汲血印：吸血+值/层', amountWeight: '影分印权重', pierceWeight: '贯穿印权重',
        minCd: '引擎底线：单武器冷却绝对下限(秒)，与词条无关'
      };
      push('  /* ---------- ' + SEC_DOC.stamps + ' ---------- */');
      push('  stamps: {');
      for (const k in cfg.stamps) push('    ' + k + ': ' + cfg.stamps[k] + ',' + comment(SD[k] || ''));
      push('  },');
    }
    // 敌人
    push('  /* ---------- ' + SEC_DOC.enemies + ' ---------- */');
    push('  enemies: {');
    for (const id in cfg.enemies) {
      const e = cfg.enemies[id];
      push('    ' + id + ': ' + inlineObj(e) + ',' + comment(E_NAME[id] || ''));
    }
    push('  },');
    // 槽位
    push('  /* ---------- ' + SEC_DOC.slots + ' ---------- */');
    push('  slots: { weapon: ' + cfg.slots.weapon + ', passive: ' + cfg.slots.passive + ' },');
    // 波次
    push('  /* ---------- ' + SEC_DOC.waves + ' ---------- */');
    push('  waves: [');
    cfg.waves.forEach((w, i) => push('    ' + inlineObj(w) + ', // ' + U.fmtTime(i * 30) + ' 起'));
    push('  ],');
    // 精英
    push('  /* ---------- ' + SEC_DOC.elites + ' ---------- */');
    push('  elites: [');
    for (const el of cfg.elites) push('    ' + inlineObj(el) + ',');
    push('  ],');
    push('  /* ---------- ' + SEC_DOC.elite + ' ---------- */');
    push('  elite: ' + inlineObj(cfg.elite) + ',');
    // 事件
    push('  /* ---------- ' + SEC_DOC.events + ' ---------- */');
    push('  events: [');
    for (const ev of cfg.events) push('    { t: ' + ev.t + ', type: ' + esc(ev.type) + ', enemy: ' + esc(ev.enemy) + ', count: ' + ev.count + ', msg: ' + esc(ev.msg) + ' },');
    push('  ],');
    // 终局
    push('  /* ---------- ' + SEC_DOC.finale + ' ---------- */');
    push('  finale: {');
    for (const k in cfg.finale) push('    ' + k + ': ' + cfg.finale[k] + ',' + comment(doc(k)));
    push('  },');
    // 特效/音效治理
    if (cfg.fx) {
      push('  /* ---------- ' + SEC_DOC.fx + ' ---------- */');
      push('  fx: {');
      for (const k in cfg.fx) push('    ' + k + ': ' + cfg.fx[k] + ',' + comment(doc(k)));
      push('  },');
    }
    // 掉落
    push('  /* ---------- ' + SEC_DOC.drops + ' ---------- */');
    push('  drops: {');
    for (const k of ['coin', 'milk', 'firework', 'vacuum', 'milkHeal', 'fireworkDmg', 'gemMax', 'chestDrop', 'chestLuck']) {
      if (cfg.drops[k] !== undefined) push('    ' + k + ': ' + cfg.drops[k] + ',' + comment(doc(k)));
    }
    push('    gemTiers: [');
    for (const g of cfg.drops.gemTiers) push('      { v: ' + g.v + ', tier: ' + g.tier + ' },');
    push('    ]');
    push('  },');
    // 宝箱
    push('  /* ---------- ' + SEC_DOC.chest + ' ---------- */');
    push('  chest: {');
    for (const k in cfg.chest) push('    ' + k + ': ' + cfg.chest[k] + ',' + comment(doc(k)));
    push('  },');
    // 金币经验规则
    if (cfg.lottery) {
      push('  /* ---------- ' + SEC_DOC.lottery + ' ---------- */');
      push('  lottery: {');
      push('    tiers: [');
      for (const t of cfg.lottery.tiers || []) push('      { pct: ' + t.pct + ', p: ' + t.p + ' },' + comment(t.pct >= 1 ? '' : '经验 ' + Math.round(t.pct * 100) + '%'));
      push('    ],');
      if (cfg.lottery.luckBoost !== undefined) push('    luckBoost: ' + cfg.lottery.luckBoost + ',' + comment(doc('luckBoost')));
      push('  }');
    }
    push('};');
    return L.join('\n');
  }

  /* ---------- 面板 UI ---------- */
  let ta = null, srcNote = null, panel = null, onClose = null;

  function snapshot(cfg, presetKey) {
    const c = JSON.parse(JSON.stringify(cfg));
    if (presetKey && PRESETS[presetKey]) Object.assign(c.difficulty, PRESETS[presetKey].vals);
    return serialize(c, presetKey);
  }
  function showText(txt, note) {
    ta.value = txt;
    srcNote.textContent = note;
  }
  function setPresetBtn(key) { // key=null 表示「当前配置」
    const box = document.getElementById('cfg-presets');
    if (!box) return;
    for (const c of box.children) {
      const k = c.getAttribute && c.getAttribute('data-preset');
      if (!k) continue;
      const on = key ? k === key : k === 'current';
      c.classList[on ? 'add' : 'remove']('on');
    }
  }
  async function refresh(presetKey) {
    setPresetBtn(presetKey || null);
    if (presetKey) { showText(snapshot(DATA.CFG, presetKey), '预览内容：' + PRESETS[presetKey].label + ' 预设档（点「导出」保存为文件）'); return; }
    // 优先读取真实文件（http/https 下可用）；file:// 下退化为当前数值快照
    try {
      if (typeof fetch === 'function') {
        const res = await fetch('js/game_config.js', { cache: 'no-store' });
        if (res.ok) {
          const txt = await res.text();
          if (txt.includes('GAME_CONFIG')) { showText(txt, '预览内容：js/game_config.js 文件原文（只读）'); return; }
        }
      }
    } catch (e) { /* file:// 情况，走快照 */ }
    showText(snapshot(DATA.CFG, null), '当前为本地直接打开(file://)，显示的是「当前生效数值」快照（内容等价于 game_config.js）');
  }
  function exportFile() {
    const blob = new Blob([ta.value], { type: 'text/javascript;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'game_config.js';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 300);
    if (srcNote) srcNote.textContent = '✅ 已导出 game_config.js（在浏览器下载目录）— 移动到游戏目录 js 文件夹覆盖旧文件，刷新页面生效！';
  }
  function open() {
    show(panel, true);
    refresh(null);
  }
  function close() { show(panel, false); }

  function init(opts) {
    panel = document.getElementById('screen-cfg');
    ta = document.getElementById('cfg-text');
    srcNote = document.getElementById('cfg-src');
    onClose = opts && opts.onClose;
    document.getElementById('btn-cfg-export').addEventListener('click', exportFile);
    document.getElementById('btn-cfg-close').addEventListener('click', () => { Sfx.sfx.click(); close(); if (onClose) onClose(); });
    const presetBox = document.getElementById('cfg-presets');
    presetBox.addEventListener('click', e => {
      const b = e.target && e.target.getAttribute ? e.target.getAttribute('data-preset') : null;
      if (!b) return;
      Sfx.sfx.click();
      refresh(b === 'current' ? null : b);
    });
  }
  const show = (el, on) => el && el.classList && el.classList[on ? 'remove' : 'add']('hidden');

  return { init, open, close, snapshot, PRESETS };
})();
