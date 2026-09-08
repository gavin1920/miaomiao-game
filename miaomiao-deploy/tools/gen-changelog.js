/* 📜 更新日志生成器：发新版本后运行，自动往 js/changelog.js 追加一条新日志
   用法：
     node tools/gen-changelog.js
         把 js/changelog.js 记录的 lastCommit 之后的 git 提交，按类型归到
         新增/优化/平衡/修复，整理成一条以今天为日期的新条目（插到最前）。
     node tools/gen-changelog.js --title "手机、平板适配！" "修复：手机上画面大小异常" "优化：横竖屏切换更顺滑"
         手写条目（措辞更可控，推荐正式发版用）；省略类型前缀默认算「优化」。
   行为：版本号自动读取 index.html 的 ?v= 缓存号；完成后把 lastCommit 推进到当前 HEAD。
   措辞原则（和游戏更新公告一致）：玩家视角说清「改了什么、现在怎么样了」，
   不写内部实现与具体数值——生成后可再打开 js/changelog.js 手动润色。 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'js', 'changelog.js');
const INDEX_FILE = path.join(ROOT, 'index.html');
const HEADER = `/* 喵都幸存者 - 📜更新日志数据（玩家在游戏内「更新日志」面板看到的版本记录）
   ── 发新版本时的维护流程 ──
   ① 把 index.html 里所有脚本的 ?v= 缓存号升一位（如 20260908b → 20260908c）
   ② 运行 node tools/gen-changelog.js：自动把上次之后的 git 提交整理成一条新日志
      （或 node tools/gen-changelog.js --title "标题" "新增：xxx" "修复：yyy" 手写条目）
   ③ 条目措辞面向玩家：说清「改了什么、现在怎么样了」即可，不写内部实现与具体数值
   条目按时间新→旧排列；items.t 类型：new 新增 / opt 优化 / bal 平衡 / fix 修复 */`;

const CATS = [
  ['fix', /修复|fix|崩溃|闪退|黑屏|白屏|卡死|卡顿|报错|错误|异常|bug/i],
  ['bal', /平衡|削弱|增强|加强|数值|难度|nerf|buff|balance/i],
  ['new', /新增|新功能|添加|加入|上线|支持|feat|更新日志/i],
];
const SKIP = [/^Initial commit$/i, /^(chore|docs?)\s*[:：]/i];

function sh(cmd) { return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim(); }

function readData() {
  const src = fs.readFileSync(DATA_FILE, 'utf8');
  return vm.runInNewContext(src + '\n;CHANGELOG', {}, { filename: 'changelog.js' });
}
function readVersion() {
  const m = fs.readFileSync(INDEX_FILE, 'utf8').match(/\?v=([0-9A-Za-z]+)/);
  if (!m) throw new Error('index.html 里没找到 ?v= 缓存号');
  return m[1];
}
function today() {
  const d = new Date(), p = n => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* 提交标题 → 玩家视角的一句话：去掉工程化前缀；冒号后是技术细节时只留可读的主干 */
function cleanSubject(s) {
  s = s.replace(/^(feat|fix|chore|refactor|perf|style|docs|test)\s*[:：]\s*/i, '');
  s = s.replace(/^喵都幸存者\s*[:：]\s*/, '');
  const at = s.search(/[：:]/);
  if (at > 0 && /canvas|css|dom|\bjs\b|api|px|dpr|storage|viewbox|正则|函数|变量|指针|内存|重构|逻辑|文件|配置项/i.test(s.slice(at + 1))) s = s.slice(0, at);
  return s.replace(/\s+/g, ' ').trim();
}
function categorize(s) { for (const [t, re] of CATS) if (re.test(s)) return t; return 'opt'; }

function collectCommits(lastCommit) {
  const range = lastCommit ? lastCommit + '..HEAD' : 'HEAD';
  let raw = '';
  try { raw = sh(`git log --no-merges --format=%s ${range}`); }
  catch (e) { throw new Error('读取 git 提交失败：' + e.message.split('\n')[0]); }
  return raw.split('\n').map(s => s.trim()).filter(Boolean)
    .filter(s => !SKIP.some(re => re.test(s)));
}

function parseArgs(argv) {
  const args = { title: '', items: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--title') args.title = argv[++i] || '';
    else args.items.push(argv[i]);
  }
  return args;
}
const TYPE_WORDS = { '新增': 'new', '优化': 'opt', '平衡': 'bal', '修复': 'fix', new: 'new', opt: 'opt', bal: 'bal', fix: 'fix' };
function parseBullet(s) {
  const m = s.match(/^(新增|优化|平衡|修复|new|opt|bal|fix)\s*[:：]\s*(.+)/i);
  if (m) return { t: TYPE_WORDS[m[1].toLowerCase()] || TYPE_WORDS[m[1]], text: m[2].trim() };
  return { t: 'opt', text: s.trim() };
}

function writeData(data) {
  const entries = data.entries.map(e => {
    const items = e.items.map(it => `        { t: '${it.t}', text: ${JSON.stringify(it.text)} },`).join('\n');
    return `    {\n      date: ${JSON.stringify(e.date)}, version: ${JSON.stringify(e.version || '')}, title: ${JSON.stringify(e.title || '')}, items: [\n${items}\n      ]\n    },`;
  }).join('\n');
  fs.writeFileSync(DATA_FILE,
    `${HEADER}\n'use strict';\nconst CHANGELOG = {\n  /* 工具记账：已收录到哪个提交（gen-changelog.js 维护，请勿手改） */\n  lastCommit: '${data.lastCommit}',\n  entries: [\n${entries}\n  ],\n};\n`,
    'utf8');
}

(function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = readData();
  const version = readVersion();
  const head = sh('git rev-parse HEAD');

  /* 自动模式：把待收录提交整理成条目；手写模式：直接用参数里的句子 */
  let items;
  if (args.items.length) {
    items = args.items.map(parseBullet);
  } else {
    const subjects = collectCommits(data.lastCommit);
    if (!subjects.length) { console.log('✔ 没有新的提交，更新日志已是最新，无需添加'); return; }
    const seen = new Set();
    items = [];
    for (const s of subjects) {
      const text = cleanSubject(s);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      items.push({ t: categorize(text), text });
    }
    if (!items.length) { console.log('✔ 待收录提交都是工程杂项，无需添加'); return; }
    console.log(`从 ${items.length} 条提交整理出新条目（可在 js/changelog.js 里润色措辞）：`);
    items.forEach(it => console.log(`  [${it.t}] ${it.text}`));
  }

  /* 版本号和最新条目相同 → 合并进那条；否则插入新条目 */
  const dup = data.entries.find(e => e.version === version);
  if (dup) {
    const have = new Set(dup.items.map(it => it.text));
    dup.items.push(...items.filter(it => !have.has(it.text)));
    if (args.title) dup.title = args.title;
    console.log(`ℹ 版本 ${version} 已有条目，已把新内容合并进去`);
  } else {
    data.entries.unshift({ date: today(), version, title: args.title, items });
    console.log(`✔ 已添加 ${today()} 版本 ${version} 的更新条目（${items.length} 条）`);
  }
  data.lastCommit = head;
  writeData(data);
  console.log('✔ js/changelog.js 已更新；下次进游戏会自动向玩家弹出新版本内容');
})();
