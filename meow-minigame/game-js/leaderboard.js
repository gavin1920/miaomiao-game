/* 喵都幸存者 - 🏆 云端排行榜服务（微信云开发双端互通）
   ─────────────────────────────────────────────────────
   同一份文件跑在两个端（引擎层零改动复用，sync 进小游戏 bundle）：
   · 微信小游戏：wx.cloud.callFunction（免域名免备案，openid 由服务端取）
   · 网页 H5：官方 @wxcloud/cloud-sdk 未登录模式（new cloud.Cloud）→ 同一组云函数
   两端都只通过云函数读写（lb_top / lb_submit），不直连数据库——权限面最小，
   服务端统一做数值校验 + 限频 + 「每只猫只留最好成绩」。
   开通步骤见 docs/排行榜云开发方案.md：开通后把环境 ID 填进下面的 LB_ENV 即可，
   未配置时本模块自动进入「未开启」降级态，主菜单/结算一切照旧，绝不影响游玩。 */
'use strict';
const LB = (() => {
  /* ========== ⚙ 配置区：开通云开发后填写（docs/排行榜云开发方案.md） ========== */
  const ENV_ID = '';            // 云开发环境 ID（控制台首页复制，形如 cla0xxxxxxxxxxxxx）
  const RESOURCE_APPID = '';    // 小游戏 AppID（网页端未登录模式要用；与 project.config.json 一致）
  const COL = 'lb_meow';        // 数据库集合名
  const FUNC_TOP = 'lb_top';
  const FUNC_SUBMIT = 'lb_submit';
  const LIMIT = 50;             // 榜单容量
  const TTL = 30 * 1000;        // 榜单缓存 30s，防止手狂点刷新烧配额

  const UID_KEY = 'meow_lb_uid', NAME_KEY = 'meow_lb_name';

  /* ---------- 平台判定 ---------- */
  const IN_WX = typeof wx !== 'undefined' && typeof wx.cloud !== 'undefined';
  const HAS_WEB_SDK = typeof cloud !== 'undefined' && typeof cloud.Cloud === 'function';

  const available = () => !!ENV_ID && (IN_WX || HAS_WEB_SDK);

  /* ---------- 本地身份（免登录：一台设备一只猫） ---------- */
  const rndB36 = n => Math.floor(Math.random() * Math.pow(36, n)).toString(36).padStart(n, '0');
  const uid = (() => {
    let v = '';
    try { v = localStorage.getItem(UID_KEY); } catch (e) { /* 存储不可用就每次随机 */ }
    if (!v || !/^[a-z0-9-]{6,40}$/i.test(v)) {
      v = 'u-' + Date.now().toString(36) + '-' + rndB36(6);
      try { localStorage.setItem(UID_KEY, v); } catch (e) { /* noop */ }
    }
    return v;
  })();

  const CAT_A = ['大橘', '三花', '奶牛', '白团', '煤球', '虎斑', '奶黄', '芝麻', '汤圆', '狸奴'];
  const CAT_B = ['夜巡', '守卫', '闪电', '锦鲤', '软软', '爱吃鱼', '不睡觉', '爱晒太阳', '踏月', '追风'];
  function genName() {
    const p = U.pick, n = U.randInt;
    return p(CAT_B) + '的' + p(CAT_A) + '#' + n(100, 999);
  }
  // 昵称消毒：去控制字符/尖括号引号，限 12 字符
  function cleanName(n) {
    const s = String(n == null ? '' : n).replace(/[\u0000-\u001f<>\"'`\\/]/g, '').trim();
    return s.slice(0, 12);
  }
  let name = '';
  try { name = cleanName(localStorage.getItem(NAME_KEY)); } catch (e) { /* noop */ }
  if (!name) { name = genName(); saveName(name); }
  function saveName(n) { try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* noop */ } }
  const getName = () => name;
  function setName(n) {
    const c = cleanName(n);
    if (c) { name = c; saveName(c); }
    return name;
  }
  function cycleName() { name = genName(); saveName(name); return name; }

  /* ---------- 云端通道（懒初始化，双端各一条） ---------- */
  let wxInited = false;
  let webCloud = null, webIniting = null;
  function callFunc(fname, data) {
    try {
      if (IN_WX) {
        if (!wxInited) { wx.cloud.init({ env: ENV_ID }); wxInited = true; }
        return wx.cloud.callFunction({ name: fname, data }).then(r => r && r.result);
      }
      // 网页端：官方 Web SDK 未登录模式（需资源方小游戏开「环境共享」并部署 cloudbase_auth）
      if (!webCloud) {
        webCloud = new cloud.Cloud({
          identityless: true,
          resourceAppid: RESOURCE_APPID,
          resourceEnv: ENV_ID
        });
        webIniting = webCloud.init();
      }
      return webIniting.then(() => new Promise((resolve, reject) => {
        webCloud.callFunction({
          name: fname, data,
          success: r => resolve(r && r.result),
          fail: err => reject(err)
        });
      })).catch(e => { webCloud = null; webIniting = null; throw e; }); // 失败后允许下次重试
    } catch (e) {
      return Promise.reject(e); // init 同步抛错（环境无效等）也走统一异步失败路径
    }
  }

  /* ---------- 快照（同步可读，面板每帧直接画） ----------
     state: off=未配置 | loading | ok | fail ；me 始终回退本地最佳 */
  const snap = { state: available() ? 'loading' : 'off', rows: [], err: '' };
  let lastFetch = 0, fetching = null;
  function meLocal() {
    const b = U.storage.get('meow_best', null);
    return {
      name, rank: U.storage.get('meow_lb_rank', 0),
      round: (b && b.rounds) || 0, time: (b && b.time) || 0
    };
  }
  function snapshot() { return { snap, me: meLocal() }; }

  function refresh(force) {
    if (!available()) { snap.state = 'off'; return Promise.resolve(snap); }
    const now = Date.now();
    if (!force && now - lastFetch < TTL) return Promise.resolve(snap);
    if (fetching) return fetching;
    snap.state = 'loading';
    fetching = callFunc(FUNC_TOP, { limit: LIMIT })
      .then(r => {
        lastFetch = Date.now();
        if (r && r.ok && Array.isArray(r.rows)) { snap.rows = r.rows; snap.state = 'ok'; }
        else { snap.state = 'fail'; snap.err = (r && r.reason) || 'bad-response'; }
      })
      .catch(e => { snap.state = 'fail'; snap.err = String((e && e.errMsg) || e && e.message || e); })
      .then(() => { fetching = null; return snap; });
    return fetching;
  }

  /* ---------- 提交成绩（结算时调用；失败静默，绝不影响游戏） ----------
     返回 { ok, rank } 或 null（未配置/失败）。服务端只保留该身份的最好成绩。 */
  function submitRun(d) {
    if (!available()) return Promise.resolve(null);
    const payload = {
      uid,
      name,
      round: Math.round(d.round || 0),
      time: Math.round(d.time || 0),
      kills: Math.round(d.kills || 0),
      lv: Math.round(d.lv || 1),
      gold: Math.round(d.gold || 0),
      win: !!d.win,
      mother: !!d.mother,
      map: String(d.map || '').slice(0, 24),
      sp: Math.round(d.sp || 1),
      ver: 1
    };
    return callFunc(FUNC_SUBMIT, payload)
      .then(r => {
        if (r && r.ok && r.rank) {
          try { U.storage.set('meow_lb_rank', r.rank); } catch (e) { /* noop */ }
        }
        return r || null;
      })
      .catch(() => null);
  }

  /* ---------- 调试用（?dev=1 面板可看状态） ---------- */
  const debug = () => ({ env: ENV_ID || '(未配置)', platform: IN_WX ? 'wx' : 'web', hasWebSdk: HAS_WEB_SDK, snap });

  return { available, snapshot, refresh, submitRun, getName, setName, cycleName, debug, LIMIT };
})();
