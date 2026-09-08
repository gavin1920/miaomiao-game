/* 喵都幸存者 - 📜更新日志面板：渲染 js/changelog.js 的数据。
   有没看过的新版本时，回到主菜单会自动弹出最新一期（localStorage 记忆已看版本） */
'use strict';
const ChangelogUI = (() => {
  const $ = id => document.getElementById(id);
  const SEEN_KEY = 'meow_log_seen';
  const TAGS = {
    new: ['新增', 'log-tag new'],
    opt: ['优化', 'log-tag opt'],
    bal: ['平衡', 'log-tag bal'],
    fix: ['修复', 'log-tag fix'],
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 顶层 const 不挂 window，直接引用 CHANGELOG；changelog.js 万一没加载也不报错
  const dataOf = () => { try { return CHANGELOG; } catch (e) { return null; } };
  const latest = () => { const c = dataOf(); return (c && c.entries && c.entries[0]) || null; };
  const hasNew = () => { const l = latest(); return !!(l && l.version && U.storage.get(SEEN_KEY, '') !== l.version); };

  function entryHtml(e, newest) {
    const items = (e.items || []).map(it => {
      const tag = TAGS[it.t] || TAGS.opt;
      return `<div class="log-item"><span class="${tag[1]}">${tag[0]}</span><span>${esc(it.text)}</span></div>`;
    }).join('');
    const ver = e.version ? `<span class="log-ver">v${esc(e.version)}</span>` : '';
    const nw = newest && hasNew() ? '<span class="log-new">NEW</span>' : '';
    return `<div class="log-entry${newest ? ' newest' : ''}">
      <div class="log-head"><span class="log-date">📅 ${esc(e.date)}</span>${ver}${nw}</div>
      ${e.title ? `<div class="log-title">${esc(e.title)}</div>` : ''}${items}</div>`;
  }

  function open(onlyLatest, silent) {
    const c = dataOf();
    const es = (c && c.entries) || [];
    $('log-list').innerHTML = es.length
      ? es.slice(0, onlyLatest ? 1 : es.length).map((e, i) => entryHtml(e, i === 0)).join('')
      : '<div class="log-item"><span>暂无更新记录～</span></div>';
    $('screen-log').classList.remove('hidden');
    // 游戏画布全局禁用了触摸手势，看日志时放开纵向滚动，手机才能划动列表
    document.body.classList.add('log-open');
    if (!silent && window.Sfx) { Sfx.ensure(); Sfx.sfx.click(); }
  }
  function close() {
    $('screen-log').classList.add('hidden');
    document.body.classList.remove('log-open');
    const l = latest(); if (l) U.storage.set(SEEN_KEY, l.version);
    updateBadge();
  }
  function updateBadge() { $('btn-log').classList[hasNew() ? 'add' : 'remove']('has-new'); }

  function init() {
    if (!$('btn-log') || !$('btn-log-close')) return;
    $('btn-log').addEventListener('click', () => open(false, false));
    $('btn-log-close').addEventListener('click', () => close());
    updateBadge();
    // 有新版本：进主菜单后自动弹出最新一期；自动化测试（?auto=）不打扰
    if (hasNew() && !/[?&]auto=/.test(location.search)) setTimeout(() => open(true, true), 800);
  }
  return { init, open, close, hasNew };
})();
ChangelogUI.init();
