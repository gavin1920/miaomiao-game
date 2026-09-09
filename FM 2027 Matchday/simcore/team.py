"""把 club id 组装成引擎可用的队伍字典（默认战术包自动生成）。"""
from pathlib import Path

from . import data
from .data import Player, clubs, load_tactic_package, players_by_club
from .tactics import auto_pick_lineup, compile_tactics

EXAMPLES = Path(__file__).resolve().parent.parent / "data/tactics/examples"


def assign_roles(formation: str) -> dict[str, str]:
    """按槽位规则给阵型配默认角色（4-2-3-1 专用映射之外阵型也能用）。"""
    fm = tactic_presets()["formations"]
    form = next(f for f in fm["formations"] if f["id"] == formation)
    out = {}
    for s in form["slots"]:
        pos = s["pos"]
        if pos == "GK":
            out[s["id"]] = "GK:de"
        elif pos in ("DC",):
            out[s["id"]] = "CD:de"
        elif pos in ("DL", "DR"):
            out[s["id"]] = "FB:su"
        elif pos in ("WBL", "WBR"):
            out[s["id"]] = "WB:su"
        elif pos == "DM":
            out[s["id"]] = "DLP:de"
        elif pos in ("ML", "MR"):
            out[s["id"]] = "W:su"
        elif pos in ("AML", "AMR"):
            out[s["id"]] = "W:at"
        elif pos == "AMC":
            out[s["id"]] = "APa:at"
        elif pos == "MC":
            out[s["id"]] = "ME:su"
        elif pos == "ST":
            out[s["id"]] = "AF:at"
        else:
            out[s["id"]] = "ME:su"
    return out


def default_package(club_id: str) -> dict:
    """ARS 用示例包；其余俱乐部自动生成 4-2-3-1 平衡包（阵容按契合度选）。"""
    path = EXAMPLES / f"{club_id}_4231_high_press.json"
    if path.exists():
        return load_tactic_package(path)
    squad = players_by_club()[club_id]
    lineup = auto_pick_lineup(squad)
    return {
        "id": f"{club_id}_auto_4231", "club": club_id,
        "name": f"{clubs()[club_id]['name']} 默认 4-2-3-1",
        "formation": "4-2-3-1", "mentality": "balanced",
        "instructions": {
            "in": {"width": "standard", "buildup": "mixed", "tempo": "standard",
                   "crossing": "mixed", "final_third_play": "mixed",
                   "short_pass_chains": "off", "time_wasting": "off"},
            "out": {"def_line": "standard", "def_width": "standard",
                    "press_intensity": "standard", "press_trigger": "midfield",
                    "tackling": "normal", "offside_trap": "off",
                    "counter_press": "off", "counter": "on",
                    "gk_distribution": "mixed", "press_gk": "off"}},
        "roles": {s: "GK:de" if s == "GK" else
                  ("CD:de" if s.startswith("DC") else
                   ("FB:su" if s in ("DL", "DR") else
                    ("DLP:de" if s.startswith("DM") else
                     ("W:at" if s in ("AML", "AMR") else
                      ("APa:at" if s == "AMC" else "AF:at")))))
                  for s in lineup},
        "lineup": lineup,
        "set_pieces": {"corner_atk": "front_post_crash", "corner_def": "zonal_mixed",
                       "fk_near": "direct_shot", "fk_deep": "long_ball",
                       "throw_in": "quick_throw"},
        "player_overrides": [],
        "notes": "auto: 占位默认包，批测用",
    }


def make_team(club_id: str, package: dict | None = None,
              overrides: dict | None = None) -> dict:
    pkg = package or default_package(club_id)
    if overrides:  # 敏感性测试/比赛日调整：直接改面板值再编译
        if "formation" in overrides and overrides["formation"] != pkg["formation"]:
            pkg = {**pkg, "formation": overrides["formation"],
                   "roles": assign_roles(overrides["formation"])}
        pkg = {**pkg, "mentality": overrides.get("mentality", pkg["mentality"]),
               "instructions": {
                   "in": {**pkg["instructions"]["in"], **overrides.get("in", {})},
                   "out": {**pkg["instructions"]["out"], **overrides.get("out", {})}}}
    by_id = {p.id: p for p in players_by_club()[club_id]}
    lineup_ids = pkg["lineup"]
    missing = [pid for pid in lineup_ids.values() if pid not in by_id]
    if missing:
        raise KeyError(f"{club_id}: 首发球员不在数据库 {missing}")
    lineup = {slot: by_id[pid] for slot, pid in lineup_ids.items()}
    team = {"club": club_id, "name": clubs()[club_id]["name"],
            "players": lineup, "package": pkg, "raw_by_id": by_id}
    team["tactics"] = compile_tactics(pkg, list(lineup.values()))
    return team
