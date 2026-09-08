/* ============================================================
   《喵都幸存者》平衡设置文件  game_config.js  (v2)
   ------------------------------------------------------------
   这是整个游戏【唯一的规则数值表】。
   · 改法：用记事本/VSCode 打开本文件 → 改数字 → 保存 → 刷新页面即可生效。
   · 所有数组都按「等级顺序」排列：第 1 个数字 = 1 级，第 2 个 = 2 级……
     例如 claw.dmg 有 8 个数字，对应猫爪连击 1~8 级的伤害。
   · 时间单位：秒；距离/尺寸单位：像素；不要改动字段名和引号、逗号。
   · 改坏了别慌：把文件恢复成下面的内容（或用游戏内 ⚙ 面板重新导出一份）即可。
   · 游戏内右上角 ⚙「平衡设置」面板可预览配置、一键导出，还有简单/普通/困难
     三个预设档位可参照。
   ============================================================ */
window.GAME_CONFIG = {

  /* ---------- 总难度开关（改一个数 = 全局变难/变简单） ---------- */
  // 各项都是「倍率」：1 = 标准。大于 1 更难（玩家血量除外，越大越肉）。
  difficulty: {
    enemyHp: 1.0,      // 敌人生命倍率
    enemyDmg: 1.0,     // 敌人伤害倍率
    enemySpd: 1.0,     // 敌人速度倍率
    spawnRate: 1.0,    // 刷怪频率倍率（越大怪越多）
    eliteHp: 1.0,      // 精英生命倍率（再乘 enemyHp）
    bossHp: 1.0,       // 鼠王生命倍率
    playerHp: 1.0,     // 玩家生命倍率（越大越容易存活）
    xpGain: 1.0,       // 经验获取倍率（小鱼干经验越多升级越快）
    goldGain: 1.0      // 金币获取倍率
  },

  /* ---------- 玩家（大橘）基础属性 ---------- */
  player: {
    hp: 100,        // 初始生命
    speed: 172,     // 移动速度（像素/秒）
    r: 16,          // 身体碰撞半径
    pickupR: 55,    // 拾取小鱼干的基础范围（被动「磁铁鱼」在此基础上加成）
    iframes: 0.55,  // 受击后的无敌时间（秒），防止被连续咬
    regenBase: 0    // 自带每秒回血（一般保持 0，回血交给「牛奶盒」被动）
  },

  /* ---------- 成长与刷怪曲线 ---------- */
  growth: {
    // 升级所需经验公式（分段抛物线：前期快，30/40/50 三档台阶，50 级起每 10 级越来越慢）：
    //   xpNeed(等级) = xpBase + (等级-1)*xpPerLv + (等级-1)^p
    //   p = xpPow(<30) / xpPow30(30~39) / xpPow40(40~49) / min(xpPowMax, xpPow50 + xpPowStep*floor((等级-50)/10))
    xpBase: 7,      // 2 级所需经验的基础值
    xpPerLv: 8,     // 每高 1 级，线性增加的经验
    xpPow: 1.32,    // 30 级前的指数（前期手感）
    xpPow30: 1.5,   // 30~39 级指数（30 级起变慢）
    xpPow40: 1.65,  // 40~49 级指数（再上一档）
    xpPow50: 1.8,   // 50 级起指数
    xpPowStep: 0.05, // 50 级起每 10 级的指数增量（越往后越慢）
    xpPowMax: 2.4,  // 指数封顶

    hpPerMin: 0.55,       // 敌人生命：每过 1 分钟 +55%（乘法成长）
    hpLatePerMin: 0.38,   // 8 分钟后，每分钟再加 38%（后期陡峭）
    hpLateFromMin: 8,     // 陡峭成长从第几分钟开始
    dmgPerMin: 0.045,     // 敌人伤害：每分钟 +4.5%
    spdPerMin: 0.012,     // 敌人速度：每分钟 +1.2%
    spdMax: 1.28,         // 敌人速度成长上限（倍率）
    capBase: 38,          // 开局同屏敌人上限
    capPerMin: 16.5,      // 每分钟上限增加量
    capMax: 265,          // 同屏敌人上限（性能保护，勿调太大）
    spawnBase: 1.05,      // 开局刷怪间隔（秒）
    spawnPerMin: 0.055,   // 每分钟刷怪间隔缩短量（秒）
    spawnMin: 0.24,       // 刷怪间隔下限（秒）
    batchPerMin: 2.2,     // 每过多少分钟，单次刷怪数量 +1
    despawnR: 1.6,        // 敌人离屏幕多少倍屏距后传送回包围圈
    countRoundMul: 2,     // 轮间杂兵数量乘数：×此值^(轮次-1)（只作用于杂兵刷怪与同屏上限，不影响 boss/精英/事件）
    countHardMax: 480,    // 数量乘区后的同屏硬顶（性能保护；超出部分自然转化为"补怪速度"）
    countBatchPerTick: 64, // 单帧单波刷怪钳制（防帧率尖峰；刷怪拍间隔不变，场子靠下一拍继续补满）

    // 轮间指数成长（意见2）：叠在既有机制（轮内曲线×轮次难度表/动态难度）之上。
    // 作用对象：杂兵 / 精英 / 批次头目 / 鼠王（含其召唤鼠）；老鼠妈妈不受影响（数值全固定）。
    roundHpMul: 3,        // 敌人生命轮间倍率：×3^(轮次-1)
    roundDmgMul: 2,       // 敌人攻击轮间倍率：×2^(轮次-1)
    roundSpdMul: 1.1      // 敌人移速轮间倍率：×1.1^(轮次-1)
  },

  /* ---------- 70 级后的成长规则（意见1） ----------
     autoFrom 级起：升级不再弹出三选一（不再出现任何可选的武器/技能/进化/猫爪印），
       每升 1 级自动：最大生命 +hpPerLv、移动速度 +spdPerLv，若血不满则恢复满血；
     chestOnlyFrom 级起：拾取经验不再直接升级——攒下的经验只能通过开宝箱结算成等级（同样享受上面的自动成长）。 */
  postLevel: {
    autoFrom: 70,       // 该级起升级自动转化为属性成长（不再弹三选一）
    chestOnlyFrom: 80,  // 该级起升级只能通过宝箱结算
    hpPerLv: 0.02,      // 每级最大生命 +2%
    spdPerLv: 0.01      // 每级移动速度 +1%
  },

  /* ---------- 轮次系统：15 分钟一轮 · 无限轮次 ----------
     parTime ÷ batchCount = 每批标称时长；每批进行到 bossFrac 比例时，该批「头目」降临；
     头目被讨伐 → 下一批无视剩余时间立刻来袭（内容时间轴直接快进到下一批起点）；
     最后一批头目被讨伐 → 鼠王降临；讨伐鼠王 → 本轮结束（场上残怪保留，可继续收割）并立刻进入下一轮。
     第 3 轮特例：鼠王被讨伐后，压轴 Boss「老鼠妈妈」降临（见 finale.mother* 参数）。 */
  rounds: {
    parTime: 900,         // 每轮标称时长（秒），也是动态难度的「标准清场用时」
    batchCount: 4,        // 每轮批次数
    bossFrac: 0.72,       // 批次头目在批次进度达到该比例时降临
    dynamicStartRound: 2, // 该轮起进入动态难度（此前轮次查 fixed 固定表；第 1 轮固定 = 基准教学轮）

    /* dynamicStartRound 之前的轮次：固定难度表（乘在轮内成长曲线之上）
       hp 敌人生命 / dmg 敌人伤害 / spawn 刷怪间隔倍率(越小越密) / eliteHp 宝箱精英生命 /
       bossHp 鼠王与批次头目生命 / mixMin 波次表起点偏移(分钟，越往后怪种越凶) /
       eventMul 事件数量倍率 / bbAffix 头目词条数 / bbAffixIds 头目固定词条 / bossAffix 鼠王词条数 */
    batchBossTypes: ['goose', 'raccoon', 'bulldog', 'calico'], // 头目怪类型（按 批次+轮次 轮换）
    batchBossHpFracs: [0.07, 0.13, 0.25, 0.45], // 头目生命 = 鼠王基础生命 × 此值（越靠后越硬）
    batchBossScale: 1.85, // 头目体型倍率（在精英体型之上）

    /* 前 6 轮：固定难度表（乘在轮内成长曲线之上）
       hp 敌人生命 / dmg 敌人伤害 / spawn 刷怪间隔倍率(越小越密) / eliteHp 宝箱精英生命 /
       bossHp 鼠王与批次头目生命 / mixMin 波次表起点偏移(分钟，越往后怪种越凶) /
       eventMul 事件数量倍率 / bbAffix 头目词条数 / bbAffixIds 头目固定词条 / bossAffix 鼠王词条数 */
    fixed: [
      { hp: 1.0, dmg: 1.0,  spawn: 1.0,  eliteHp: 1.0, bossHp: 1.0, mixMin: 0,    eventMul: 1,   bbAffix: 0, bossAffix: 0 },
      { hp: 1.5, dmg: 1.10, spawn: 0.90, eliteHp: 1.6, bossHp: 1.7, mixMin: 2.5,  eventMul: 1,   bbAffix: 0, bossAffix: 0 },
      { hp: 2.2, dmg: 1.20, spawn: 0.83, eliteHp: 2.4, bossHp: 2.8, mixMin: 5,    eventMul: 1.5, bbAffix: 0, bossAffix: 1 },
      { hp: 3.2, dmg: 1.30, spawn: 0.76, eliteHp: 3.5, bossHp: 4.2, mixMin: 7.5,  eventMul: 1.5, bbAffix: 1, bbAffixIds: ['tough'], bossAffix: 1 },
      { hp: 4.6, dmg: 1.40, spawn: 0.70, eliteHp: 5.0, bossHp: 6.0, mixMin: 10,   eventMul: 2,   bbAffix: 1, bbAffixIds: ['swift'], bossAffix: 1 },
      { hp: 6.5, dmg: 1.52, spawn: 0.65, eliteHp: 7.0, bossHp: 8.2, mixMin: 12.5, eventMul: 2.5, bbAffix: 2, bbAffixIds: ['swift', 'split'], bossAffix: 2 }
    ],

    /* dynamicStartRound（默认第 2 轮）起：动态难度（读上一轮实测数据自动调整）。三根轴各管各的：
       · 压力轴（杂兵血/伤害/密度）看清场速度：clear = parTime ÷ 本轮实际用时
       · DPS轴（鼠王/头目血）看击杀用时是否贴 parBossTTK：秒杀→下轮追血，磨半天→回落
       · 生存轴（伤害）看本轮平均血线：血线常年红→下轮喘息
       所有系数都有钳制区间 → 任何一轮最多比上一轮难 hpClamp 上限倍，绝不突刺。
       mixMin（怪种组合）与头目词条数按轮次线性爬坡，不会因提前开动而瞬间跳怪。 */
    dynamic: {
      hpK: 1.45, hpClamp: [1.25, 1.7],           // 杂兵生命轮增量与区间（涨最快：追玩家输出）
      dmgK: 1.08, dmgClamp: [1.04, 1.13],        // 伤害轮增量（涨最慢！这是「容错次数」旋钮）
      denK: 1.12, denClamp: [1.06, 1.18],        // 密度轮增量
      spawnFloor: 0.5,                            // 刷怪间隔倍率下限（性能保护）
      bossK: 1.2, bossKClamp: [0.85, 1.7],       // 头目生命轮增量（由击杀用时恒温调节）
      parBossTTK: 15,                             // 轮Boss标准击杀用时（秒）
      hpLow: 0.35, dmgRelief: 0.9,                // 平均血线低于此 → 下轮伤害 × 此值（喘息）
      hpHigh: 0.85, dmgTighten: 1.1,              // 平均血线高于此 → 下轮伤害 × 此值（收紧）
      lvLow: 5, lvHigh: 12, xpClamp: [0.8, 1.2],  // 每轮升级数超出/不足 → 经验获取微调
      softCapRound: 12, hpStep: 1.2               // 该轮起杂兵血改加法步进，防指数爆墙
    },

    /* 头目词条池（头目/鼠王按词条数随机抽取；鼠王不会抽到「分裂」） */
    affixes: {
      swift:  { name: '迅捷', spd: 1.28 },
      tough:  { name: '铁壁', dmgTaken: 0.8, kbRes: 0.5 },
      enrage: { name: '狂暴', atFrac: 0.3, spd: 1.3, dmg: 1.35 },
      split:  { name: '分裂', n: 3, hpMul: 4 }
    }
  },

  /* ---------- 8 种武器 ----------
     maxLv   : 最高等级（升级表数组长度要和它一致）
     evo     : 进化形态代号（勿改）
     evoPassive : 进化条件——需要携带的被动 id（对应下方 passives 的 id）
     其余数组 = 逐级数值（长度 = maxLv）。statsEvo = 进化后的固定数值。 */
  weapons: {
    claw: {  // 猫爪连击：朝面向方向的爪击
      maxLv: 8, evo: 'sakura', evoPassive: 'catnip',
      dmg:   [14, 18, 18, 24, 30, 30, 30, 38],   // 每击伤害
      cd:    [1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.05, 1.05], // 冷却秒
      area:  [1, 1, 1.28, 1.28, 1.28, 1.28, 1.28, 1.55], // 爪击范围倍率
      waves: [1, 1, 1, 2, 2, 2, 2, 2],           // 连挥段数
      both:  [0, 0, 0, 0, 0, 1, 1, 1],           // 1=前后双向挥击
      kb: 130,                                    // 击退力度
      statsEvo: { dmg: 46, cd: 0.9, area: 1.8, waves: 2, both: 1, kb: 170, crit: 0.3, critMul: 2, lifesteal: 0.06 }
    },
    note: {  // 喵喵音波：追踪音符
      maxLv: 8, evo: 'ultra', evoPassive: 'alarm',
      dmg:    [10, 10, 13, 13, 17, 17, 17, 22],
      cd:     [1.1, 1.1, 0.95, 0.95, 0.95, 0.95, 0.8, 0.8],
      amount: [1, 2, 2, 3, 3, 4, 4, 5],          // 每次发射的音符数
      speed:  [330, 330, 330, 330, 370, 370, 370, 370], // 弹速
      pierce: [1, 1, 1, 1, 1, 2, 2, 2],          // 可穿透敌人数
      statsEvo: { dmg: 27, cd: 0.42, amount: 2, speed: 440, pierce: 4 }
    },
    fish: {  // 飞鱼干：直线飞刀
      maxLv: 8, evo: 'fishstorm', evoPassive: 'bell',
      dmg:    [9, 9, 12, 12, 15, 15, 18, 18],
      cd:     [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.8, 0.8],
      amount: [1, 2, 2, 3, 3, 4, 4, 6],
      speed:  [490, 490, 530, 530, 530, 530, 530, 530],
      pierce: [1, 1, 1, 1, 2, 2, 2, 3],
      spread: 0.09,                              // 多发时的扇形散布（弧度）
      statsEvo: { dmg: 25, cd: 0.68, amount: 8, speed: 580, pierce: 3, spread: 0.55 }
    },
    axe: {   // 鱼头斧：抛物线砸落
      maxLv: 8, evo: 'tunarain', evoPassive: 'yarnball',
      dmg:    [22, 28, 28, 34, 34, 34, 44, 50],
      cd:     [2.3, 2.3, 2.3, 2.3, 2.0, 2.0, 2.0, 2.0],
      amount: [1, 1, 2, 2, 2, 3, 3, 4],
      area:   [1, 1, 1, 1.3, 1.3, 1.3, 1.3, 1.6],
      statsEvo: { dmg: 68, cd: 1.9, amount: 5, area: 2.1 }
    },
    orbit: { // 毛线环绕：绕身旋转
      maxLv: 8, evo: 'planet', evoPassive: 'gloves',
      dmg:    [12, 12, 16, 16, 22, 22, 22, 30],
      cd:     [3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.2],  // 一轮总冷却
      active: [2.6, 2.6, 2.6, 2.6, 3.0, 3.0, 3.0, 3.0],  // 每轮旋转持续时间
      amount: [1, 2, 2, 3, 3, 3, 4, 4],          // 毛线球数量
      radius: [95, 95, 95, 110, 110, 110, 110, 130], // 环绕半径
      speed:  [3.2, 3.2, 3.6, 3.6, 3.6, 4.2, 4.2, 4.2],  // 旋转角速度
      hitCd: 0.5, kb: 200,                       // 同一敌人被撞间隔 / 击退
      statsEvo: { dmg: 46, cd: 5.2, active: 4.8, amount: 6, radius: 155, speed: 5.2, hitCd: 0.32, kb: 260 }
    },
    aura: {  // 猫薄荷光环：持续伤害圈
      maxLv: 8, evo: 'aurastorm', evoPassive: 'milk',
      dmg:    [4, 4, 6, 6, 9, 9, 13, 16],        // 每跳伤害
      tick:   [0.55, 0.55, 0.55, 0.5, 0.5, 0.5, 0.5, 0.5], // 每跳间隔秒
      radius: [75, 88, 88, 102, 102, 118, 118, 135],
      slow:   [0, 0, 0, 0, 0, 0, 0.15, 0.25],    // 减速比例（0~1）
      statsEvo: { dmg: 25, tick: 0.4, radius: 195, slow: 0.35 }
    },
    litter: { // 猫砂弹：炸开留伤害区
      maxLv: 8, evo: 'littermeteor', evoPassive: 'yarnball',
      dmg:    [10, 10, 14, 14, 18, 18, 23, 23],
      cd:     [2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.0, 2.0],
      amount: [1, 2, 2, 3, 3, 4, 4, 5],
      zoneR:  [55, 55, 64, 64, 64, 74, 74, 74],  // 伤害区半径
      zoneT:  [2.2, 2.2, 2.2, 2.8, 2.8, 2.8, 2.8, 3.4], // 伤害区持续秒
      statsEvo: { dmg: 32, cd: 1.7, amount: 7, zoneR: 96, zoneT: 3.6 }
    },
    zap: {   // 炸毛静电：随机落雷
      maxLv: 8, evo: 'thunderpuff', evoPassive: 'gloves',
      dmg:     [24, 24, 32, 32, 42, 42, 54, 54],
      cd:      [2.9, 2.9, 2.9, 2.7, 2.7, 2.7, 2.5, 2.5],
      strikes: [1, 2, 2, 3, 3, 4, 4, 6],         // 每次落雷道数
      chain: 0,                                  // 进化前链式跳跃数（0=不连链）
      statsEvo: { dmg: 72, cd: 1.9, strikes: 8, chain: 2 }
    }
  },

  /* ---------- 8 种被动道具 ----------
     maxLv = 最高等级；其余数组 = 逐级数值（长度 = maxLv）。 */
  passives: {
    catnip:     { maxLv: 10, might:    [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00] },  // 所有伤害 +10%/级
    alarm:      { maxLv: 8, cdMult:   [0.93, 0.86, 0.79, 0.72, 0.65, 0.58, 0.51, 0.44] },  // 冷却 -7%/级（乘法）
    yarnball:   { maxLv: 10, areaMult: [1.10, 1.20, 1.30, 1.40, 1.50, 1.60, 1.70, 1.80, 1.90, 2.00] },  // 范围 +10%/级
    bell:       { maxLv: 8, spdMult:  [1.12, 1.24, 1.36, 1.48, 1.60, 1.72, 1.84, 1.96] },  // 弹速 +12%/级
    gloves:     { maxLv: 5, amount:   [1, 2, 3, 4, 5] },                          // 投射物数量 +1/级
    milk:       { maxLv: 10, hpMult:   [1.15, 1.30, 1.45, 1.60, 1.75, 1.90, 2.05, 2.20, 2.35, 2.50],    // 生命 +15%/级
                  regen:    [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0] },                 // 回复 +0.5/秒/级
    magnetfish: { maxLv: 5, pickMult: [1.20, 1.40, 1.60, 1.80, 2.00] },  // 拾取范围 +20%/级
    koi:        { maxLv: 20, luck:     [0.15, 0.30, 0.45, 0.60, 0.75, 0.90, 1.05, 1.20, 1.35, 1.50, 1.65, 1.80, 1.95, 2.10, 2.25, 2.40, 2.55, 2.70, 2.85, 3.00],  // 幸运 +15%/级
                  crit:     [0.0025, 0.005, 0.0075, 0.01, 0.0125, 0.015, 0.0175, 0.02, 0.0225, 0.025, 0.0275, 0.03, 0.0325, 0.035, 0.0375, 0.04, 0.0425, 0.045, 0.0475, 0.05] } // 暴击率 +0.25%/级（全武器）
  },

  /* ---------- 敌人图鉴数值 ----------
     hp 生命 / spd 速度 / dmg 碰撞伤害 / r 碰撞半径 / xp 掉落经验 / mass 质量(影响击退)
     kbRes 击退抵抗(0~1，1=完全吃击退) ；zig/erratic/lunge 是特殊走位标记（勿改）
     意见6（第三版）行为特性标记（参数见下方 enemyTraits，勿改标记名）：
     slime=留下黏液减速带 / steal=会扑抢地上的鱼干 / dash=蓄力突进 / ranged=远程吐羽毛 */
  enemies: {
    rat:     { hp: 8,    spd: 62,  dmg: 8,  r: 15, xp: 1, mass: 1 },                     // 灰灰鼠
    sparrow: { hp: 6,    spd: 102, dmg: 6,  r: 13, xp: 1, mass: 1,   zig: 1 },         // 小麻雀（蛇形）
    snail:   { hp: 55,   spd: 20,  dmg: 12, r: 17, xp: 3, mass: 2.4, slime: 1 },       // 蜗牛仔（身后留黏液）
    goose:   { hp: 26,   spd: 80,  dmg: 12, r: 16, xp: 2, mass: 1.6, lunge: 1 },       // 大白鹅（会冲锋）
    bat:     { hp: 12,   spd: 118, dmg: 8,  r: 13, xp: 2, mass: 0.8, erratic: 1 },     // 蝙蝠仔（乱窜）
    raccoon: { hp: 46,   spd: 68,  dmg: 10, r: 16, xp: 3, mass: 1.8, steal: 1 },       // 浣熊团子（贪吃扑鱼干）
    bulldog: { hp: 115,  spd: 52,  dmg: 16, r: 19, xp: 5, mass: 3.2, kbRes: 0.35 },    // 斗牛犬（抗击退）
    calico:  { hp: 82,   spd: 92,  dmg: 13, r: 16, xp: 4, mass: 1.5, dash: 1 },        // 三花姐（蓄力突进）
    pigeon:  { hp: 24,   spd: 74,  dmg: 9,  r: 15, xp: 2, mass: 1.2, ranged: 1 },      // 鸽子咕咕（远程吐羽毛）
    boss:    { hp: 11000, spd: 68, dmg: 26, r: 50, xp: 0, mass: 60,                  // 鼠王·铁须
               boss: 1 },
    mother:  { hp: 5000000, spd: 100, dmg: 80, r: 66, xp: 0, mass: 200,               // 老鼠妈妈（第3轮压轴）
               boss: 1, mother: 1 }  // hp/dmg/spd 全部为固定值，运行时不吃任何难度/动态/成长/轮间倍率
  },

  /* ---------- 敌人行为特性参数（enemies 表中对应标记为 1 时启用；普通精英也会带特性，头目级不受影响） ---------- */
  enemyTraits: {
    dash:   { cd: 3.4, range: 460, windup: 0.5, mul: 3.6, time: 0.26 },  // 三花姐：预警定身后朝主角突进
    ranged: { cd: 2.6, range: 430, speed: 300, dmgMul: 0.7, life: 2.2 }, // 鸽子：中距离吐羽毛（隔墙不发射）
    steal:  { radius: 250, keep: 170, eatR: 22 },                        // 浣熊：主角离得远就先扑鱼干吞掉
    slime:  { gap: 0.55, life: 2.8, r: 15, slow: 0.55, max: 70 }         // 蜗牛：黏液带只拖慢主角（与地形减速叠乘）
  },

  /* ---------- 装备槽位 ----------
     weapon = 默认猫爪之外可选的武器数（场上共 1+4 把）；选满后不再出现新武器 */
  slots: { weapon: 4, passive: 6 },

  /* ---------- 猫爪印（玩家侧全武器词条，区别于 rounds.affixes 的头目词条） ----------
     玩家 ≥ minLevel 级后【只在宝箱中出现】（升级三选一永不出印卡）；不占槽位、无层数上限、跨轮累计。
     7 枚印全部无上限：dmg/cd/area 为乘法（每层乘一次）；crit/lifesteal 为概率/比例
     （加法累积）；amount/pierce 为整数（每层 +1）。
     引擎级硬底线（不属于词条上限）：单武器冷却最低 minCd 秒、场上投射物总量 480。 */
  stamps: {
    minLevel: 70,      // 解锁等级（此前永不掉落；且只通过宝箱发放）
    share: 0.5,        // 出现强度：印卡概率 = 常规卡概率 × share（0.5 = 现有类别的一半）
    chestAffix: 0.6,   // 宝箱无可升级项时，该奖励位出猫爪印的概率（其余金币）
    dmg: 0.12,         // 锐爪印：全武器伤害 ×(1+0.12)/层
    cd: 0.06,          // 疾风印：全武器冷却 ×(1-0.06)/层
    area: 0.10,        // 广域印：攻击范围 ×(1+0.10)/层
    amount: 1,         // 影分印：投射物数量 +1/层
    pierce: 1,         // 贯穿印：投射物穿透 +1/层
    crit: 0.04,        // 会心印：暴击率 +0.04/层（暴伤固定 ×2，超过 100% 即必暴击）
    lifesteal: 0.004,  // 汲血印：攻击吸血 +0.004/层
    amountWeight: 0.7, // 影分印在印池内的相对权重（其余为 1）
    pierceWeight: 0.8, // 贯穿印在印池内的相对权重
    minCd: 0.10        // 引擎底线：单武器冷却绝对下限（秒），与词条无关
  },

  /* ---------- 波次表：每 30 秒一格，数字 = 权重（越大刷得越多） ----------
     可用的敌人 id：rat sparrow snail goose bat raccoon bulldog calico pigeon */
  waves: [
    /* 0:00 */ { rat: 1 },
    /* 0:30 */ { rat: 1 },
    /* 1:00 */ { rat: 4, sparrow: 1 },
    /* 1:30 */ { rat: 4, sparrow: 1 },
    /* 2:00 */ { rat: 4, sparrow: 1, snail: 1 },
    /* 2:30 */ { rat: 3, sparrow: 1, snail: 1 },
    /* 3:00 */ { rat: 3, sparrow: 1, snail: 1, goose: 1 },
    /* 3:30 */ { rat: 3, sparrow: 1, goose: 2 },
    /* 4:00 */ { rat: 2, sparrow: 1, snail: 1, goose: 2 },
    /* 4:30 */ { rat: 2, sparrow: 1, goose: 2, snail: 1 },
    /* 5:00 */ { rat: 2, sparrow: 2, goose: 2, bat: 2 },
    /* 5:30 */ { rat: 2, goose: 2, bat: 3 },
    /* 6:00 */ { rat: 2, goose: 2, bat: 2, raccoon: 2 },
    /* 6:30 */ { sparrow: 2, goose: 2, bat: 2, raccoon: 2 },
    /* 7:00 */ { rat: 1, sparrow: 2, goose: 2, bat: 2, raccoon: 2 },
    /* 7:30 */ { sparrow: 2, goose: 3, bat: 2, raccoon: 2, snail: 1 },
    /* 8:00 */ { sparrow: 2, goose: 2, bat: 2, raccoon: 2, bulldog: 1 },
    /* 8:30 */ { sparrow: 2, goose: 2, bat: 2, bulldog: 2 },
    /* 9:00 */ { sparrow: 1, goose: 2, bat: 3, bulldog: 2, raccoon: 1 },
    /* 9:30 */ { goose: 2, bat: 3, bulldog: 2, raccoon: 2 },
    /*10:00 */ { goose: 2, bat: 2, bulldog: 2, raccoon: 2, calico: 2 },
    /*10:30 */ { goose: 1, bat: 2, bulldog: 2, calico: 3 },
    /*11:00 */ { bat: 2, bulldog: 2, raccoon: 2, calico: 3 },
    /*11:30 */ { bat: 3, bulldog: 3, calico: 3, snail: 1 },
    /*12:00 */ { bat: 2, bulldog: 3, raccoon: 2, calico: 3 },
    /*12:30 */ { bulldog: 3, bat: 3, calico: 3, goose: 1 },
    /*13:00 */ { bulldog: 3, bat: 3, calico: 4 },
    /*13:30 */ { bulldog: 4, bat: 3, calico: 4, raccoon: 2 },
    /*14:00 */ { bulldog: 4, bat: 4, calico: 4, goose: 2 },
    /*14:30 */ { bulldog: 5, bat: 4, calico: 5, raccoon: 2 }
  ],

  /* ---------- 精英时间轴：t = 出现秒数，type = 敌人 id，打倒掉金宝箱 ---------- */
  elites: [
    { t: 120,  type: 'rat' },
    { t: 240,  type: 'goose' },
    { t: 360,  type: 'raccoon' },
    { t: 480,  type: 'bulldog' },
    { t: 600,  type: 'bat' },
    { t: 720,  type: 'calico' },
    { t: 840,  type: 'bulldog' },
    { t: 840,  type: 'calico' }
  ],
  elite: {
    hpMul: 40,     // 精英生命 = 普通生命 × 曲线 × 40
    dmgMul: 1.8,   // 精英伤害倍率
    scale: 1.55,   // 精英体型倍率
    spdMul: 0.92,  // 精英速度倍率
    chestBase: 0.5,  // 意见7：普通精英掉宝箱的基础概率（此前 100%；批次头目属 boss 级不受影响、必掉）
    chestLuck: 0.06  // 幸运每点额外提高的宝箱概率（锦鲤满级 luck=3.0 → 50%+18%=68%，封顶 85%）；未掉宝箱改掉 1 枚金币
  },

  /* ---------- 事件演出：ring=环形包围，line=直线冲锋 ---------- */
  events: [
    { t: 270, type: 'ring', enemy: 'pigeon',  count: 34, msg: '鸽子大军包围过来了！咕咕咕——' },
    { t: 540, type: 'ring', enemy: 'bat',     count: 40, msg: '蝙蝠仔成群袭来！吱吱吱——' },
    { t: 750, type: 'line', enemy: 'bulldog', count: 12, msg: '汪汪汪！斗牛犬队从东边冲过来了！' },
    { t: 870, type: 'ring', enemy: 'goose',   count: 28, msg: '鹅鹅鹅！大白鹅钳形攻势！' }
  ],

  /* ---------- 终局（鼠王演出参数；降临时机由上方 rounds 的批次推进决定） ---------- */
  finale: {
    bossWarn: 2.8,     // 降临前的警告演出时长（秒）
    bossSummonN: 6,    // 鼠王召唤小老鼠数量
    bossSummonCd: 8,   // 召唤间隔（秒）
    bossChargeDist: 420, // 距离多近开始蓄力冲锋
    bossTeleTime: 0.65,  // 蓄力（定身）时间
    bossChargeTime: 0.85, // 冲刺时间
    bossChargeMul: 3.4,   // 冲刺速度倍率
    bossSummonHpMul: 3,   // 召唤鼠生命倍率

    /* 老鼠妈妈（第 3 轮鼠王被讨伐后降临的压轴 Boss）
       她的全部参数都是固定值：不吃难度倍率 / 动态难度 / 轮内成长，也不享受头目词条。 */
    motherWarn: 3.2,       // 鼠王被讨伐后，老鼠妈妈降临前的警告演出时长（秒）
    motherSkillCd: 10,     // 全屏斩间隔（秒）
    motherTele: 0.6,       // 全屏斩预警时长（秒，主角脚下红圈收缩）
    motherHpFrac: 0.5,     // 全屏斩扣除主角「当前」体力的比例
    motherHpFloor: 1,      // 全屏斩后主角保底剩余体力（绝不直接致死）
    motherStun: 1,         // 全屏斩命中后：眩晕时长（秒）——无法移动、武器暂停
    motherDisarm: 1,       // 眩晕结束后：缴械时长（秒）——可移动但武器继续暂停
    motherSlowT: 2,        // 眩晕结束后：减速时长（秒，与缴械前1秒重叠）
    motherSlowMul: 0.55,   // 减速倍率（等同踩到减速地面）
    motherGold: 500,       // 讨伐奖励金币（直接入账）
    motherCoinN: 30,       // 死后掉落在地上的金币堆数量（拾取时照常走金币抽奖）
    motherChestN: 5        // 死后掉落的专属宝箱：必定含有最多 N 件物品，且必定不含金币（金币位由印章/升级/牛奶兜底）
  },

  /* ---------- 特效/音效治理（中后期防过载：屏幕不常驻晃动、地面可见、无持续噪声） ---------- */
  fx: {
    shakeMax: 14,        // 震屏总上限（主震源：boss落地/精英死亡/玩家受伤/boss死亡等低频大震）
    shakeMinorCap: 4,    // 次震源上限（暴击/大体型怪死亡等高频小震，且随现有震幅阻尼递减）
    shakeDecay: 34,      // 震屏每秒衰减量
    zoneMax: 28,         // 猫砂伤害区域同屏上限（超出移除最旧的，视觉淡出同步减弱）
    particleLodAt: 450   // 粒子数超过此值时，新粒子生成量减半（LOD）
  },

  /* ---------- 掉落与经济 ---------- */
  drops: {
    coin: 0.035,       // 击杀掉金币概率（幸运可提高）
    milk: 0.012,       // 掉牛奶（回血 30）概率
    firework: 0.0045,  // 掉烟花（全屏伤害）概率
    vacuum: 0.0045,    // 掉猫薄荷吸尘器（吸走全场鱼干）概率
    milkHeal: 30,      // 牛奶回复量
    fireworkDmg: 150,  // 烟花全屏伤害
    gemMax: 330,       // 场上鱼干上限（超出自动合并，性能保护）
    gemTiers: [        // 经验分层：大于等于 v 的掉高级鱼干（从大到小排列）
      { v: 25, tier: 3 },
      { v: 5,  tier: 2 },
      { v: 1,  tier: 1 }
    ],
    chestDrop: 0.001,  // 普通怪掉宝箱的基础概率（约 1/1000 击杀）
    chestLuck: 0.0016  // 幸运每点提高的宝箱概率（锦鲤满级 luck=0.75 → 约 2.2 倍）
  },

  /* ---------- 宝箱规则 ----------
     金币不再按固定数额发放：奖励位里的金币 = 恰好 1 枚，按上方 lottery 规则折算成经验。 */
  chest: {
    radius: 40,          // 触碰开箱距离
    p5: 0.02,            // 5件奖励概率（幸运每点 +0.06）
    p3: 0.12,            // 3件奖励概率（幸运每点 +0.14）
    luckP5: 0.06,        // 幸运对 5 件的加成系数
    luckP3: 0.14         // 幸运对 3 件的加成系数
  },

  /* ---------- 金币经验规则 ----------
     拾到金币 → 均匀随机查 tiers 定档（pct 从大到小比较）：
     单枚金币经验 = pct × 当前等级升级所需经验（80% 封顶）。
     绝大部分集中在最小的 1%，极少到 30%，非常罕见到 80%。
     幸运（锦鲤）：大于最小档的各档概率 ×(1 + luck × luckBoost)，最小档吸收剩余概率。 */
  lottery: {
    tiers: [             // 档位表：pct = 经验比例，p = 概率（无需恰好加和为 1，最小档兜底）
      { pct: 0.80, p: 0.0001 },  // 非常罕见：经验 80%
      { pct: 0.50, p: 0.0009 },  // 经验 50%
      { pct: 0.30, p: 0.009 },   // 极少：经验 30%
      { pct: 0.10, p: 0.04 },    // 经验 10%
      { pct: 0.05, p: 0.10 },    // 经验 5%
      { pct: 0.01, p: 0.85 }     // 绝大部分：经验 1%
    ],
    luckBoost: 1         // 幸运对非最小档概率的放大系数
  }
};
