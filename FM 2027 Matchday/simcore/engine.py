"""回合制比赛引擎 v0（确定性，粗粒度）。

模型：90+补时 分钟级循环。每分钟：
  1. 中场争夺决定控球方（control = mid × 心态/节奏修正）
  2. 控球方按创造率产生机会（att vs 对手 def，战术/角色调制机会类型分布）
  3. 每次机会采样 xG → 完成 = xG × 终结修正（finishing vs GK）→ 进球/射正/偏出
  4. 伴随事件：传球成功数（→传球成功率）、角球、犯规/黄牌、反抢夺回
校准旋钮集中在 TUNING（对照 data/calibration/epl_baseline.csv 调）。
"""
import random

from .data import Player

TUNING = {
    "minutes": 90,
    "chance_base_per_min": 0.135,   # 场均射门 ≈ 0.135×2×90 / 2 队 ≈ 12
    "att_def_elasticity": 1.35,     # att/def 比对创造率的弹性
    "xg_mean": 0.165,               # 机会平均基础 xG（×类型乘数×采样 ≈ 0.21/射门）
    "xg_on_target_share": 0.36,     # 射正占射门比
    "finishing_gain": 0.55,         # finishing 对转化率的增益幅度
    "gk_gain": 0.45,
    "passes_per_min": 9.5,          # 场均传球基数（两队合计 ≈ 850）
    "pass_acc_base": 0.815,
    "pass_acc_buildup": 0.035,      # 短传偏向对成功率的抬升
    "pass_acc_press": 0.055,        # 对手逼抢对成功率的压制
    "corner_per_crossish_chance": 0.35,
    "foul_base_per_min": 0.24,      # 场均犯规 ≈ 11（两队）
    "yellow_per_foul": 0.20,
    "counter_press_recovery": 0.35, # 反抢开 → 前场夺回加成
    "highline_throughball": 0.012,  # 高线 vs 速度前锋：每分钟被打身后加成基数
    "home_advantage": 0.0,          # v0 无主客场
}

CHANCE_TYPES = {  # (权重, xG 乘数)：角色组合调制
    "open_play": 0.52, "box_move": 0.24, "counter": 0.10,
    "set_piece": 0.08, "long_shot": 0.06,
}
TYPE_XG_MULT = {"open_play": 1.0, "box_move": 1.15, "counter": 1.25,
                "set_piece": 1.35, "long_shot": 0.30}


