#!/usr/bin/env python3
"""把 tick 状态流 JSONL 渲染成可交互回放的 HTML（无依赖，浏览器直接打开）。

用法: python scripts/render_match.py out/tick_ARS_vs_LIV_s42.jsonl
输出: out/tick_ARS_vs_LIV_s42.html   （回放器：播放/暂停/倍速/进度条/事件流）
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from simcore.data import clubs  # noqa: E402


def load(path: Path):
    meta, frames, final = {}, [], {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            if d.get("meta") and "final" in d:
                final = d
            elif d.get("meta"):
                meta = d
            else:
                frames.append(d)
    return meta, frames, final


def compact(frames):
    out = []
    for fr in frames:
        out.append({
            "t": fr["tick"], "c": fr["clock"], "ph": fr["phase"], "s": fr["score"],
            "b": [round(fr["ball"]["p"][0], 1), round(fr["ball"]["p"][1], 1)],
            "p": [[p["p"][0], p["p"][1], p["team"], 1 if p["has_ball"] else 0,
                   p["pid"]] for p in fr["players"]],
        })
    return out


HTML = """<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8">
<title>FM2027 Matchday · Tick 回放</title>
<style>
 body{background:#0b1420;color:#cfe3ff;font-family:Segoe UI,system-ui,sans-serif;margin:0;display:flex;flex-direction:column;align-items:center}
 h1{font-size:16px;margin:10px 0 4px}
 #bar{display:flex;gap:14px;align-items:center;margin:6px 0}
 button,select{background:#173252;color:#cfe3ff;border:1px solid #2c5b93;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:14px}
 #score{font-size:20px;font-weight:700}
 #evlog{width:760px;max-height:130px;overflow-y:auto;font-size:12px;background:#0e1c2e;border:1px solid #1d3a5f;border-radius:6px;padding:6px 10px;margin-bottom:10px}
 canvas{background:#0e5c2f;border-radius:8px}
 input[type=range]{width:700px}
</style></head><body>
<h1 id="title"></h1>
<canvas id="cv" width="880" height="590"></canvas>
<div id="bar">
 <button id="play">⏸ 暂停</button>
 <select id="spd"><option value="0.5">0.5×</option><option value="1" selected>1×</option>
  <option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select>
 <span id="clock"></span><span id="score"></span>
</div>
<input type="range" id="seek" min="0" max="1" step="0.001" value="0">
<div id="evlog"></div>
<script>
const DATA = __DATA__;
const EVS = __EVENTS__;
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const SX = 820/105, SY = 550/68, OX = 30, OY = 20;
const W = (x)=>OX+(x+52.5)*SX, H = (y)=>OY+(y+34)*SY;
const frames = DATA.frames;
const SNAP_S = 1;             // 帧间隔秒（1Hz 快照）
let speed = 1, playing = true, t = 0;
const tmax = (frames.length-1)*SNAP_S;

function lerp(a,b,k){return a+(b-a)*k}
function frameAt(time){
  const i = Math.min(frames.length-1, Math.floor(time/SNAP_S));
  const k = Math.min(1, time/SNAP_S - i);
  const a = frames[i], b = frames[Math.min(frames.length-1, i+1)];
  return {a, b, k, i};
}
function draw(){
  const {a,b,k,i} = frameAt(t);
  ctx.clearRect(0,0,cv.width,cv.height);
  // 场地
  ctx.strokeStyle='rgba(255,255,255,.75)'; ctx.lineWidth=1.5;
  ctx.strokeRect(W(-52.5),H(-34),105*SX,68*SY);
  ctx.beginPath(); ctx.moveTo(W(0),H(-34)); ctx.lineTo(W(0),H(34)); ctx.stroke();
  ctx.beginPath(); ctx.arc(W(0),H(0),9.15*SX,0,7); ctx.stroke();
  for(const gx of [-52.5,52.5]){
    const s = gx<0?1:-1;
    ctx.strokeRect(W(gx),H(-20.16),s*16.5*SX,40.32*SY);
    ctx.strokeRect(W(gx),H(-9.16),s*5.5*SX,18.32*SY);
  }
  // 球
  const bx=lerp(a.b[0],b.b[0],k), by=lerp(a.b[1],b.b[1],k);
  // 球员
  for(let j=0;j<22;j++){
    const pa=a.p[j], pb=b.p[j];
    const x=lerp(pa[0],pb[0],k), y=lerp(pa[1],pb[1],k);
    const team=pa[2], c = team===0?DATA.home_c:DATA.away_c;
    ctx.beginPath(); ctx.arc(W(x),H(y),6.5,0,7);
    ctx.fillStyle=c; ctx.fill();
    if(team===1){ctx.lineWidth=1;ctx.strokeStyle='rgba(255,255,255,.65)';ctx.stroke();}
    if(pa[3]||pb[3]){ctx.beginPath();ctx.arc(W(x),H(y),9,0,7);ctx.strokeStyle='#ffe066';ctx.lineWidth=2;ctx.stroke();}
  }
  ctx.beginPath(); ctx.arc(W(bx),H(by),4.5,0,7); ctx.fillStyle='#fff'; ctx.fill();
  ctx.strokeStyle='#222'; ctx.stroke();
  // 记分
  document.getElementById('clock').textContent = a.c;
  document.getElementById('score').textContent = DATA.home+' '+a.s[0]+' - '+a.s[1]+' '+DATA.away;
  document.getElementById('seek').value = t/tmax;
}
let lastEv=0;
function tick(){
  if(playing){
    t += 0.016*speed*SNAP_S/SNAP_S;
    if(t>=tmax){t=tmax;playing=false;document.getElementById('play').textContent='▶ 播放';}
    while(lastEv<EVS.length && EVS[lastEv].tick<=frames[Math.min(frames.length-1,Math.floor(t/SNAP_S))].t){
      logEv(EVS[lastEv]); lastEv++;
    }
  }
  draw(); requestAnimationFrame(tick);
}
function logEv(e){
  const d=document.createElement('div');
  const names={goal:'⚽ 进球',shot:'射门',save:'🧤 扑救',pass_attempt:'传球',interception:'拦截',
    throw_in:'界外球',corner:'角球',goal_kick:'球门球',free_kick:'任意球',match_phase_change:'阶段'};
  d.textContent = `[${e.clock||''}] ${names[e.type]||e.type} ${e.shooter||e.player||e.gk||e.taker||''} ${e.xg?'xG '+e.xg:''}`;
  if(e.type==='goal'){d.style.color='#ffd43b';d.style.fontWeight='700';}
  const log=document.getElementById('evlog'); log.prepend(d);
}
document.getElementById('play').onclick=()=>{playing=!playing;
  document.getElementById('play').textContent=playing?'⏸ 暂停':'▶ 播放';};
document.getElementById('spd').onchange=e=>speed=parseFloat(e.target.value);
document.getElementById('seek').oninput=e=>{t=parseFloat(e.target.value)*tmax;
  lastEv=0;document.getElementById('evlog').innerHTML='';
  while(lastEv<EVS.length && EVS[lastEv].tick<=frames[Math.min(frames.length-1,Math.floor(t/SNAP_S))].t){logEv(EVS[lastEv]);lastEv++;}};
document.getElementById('title').textContent =
  `${DATA.home} vs ${DATA.away}  ·  seed ${DATA.seed}  ·  25Hz tick 回放（1Hz 快照+插值）`;
window.seekTo = (frac) => { t = Math.max(0, Math.min(tmax, frac * tmax));
  lastEv = 0; document.getElementById('evlog').innerHTML = ''; };
window.playState = () => ({ t: Math.round(t), tmax: Math.round(tmax), playing,
  clock: document.getElementById('clock').textContent, score: document.getElementById('score').textContent });
window.togglePlay = () => document.getElementById('play').click();
requestAnimationFrame(tick);
</script></body></html>"""


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if src is None or not src.exists():
        print(__doc__)
        return 2
    meta, frames, final = load(src)
    evs = []
    for fr in frames:
        for e in fr["events"]:
            e["tick"] = fr["tick"]
            e["clock"] = fr["clock"]
            evs.append(e)
    cs = clubs()
    payload = {
        "home": meta.get("home"), "away": meta.get("away"), "seed": meta.get("seed"),
        "home_c": cs[meta["home"]]["primary"] if meta.get("home") in cs else "#d33",
        # 客队用副色：主客主色可能同色系（ARS/LIV 都是红）
        "away_c": cs[meta["away"]]["secondary"] if meta.get("away") in cs else "#33d",
        "frames": compact(frames),
    }
    html = HTML.replace("__DATA__", json.dumps(payload, ensure_ascii=False,
                                              separators=(",", ":"))) \
                .replace("__EVENTS__", json.dumps(evs, ensure_ascii=False,
                                                  separators=(",", ":")))
    out = src.with_suffix(".html")
    out.write_text(html, encoding="utf-8")
    print(f"回放器 → {out}  ({out.stat().st_size/1e6:.1f} MB, {len(frames)} 帧, {len(evs)} 事件)")
    if final:
        print(f"终场比分: {meta.get('home')} {final['score'][0]} - {final['score'][1]} {meta.get('away')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
