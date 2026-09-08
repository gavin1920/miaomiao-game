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
mkdir -p "$MG/game-js" "$MG/assets"

# ⓪ 重新生成小游戏版 main（fork 生成器：网页版 main.js → 去 DOM 化定制版）
#    网页版每次改完 js/main.js 都要跑同步；python 缺失时沿用现有 src/main.js（可能过时）
if command -v python >/dev/null 2>&1; then
  python "$MG/tools_transform.py" || { echo "✗ fork 生成失败" >&2; exit 1; }
else
  echo "⚠ 未找到 python，跳过 main.js 重新生成（沿用旧的 src/main.js）" >&2
fi

# ① 引擎层（零改动复用）：util/audio/art/maps/game_config/data/result + changelog 数据
for f in util audio art maps game_config data result changelog; do
  cp "$ROOT/js/$f.js" "$MG/game-js/$f.js"
done

# ② 喵叫采样（audio.js 的 fetch 适配层会用 FileSystemManager 读取）
if [ -d "$ROOT/assets/meow" ]; then
  rm -rf "$MG/assets/meow"
  cp -r "$ROOT/assets/meow" "$MG/assets/meow"
fi

# ③ 拼 bundle：文件顺序 = 浏览器 script 标签加载顺序（顶层 const 跨文件可见的同一语义）
#    adapter 必须最先（建 window/document 桩），main 最后（依赖全部前序）。
OUT="$MG/bundle.js"
{
  cat "$MG/src/adapter.js";      printf '\n;\n'
  cat "$MG/game-js/util.js";     printf '\n;\n'
  cat "$MG/game-js/audio.js";    printf '\n;\n'
  cat "$MG/game-js/art.js";      printf '\n;\n'
  cat "$MG/game-js/maps.js";     printf '\n;\n'
  cat "$MG/game-js/game_config.js"; printf '\n;\n'
  cat "$MG/game-js/data.js";     printf '\n;\n'
  cat "$MG/game-js/changelog.js"; printf '\n;\n'
  cat "$MG/game-js/result.js";   printf '\n;\n'
  cat "$MG/src/ui.js";           printf '\n;\n'
  cat "$MG/src/main.js"
} > "$OUT"
echo "✓ 已同步并生成 $OUT（$(wc -c < "$OUT") 字节）"
