#!/bin/bash
# 1:1 完整地图导出：preview/map-render.html?map=<id> 把整张地图渲染成 宽×高 的画布，
# 无头 Edge 按地图尺寸开窗截图 → maps/<id>.png（1 游戏单位 = 1 像素，含地面/装饰/夜幕/灯光）。
# 用法: bash tools/export-maps.sh   （需要 http://localhost:8642 指向游戏根目录；
#        尺寸来自 node tools/map-sizes.js，地图改动后重跑本脚本即可重新出图）
# 注意：Git Bash 不等待 GUI 程序退出，Edge 启动后靠轮询 PNG 大小稳定来确认写完。
E="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
ROOT="C:/Users/gavin/Desktop/Games/miaomiao-deploy"
BASE="http://localhost:8642"
TIMEOUT=180
mkdir -p "$ROOT/maps"
wait_png() { # $1=file：出现且字节数连续两次一致（>0）即认为写完
  local f="$1" last=-1 t=0 sz
  while [ $t -lt $TIMEOUT ]; do
    if [ -f "$f" ]; then
      sz=$(stat -c %s "$f" 2>/dev/null || echo 0)
      if [ "$sz" -gt 0 ] && [ "$sz" = "$last" ]; then return 0; fi
      last=$sz
    fi
    sleep 1; t=$((t+1))
  done
  return 1
}
export_map() { # $1=id  $2=w  $3=h
  local out="$ROOT/maps/$1.png" prof="$TEMP/edge-prof-map-$1" rc
  rm -f "$out"; rm -rf "$prof"
  "$E" --headless=new --disable-gpu --no-first-run --user-data-dir="$prof" \
    --hide-scrollbars --window-size=$2,$3 --virtual-time-budget=30000 \
    --screenshot="$out" "$BASE/preview/map-render.html?map=$1" >/dev/null 2>&1 </dev/null
  if wait_png "$out"; then
    echo "OK $1 ${2}x${3} -> maps/$1.png"
  else
    echo "FAIL $1 (等待 $TIMEOUT 秒未产出/未稳定)"; rc=1
  fi
  rm -rf "$prof"
  return $rc
}
rc=0
while read -r id w h; do
  export_map "$id" "$w" "$h" || rc=1
done < <(node "$ROOT/tools/map-sizes.js")
echo DONE
exit $rc
