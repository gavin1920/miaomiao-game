#!/bin/bash
# 地图截图矩阵：每张地图多个机位（?dev=1&auto=play&map=..&at=x,y）
E="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
ROOT="C:/Users/gavin/Desktop/Games/miaomiao-deploy"
mkdir -p "$ROOT/shots"
shot() { # $1=out  $2=url
  local prof="$TEMP/edge-prof-$1"
  rm -rf "$prof"
  "$E" --headless=new --disable-gpu --no-first-run --user-data-dir="$prof" \
    --hide-scrollbars --window-size=1600,900 --virtual-time-budget=12000 \
    --screenshot="$ROOT/shots/$1" "$2" >/dev/null 2>&1
  sleep 2
}
shot menu.png "http://localhost:8642/index.html"
shot endless.png "http://localhost:8642/index.html?dev=1&auto=play&map=endless"
shot oldtown-a.png "http://localhost:8642/index.html?dev=1&auto=play&map=oldtown&at=2400,2325"
shot oldtown-b.png "http://localhost:8642/index.html?dev=1&auto=play&map=oldtown&at=2100,950"
shot oldtown-c.png "http://localhost:8642/index.html?dev=1&auto=play&map=oldtown&at=3225,990"
shot sakura-a.png "http://localhost:8642/index.html?dev=1&auto=play&map=sakura&at=2200,3180"
shot sakura-b.png "http://localhost:8642/index.html?dev=1&auto=play&map=sakura&at=2220,1300"
shot sakura-c.png "http://localhost:8642/index.html?dev=1&auto=play&map=sakura&at=3620,1560"
shot harbor-a.png "http://localhost:8642/index.html?dev=1&auto=play&map=harbor&at=1700,2100"
shot harbor-b.png "http://localhost:8642/index.html?dev=1&auto=play&map=harbor&at=2200,1420"
shot harbor-c.png "http://localhost:8642/index.html?dev=1&auto=play&map=harbor&at=3800,915"
shot onsen-a.png "http://localhost:8642/index.html?dev=1&auto=play&map=onsen&at=2100,3320"
shot onsen-b.png "http://localhost:8642/index.html?dev=1&auto=play&map=onsen&at=2550,1130"
shot onsen-c.png "http://localhost:8642/index.html?dev=1&auto=play&map=onsen&at=3530,1000"
shot carnival-a.png "http://localhost:8642/index.html?dev=1&auto=play&map=carnival&at=2300,3180"
shot carnival-b.png "http://localhost:8642/index.html?dev=1&auto=play&map=carnival&at=2300,1900"
shot carnival-c.png "http://localhost:8642/index.html?dev=1&auto=play&map=carnival&at=3900,2800"
echo DONE
