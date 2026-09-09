#!/usr/bin/env python3
"""比赛日：选两队 → 踢一场 → 自动打开浏览器回放。

用法:
  python scripts/play.py                          # ARS vs LIV（默认）
  python scripts/play.py MCI LIV --seed 7
  python scripts/play.py ARS CHE --mentality attacking --formation 4-3-3
  python scripts/play.py --list                   # 列出可用球队
"""
import argparse
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from simcore import data  # noqa: E402
from simcore.tick.match import play_tick_match  # noqa: E402
from simcore.team import make_team  # noqa: E402

sys.path.insert(0, str(ROOT / "scripts"))
import render_match  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("home", nargs="?", default="ARS")
    ap.add_argument("away", nargs="?", default="LIV")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--minutes", type=int, default=90)
    ap.add_argument("--mentality", default=None,
                    choices=["extreme_defensive", "defensive", "cautious", "balanced",
                             "positive", "attacking", "extreme_attacking"])
    ap.add_argument("--formation", default=None)
    ap.add_argument("--no-open", action="store_true")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    if args.list:
        for cid, c in sorted(data.clubs().items()):
            print(f"  {cid}  {c['name']}")
        return 0

    clubs = data.clubs()
    for cid in (args.home.upper(), args.away.upper()):
        if cid not in clubs:
            print(f"球队 {cid} 不存在（--list 查看全部）")
            return 2

    over_home, over_away = {}, {}
    if args.mentality:
        over_home["mentality"] = over_away["mentality"] = args.mentality
    if args.formation:
        over_home["formation"] = over_away["formation"] = args.formation

    home = make_team(args.home.upper(), overrides=over_home or None)
    away = make_team(args.away.upper(), overrides=over_away or None)
    out = ROOT / "out" / f"play_{args.home.upper()}_vs_{args.away.upper()}_s{args.seed}"
    print(f"比赛日：{home['name']} vs {away['name']}（seed={args.seed}）")
    s = play_tick_match(home, away, args.seed, Path(str(out) + ".jsonl"),
                        minutes=args.minutes)
    print(f"终场  {args.home.upper()} {s['score'][0]} - {s['score'][1]} {args.away.upper()}")
    print(f"  射门 {s['shots']}（xG {s['xg']}）  传球成功率 {s['pass_acc']:.0%}  "
          f"控球 {s['possession'][0]:.0%}-{s['possession'][1]:.0%}")
    print(f"  犯规 {s['fouls']}  黄牌 {s['yellows']}  抢断 {s['tackles']}")

    # 生成回放并打开
    jsonl = Path(str(out) + ".jsonl")
    rc = render_match.main.__wrapped__ if hasattr(render_match.main, "__wrapped__") else None
    sys.argv = ["render_match.py", str(jsonl)]
    render_match.main()
    html = jsonl.with_suffix(".html")
    print(f"回放 → {html.relative_to(ROOT)}")
    if not args.no_open:
        webbrowser.open(html.as_uri())
        print("已在浏览器打开 ▶")
    return 0


if __name__ == "__main__":
    sys.exit(main())
