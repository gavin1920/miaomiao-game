/* ============================================================
 * FM 2027 Matchday - 战术系统
 * 阵型（21 套 + 自由拖拽）/ 角色（30 个，FM 风格）/ 球队指令（12 项下拉 + 4 项开关）
 * 战术编译：把阵型+角色+指令编译为引擎参数，并生成战术建议
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 阵型库：坐标 x=本方球门0→对方球门100, y=左0→右100 ---------- */
  function s(x, y, zone, code) { return { x: x, y: y, zone: zone, code: code }; }
  var FORMATIONS = [
    { id: '4-4-2', name: '4-4-2 经典', desc: '双前锋+扁平四中场，攻守平衡的传世基石', slots: [s(4,50,'GK','GK'), s(22,12,'DF','LB'), s(15,37,'DF','CB'), s(15,63,'DF','CB'), s(22,88,'DF','RB'), s(48,12,'MF','LM'), s(44,38,'MF','CM'), s(44,62,'MF','CM'), s(48,88,'MF','RM'), s(76,38,'FW','ST'), s(76,62,'FW','ST')] },
    { id: '4-4-1-1', name: '4-4-1-1', desc: '前腰 hiding 在双中场与单前锋之间', slots: [s(4,50,'GK','GK'), s(22,12,'DF','LB'), s(15,37,'DF','CB'), s(15,63,'DF','CB'), s(22,88,'DF','RB'), s(46,12,'MF','LM'), s(42,38,'MF','CM'), s(42,62,'MF','CM'), s(46,88,'MF','RM'), s(64,50,'AM','AM'), s(82,50,'FW','ST')] },
    { id: '4-4-2D', name: '4-4-2 菱形', desc: '4-1-2-1-2 钻石中场，中路极致渗透', slots: [s(4,50,'GK','GK'), s(24,12,'DF','LB'), s(15,37,'DF','CB'), s(15,63,'DF','CB'), s(24,88,'DF','RB'), s(34,50,'DM','DM'), s(52,30,'MF','CM'), s(52,70,'MF','CM'), s(68,50,'AM','AM'), s(80,42,'FW','ST'), s(80,58,'FW','ST')] },
    { id: '4-2-3-1', name: '4-2-3-1', desc: '现代英超最主流：双后腰+攻击型三人组', slots: [s(4,50,'GK','GK'), s(22,12,'DF','LB'), s(15,37,'DF','CB'), s(15,63,'DF','CB'), s(22,88,'DF','RB'), s(38,38,'DM','DM'), s(38,62,'DM','DM'), s(62,12,'AM','LW'), s(58,50,'AM','AM'), s(62,88,'AM','RW'), s(82,50,'FW','ST')] },
    { id: '4-1-4-1', name: '4-1-4-1', desc: '单后腰扫荡+平行四人中场，结构稳固', slots: [s(4,50,'GK','GK'), s(22,12,'DF','LB'), s(15,37,'DF','CB'), s(15,63,'DF','CB'), s(22,88,'DF','RB'), s(34,50,'DM','DM'), s(56,12,'MF','LM'), s(52,38,'MF','CM'), s(52,62,'MF','CM'), s(56,88,'MF','RM'), s(80,50,'FW','ST')] },
    { id: '4-3-3P', name: '4-3-3 控球', desc: '单后腰沉底组织，双内锋联动边锋', slots: [s(4,50,'GK','GK'), s(24,12,'DF','LB'), s(15,37,'DF','CB'), s(15,63,'DF','CB'), s(24,88,'DF','RB'), s(34,50,'DM','DM'), s(52,32,'MF','CM'), s(52,68,'MF','CM'), s(74,12,'FW','LW'), s(82,50,'FW','ST'), s(74,88,'FW','RW')] },
    { id: '4-3-3F', name: '4-3-3 扁平', desc: '平排三中场，两翼齐飞直取球门', slots: [s(4,50,'GK','GK'), s(24,12,'DF','LB'), s(15,37,'DF','CB'), s(15,63,'DF','CB'), s(24,88,'DF','RB'), s(48,50,'MF','CM'), s(50,26,'MF','CM'), s(50,74,'MF','CM'), s(74,12,'FW','LW'), s(82,50,'FW','ST'), s(74,88,'FW','RW')] },
    { id: '4-2-2-2', name: '4-2-2-2', desc: '巴西式魔方：双后腰双前腰双前锋', slots: [s(4,50,'GK','GK'), s(22,12,'DF','LB'), s(15,37,'DF','CB'), s(15,63,'DF','CB'), s(22,88,'DF','RB'), s(36,38,'DM','DM'), s(36,62,'DM','DM'), s(64,30,'AM','AM'), s(64,70,'AM','AM'), s(82,42,'FW','ST'), s(82,58,'FW','ST')] },
    { id: '4-2-4', name: '4-2-4 轰炸', desc: '双后腰托底，四重火力全场压制', slots: [s(4,50,'GK','GK'), s(22,12,'DF','LB'), s(15,37,'DF','CB'), s(15,63,'DF','CB'), s(22,88,'DF','RB'), s(36,40,'DM','DM'), s(36,60,'DM','DM'), s(70,12,'FW','LW'), s(70,88,'FW','RW'), s(82,38,'FW','ST'), s(82,62,'FW','ST')] },
    { id: '4-5-1', name: '4-5-1', desc: '五人平行中场，用人数锁死中路', slots: [s(4,50,'GK','GK'), s(22,12,'DF','LB'), s(15,37,'DF','CB'), s(15,63,'DF','CB'), s(22,88,'DF','RB'), s(52,8,'MF','LM'), s(48,29,'MF','CM'), s(46,50,'MF','CM'), s(48,71,'MF','CM'), s(52,92,'MF','RM'), s(80,50,'FW','ST')] },
    { id: '4-6-0', name: '4-6-0 无锋', desc: '伪九号回撤，用传递肢解对手防线', slots: [s(4,50,'GK','GK'), s(22,12,'DF','LB'), s(15,37,'DF','CB'), s(15,63,'DF','CB'), s(22,88,'DF','RB'), s(44,20,'MF','CM'), s(40,42,'MF','CM'), s(40,58,'MF','CM'), s(44,80,'MF','CM'), s(64,35,'AM','AM'), s(64,65,'AM','AM')] },
    { id: '4-1-2-1-2', name: '4-1-2-1-2 圣诞树', desc: '窄道圣诞树，中场绞杀后直塞双前锋', slots: [s(4,50,'GK','GK'), s(22,14,'DF','LB'), s(14,38,'DF','CB'), s(14,62,'DF','CB'), s(22,86,'DF','RB'), s(30,50,'DM','DM'), s(50,32,'MF','CM'), s(50,68,'MF','CM'), s(66,50,'AM','AM'), s(82,44,'FW','ST'), s(82,56,'FW','ST')] },
    { id: '3-4-3', name: '3-4-3', desc: '孔蒂式三中卫，翼卫就是边路生命线', slots: [s(4,50,'GK','GK'), s(15,26,'DF','CB'), s(13,50,'DF','CB'), s(15,74,'DF','CB'), s(48,10,'MF','LM'), s(42,38,'MF','CM'), s(42,62,'MF','CM'), s(48,90,'MF','RM'), s(76,16,'FW','LW'), s(82,50,'FW','ST'), s(76,84,'FW','RW')] },
    { id: '3-4-2-1', name: '3-4-2-1', desc: '双前腰藏在翼卫与中锋之间的杀阵', slots: [s(4,50,'GK','GK'), s(15,26,'DF','CB'), s(13,50,'DF','CB'), s(15,74,'DF','CB'), s(48,10,'MF','LM'), s(42,38,'MF','CM'), s(42,62,'MF','CM'), s(48,90,'MF','RM'), s(66,36,'AM','AM'), s(66,64,'AM','AM'), s(84,50,'FW','ST')] },
    { id: '3-5-2', name: '3-5-2', desc: '翼卫上提成五人中场，双前锋打穿肋部', slots: [s(4,50,'GK','GK'), s(15,26,'DF','CB'), s(13,50,'DF','CB'), s(15,74,'DF','CB'), s(50,10,'MF','LM'), s(44,36,'MF','CM'), s(40,50,'MF','CM'), s(44,64,'MF','CM'), s(50,90,'MF','RM'), s(80,40,'FW','ST'), s(80,60,'FW','ST')] },
    { id: '3-2-3-2', name: '3-2-3-2', desc: '双后腰护驾，攻击五人组自由换位', slots: [s(4,50,'GK','GK'), s(15,26,'DF','CB'), s(13,50,'DF','CB'), s(15,74,'DF','CB'), s(34,38,'DM','DM'), s(34,62,'DM','DM'), s(62,12,'AM','LW'), s(58,50,'AM','AM'), s(62,88,'AM','RW'), s(82,40,'FW','ST'), s(82,60,'FW','ST')] },
    { id: '3-6-1', name: '3-6-1', desc: '六人中场车河，控到对手怀疑人生', slots: [s(4,50,'GK','GK'), s(15,26,'DF','CB'), s(13,50,'DF','CB'), s(15,74,'DF','CB'), s(48,8,'MF','LM'), s(44,28,'MF','CM'), s(42,50,'MF','CM'), s(44,72,'MF','CM'), s(48,92,'MF','RM'), s(62,35,'AM','AM'), s(64,65,'AM','AM')] },
    { id: '5-3-2', name: '5-3-2', desc: '五后卫铁桶，反击一击致命', slots: [s(4,50,'GK','GK'), s(30,10,'DF','LB'), s(15,30,'DF','CB'), s(12,50,'DF','CB'), s(15,70,'DF','CB'), s(30,90,'DF','RB'), s(46,30,'MF','CM'), s(42,50,'MF','CM'), s(46,70,'MF','CM'), s(78,42,'FW','ST'), s(78,58,'FW','ST')] },
    { id: '5-4-1', name: '5-4-1 大巴', desc: '极简防反：摆大巴，然后偷家', slots: [s(4,50,'GK','GK'), s(30,10,'DF','LB'), s(15,30,'DF','CB'), s(12,50,'DF','CB'), s(15,70,'DF','CB'), s(30,90,'DF','RB'), s(50,14,'MF','LM'), s(46,38,'MF','CM'), s(46,62,'MF','CM'), s(50,86,'MF','RM'), s(80,50,'FW','ST')] },
    { id: '2-3-2-3', name: '2-3-2-3 魔幻矩阵', desc: 'Magic Rectangle：1920年代复古未来主义', slots: [s(4,50,'GK','GK'), s(14,36,'DF','CB'), s(14,64,'DF','CB'), s(38,16,'MF','CM'), s(34,50,'MF','CM'), s(38,84,'MF','CM'), s(60,30,'AM','AM'), s(60,70,'AM','AM'), s(80,12,'FW','LW'), s(84,50,'FW','ST'), s(80,88,'FW','RW')] },
    { id: '4-3-1-2', name: '4-3-1-2 窄锋', desc: '中路走廊：三中场+前腰喂饱双枪', slots: [s(4,50,'GK','GK'), s(22,12,'DF','LB'), s(15,37,'DF','CB'), s(15,63,'DF','CB'), s(22,88,'DF','RB'), s(40,50,'MF','DM'), s(52,30,'MF','CM'), s(52,70,'MF','CM'), s(68,50,'AM','AM'), s(82,42,'FW','ST'), s(82,58,'FW','ST')] }
  ];

  /* ---------- 角色库 ---------- */
  /* eff 键（引擎读取，共识 A10 只保留活键）：att 进攻贡献 / cross 传中 / cutInside 内切射门 /
     holdUp 支点 / buildup 出球 / tackle 抢断 / overlapS 套上倾向 / box 前插禁区 /
     key 关键传球 / aerial 抢点 / run 跑身后 / finish 射术加成（死键已删，不给假药续命） */
  var ROLES = [
    { id: 'GK',  name: '门将',       zones: ['GK'], eff: {} },
    { id: 'SK',  name: '清道夫门将', zones: ['GK'], eff: { buildup: 6 }, desc: '扩大防区+短传出球' },
    { id: 'CD',  name: '中后卫',     zones: ['DF'], eff: {} },
    { id: 'BPD', name: '出球中卫',   zones: ['DF'], eff: { buildup: 8 }, desc: '长传/推进发起进攻' },
    { id: 'BCD', name: '上抢中卫',   zones: ['DF'], eff: { tackle: 5 }, desc: '贴身上抢，风险更高' },
    { id: 'LD',  name: '拖后自由人', zones: ['DF'], eff: { buildup: 6 }, desc: '清道夫式拖后补位' },
    { id: 'FB',  name: '边后卫',     zones: ['DF'], eff: {} },
    { id: 'WB',  name: '翼卫',       zones: ['DF', 'MF'], eff: { att: 4, overlapS: 2, cross: 3 }, desc: '边路一条龙' },
    { id: 'IWB', name: '内收边后卫', zones: ['DF'], eff: { buildup: 5 }, desc: '内收中场，边路留空当' },
    { id: 'CWB', name: '进攻型边后卫', zones: ['DF'], eff: { att: 6, cross: 4, overlapS: 3 } },
    { id: 'DM',  name: '后腰',       zones: ['DM', 'MF'], eff: {} },
    { id: 'BWM', name: '抢球机器',   zones: ['DM', 'MF'], eff: { tackle: 7, buildup: -3 }, desc: '绞杀型破坏者' },
    { id: 'DLP', name: '拖后组织核心', zones: ['DM', 'MF'], eff: { buildup: 8, tackle: -2 }, desc: '由守转攻的节拍器' },
    { id: 'REG', name: '节拍器',     zones: ['DM', 'MF'], eff: { buildup: 6, att: 3 }, desc: 'Regista：高位的进攻发牌员' },
    { id: 'CM',  name: '中前卫',     zones: ['MF'], eff: {} },
    { id: 'B2B', name: '全能中场',   zones: ['MF'], eff: { att: 3, box: 1, tackle: 2 }, desc: 'Box-to-Box 两个禁区都见人' },
    { id: 'MEZ', name: '内切中场',   zones: ['MF', 'AM'], eff: { att: 4, box: 2 }, desc: 'Mezzala：肋部前插' },
    { id: 'AP',  name: '中场组织核心', zones: ['MF', 'AM'], eff: { buildup: 5, att: 4 }, desc: 'Advanced Playmaker' },
    { id: 'AM',  name: '攻击型中场', zones: ['AM'], eff: { att: 4 } },
    { id: 'APA', name: '前场组织核心', zones: ['AM'], eff: { buildup: 4, att: 5, key: 1 }, desc: '最后一传的主宰者' },
    { id: 'SS',  name: '影锋',       zones: ['AM'], eff: { att: 5, box: 2 } },
    { id: 'W',   name: '边锋',       zones: ['MF', 'AM', 'FW'], eff: { att: 3, cross: 5 } },
    { id: 'IF',  name: '内切边锋',   zones: ['MF', 'AM', 'FW'], eff: { att: 4, cutInside: 1, cross: -2 } },
    { id: 'WM',  name: '防守型边锋', zones: ['MF'], eff: { tackle: 3, att: -1 }, desc: '落位成边前卫' },
    { id: 'AF',  name: '突前前锋',   zones: ['FW'], eff: { att: 4, run: 1 } },
    { id: 'P',   name: '抢点射手',   zones: ['FW'], eff: { att: 3, box: 2, finish: 1 }, desc: 'Poacher：只在禁区活着' },
    { id: 'DLF', name: '拖后前锋',   zones: ['FW'], eff: { buildup: 4, att: 2 } },
    { id: 'TM',  name: '支点中锋',   zones: ['FW'], eff: { holdUp: 1, aerial: 1 } },
    { id: 'F9',  name: '伪九号',     zones: ['FW'], eff: { buildup: 6, box: -1 } },
    { id: 'CF',  name: '全能中锋',   zones: ['FW'], eff: { att: 3, holdUp: 1, box: 1 } }
  ];
  var DUTIES = [
    { id: 'D', name: '防守' },
    { id: 'S', name: '均衡' },
    { id: 'A', name: '进攻' }
  ];

  /* ---------- 球队指令选项 ---------- */
  var INSTR = {
    attPush:   { name: '攻压心态', opts: ['全力防守', '防守', '谨慎', '均衡', '积极', '进攻', '全力进攻'] },
    defBlock:  { name: '防稳心态', opts: ['极不设防', '松动', '略收', '均衡', '较稳', '稳守', '铁桶'] },
    mentality: { name: '心态（旧版显示）', opts: ['全力防守', '防守', '谨慎', '均衡', '积极', '进攻', '全力进攻'], legacy: 1 },
    pass:      { name: '传球风格', opts: ['极短传', '短传', '混合', '直传', '长传冲吊'] },
    tempo:     { name: '比赛节奏', opts: ['慢', '中', '快', '极快'] },
    line:      { name: '防线高度', opts: ['很低', '低', '中', '高', '极高'] },
    press:     { name: '逼抢强度', opts: ['松散', '标准', '高强度', '疯狂逼抢'] },
    pressZone: { name: '逼抢区域', opts: ['本方半场', '中场线', '对方半场'] },
    attWidth:  { name: '进攻宽度', opts: ['窄', '标准', '宽'] },
    defWidth:  { name: '防守宽度', opts: ['收缩', '标准', '拉开'] },
    focus:     { name: '进攻侧重', opts: ['均衡', '左路', '中路', '右路', '两翼'], values: ['balanced', 'left', 'middle', 'right', 'flanks'] },
    overlap:   { name: '边后卫套上', opts: ['不套上', '偶尔套上', '频繁套上'] },
    tackling:  { name: '抢断强度', opts: ['温和', '标准', '凶狠'] },
    gkDist:    { name: '门将出球', opts: ['短传组织', '长传找前锋'] }
  };
  var TOGGLES = [
    { id: 'counter',   name: '快速反击', desc: '夺回球权后立刻打身后' },
    { id: 'gegen',     name: '就地反抢', desc: '丢球后立即围抢（Gegenpress）' },
    { id: 'timeWaste', name: '拖延时间', desc: '领先时控节奏（影响终盘）' },
    { id: 'offside',   name: '越位陷阱', desc: '整体前压造越位（有被打穿风险）' }
  ];

  function findFormation(id) {
    for (var i = 0; i < FORMATIONS.length; i++) if (FORMATIONS[i].id === id) return FORMATIONS[i];
    return FORMATIONS[0];
  }
  function findRole(id) {
    for (var i = 0; i < ROLES.length; i++) if (ROLES[i].id === id) return ROLES[i];
    return null;
  }
  function rolesForZone(zone) {
    return ROLES.filter(function (r) { return r.zones.indexOf(zone) >= 0; });
  }
  function defaultRoleForSlot(slot) {
    var map = { GK: 'GK', CB: 'CD', LB: 'FB', RB: 'FB', DM: 'DM', CM: 'CM', LM: 'W', RM: 'W', AM: 'AM', LW: 'W', RW: 'W', ST: 'AF' };
    return map[slot.code] || 'CM';
  }
  function defaultDutyForRole(roleId, zone) {
    if (zone === 'GK' || zone === 'DF') return 'D';
    if (zone === 'FW') return 'A';
    return 'S';
  }
  function emptyTactic(formationId) {
    var f = findFormation(formationId || '4-2-3-1');
    return {
      formation: f.id,
      slots: f.slots.map(function (sl) {
        return { x: sl.x, y: sl.y, zone: sl.zone, code: sl.code, role: defaultRoleForSlot(sl), duty: defaultDutyForRole(defaultRoleForSlot(sl), sl.zone), playerId: null };
      }),
      instr: { mentality: 3, attPush: 3, defBlock: 3, pass: 1, tempo: 1, line: 2, press: 1, pressZone: 1, attWidth: 1, defWidth: 1, focus: 'balanced', overlap: 1, tackling: 1, gkDist: 0, counter: 0, gegen: 0, timeWaste: 0, offside: 0 },
      setPiece: { corner: null, fk: null, pen: null },
      captain: null
    };
  }
  function cloneTactic(t) {
    return JSON.parse(JSON.stringify(t));
  }
  /* 从俱乐部风格生成默认战术（AI 经理 & 玩家快速起步）
     R3-1 双轴：官方 style.mentality 同时初始化攻压/防稳，玩家/AI 再分别调整 */
  function tacticFromStyle(style) {
    var t = emptyTactic(style.formation);
    var i = t.instr;
    i.mentality = style.mentality; i.attPush = style.mentality; i.defBlock = style.mentality;
    i.pass = style.pass; i.tempo = style.tempo; i.line = style.line;
    i.press = style.press; i.pressZone = style.pressZone; i.attWidth = style.attWidth; i.defWidth = style.defWidth;
    i.focus = style.focus; i.counter = style.counter; i.gegen = style.gegen; i.timeWaste = style.timeWaste;
    i.gkDist = style.gkDist; i.overlap = style.overlap; i.offside = style.offside; i.tackling = style.tackling == null ? 1 : style.tackling;
    return t;
  }

  /* ---------- 球员-位置/角色契合度 ---------- */
  var POS_GATE = { GK: ['GK'], CB: ['CB'], LB: ['LB', 'RB'], RB: ['RB', 'LB'], DM: ['DM', 'CM'], CM: ['CM', 'DM', 'AM'], AM: ['AM', 'CM'], LW: ['LW', 'RW', 'LM'], RW: ['RW', 'LW', 'RM'], LM: ['LM', 'LW', 'LB'], RM: ['RM', 'RW', 'RB'], ST: ['ST'] };
  function posMatch(player, slotCode) {
    var gates = POS_GATE[slotCode] || [];
    var plist = global.GMD_DATA.posList(player.pos);
    var best = 3;
    for (var i = 0; i < plist.length; i++) {
      var idx = gates.indexOf(plist[i]);
      if (idx >= 0) best = Math.min(best, idx);
    }
    return best; // 0 天然 1 可客串 2 勉强 3 不会踢
  }
  /* 0-1 契合系数 */
  function slotFit(player, slot, roleId) {
    if (!player) return 0;
    if (slot.zone === 'GK') return player.pos.split(',')[0] === 'GK' ? 1 : 0.2;
    var m = posMatch(player, slot.code);
    var base = m === 0 ? 1 : m === 1 ? 0.9 : m === 2 ? 0.78 : 0.6;
    var role = findRole(roleId);
    if (role) {
      /* 角色对属性的要求微调 */
      var a = player.a;
      var need = null;
      if (roleId === 'DLP' || roleId === 'AP' || roleId === 'APA' || roleId === 'REG' || roleId === 'BPD') need = a[2];
      else if (roleId === 'BWM') need = a[4];
      else if (roleId === 'W' || roleId === 'WB' || roleId === 'CWB') need = Math.max(a[0], 60);
      else if (roleId === 'P' || roleId === 'AF' || roleId === 'IF') need = a[1];
      else if (roleId === 'TM' || roleId === 'CF') need = a[5];
      else if (roleId === 'SK') need = player.gk ? player.gk.kic : 40;
      if (need != null) base *= (0.86 + 0.28 * Math.min(1, need / 85));
    }
    return Math.min(1, base);
  }

  /* ---------- 自动挑选首发 XI ---------- */
  function autoPickXI(formationId, squad) {
    var f = findFormation(formationId);
    var tactic = emptyTactic(formationId);
    var used = {};
    /* 先锁定门将 */
    f.slots.forEach(function (sl, i) {
      if (sl.zone !== 'GK') return;
      var gks = squad.filter(function (p) { return p.pos.split(',')[0] === 'GK' && !used[p.__uid]; })
        .sort(function (x, y) { return (y.gk ? y.gk.ref : 0) - (x.gk ? x.gk.ref : 0); });
      if (gks.length) { used[gks[0].__uid] = 1; tactic.slots[i].playerId = gks[0].__uid; }
    });
    /* 其余按位置逐个挑最优 */
    var order = f.slots.map(function (sl, i) { return i; }).filter(function (i) { return f.slots[i].zone !== 'GK'; })
      .sort(function (a, b) { return f.slots[a].zone === 'DF' ? -1 : f.slots[b].zone === 'DF' ? 1 : 0; });
    order.forEach(function (i) {
      var sl = f.slots[i];
      var best = null, bestScore = -1;
      squad.forEach(function (p) {
        if (used[p.__uid]) return;
        var ovr = overallOf(p);
        var sc = slotFit(p, sl, tactic.slots[i].role) * 100 + ovr * 0.6;
        if (sc > bestScore) { bestScore = sc; best = p; }
      });
      if (best) { used[best.__uid] = 1; tactic.slots[i].playerId = best.__uid; }
    });
    return tactic;
  }

  function overallOf(p) {
    if (p.pos.split(',')[0] === 'GK') {
      var g = p.gk || { ref: 50, one: 50, cmd: 50, kic: 50 };
      return Math.round(g.ref * 0.5 + g.one * 0.2 + g.cmd * 0.15 + g.kic * 0.15);
    }
    return Math.round(p.a[0] * 0.14 + p.a[1] * 0.16 + p.a[2] * 0.16 + p.a[3] * 0.16 + p.a[4] * 0.18 + p.a[5] * 0.2);
  }

  /* ---------- 战术建议/警告 ---------- */
  function tacticAdvice(tactic, squad, oppInfo) {
    var out = [];
    var xi = tactic.slots.map(function (sl) { return squad.filter(function (p) { return p.__uid === sl.playerId; })[0]; });
    var cb = [], fb = [], mid = [], st = [], w = [];
    tactic.slots.forEach(function (sl, i) {
      var p = xi[i]; if (!p) return;
      if (sl.zone === 'DF' && sl.code === 'CB') cb.push(p);
      if (sl.zone === 'DF' && (sl.code === 'LB' || sl.code === 'RB')) fb.push(p);
      if (sl.zone === 'MF' || sl.zone === 'DM') mid.push(p);
      if (sl.zone === 'FW' && sl.code === 'ST') st.push(p);
      if (sl.code === 'LW' || sl.code === 'RW' || sl.code === 'LM' || sl.code === 'RM') w.push(p);
    });
    var avg = function (arr, k) { return arr.length ? arr.reduce(function (s, p) { return s + p.a[k]; }, 0) / arr.length : 0; };
    var instr = tactic.instr;
    if (instr.line >= 3 && cb.length && avg(cb, 0) < 76) {
      out.push({ level: 'warn', text: '防线压得高（' + INSTR.line.opts[instr.line] + '），但中卫平均速度仅 ' + Math.round(avg(cb, 0)) + '，对手快马打身后会很难受。' });
    }
    if (instr.press >= 2 && avg(xi.filter(Boolean), 5) < 74) {
      out.push({ level: 'warn', text: '高强度逼抢 + 全队身体平均 ' + Math.round(avg(xi.filter(Boolean), 5)) + '，70 分钟后体能崩盘风险大。' });
    }
    if (instr.pass <= 1 && avg(mid, 2) < 78 && mid.length) {
      out.push({ level: 'info', text: '偏好短传渗透，但中场传球平均 ' + Math.round(avg(mid, 2)) + '，遇到疯抢容易出球瘫痪，可考虑混合传球。' });
    }
    if ((instr.focus === 'flanks' || instr.attWidth === 2) && st.length && st.every(function (p) { return p.a[5] < 76; })) {
      out.push({ level: 'info', text: '主打两翼传中，但中锋对抗不足（<76），传中落点容易被解围，支点型中锋或中路渗透更配。' });
    }
    if (instr.overlap === 2 && fb.length && fb.every(function (p) { return p.a[4] < 74; })) {
      out.push({ level: 'info', text: '边后卫频繁套上后，身后空当需要队友补位；当前边卫防守偏弱，被反击时边路会漏。' });
    }
    if (instr.attPush >= 5 && instr.line >= 3 && !(instr.gegen)) {
      out.push({ level: 'warn', text: '攻压拉满+极高防线却没有就地反抢保护，一旦丢球就是对手的反击大片。' });
    }
    if (instr.attPush <= 1 && !instr.counter) {
      out.push({ level: 'warn', text: '攻压极低又关闭快速反击，阵地战能力不足时全场机会会寥寥无几。' });
    }
    if (instr.defBlock <= 1 && instr.line >= 3) {
      out.push({ level: 'warn', text: '防稳松动还压上防线，后防无人掩护，对手的直塞和反击会非常致命。' });
    }
    if (instr.attPush + instr.defBlock >= 11) {
      out.push({ level: 'warn', text: '攻压与防稳双双拉满，体系会失真超载——鱼与熊掌不可兼得。' });
    }
    if (instr.offside && instr.line <= 1) {
      out.push({ level: 'info', text: '低位防线配越位陷阱收益很小，反而容易在混战中失位。' });
    }
    if (!xi.filter(Boolean).length) {
      out.push({ level: 'warn', text: '尚未安排首发球员。' });
    } else {
      var missing = xi.filter(function (p) { return !p; }).length;
      if (missing) out.push({ level: 'warn', text: '有 ' + missing + ' 个位置没有安排球员。' });
    }
    if (oppInfo && oppInfo.fastStriker && instr.line >= 3) {
      out.push({ level: 'warn', text: '对方锋线有速度爆点（' + oppInfo.fastStriker + '），极高防线=请自求多福。' });
    }
    return out;
  }

  function oppProfile(club) {
    var fast = null, fv = 0;
    club.players.forEach(function (p) {
      if (global.GMD_DATA.posList(p.pos).indexOf('ST') >= 0 && p.a[0] > fv) { fv = p.a[0]; fast = p.name; }
    });
    return { fastStriker: fv >= 86 ? fast : null };
  }

  global.GMD_TACTICS = {
    FORMATIONS: FORMATIONS,
    ROLES: ROLES,
    DUTIES: DUTIES,
    INSTR: INSTR,
    TOGGLES: TOGGLES,
    findFormation: findFormation,
    findRole: findRole,
    rolesForZone: rolesForZone,
    defaultRoleForSlot: defaultRoleForSlot,
    defaultDutyForRole: defaultDutyForRole,
    emptyTactic: emptyTactic,
    cloneTactic: cloneTactic,
    tacticFromStyle: tacticFromStyle,
    posMatch: posMatch,
    slotFit: slotFit,
    autoPickXI: autoPickXI,
    overallOf: overallOf,
    tacticAdvice: tacticAdvice,
    oppProfile: oppProfile
  };
})(typeof window !== 'undefined' ? window : globalThis);
