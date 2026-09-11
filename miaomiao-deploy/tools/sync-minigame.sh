#!/usr/bin/env bash
# 把网页版引擎文件同步进小游戏工程并拼接 bundle.js（打小游戏包 / 真机调试前运行）
# 用法: bash tools/sync-minigame.sh   （在 miaomiao-deploy 目录下执行）
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MG="$ROOT/../meow-minigame"
if [ ! -d "$MG" ]; then
  echo "✗ 找不到小游戏工程 $MG" >&2
  exit 1
fi

# ⓪ 自动跟随守卫：以网页版 index.html 的 <script> 清单为准，做差集校验
INDEX="$ROOT/index.html"
EXPECTED="util audio art art_pixel maps game_config data result changelog leaderboard"
if command -v python >/dev/null 2>&1; then
  MANIFEST_WIN="C:\\Users\\gavin\\Desktop\\Games\\miaomiao-deploy\\index.html"
  if command -v cygpath >/dev/null 2>&1; then MANIFEST_WIN=$(cygpath -w "$INDEX"); fi
  RESULT=$(python -c "
import io,re
html=io.open(r'$MANIFEST_WIN',encoding='utf-8').read()
mods=re.findall(r'<script src=\"js/([\w.-]+)\.js',html)
known={'main','config_panel','changelog_ui','lb_ui'}
out=[m for m in mods if m not in known]
expected='''$EXPECTED'''.split()
missing=[m for m in out if m not in expected]
extra=[m for m in expected if m not in out]
if missing: print('MISSING:'+','.join(missing))
if extra: print('EXTRA:'+','.join(extra))
" 2>&1)
  if [ -n "$RESULT" ]; then
    echo "✗ 网页版脚本清单不一致：$RESULT" >&2
    exit 1
  fi
fi

# ⓪.1 python 必须可用（fork 生成 + 脱敏 + 字体子集 + manifest 内联全依赖它）
if ! command -v python >/dev/null 2>&1; then
  echo "✗ python 不可用，无法构建小游戏包" >&2
  exit 1
fi

# ⓪.2 重新生成小游戏版 main（fork 生成器）
python "$MG/tools_transform.py"

mkdir -p "$MG/game-js" "$MG/assets" "$MG/test"

# ① 引擎层（零改动复用）：从网页版 js/ 复制 + 通过 Python 脱敏脚本清理
#    （leaderboard.js 是双端自适应的服务模块：小游戏走 wx.cloud、浏览器走 Web SDK，整份复用）
for f in util audio art art_pixel maps game_config data result changelog leaderboard; do
  cp "$ROOT/js/$f.js" "$MG/game-js/$f.js"
done

# ①.5 art_pixel 复制品脱敏（Python 精准替换：document 依赖剥离 + 单帧解包 + 事件替换）
python "$ROOT/tools/sanitize_art_pixel.py"

# ② 像素素材 + 内联 manifest
rm -rf "$MG/pixel-assets"
cp -r "$ROOT/pixel-assets" "$MG/pixel-assets"
rm -rf "$MG/test/pixel-assets"
mkdir -p "$MG/test/pixel-assets"
cp -r "$ROOT/pixel-assets" "$MG/test/pixel-assets"
# 内联 manifest 为 JS 变量（art_pixel 官方钩子 window.PIXEL_MANIFEST）
MANIFEST_WIN="C:\\Users\\gavin\\Desktop\\Games\\miaomiao-deploy\\pixel-assets\\manifest.json"
if command -v cygpath >/dev/null 2>&1; then MANIFEST_WIN=$(cygpath -w "$ROOT/pixel-assets/manifest.json"); fi
python -c "import json,io;print('window.PIXEL_MANIFEST = '+json.dumps(json.load(io.open(r'$MANIFEST_WIN',encoding='utf-8')),ensure_ascii=False)+';')" > "$MG/game-js/pixel_manifest.js"

# ③ 喵叫采样
if [ -d "$ROOT/assets/meow" ]; then
  rm -rf "$MG/assets/meow"
  cp -r "$ROOT/assets/meow" "$MG/assets/meow"
fi
# test/ 里也放一份（浏览器冒烟用，不进小游戏包）
mkdir -p "$MG/test/assets"
rm -rf "$MG/test/assets/meow"
cp -r "$ROOT/assets/meow" "$MG/test/assets/meow"

# ④ 拼 bundle：顺序 = 浏览器 script 标签加载顺序
#    adapter 首位 → pixel_manifest 先于 art_pixel → main 最后
OUT="$MG/bundle.js"
{
  cat "$MG/src/adapter.js";            printf '\n;\n'
  cat "$MG/game-js/util.js";           printf '\n;\n'
  cat "$MG/game-js/audio.js";          printf '\n;\n'
  cat "$MG/game-js/art.js";            printf '\n;\n'
  cat "$MG/game-js/pixel_manifest.js"; printf '\n;\n'
  cat "$MG/game-js/art_pixel.js";      printf '\n;\n'
  cat "$MG/game-js/maps.js";           printf '\n;\n'
  cat "$MG/game-js/game_config.js";    printf '\n;\n'
  cat "$MG/game-js/data.js";           printf '\n;\n'
  cat "$MG/game-js/result.js";         printf '\n;\n'
  cat "$MG/game-js/changelog.js";      printf '\n;\n'
  cat "$MG/game-js/leaderboard.js";    printf '\n;\n'
  cat "$MG/src/ui.js";                 printf '\n;\n'
  cat "$MG/src/main.js"
} > "$OUT"
echo "✓ 已同步并生成 $OUT（$(wc -c < "$OUT") 字节）"

# ⑤ 像素字体子集
python "$MG/tools_font.py" || echo "⚠ 字体子集生成失败（回退系统字体）"
