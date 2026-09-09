"""战术编译器 v0：战术包(Tactics Package) → SimParams → 球队强度。

docs/02 §八 的可执行版（粗粒度）。编译分两步：
  1. 面板值 → SimParams（查 mentality/instructions 预设，叠加角色/职责偏移）
  2. SimParams + 首发属性 → 五维球队强度
     att 进攻 / def 防守 / mid 中场控制 / press 压迫 / line 防线高度（后两者供引擎事件修正）
"""
from .data import Player, tactic_presets

DUTY_DEPTH = {"de": -4.0, "su": 0.0, "at": 4.0}   # 职责纵深偏移（米，影响 line 修正的代理）


def compile_tactics(pkg: dict, lineup: list[Player]) -> dict:
    """pkg: data/tactics/examples/*.json 结构；lineup: 11 名首发（与槽位顺序无关）。"""
    presets = tactic_presets()
    men = next(p for p in presets["mentality"]["presets"] if p["id"] == pkg["mentality"])
    ins, ins_out = pkg["instructions"]["in"], pkg["instructions"]["out"]

    def opt(iid: str, val: str) -> dict:
        inst = next(i for i in presets["instructions"]["instructions"] if i["id"] == iid)
        return next(o for o in inst["options"] if o["id"] == val)

    # ---- SimParams（v0 只取引擎需要的字段）----
    sp = {
        "mentality": pkg["mentality"],
        "def_line_base_m": float(men["def_line_height_m"])
                           + {"very_low": -8, "low": -4, "standard": 0,
                              "high": 4, "very_high": 8}[ins_out["def_line"]],
        "width_m": float(men["width_m"]),
        "press_intensity": float(men["press_intensity"]),
        "press_trigger_dist_m": {"very_low": 22, "low": 18.5, "standard": 15,
                                 "high": 11.5, "very_high": 8}[ins_out["press_intensity"]],
        "forward_risk_weight": float(men["forward_risk_weight"]),
        "decision_window_s": float(men["decision_window_s"]),
        "buildup_short_bias": {"short": 0.8, "mixed": 0.5, "direct": 0.2}[ins["buildup"]],
        "long_ball_weight": {"short": 0.6, "mixed": 1.0, "direct": 1.8}[ins["buildup"]],
        "counter_press": ins_out["counter_press"] == "on",
        "counter": ins_out["counter"] == "on",
        "offside_trap": ins_out["offside_trap"] == "on",
        "tackling": {"softer": 0.6, "normal": 1.0, "hard": 1.8}[ins_out["tackling"]],
        "tempo_mult": {"slow": 1.2, "standard": 1.0, "fast": 0.8}[ins["tempo"]],
        "roles": {slot: tuple(rc.split(":")) for slot, rc in pkg["roles"].items()},
    }

    # ---- 强度合成 ----
    roles = presets["roles"]["roles"]
    role_by_id = {r["id"]: r for r in roles}
    att = de = mid = press = 0.0
    for p in lineup:
        slot = _slot_of(pkg, p)
        rid, duty = sp["roles"][slot]
        role = role_by_id[rid]
        fit = p.positions.get(_slot_pos(pkg, slot), 0.80)
        # 角色属性适配度：attrs 加权平均（v0 简化为等权）
        adap = (sum(p.attr(a) * w for a, w in role["attrs"].items())
                / max(sum(role["attrs"].values()), 1e-6))
        g = role["group"]
        val = adap * fit
        if g in ("st", "am", "wide"):
            att += val
        elif g in ("dc", "fb", "gk"):
            de += val
        else:
            mid += val
        press += role["defense"]["press"] * fit
    n = len(lineup)
    return {
        "simparams": sp,
        "tackling": sp["tackling"],
        "press_intensity": sp["press_intensity"],
        "counter_press": sp["counter_press"],
        "att": att / max(1, sum(1 for s in sp["roles"]
                                if role_by_id[sp["roles"][s][0]]["group"]
                                in ("st", "am", "wide"))),
        "def": de / max(1, sum(1 for s in sp["roles"]
                               if role_by_id[sp["roles"][s][0]]["group"]
                               in ("dc", "fb", "gk"))),
        "mid": mid / max(1, sum(1 for s in sp["roles"]
                                if role_by_id[sp["roles"][s][0]]["group"]
                                in ("dm", "mc"))),
        "press": press / n,
        "def_line_m": sp["def_line_base_m"],
        "mentality_attack": {"extreme_defensive": 0.55, "defensive": 0.75, "cautious": 0.9,
                             "balanced": 1.0, "positive": 1.12, "attacking": 1.25,
                             "extreme_attacking": 1.4}[pkg["mentality"]],
        "mentality_defend": 2.0 - {"extreme_defensive": 0.55, "defensive": 0.75,
                                   "cautious": 0.9, "balanced": 1.0, "positive": 1.12,
                                   "attacking": 1.25, "extreme_attacking": 1.4}[pkg["mentality"]],
    }


def _slot_of(pkg: dict, p: Player) -> str:
    for slot, pid in pkg["lineup"].items():
        if pid == p.id:
            return slot
    raise KeyError(f"{p.id} 不在 {pkg['id']} 首发中")


def _slot_pos(pkg: dict, slot: str) -> str:
    fm = tactic_presets()["formations"]
    form = next(f for f in fm["formations"] if f["id"] == pkg["formation"])
    return next(s["pos"] for s in form["slots"] if s["id"] == slot)


def auto_pick_lineup(squad: list[Player], formation: str = "4-2-3-1") -> dict[str, str]:
    """无显式战术包时按位置契合度自动选首发（槽位 → 球员 id）。"""
    fm = tactic_presets()["formations"]
    form = next(f for f in fm["formations"] if f["id"] == formation)
    slots = form["slots"]
    pool = list(squad)
    lineup: dict[str, str] = {}
    # GK 先锁，再按（综合能力 × 位置契合）贪心
    for s in sorted(slots, key=lambda s: s["pos"] != "GK"):
        best, best_v = None, -1
        for p in pool:
            # 客串允许（生疏惩罚 0.6），保证任意阵容都有解
            fit = p.positions.get(s["pos"], 0.6 if s["pos"] != "GK" else 0.0)
            overall = sum(p.attrs.values()) / max(len(p.attrs), 1)
            v = overall * fit
            if v > best_v:
                best, best_v = p, v
        lineup[s["id"]] = best.id
        pool.remove(best)
    return lineup
