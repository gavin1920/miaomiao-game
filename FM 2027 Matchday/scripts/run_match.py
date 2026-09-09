#!/usr/bin/env python3
"""跑一场比赛：python scripts/run_match.py ARS LIV [seed]"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from simcore.engine import MatchEngine
from simcore.team import make_team


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    home, away = sys.argv[1].upper(), sys.argv[2].upper()
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else 42
    m = MatchEngine(make_team(home), make_team(away), seed)
    s = m.run()
    print(f"{s['home']} {s['score'][0]} - {s['score'][1]} {s['away']}   (seed={seed})")
    print(f"  射门  {s['home_shots']} - {s['away_shots']}   射正 {s['home_sot']} - {s['away_sot']}"
          f"   xG {s['home_xg']} - {s['away_xg']}")
    print(f"  控球  {s['home_possession']:.0%} - {1 - s['home_possession']:.0%}"
          f"   传球成功率 {s['home_pass_acc']:.0%} - {s['away_pass_acc']:.0%}"
          f"   角球 {s['home_corners']} - {s['away_corners']}")
    print(f"  犯规 {s['fouls']}   黄牌 {s['yellows']}")
    print("  进球:")
    for e in m.events:
        if e["type"] == "goal":
            print(f"    {e['minute']:>2}' {e['team']} #{e['scorer']} ({e['phase']}, xG {next(x['xg'] for x in m.events if x['type']=='shot' and x['player']==e['scorer'] and x['minute']==e['minute'])})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
