"""TickMatch：25Hz 主循环编排（阶段/死球/进球/出界/扑救）+ 状态流写盘。

规则 v1-lite：出界即时重开（走位收敛后由主罚人出球），无犯规/越位（阶段3 加裁判模块）。
"""
import math
import random
from pathlib import Path

from . import brain, motion
from .brain import (DECIDE_EVERY, Side, decide_carrier, decide_window,
                    formation_target, press_targets)
from ..data import tactic_presets
from .stream import StateWriter
from .world import (DT, GOAL_W, GOAL_X, PITCH_L, PITCH_W, TICKS_PER_MIN, Ball,
                    TPlayer, World, dist)

KICK_CYCLE = int(2.5 / DT)          # 死球最短停留 2.5s
CELEBRATION = int(6 / DT)


class TickMatch:
    def __init__(self, home: dict, away: dict, seed: int, minutes: int = 90,
                 snapshot_every: int = 25):
        self.rng = random.Random(seed)
        self.seed = seed
        self.minutes = minutes
        self.snapshot_every = snapshot_every
        self.total_ticks = minutes * TICKS_PER_MIN
        self.home = home
        self.away = away
        self.presets = tactic_presets()
        self.roles_by_id = {r["id"]: r for r in self.presets["roles"]["roles"]}
        self.w = World()
        self.sides: list[Side] = []
        self.pos_ticks = {0: 0, 1: 0}

    # ------------------------------------------------------------ setup
    def _build_side(self, team_idx: int, club: dict, attack_dir: int) -> Side:
        pkg = club["package"]
        fm = next(f for f in self.presets["formations"]["formations"]
                  if f["id"] == pkg["formation"])
        sp = club["tactics"]["simparams"]
        side = Side(team_idx, attack_dir, fm, sp, {}, {})
        side.role_defs = self.roles_by_id
        side.mentality = pkg["mentality"]
        side.package = pkg
        by_id = club["raw_by_id"]
        for slot, pid in pkg["lineup"].items():
            raw = by_id[pid]
            slot_def = side.slots[slot]
            tp = TPlayer(
                idx=len(self.w.players), pid=pid, team=team_idx, slot=slot,
                pos=slot_def["pos"], is_gk=slot_def["pos"] == "GK",
                attrs=raw.attrs, pos_fam=raw.positions.get(slot_def["pos"], 0.8))
            side.lineup[slot] = tp
            self.w.players.append(tp)
        self.sides.append(side)
        return side

    def kickoff(self, attacking: int) -> None:
        w = self.w
        w.phase = "kickoff"
        b = w.ball
        b.p = [0.0, 0.0, 0.0]
        b.v = [0.0, 0.0, 0.0]
        b.carrier = -1
        b.intended_to = -1
        for p in w.players:
            p.has_ball = False
        side = self.sides[attacking]
        taker = max(side.lineup.values(), key=lambda p: side.slots[p.slot]["x"])
        w.restart = {"kind": "kickoff", "team": attacking, "taker": taker.idx,
                     "until": w.tick + KICK_CYCLE}
        self._emit_phase("kickoff")

    def _emit_phase(self, to: str):
        self.w.emit("match_phase_change", **{"from": self.w.phase, "to": to})

    # ------------------------------------------------------------ main
    def run(self, out_path: Path) -> dict:
        home, away = self.sides[0], self.sides[1]
        w = self.w
        writer = StateWriter(out_path, home_club=self.home["club"],
                             away_club=self.away["club"], seed=self.seed)
        self.kickoff(0)
        for w.tick in range(1, self.total_ticks + 1):
            w.minute = w.tick * DT / 60
            if w.phase in ("open_play",):
                self._tick_open_play()
            else:
                self._tick_restart()
            motion.step_ball(w)
            was_offside_target = w.ball.offside_receiver
            prev_carrier = w.ball.carrier
            motion.try_gain_possession(w)
            if (w.phase == "open_play" and w.ball.carrier >= 0
                    and prev_carrier != w.ball.carrier):
                # 新持球人：决策窗重置（拿球后先带一带/观察）
                w.players[w.ball.carrier].next_decide = w.tick + decide_window(
                    self.sides[w.players[w.ball.carrier].team])
            if (w.phase == "open_play" and w.ball.carrier >= 0
                    and w.ball.carrier == was_offside_target):
                p = w.players[w.ball.carrier]
                w.emit("offside", player=p.pid)
                w.ball.offside_receiver = -1
                self._set_restart("free_kick", 1 - p.team, (p.x, p.y))
            self._resolve_bounds()
            self._ai_manager()
            if w.tick % self.snapshot_every == 0:
                writer.write(w)
            if w.phase == "halftime":
                break
        writer.close(score=w.score)
        return self._summary()

    # ------------------------------------------------------------ open play
    def _tick_open_play(self):
        w = self.w
        b = w.ball
        if b.carrier >= 0:
            self.pos_ticks[w.players[b.carrier].team] += 1
        for side in self.sides:
            ball_xt, _ = side.to_team(b.p[0], b.p[1])
            if w.tick % brain.TARGETS_EVERY == side.team:
                # 越位线帽（动态）：持球时允许压线 +0.5m（留启动跑），无球回撤 −2m（回位纪律）
                depths = sorted((side.dir * q.x
                                 for q in self.sides[1 - side.team].lineup.values()),
                                reverse=True)
                second_last = depths[1] if len(depths) >= 2 else depths[0]
                we_have_ball = b.carrier >= 0 and w.players[b.carrier].team == side.team
                cap = second_last + (0.5 if we_have_ball else -2.0)
                for p in side.lineup.values():
                    if p.idx == b.carrier:
                        continue
                    xt, yt = formation_target(side, p, ball_xt, b.p[1], cap)
                    p.target = side.to_world(xt, yt)
                if cap is not None:
                    brain_side = side
                    from simcore.tick.brain import attack_runs
                    attack_runs(brain_side, w, cap)
                press_targets(side, w)
        # 持球者决策（节流）
        if b.carrier >= 0:
            p = w.players[b.carrier]
            side = self.sides[p.team]
            if w.tick >= p.next_decide:
                p.next_decide = w.tick + decide_window(side)
                decide_carrier(w, side, p, self.rng)
        elif b.intended_to >= 0:
            # 传跑协同 stub：预期接收人迎球跑（阶段3 换成 5Hz 传跑时机匹配）
            rx = w.players[b.intended_to]
            look = 0.45
            rx.target = (b.p[0] + b.v[0] * look, b.p[1] + b.v[1] * look)
        for p in w.players:
            motion.step_player(p)
        self._tackle_check()
        self._gk_save_check()
        # 半场/终场
        if w.minute >= self.minutes / 2 and w.phase == "open_play" and not self._half_done:
            self._half_done = True
            self._emit_phase("halftime")
            w.phase = "halftime"
            for p in w.players:
                p.stamina = min(1.0, p.stamina + 0.25)
            self.kickoff(1)
        # 中场后球权交换开球由 kickoff(1) 处理

    _half_done = False

    # ------------------------------------------------------------ restarts
    def _tick_restart(self):
        w = self.w
        r = w.restart
        if r.get("taker") is None:      # 庆祝等过渡态，由 _resolve_bounds 接管
            return
        for side in self.sides:
            ball_xt, _ = side.to_team(w.ball.p[0], w.ball.p[1])
            if w.tick % brain.TARGETS_EVERY == side.team:
                for p in side.lineup.values():
                    xt, yt = formation_target(side, p, ball_xt, w.ball.p[1])
                    # 死球时整体回撤，不越位压迫
                    xt -= side.dir * 4
                    p.target = side.to_world(xt, yt)
        if r.get("taker") is not None:
            taker = w.players[r["taker"]]
            taker.target = (w.ball.p[0], w.ball.p[1])
            taker.action = "set_piece_ready"
        for p in w.players:
            motion.step_player(p)
        if w.tick >= r["until"]:
            self._take_restart()

    def _take_restart(self):
        w = self.w
        r = w.restart
        kind, team = r["kind"], r["team"]
        w.phase = "open_play"
        self._emit_phase("open_play")
        w.restart = {}
        if kind == "kickoff":
            taker = w.players[r["taker"]]
            mate = min((p for p in self.sides[team].lineup.values()
                        if p.idx != taker.idx and not p.is_gk),
                       key=lambda p: dist(p.x, p.y, taker.x, taker.y))
            brain.execute_pass(w, self.sides[team], taker, mate, self.rng, intent="safe")
            return
        taker = w.players[r["taker"]]
        side = self.sides[team]
        mates = [p for p in side.lineup.values() if p.idx != taker.idx
                 and not brain.is_offside(side, p, w.ball.p[0],
                                          [q for q in w.players if q.team != team])]
        if kind == "corner":
            box = [p for p in mates if side.dir * p.x > GOAL_X - 18 and abs(p.y) < 22]
            mate = self.rng.choice(box) if box else self.rng.choice(mates)
            brain.execute_pass(w, side, taker, mate, self.rng, intent="cross")
        elif kind == "goal_kick":
            safe = max(mates, key=lambda m: brain.lane_openness(w, taker, m))
            brain.execute_pass(w, side, taker, safe, self.rng, intent="safe")
        else:  # throw_in / free_kick
            best = max(mates, key=lambda m: brain.lane_openness(w, taker, m)
                       + side.dir * m.x * 0.02)
            brain.execute_pass(w, side, taker, best, self.rng, intent="safe")

    def _set_restart(self, kind: str, team: int, at: tuple):
        w = self.w
        w.ball.p = [at[0], at[1], 0.0]
        w.ball.v = [0.0, 0.0, 0.0]
        w.ball.spin = [0.0, 0.0, 0.0]
        w.ball.carrier = -1
        w.ball.shot_outcome = ""
        w.ball.offside_receiver = -1
        for p in w.players:
            p.has_ball = False
        side = self.sides[team]
        pool = list(side.lineup.values())
        if kind == "goal_kick":
            taker = next(p for p in pool if p.is_gk)
        else:
            taker = min(pool, key=lambda p: dist(p.x, p.y, at[0], at[1]))
        for q in pool:
            if q.idx == taker.idx:
                continue
            d = dist(q.x, q.y, at[0], at[1])
            if d < 6:   # 站位不让主罚人被贴脸
                q.target = (q.x - side.dir * 8, q.y)
        w.phase = kind if kind in ("throw_in", "corner", "goal_kick") else "free_kick"
        self._emit_phase(w.phase)
        w.restart = {"kind": kind, "team": team, "taker": taker.idx,
                     "until": w.tick + KICK_CYCLE}
        w.emit("set_piece_awarded", kind=kind, team=side.team,
               origin=[round(at[0], 1), round(at[1], 1)])

    # ------------------------------------------------------------ resolutions
    def _resolve_bounds(self):
        w = self.w
        b = w.ball
        if w.phase == "goal_celebration":
            if w.tick >= w.restart.get("until", 0):
                self.kickoff(w.restart["team"])
            return
        if w.phase != "open_play" or b.carrier >= 0:
            return
        x, y, z = b.p
        # 进球：只有判定为 goal 的射门过线才算（xG 语义硬守恒；其余过线=球门球）
        if abs(x) > GOAL_X and abs(y) < GOAL_W / 2 and z < 2.44 \
                and b.shot_outcome == "goal":
            scoring = 0 if x > 0 else 1          # 主队攻 +x
            w.score[scoring] += 1
            scorer, xg = self._last_shot_by(scoring)
            w.emit("goal", scorer=scorer or "", assister=None,
                   phase="open_play", xg=xg or 0.0)
            self._emit_phase("goal_celebration")
            w.phase = "goal_celebration"
            w.restart = {"kind": "kickoff", "team": 1 - scoring, "taker": None,
                         "until": w.tick + CELEBRATION}
            return
        # 出界
        if abs(y) > PITCH_W / 2:
            team = 1 - b.last_touch_team if b.last_touch_team in (0, 1) else 0
            self._set_restart("throw_in", team, (max(-GOAL_X + 2, min(GOAL_X - 2, x)),
                                                 (PITCH_W / 2 - 0.3) * (1 if y > 0 else -1)))
        elif abs(x) > GOAL_X:
            defending = 1 if x > 0 else 0        # +x 球门由客队防守
            if b.last_touch_team == defending:
                attacking = 1 - defending
                cx = (GOAL_X - 0.3) * (1 if x > 0 else -1)
                self._set_restart("corner", attacking,
                                  (cx, (PITCH_W / 2 - 0.3) * (1 if y >= 0 else -1)))
            else:
                self._set_restart("goal_kick", defending,
                                  ((GOAL_X - 6) * (1 if x > 0 else -1),
                                   9 * (1 if y >= 0 else -1)))

    def _last_shot_by(self, team: int):
        for e in reversed(self.w.events):
            if e["type"] == "shot":
                shooter = e["shooter"]
                p = next((q for q in self.w.players if q.pid == shooter), None)
                if p and p.team == team:
                    return shooter, e["xg"]
        return None, None

    def _tackle_check(self):
        """抢断决斗（阶段1 显式决算，借鉴 RoboCup 2D tackle）：最近防守人尝试，含犯规分支。"""
        w = self.w
        b = w.ball
        if b.carrier < 0:
            return
        car = w.players[b.carrier]
        if car.is_gk or w.tick < car.stumble_until:
            return
        dside = self.sides[1 - car.team]
        best_d, bd = None, 1e9
        for d in dside.lineup.values():
            if d.is_gk or w.tick < d.tackle_cd:
                continue
            dd = dist(d.x, d.y, car.x, car.y)
            if dd < 2.0 and dd < bd:
                best_d, bd = d, dd
        if best_d is None:
            return
        d = best_d
        d.tackle_cd = w.tick + 75           # ~1.1s 内不再尝试
        pw = max(0.12, min(0.80, 0.42 + 1.1 * (d.attr("tackling")
                                               - car.attr("dribbling") * 0.6
                                               - car.attr("balance") * 0.4)))
        if self.rng.random() < pw:
            # 抢断成功：球弹地争抢
            w.emit("duel", subtype="tackle", attacker=car.pid, defender=d.pid,
                   winner=d.pid, foul=False, card="none")
            xt_gain = (1 if d.team == 0 else -1) * b.p[0] + 52.5   # 得球方 team frame 纵深
            w.emit("turnover",
                   possession_from=self.home["club"] if car.team == 0 else self.away["club"],
                   possession_to=self.home["club"] if d.team == 0 else self.away["club"],
                   zone="attacking_third" if xt_gain > 70 else
                        ("midfield" if xt_gain > 35 else "defending_third"),
                   cause="tackle")
            b.carrier = -1
            car.has_ball = False
            car.stumble_until = w.tick + 25
            b.last_touch_team = d.team
            b.intended_to = -1
            ang = self.rng.uniform(0, 2 * math.pi)
            b.v = [math.cos(ang) * 5, math.sin(ang) * 5, 0.5]
            d.action = "tackle"
            car.action = "fall"
        else:
            pf = 0.13 * dside.sp.get("tackling", 1.0) * (0.7 + d.attr("aggression"))
            if self.rng.random() < pf:
                w.emit("duel", subtype="tackle", attacker=car.pid, defender=d.pid,
                       winner=car.pid, foul=True, card="none")
                w.emit("foul", player=d.pid, victim=car.pid, danger="中")
                if self.rng.random() < 0.14 * (0.7 + d.attr("aggression")):
                    w.emit("card", player=d.pid, type="yellow", reason="tackle")
                self._set_restart("free_kick", car.team, (car.x, car.y))

    def _gk_save_check(self):
        """结果已由 execute_shot 判定（goal/saved/off_target）：物理只演出。
        仅 outcome=saved 的射门在到达门线前由门将终结。"""
        w = self.w
        b = w.ball
        if b.carrier >= 0 or b.shot_outcome != "saved":
            return
        for side in self.sides:
            gk = next(p for p in side.lineup.values() if p.is_gk)
            gxw = -side.dir * GOAL_X      # 本方球门
            d = dist(gk.x, gk.y, b.p[0], b.p[1])
            toward_goal = (b.p[0] - gxw) * b.v[0] < 0
            if d < 6.0 and toward_goal:
                handled = "caught" if self.rng.random() < gk.attr("handling") else "parried"
                w.emit("save", gk=gk.pid, shot_ref=None, handled=handled)
                gk.action = "gk_dive"
                if handled == "caught":
                    b.carrier = gk.idx
                    b.v = [0, 0, 0]
                    gk.has_ball = True
                    b.last_touch_team = side.team
                else:
                    # 半击球解围：向边路/前场打出去，避免禁区弹球连射
                    away_dir = -side.dir
                    ang = self.rng.uniform(-0.9, 0.9)
                    spd = self.rng.uniform(9, 14)
                    b.v = [away_dir * abs(math.cos(ang)) * spd,
                           math.sin(ang) * spd * 1.4, 2.5]
                    b.last_touch_team = side.team
                b.shot_xg = 0.0
                b.shot_fin = 0.6
                b.shot_outcome = ""
                return

    # ------------------------------------------------------------ AI 经理 v0
    MENTALITY_LADDER = ["extreme_defensive", "defensive", "cautious", "balanced",
                        "positive", "attacking", "extreme_attacking"]

    def _ai_manager(self):
        w = self.w
        if w.minute < 60 or w.phase not in ("open_play",):
            return
        if not hasattr(self, "_ai_state"):
            self._ai_state = {0: {"steps": 0, "subs": 0, "next": 60},
                              1: {"steps": 0, "subs": 0, "next": 70}}
        for ti, st in self._ai_state.items():
            if w.minute < st["next"]:
                continue
            side = self.sides[ti]
            diff = w.score[ti] - w.score[1 - ti]
            if diff < 0 and st["steps"] < 2:
                # 落后：心态进一步 + 前压
                cur = self.MENTALITY_LADDER.index(side.mentality)
                new = self.MENTALITY_LADDER[min(6, cur + 1 + st["steps"])]
                st["steps"] += 1
                st["next"] = w.minute + 8
                self._apply_mentality(side, new)
                w.emit("manager_decision", team=side.team, kind="mentality",
                       detail=f" mentality -> {new}",
                       reason_tag=f"{w.clock()} 落后，主帅押上进攻")
            elif diff >= 2 and w.minute >= 75 and st["steps"] > -1:
                cur = self.MENTALITY_LADDER.index(side.mentality)
                new = self.MENTALITY_LADDER[max(0, cur - 1)]
                st["steps"] -= 1
                st["next"] = w.minute + 10
                self._apply_mentality(side, new)
                w.emit("manager_decision", team=side.team, kind="mentality",
                       detail=f" mentality -> {new}",
                       reason_tag=f"{w.clock()} 大比分领先，控制节奏")
            elif st["subs"] < 2:
                # 换下体能最低的场上球员（同位置最优替补）
                self._make_sub(ti, st)
                st["subs"] += 1
                st["next"] = w.minute + 6

    def _apply_mentality(self, side, new_id):
        from ..data import tactic_presets
        men = next((p for p in tactic_presets()["mentality"]["presets"]
                    if p["id"] == new_id), None)
        side.mentality = new_id
        if men:
            side.sp["def_line_base_m"] = float(men["def_line_height_m"])
            side.sp["press_intensity"] = float(men["press_intensity"])
            side.sp["decision_window_s"] = float(men["decision_window_s"])
            side.sp.setdefault("tempo", {})["forward_risk_weight"] = float(men["forward_risk_weight"])
            side.sp["width_m"] = float(men["width_m"])
        side.line_m = float(men["def_line_height_m"]) if men else side.line_m

    def _make_sub(self, ti, st):
        w = self.w
        club = self.home if ti == 0 else self.away
        raw = club["raw_by_id"]
        on_ids = {p.pid for p in self.sides[ti].lineup.values()}
        bench = [p for pid, p in raw.items() if pid not in on_ids]
        if not bench:
            return
        # 体能最低的非门将场上球员
        out_p = min((p for p in self.sides[ti].lineup.values() if not p.is_gk),
                    key=lambda p: p.stamina)
        if out_p.stamina > 0.72:
            return
        same = [b for b in bench if out_p.pos in b.positions]
        cand = max(same or bench, key=lambda b: sum(b.attrs.values()) / max(len(b.attrs), 1))
        old_pid = out_p.pid
        out_p.pid, out_p.attrs, out_p.stamina = cand.id, cand.attrs, 0.92
        out_p.action = "idle"
        w.emit("substitution", team=club["club"], out=old_pid, **{"in": cand.id},
               minute=int(w.minute), reason="fatigue")

    # ------------------------------------------------------------ summary
    def _summary(self) -> dict:
        w = self.w
        ev = w.events
        shots = [e for e in ev if e["type"] == "shot"]
        passes = [e for e in ev if e["type"] == "pass_attempt"]
        completed = sum(1 for e in ev if e["type"] == "pass_completed")
        total_pos = max(sum(self.pos_ticks.values()), 1)
        return {
            "score": tuple(w.score), "seed": self.seed, "ticks": self.total_ticks,
            "shots": len(shots), "goals": sum(1 for e in ev if e["type"] == "goal"),
            "passes": len(passes),
            "pass_acc": completed / max(len(passes), 1),
            "xg": round(sum(e.get("xg", 0) for e in shots), 2),
            "fouls": sum(1 for e in ev if e["type"] == "foul"),
            "yellows": sum(1 for e in ev if e["type"] == "card"),
            "tackles": sum(1 for e in ev if e["type"] == "duel"),
            "possession": [self.pos_ticks[0] / total_pos, self.pos_ticks[1] / total_pos],
            "avg_stamina": sum(p.stamina for p in w.players) / 22,
        }


def play_tick_match(home: dict, away: dict, seed: int, out_path: Path,
                    minutes: int = 90, snapshot_every: int = 25) -> dict:
    """入口：home/away 为 simcore.team.make_team 的产物（含 raw_by_id）。"""
    m = TickMatch(home, away, seed, minutes, snapshot_every)
    m._build_side(0, home, +1)
    m._build_side(1, away, -1)
    return m.run(out_path)
