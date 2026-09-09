"""数据加载：clubs / players / 战术预设库 / 示例战术包 / 校准基线。"""
import csv
import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

POSITIONS = ("GK", "DR", "DL", "DC", "WBR", "WBL", "DM", "MR", "ML",
             "MC", "AMR", "AML", "AMC", "ST")
META_COLS = ["id", "name", "club", "age", "height_cm", "weight_kg",
             "foot_l", "foot_r", "positions"]


@dataclass
class Player:
    id: str
    name: str
    club: str
    attrs: dict = field(default_factory=dict)
    positions: dict = field(default_factory=dict)   # 位置 -> 熟悉度乘数
    foot_l: int = 50
    foot_r: int = 50

    def attr(self, key: str) -> float:
        """归一化属性 ∈ [0,1]；缺省按英超轮换水平 62。"""
        v = self.attrs.get(key)
        return (v if v is not None else 62) / 100.0


def _familiarity(tok: str) -> tuple[str, float]:
    if tok.endswith("*"):
        return tok[:-1], 1.00
    if tok.endswith("+"):
        return tok[:-1], 0.92
    return tok, 0.80


@lru_cache
def clubs() -> dict[str, dict]:
    with open(DATA / "clubs.csv", encoding="utf-8") as f:
        return {r["id"]: r for r in csv.DictReader(f)}


@lru_cache
def players_by_club() -> dict[str, list[Player]]:
    out: dict[str, list[Player]] = {}
    for path in sorted((DATA / "players").glob("*.csv")):
        plist = []
        with open(path, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                pos = {}
                for tok in (r["positions"] or "").split(","):
                    tok = tok.strip()
                    if tok:
                        p, mult = _familiarity(tok)
                        pos[p] = mult
                plist.append(Player(
                    id=r["id"], name=r["name"], club=r["club"],
                    attrs={k: int(v) for k, v in r.items()
                           if k not in META_COLS and k != "traits" and v and v.isdigit()},
                    positions=pos,
                    foot_l=int(r["foot_l"] or 50), foot_r=int(r["foot_r"] or 50)))
        out[path.stem] = plist
    return out


@lru_cache
def tactic_presets() -> dict:
    """data/tactics/ 五份预设库 + 词表。"""
    presets = {}
    for name in ("formations", "roles", "mentality", "instructions", "set_pieces"):
        with open(DATA / "tactics" / f"{name}.json", encoding="utf-8") as f:
            presets[name] = json.load(f)
    return presets


@lru_cache
def load_tactic_package(path: str | Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@lru_cache
def epl_baseline() -> dict[str, tuple[float, float]]:
    with open(DATA / "calibration" / "epl_baseline.csv", encoding="utf-8") as f:
        return {r["metric"]: (float(r["min"]), float(r["max"]))
                for r in csv.DictReader(f)}
