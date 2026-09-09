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

# ⓪ 自动跟随守卫：以网页版 index.html 的 <script> 清单为准，做差集校验——
#    网页版新增/删除 js 模块而本脚本未跟进时，构建期即报错（防运行时 ReferenceError）
INDEX="$ROOT/index.html"
EXPECTED="util audio art art_pixel maps game_config data result changelog"
ACTUAL=""
if command -v python >/dev/null 2>&1; then
  ACTUAL=$(python -c "
import io,re,sys
html=io.open(r'$(cygpath -w "$INDEX" 2>/dev/null || echo "$INDEX")',encoding='utf-8').read()
mods=re.findall(r'<script src=\"js/([\w.-]+)\.js',html)
known_exclude={'main','config_panel','changelog_ui'}
out=[m for m in mods if m not in known_exclude]
missing=[m for m in out if m not in '''$EXPECTED'''.split()]
extra=[m for m in '''$EXPECTED'''.split() if m not in out]
if missing: print('MISSING:'+','.join(missing))
if extra: print('EXTRA:'+','.join(extra))
")
  case "$ACTUAL" in
    MISSING:*|*EXTRA:*)
      echo "✗ 网页版脚本清单与同步清单不一致：$ACTUAL" >&2
      echo "  请更新 sync-minigame.sh 的文件清单与 tools_transform.py 锚点后重试。" >&2
      exit 1 ;;
  esac
fi

# ⓪.1 python 缺失时禁止静默沿用陈旧 fork：main.js 比目标 fork 新就必须有 python
if ! command -v python >/dev/null 2>&1; then
  if [ "$ROOT/js/main.js" -nt "$MG/src/main.js" ]; then
    echo "✗ 网页版 main.js 有更新且 python 不可用——拒绝用陈旧 fork 打包" >&2
    exit 1
  fi
fi
mkdir -p "$MG/game-js" "$MG/assets"

# ⓪ 重新生成小游戏版 main（fork 生成器：网页版 main.js → 去 DOM 化定制版）
#    网页版每次改完 js/main.js 都要跑同步；python 缺失时沿用现有 src/main.js（可能过时）
if command -v python >/dev/null 2>&1; then
  python "$MG/tools_transform.py" || { echo "✗ fork 生成失败" >&2; exit 1; }
else
  echo "⚠ 未找到 python，跳过 main.js 重新生成（沿用旧的 src/main.js）" >&2
fi

# ① 引擎层（零改动复用）：util/audio/art/art_pixel/maps/game_config/data/result + changelog 数据
#    （顺序对齐网页版 index.html 的 script 标签：result 在 changelog 前）
for f in util audio art art_pixel maps game_config data result changelog; do
  cp "$ROOT/js/$f.js" "$MG/game-js/$f.js"
done
# 复制品脱敏：开发者工具嵌入式页面的 document.title 只读，art_pixel 的调试赋值会抛错
# 并炸掉像素管线——改写为经 __setDocTitle 安全写入（adapter 定义）
sed -i "s/document\.title = \([^;]*\);/__setDocTitle(\1);/g" "$MG/game-js/art_pixel.js"
# 这两行是网页版 CSS 门控标记（pixel-ready/pixelMode），小游戏无 DOM 概念——直接删除，
# 否则 documentElement 为 undefined 时 .classList 读取会抛 TypeError（实测踩雷）
sed -i "/document\.documentElement\.classList\.add('pixel-ready');/d" "$MG/game-js/art_pixel.js"
sed -i "/document\.documentElement\.dataset\.pixelMode = /d" "$MG/game-js/art_pixel.js"
# MutationObserver 在小游戏 VM 可能不存在——去掉网页专用的属性观察
sed -i "s/new MutationObserver(noSmooth).observe(cv, { attributes: true });/;/" "$MG/game-js/art_pixel.js"
# 就绪信号改走直接 resolve（dispatchEvent 对桩事件在部分宿主会抛错——实测踩雷）
sed -i "s/window\.dispatchEvent(new CustomEvent('pixel-assets-ready'))/__PIXEL_GATE_RESOLVE();/g" "$MG/game-js/art_pixel.js"