class MatchEngine:
    def __init__(self, home: dict, away: dict, seed: int):
        """home/away: {'club', 'name', 'players': {slot: Player}, 'tactics': compile_tactics 输出}"""
        self.home, self.away = home, away
        self.rng = random.Random(seed)
        self.seed = seed
        self.events: list[dict] = []
        self.minute = 0

    # ------------------------------------------------------------------ utils
    def _fins(self, side, key):
        return side["players"][key]

    def _top(self, side, attr, n=3):
        return max((p.attr(attr) for p in side["players"].values()), default=0.62)

    def _avg(self, side, attr):
        return sum(p.attr(attr) for p in side["players"].values()) / 11

    # ------------------------------------------------------------------ match
    def run(self) -> dict:
        t = TUNING
        for self.minute in range(1, t["minutes"] + 1):
            atk, dfd = self._pick_attacker()
            self._play_minute(atk, dfd)
        return self._summary()

    def _pick_attacker(self):
        h, a = self.home, self.away
        hc = h["tactics"]["mid"] * h["tactics"]["mentality_attack"] ** 0.3
        ac = a["tactics"]["mid"] * a["tactics"]["mentality_attack"] ** 0.3
        # logistic 平方：放大中控差信号（压过分钟级二项噪声）
        p_home = (hc / ac) ** 2 / (1 + (hc / ac) ** 2)
        return (h, a) if self.rng.random() < p_home else (a, h)

    def _play_minute(self, atk, dfd):
        t = TUNING
        ta, td = atk["tactics"], dfd["tactics"]
        # ---- 机会创造 ----
        ratio = (ta["att"] * ta["mentality_attack"]) / (td["def"] * td["mentality_defend"])
        lam = t["chance_base_per_min"] * ratio ** t["att_def_elasticity"]
        # 高线风险：防守方防线高 + 进攻方有速度型前锋 → 被打身后（counter 型机会）
        pace_top = self._top(atk, "pace")
        if td["def_line_m"] >= 42 and pace_top > 0.82:
            lam += t["highline_throughball"] * (pace_top - 0.82) * 40
        if self.rng.random() >= lam:
            self._filler_events(atk, dfd)
            return
        # ---- 机会类型 ----
        weights = dict(CHANCE_TYPES)
        if ta["simparams"]["counter"] and self.rng.random() < 0.35:
            weights["counter"] *= 3.0
        weights["set_piece"] *= (1.4 if td["tackling"] > 1.2 else 1.0)
        xs = list(weights)
        ws = [weights[x] for x in xs]
        ctype = self.rng.choices(xs, ws)[0]
        # ---- xG 与终结 ----
        xg = t["xg_mean"] * TYPE_XG_MULT[ctype] * self.rng.uniform(0.35, 2.2)
        finisher = self._pick_shooter(atk, ctype)
        fin = finisher.attr("finishing") * 0.6 + finisher.attr("composure") * 0.4
        gk_stop = self._top(dfd, "reflexes") * t["gk_gain"]
        on_target = self.rng.random() < t["xg_on_target_share"] + (fin - 0.62) * 0.3
        # xG 语义：xg ≈ 该次射门进球概率；条件在射正上，转化 = xg / 射正占比
        goal = False
        if on_target:
            cond = (xg / t["xg_on_target_share"]) \
                * (1 + t["finishing_gain"] * (fin - 0.62) * 2) \
                * (1 - gk_stop * 0.3)
            goal = self.rng.random() < min(0.92, cond)
        outcome = "goal" if goal else ("on_target" if on_target else
                                       ("blocked" if self.rng.random() < 0.18 else "off_target"))
        self.events.append({
            "type": "shot", "minute": self.minute, "team": atk["club"],
            "player": finisher.id, "chance_type": ctype, "xg": round(xg, 3),
            "outcome": outcome,
        })
        if outcome == "goal":
            self.events.append({"type": "goal", "minute": self.minute,
                                "team": atk["club"], "scorer": finisher.id,
                                "phase": "set_piece" if ctype == "set_piece" else "open_play"})
        self._filler_events(atk, dfd, chance=True)

    def _pick_shooter(self, atk, ctype) -> Player:
        pool = list(atk["players"].values())
        weights = []
        for p in pool:
            w = p.attr("finishing") + p.attr("off_the_ball") * 0.5
            if ctype == "set_piece":
                w = p.attr("jumping") + p.attr("heading") * 0.5
            if ctype == "long_shot":
                w = p.attr("long_shots") * 1.5
            weights.append(max(w, 0.05))
        return self.rng.choices(pool, weights)[0]

    def _filler_events(self, atk, dfd, chance=False):
        """每分钟伴随的传球/角球/犯规/牌/反抢事件（驱动统计指标）。"""
        t = TUNING
        ta, td = atk["tactics"], dfd["tactics"]
        acc = (t["pass_acc_base"] + t["pass_acc_buildup"] * ta["simparams"]["buildup_short_bias"]
               - t["pass_acc_press"] * (td["press_intensity"] / 5) * 0.6)
        acc = min(0.93, max(0.62, acc))
        n_pass = t["passes_per_min"] * (0.85 + 0.3 * self.rng.random())
        # 控制力强的队传导更多（也算入控球率）
        n_pass *= (ta["mid"] / td["mid"]) ** 0.9
        ok = round(n_pass * acc)
        self.events.append({"type": "passes", "minute": self.minute, "team": atk["club"],
                            "attempted": round(n_pass), "completed": ok})
        if chance and self.rng.random() < t["corner_per_crossish_chance"]:
            self.events.append({"type": "corner", "minute": self.minute, "team": atk["club"]})
        foul_p = t["foul_base_per_min"] * 0.5 * td["tackling"] ** 0.8
        if self.rng.random() < foul_p:
            fouler = self.rng.choice(list(dfd["players"].values()))
            ev = {"type": "foul", "minute": self.minute, "team": dfd["club"], "player": fouler.id}
            self.events.append(ev)
            if self.rng.random() < t["yellow_per_foul"] * (0.8 + fouler.attr("aggression")):
                self.events.append({"type": "card", "minute": self.minute,
                                    "team": dfd["club"], "player": fouler.id, "card": "yellow"})
        if ta["simparams"]["counter_press"] and self.rng.random() < t["counter_press_recovery"] * 0.2:
            self.events.append({"type": "ball_recovery", "minute": self.minute,
                                "team": atk["club"], "source": "counter_press"})

    # ------------------------------------------------------------------ stats
    def _summary(self) -> dict:
        s = {"home": self.home["club"], "away": self.away["club"], "seed": self.seed,
             "events": self.events}
        for key, club in (("home", self.home), ("away", self.away)):
            evs = [e for e in self.events if e.get("team") == club["club"]]
            shots = [e for e in evs if e["type"] == "shot"]
            s[f"{key}_goals"] = sum(1 for e in shots if e["outcome"] == "goal")
            s[f"{key}_shots"] = len(shots)
            s[f"{key}_sot"] = sum(1 for e in shots if e["outcome"] in ("goal", "on_target"))
            s[f"{key}_xg"] = round(sum(e["xg"] for e in shots if e["outcome"] == "goal") +
                                   sum(e["xg"] for e in shots if e["outcome"] != "goal"), 2)
        passes = {"home": [0, 0], "away": [0, 0]}
        for e in self.events:
            if e["type"] == "passes":
                passes["home" if e["team"] == self.home["club"] else "away"][0] += e["attempted"]
                passes["home" if e["team"] == self.home["club"] else "away"][1] += e["completed"]
        th, ah = passes["home"], passes["away"]
        s["home_pass_acc"] = th[1] / max(th[0], 1)
        s["away_pass_acc"] = ah[1] / max(ah[0], 1)
        s["home_possession"] = th[0] / max(th[0] + ah[0], 1)
        s["home_corners"] = sum(1 for e in self.events
                                if e["type"] == "corner" and e["team"] == self.home["club"])
        s["away_corners"] = sum(1 for e in self.events
                                if e["type"] == "corner" and e["team"] == self.away["club"])
        s["fouls"] = sum(1 for e in self.events if e["type"] == "foul")
        s["yellows"] = sum(1 for e in self.events if e["type"] == "card")
        s["score"] = (s["home_goals"], s["away_goals"])
        return s
