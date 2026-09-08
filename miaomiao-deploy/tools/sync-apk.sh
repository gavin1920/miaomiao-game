#!/usr/bin/env bash
# 把网页版最新资源同步进安卓壳工程（../meow-android/assets/www），打 APK 前运行。
# 用法: bash tools/sync-apk.sh   （在 miaomiao-deploy 目录下执行）
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/../meow-android/assets/www"
if [ ! -d "$ROOT/../meow-android" ]; then
  echo "✗ 找不到壳工程 $ROOT/../meow-android" >&2
  exit 1
fi
rm -rf "$DEST"
mkdir -p "$DEST"
cp "$ROOT/index.html" "$DEST/"
cp -r "$ROOT/js" "$DEST/js"
[ -d "$ROOT/assets" ] && cp -r "$ROOT/assets" "$DEST/assets"
echo "✓ 已同步 $DEST（$(find "$DEST" -type f | wc -l) 个文件）"
echo "下一步: source /c/dev/env.sh && cd ../meow-android && flutter build apk --release"
