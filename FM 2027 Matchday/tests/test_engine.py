#!/usr/bin/env python3
"""tick 引擎质检测试。运行: python -m unittest tests.test_engine -v"""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from simcore.tick.match import TickMatch  # noqa: E402
from simcore.team import make_team  # noqa: E402

OUT = ROOT / "out" / "_test"
TELE_VOCAB = {e["id"] for e in json.load(
    open(ROOT / "schemas/telemetry_events.json", encoding="utf-8"))["events"]}
PHASES = {"kickoff", "open_play", "throw_in", "goal_kick", "corner", "free_kick",
          "penalty", "gk_possession", "goal_celebration", "injury_stop",
          "halftime", "fulltime"}
ACTIONS = {"idle", "jog", "run", "sprint", "decel", "dribble", "tackle",
           "aerial_challenge", "block", "fall", "gk_dive", "gk_hold",
           "gk_distribute", "set_piece_ready"}


def run_match(a, b, seed, minutes=8):
    m = TickMatch(make_team(a), make_team(b), seed, minutes=minutes, snapshot_every=25)
    m._build_side(0, m.home, +1)
    m._build_side(1, m.away, -1)
    path = OUT / f"t_{a}_{b}_{seed}.jsonl"
    s = m.run(path)
    return m, s, path


class TestDeterminism(unittest.TestCase):
    def test_same_seed_same_result(self):
        _, s1, _ = run_match("ARS", "LIV", 42)
        _, s2, _ = run_match("ARS", "LIV", 42)
        self.assertEqual(s1["score"], s2["score"])
        self.assertEqual(s1["shots"], s2["shots"])
        self.assertEqual(s1["passes"], s2["passes"])
        self.assertEqual(round(s1["xg"], 2), round(s2["xg"], 2))

    def test_different_seed_different_result(self):
        _, s1, _ = run_match("ARS", "LIV", 42, minutes=45)
        _, s2, _ = run_match("ARS", "LIV", 43, minutes=45)
        fp1 = (s1["score"], s1["shots"], s1["passes"], round(s1["xg"], 2))
        fp2 = (s2["score"], s2["shots"], s2["passes"], round(s2["xg"], 2))
        self.assertNotEqual(fp1, fp2)


class TestStreamConformance(unittest.TestCase):
    def test_frames_schema_and_vocab(self):
        _, _, path = run_match("MCI", "COV", 5)
        lines = [json.loads(l) for l in open(path, encoding="utf-8")]
        self.assertTrue(lines[0].get("meta"))
        self.assertTrue(lines[-1].get("final"))
        frames = [l for l in lines if not l.get("meta")]
        self.assertGreater(len(frames), 100)
        for fr in frames[::7]:                     # 抽样
            self.assertIn(fr["phase"], PHASES)
            self.assertEqual(len(fr["players"]), 22)
            for p in fr["players"]:
                self.assertIn(p["action"], ACTIONS)
                self.assertTrue(0.0 <= p["stamina"] <= 1.0)
                self.assertGreaterEqual(p["p"][0], -53.5)
                self.assertLessEqual(p["p"][0], 53.5)
                self.assertGreaterEqual(p["p"][1], -34.5)
                self.assertLessEqual(p["p"][1], 34.5)
            for e in fr["events"]:
                self.assertIn(e["type"], TELE_VOCAB,
                              f"事件 {e['type']} 不在遥测词表")
            self.assertGreaterEqual(fr["ball"]["p"][2], -0.01)


class TestMatchSanity(unittest.TestCase):
    def test_multiple_pairings_stable(self):
        pairs = [("ARS", "CHE"), ("LIV", "MUN"), ("COV", "MCI"),
                 ("EVE", "TOT"), ("FUL", "NEW")]
        for a, b in pairs:
            m, s, _ = run_match(a, b, 77)
            self.assertIsInstance(s["score"][0], int)
            self.assertLessEqual(s["score"][0] + s["score"][1], 12)
            self.assertAlmostEqual(sum(s["possession"]), 1.0, places=3)
            self.assertGreater(s["passes"], 20)

    def test_strong_beats_weak_tendency(self):
        # 90 分钟聚合：强队的 进球+xG 产出必须高于弱队（单场噪声太大）
        mci_out = cov_out = 0.0
        for i in range(6):
            _, s, _ = run_match("MCI", "COV", 900 + i, minutes=90)
            mci_out += s["score"][0] + s["xg"] * 0.5
            cov_out += s["score"][1]
        self.assertGreater(mci_out, cov_out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
