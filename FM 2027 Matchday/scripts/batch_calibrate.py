#!/usr/bin/env python3
"""批量校准：N 场随机对阵 → 聚合统计 → 对照 data/calibration/epl_baseline.csv。

用法:
  python scripts/batch_calibrate.py            # 1000 场校准报告
  python scripts/batch_calibrate.py --sens     # 附带战术敏感性用例（3 条）
"""
import random
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from simcore import data, engine
from simcore.team import make_team

ROOT = Path(__file__).resolve().parent.parent


def play(a: str, b: str, seed: int) -> dict:
    return engine.MatchEngine(make_team(a), make_team(b), seed).run()


def batch(n_matches: int, seed0: int = 20270901) -> list[dict]:
    club_ids = sorted(data.clubs())
    rng = random.Random(seed0)
    results = []
    for i in range(n_matches):
        a, b = rng.sample(club_ids, 2)
        results.append(play(a, b, seed0 + i))
    return results


def aggregate(results: list[dict]) -> dict:
    per_team = []
    for r in results:
        for side in ("home", "away"):
            other = "away" if side == "home" else "home"
            per_team.append({
                "goals": r[f"{side}_goals"], "shots": r[f"{side}_shots"],
                "sot": r[f"{side}_sot"], "xg": r[f"{side}_xg"],
                "pass_acc": r[f"{side}_pass_acc"] * 100,
                "corners": r[f"{side}_corners"],
                "possession": (r[f"{side}_possession"] if side == "home"
                               else 1 - r["home_possession"]) * 100,
                "club": r[side], "opp": r[other],
            })
    match_stats = {
        "goals_per_match": [r["home_goals"] + r["away_goals"] for r in results],
        "shots_per_match": [r["home_shots"] + r["away_shots"] for r in results],
        "sot_per_match": [r["home_sot"] + r["away_sot"] for r in results],
        "pass_accuracy_pct": [t["pass_acc"] for t in per_team],
        "corners_per_match": [r["home_corners"] + r["away_corners"] for r in results],
        "fouls_per_match": [r["fouls"] for r in results],
        "yellows_per_match": [float(r["yellows"]) for r in results],
    }
    # 控球率 vs 队伍强度（代理排名）的皮尔逊相关
    squad_strength = {cid: sorted((sum(p.attrs.values()) / max(len(p.attrs), 1)
                                   for p in ps), reverse=True)[:11]
                      for cid, ps in data.players_by_club().items()}
    avg_strength = {cid: sum(v) / len(v) for cid, v in squad_strength.items()}
    xs = [avg_strength[t["club"]] for t in per_team]
    ys = [t["possession"] for t in per_team]
    match_stats["possession_rank_corr"] = _pearson(xs, ys)
    means = {k: statistics.mean(v) for k, v in match_stats.items() if isinstance(v, list)}
    means["possession_rank_corr"] = match_stats["possession_rank_corr"]
    means["_raw"] = match_stats
    return means


def _pearson(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    vx = sum((x - mx) ** 2 for x in xs) ** 0.5
    vy = sum((y - my) ** 2 for y in ys) ** 0.5
    return cov / (vx * vy) if vx and vy else 0.0


def report(n_matches: int) -> bool:
    results = batch(n_matches)
    agg = aggregate(results)
    baseline = data.epl_baseline()
    all_pass = True
    print(f"\n批量校准（{n_matches} 场, 20 队） vs data/calibration/epl_baseline.csv")
    print(f"{'指标':<24}{'仿真':>10}{'基线区间':>16}{'判定':>6}")
    for metric, (lo, hi) in baseline.items():
        v = agg.get(metric)
        ok = v is not None and lo <= v <= hi
        all_pass &= ok
        print(f"{metric:<24}{v:>10.3f}{f'[{lo}, {hi}]':>16}{'✔' if ok else '✘':>4}")
    return all_pass


def sensitivity() -> None:
    """3 条战术敏感性用例：改参数 → 分布必须显著移动。"""
    n = 400
    seed0 = 31337

    def mean_goals(over_a=None, over_b=None, atk="MCI", dfd="COV"):
        gs = []
        for i in range(n):
            ha = make_team(atk, overrides=over_a)
            aa = make_team(dfd, overrides=over_b)
            r = engine.MatchEngine(ha, aa, seed0 + i).run()
            gs.append(r["home_goals"] + r["away_goals"])
        return statistics.mean(gs)

    def mean_recoveries(over_a, atk="MCI", dfd="COV"):
        out = []
        for i in range(n):
            m = engine.MatchEngine(make_team(atk, overrides=over_a), make_team(dfd), seed0 + i)
            m.run()
            out.append(sum(1 for e in m.events
                           if e["type"] == "ball_recovery" and e["team"] == atk))
        return statistics.mean(out)

    print("\n战术敏感性（每条 = 改参 → 分布显著移动）")
    g0 = mean_goals()
    g1 = mean_goals(over_a={"mentality": "attacking"})
    print(f"1. 心态 balanced→attacking: 总进球 {g0:.2f} → {g1:.2f} "
          f"{'✔' if g1 > g0 + 0.15 else '✘'}")
    r0 = mean_recoveries(None)
    r1 = mean_recoveries({"out": {"counter_press": "on", "press_intensity": "very_high"}})
    print(f"2. 反抢+高压 on/off: 前场夺回 {r0:.1f} → {r1:.1f} "
          f"{'✔' if r1 > r0 + 3 else '✘'}")
    g_low = mean_goals(over_a={"out": {"def_line": "very_low", "press_intensity": "very_low",
                                       "mentality": "defensive"}} if False else
                       {"mentality": "defensive",
                        "out": {"def_line": "very_low", "press_intensity": "very_low"}})
    print(f"3. 基准 vs 低位块: 总进球 {g0:.2f} → {g_low:.2f} "
          f"{'✔' if g_low < g0 - 0.15 else '✘'}")


if __name__ == "__main__":
    n = 1000
    if "--sens" in sys.argv:
        sensitivity()
    else:
        ok = report(n)
        sys.exit(0 if ok else 1)