# ①.5 像素素材（像素风的资产包；字体子集由 tools_font.py 生成到 assets/fonts/）
rm -rf "$MG/pixel-assets"
cp -r "$ROOT/pixel-assets" "$MG/pixel-assets"
mkdir -p "$MG/test/pixel-assets" "$MG/game-js"
# test/ 里也放一份，供浏览器冒烟时 art_pixel 按页面相对路径取到（不进小游戏包）
rm -rf "$MG/test/pixel-assets"
cp -r "$ROOT/pixel-assets" "$MG/test/pixel-assets"
# 内联 manifest：小游戏里 FileSystemManager 读包内 json 不稳，改用 art_pixel 官方钩子
# window.PIXEL_MANIFEST（index.html 在网页版就是这么干的），彻底绕开 fetch/fs
# 内联 manifest：小游戏里 FileSystemManager 读包内 json 不稳，改用 art_pixel 官方钩子
# window.PIXEL_MANIFEST（index.html 在网页版就是这么干的），彻底绕开 fetch/fs
if command -v python >/dev/null 2>&1; then
  MANIFEST_WIN="C:\\Users\\gavin\\Desktop\\Games\\miaomiao-deploy\\pixel-assets\\manifest.json"
  if command -v cygpath >/dev/null 2>&1; then MANIFEST_WIN=$(cygpath -w "$ROOT/pixel-assets/manifest.json"); fi
  python -c "import json,io;print('window.PIXEL_MANIFEST = '+json.dumps(json.load(io.open(r'$MANIFEST_WIN',encoding='utf-8')),ensure_ascii=False)+';')" > "$MG/game-js/pixel_manifest.js"
else
  echo "⚠ python 不可用：跳过 pixel_manifest 内联（像素精灵将走 fetch 回退）" >&2
fi
# 猫叫采样同理（浏览器冒烟时 fetch 相对路径指向 test/）
mkdir -p "$MG/test/assets"
rm -rf "$MG/test/assets/meow"
cp -r "$ROOT/assets/meow" "$MG/test/assets/meow"

# ② 喵叫采样（audio.js 的 fetch 适配层会用 FileSystemManager 读取）
if [ -d "$ROOT/assets/meow" ]; then
  rm -rf "$MG/assets/meow"
  cp -r "$ROOT/assets/meow" "$MG/assets/meow"
fi

# ③ 拼 bundle：文件顺序 = 浏览器 script 标签加载顺序（顶层 const 跨文件可见的同一语义）
#    adapter 必须最先（建 window/document 桩），art_pixel 在 art 之后（替换像素精灵），main 最后。
OUT="$MG/bundle.js"
{
  cat "$MG/src/adapter.js";      printf '\n;\n'
  cat "$MG/game-js/util.js";     printf '\n;\n'
  cat "$MG/game-js/audio.js";    printf '\n;\n'
  cat "$MG/game-js/art.js";      printf '\n;\n'
  cat "$MG/game-js/pixel_manifest.js"; printf '\n;\n'
  cat "$MG/game-js/art_pixel.js"; printf '\n;\n'
  cat "$MG/game-js/maps.js";     printf '\n;\n'
  cat "$MG/game-js/game_config.js"; printf '\n;\n'
  cat "$MG/game-js/data.js";     printf '\n;\n'
  cat "$MG/game-js/result.js";   printf '\n;\n'
  cat "$MG/game-js/changelog.js"; printf '\n;\n'
  cat "$MG/src/ui.js";           printf '\n;\n'
  cat "$MG/src/main.js"
} > "$OUT"
echo "✓ 已同步并生成 $OUT（$(wc -c < "$OUT") 字节）"

# ④ 像素字体子集（从 bundle 提取用字；依赖 fonttools+brotli，失败不阻断、回退系统字体）
if command -v python >/dev/null 2>&1; then
  python "$MG/tools_font.py" || echo "⚠ 字体子集生成失败（小游戏将回退系统字体）"
fi
