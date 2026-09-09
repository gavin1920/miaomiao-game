#!/usr/bin/env python3
"""跑一场 25Hz tick 比赛并落盘状态流。

用法: python scripts/run_tick_match.py ARS LIV 42 [--minutes 90] [--snap 25]
输出: out/tick_ARS_vs_LIV_s42.jsonl
"""
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from simcore.tick.match import play_tick_match  # noqa: E402
from simcore.team import make_team  # noqa: E402


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    home, away = args[0].upper(), args[1].upper()
    seed = int(args[2]) if len(args) > 2 else 42
    minutes = 90
    snap = 25
    if "--minutes" in sys.argv:
        minutes = int(sys.argv[sys.argv.index("--minutes") + 1])
    if "--snap" in sys.argv:
        snap = int(sys.argv[sys.argv.index("--snap") + 1])

    t0 = time.time()
    out = ROOT / "out" / f"tick_{home}_vs_{away}_s{seed}.jsonl"
    s = play_tick_match(make_team(home), make_team(away), seed, out,
                        minutes=minutes, snapshot_every=snap)
    dt = time.time() - t0
    print(f"{home} {s['score'][0]} - {s['score'][1]} {away}   (seed={seed}, 25Hz×{minutes}')")
    print(f"  射门 {s['shots']}  进球事件 {s['goals']}  传球 {s['passes']}"
          f"（成功率 {s['pass_acc']:.0%}）  平均体能 {s['avg_stamina']:.0%}")
    print(f"  耗时 {dt:.1f}s  状态流 → {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
