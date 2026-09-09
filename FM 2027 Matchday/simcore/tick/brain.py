"""决策层（阶段 1 启发式）。

目标：让比赛"看得见、像足球"——阵型形状跟球移动、持球按 射门/传球/盘带 粗启发式出球。
阶段 3 将把 decide_carrier 替换为效用评分（P(成功)×V(结果)×战术权重 + 噪声），
跑位替换为角色行为包 + 传跑协同；接口（team_targets/decide_carrier）保持不变。

坐标约定：team frame —— 主队进攻 +x（本方球门 x=-52.5），客队镜像。
"""
import math
import random

from .motion import CONTROL_RADIUS
from .world import GOAL_W, GOAL_X, PITCH_L, PITCH_W, TPlayer, World, dist

DECIDE_EVERY = 25       # 默认决策窗 ≈ 1.0s（实际按心态 decision_window_s 换算）
TARGETS_EVERY = 15      # 跑位目标刷新 ≈ 0.6s
BASE_LINE_M = 37.0      # formations 锚点为"平衡"心态基准（对应 37m 防线）


class Side:
    """一队的战术上下文（由 match.py 用战术包构建）。"""

    def __init__(self, team_idx: int, attack_dir: int, formation: dict,
                 sp: dict, lineup: dict, roster: dict):
        self.team = team_idx
        self.dir = attack_dir            # +1 / -1
        self.sp = sp                     # compile_tactics 输出的 simparams 子集
        self.slots = {s["id"]: s for s in formation["slots"]}
        self.lineup = lineup             # slot -> TPlayer
        self.roster = roster             # pid -> Player（原始属性）
        self.width_m = sp.get("width_m", 38.0)
        self.line_m = sp.get("def_line_base_m", 37.0)
        self.role_of = {slot: (tuple(rc.split(":")) if isinstance(rc, str) else tuple(rc))
                        for slot, rc in sp.get("roles", {}).items()}
        self.role_defs = None            # roles.json 查表，match.py 注入

    # team frame（本方球门 xt=0，对方球门 xt=105）→ world frame
    def to_world(self, xt: float, yt: float) -> tuple:
        return self.dir * (xt - PITCH_L / 2), yt

    def to_team(self, xw: float, yw: float) -> tuple:
        return self.dir * xw + PITCH_L / 2, yw


def formation_target(side: Side, p: TPlayer, ball_xt: float, ball_yw: float,
                     line_cap: float | None = None) -> tuple:
    """锚点（平衡基准）+ 球位弹性偏移 + 心态线宽修正 + 角色偏移 → 队形目标（team frame）。
    line_cap：进攻时的越位线帽（倒数第二防守人深度），前锋锚点自动剃到线后。"""
    # 门将：门线前 4m，沿 y 轻跟球（team frame 本方球门在 x=0）
    if p.is_gk:
        return 4.0, max(-4.0, min(4.0, ball_yw * 0.12))
    slot = side.slots[p.slot]
    xt = slot["x"] * PITCH_L
    yt = slot["y"] * PITCH_W / 2
    # 心态/指令防线整体平移（线基准 37m）
    xt += (side.line_m - BASE_LINE_M) * (0.4 if slot["x"] < 0.45 else 0.12)
    # 宽度指令/心态
    yt *= side.width_m / 38.0
    # 角色锚点偏移（roles.json：depth_m 向前 +，lateral_m 负=内收）
    if side.role_defs and p.slot in side.role_of:
        rid = side.role_of[p.slot][0]
        rd = side.role_defs.get(rid)
        if rd:
            xt += rd.get("anchor", {}).get("depth_m", 0.0)
            lat = rd.get("anchor", {}).get("lateral_m", 0.0)
            if lat:
                yt += lat * (-1.0 if yt > 0 else 1.0)
    # 球位弹性：全体向球侧滑动（越靠前滑得越多），横向轻微随球
    pull = 0.18 + 0.5 * slot["x"]
    xt += (ball_xt - xt) * pull * 0.6
    yt += ball_yw * 0.12
    if line_cap is not None and slot["x"] > 0.4:
        xt = min(xt, line_cap)          # 越位纪律：不蹲在防线身后
    return xt, yt


def press_targets(side: Side, w: World) -> None:
    """无球方：最近 1-2 人扑持球者，其余人 球侧保护性盯人（阶段3 换压迫结构）。"""
    if w.ball.carrier < 0:
        return
    carrier = w.players[w.ball.carrier]
    if carrier.team == side.team:
        return
    defenders = [p for p in side.lineup.values() if not p.is_gk]
    defenders.sort(key=lambda p: dist(p.x, p.y, carrier.x, carrier.y))
    # compile 输出 press_intensity ∈ [1,5] → 压迫人数 1-3
    n = max(1, min(3, round(float(side.sp.get("press_intensity", 3)) / 5 * 3)))
    pressers = defenders[:n]
    for p in pressers:
        p.target = (carrier.x + carrier.vx * 0.3, carrier.y + carrier.vy * 0.3)
    # 其余防守人：贴防最近的危险对手（goal-side：站人与本方球门之间）
    gx = -side.dir * GOAL_X
    for p in defenders[len(pressers):]:
        threats = [q for q in w.players
                   if q.team != side.team and not q.is_gk and q.idx != carrier.idx
                   and dist(p.x, p.y, q.x, q.y) < 16]
        if not threats:
            continue
        q = min(threats, key=lambda t: dist(p.x, p.y, t.x, t.y))
        mx = q.x + (gx - q.x) * 0.26
        my = q.y * 0.94
        p.target = (mx, my)


def attack_runs(side: Side, w: World, line_cap: float | None) -> None:
    """进攻无球跑位（传跑协同 v0）：锋线/边路向防线身后插，制造穿透目标。"""
    if w.ball.carrier < 0:
        return
    carrier = w.players[w.ball.carrier]
    if carrier.team != side.team or carrier.is_gk:
        return
    for p in side.lineup.values():
        if p.idx == carrier.idx or p.is_gk:
            continue
        if p.pos not in ("ST", "AMR", "AML", "AMC"):
            continue
        d = dist(p.x, p.y, carrier.x, carrier.y)
        if not 6 < d < 32:
            continue
        depth = side.dir * carrier.x + 52.5 + 10.0
        if line_cap is not None:
            depth = min(depth, line_cap + 3.0)
        xt = min(max(depth - 52.5, -GOAL_X + 8) * side.dir, side.dir * (GOAL_X - 8))             if False else side.dir * (min(max(depth, 60), 100) - 52.5)
        yt = p.y * 0.8 if p.pos != "ST" else carrier.y * -0.3
        p.target = (xt, yt)


def nearest_opp_dist(w: World, p: TPlayer) -> float:
    best = 1e9
    for q in w.players:
        if q.team != p.team:
            best = min(best, dist(p.x, p.y, q.x, q.y))
    return best


def lane_openness(w: World, p: TPlayer, mate: TPlayer) -> float:
    """传球线路 openness：对方向量离线的最近对手距离（截断在传球长度内）。"""
    dx, dy = mate.x - p.x, mate.y - p.y
    L = math.hypot(dx, dy) + 1e-6
    ux, uy = dx / L, dy / L
    worst = 10.0
    for q in w.players:
        if q.team == p.team:
            continue
        t = (q.x - p.x) * ux + (q.y - p.y) * uy
        if -1 < t < L:
            perp = abs(-(q.x - p.x) * uy + (q.y - p.y) * ux)
            worst = min(worst, perp)
    return worst


def shoot_score(w: World, side: Side, p: TPlayer, rng: random.Random) -> tuple:
    """射门选项的 (score, xg_eff)——与 execute_shot 的判定公式镜像。"""
    gxw = side.dir * GOAL_X
    d = dist(p.x, p.y, gxw, 0.0)
    if abs(p.y) > 22 or d > 30:
        return -1.0, 0.0
    angle_open = max(0.0, 1.0 - abs(p.y) / (d + 6))
    fin = p.attr("finishing") * 0.6 + p.attr("composure") * 0.4
    xg = max(0.02, min(0.75, 0.62 * math.exp(-d / 9) * (0.4 + 0.6 * angle_open)
                       * (0.75 + 0.5 * fin)))
    press = nearest_opp_dist(w, p)
    score = xg * 6.0 + 0.8 * p.attr("finishing") + rng.uniform(0, 0.3)
    return score, xg


def is_offside(side: Side, mate: TPlayer, ball_x: float, opp_players: list,
               tol: float = 0.3) -> bool:
    """越位判定（docs/03）：队友在球前方 且 越过对方倒数第二名防守人 且 在对方半场。"""
    d = side.dir
    m_depth = d * mate.x
    if m_depth <= d * ball_x:          # 不比球靠前
        return False
    if m_depth <= 0:                   # 未过半场
        return False
    opp_depths = sorted((d * q.x for q in opp_players), reverse=True)
    second_last = opp_depths[1] if len(opp_depths) >= 2 else opp_depths[0]
    return m_depth > second_last + tol


def _clearly_offside(side: Side, mate: TPlayer, ball_x: float, opp_players: list) -> bool:
    d = side.dir
    m_depth = d * mate.x
    if m_depth <= d * ball_x or m_depth <= 0:
        return False
    opp_depths = sorted((d * q.x for q in opp_players), reverse=True)
    second_last = opp_depths[1] if len(opp_depths) >= 2 else opp_depths[0]
    return m_depth > second_last + 0.6


def decide_window(side: Side) -> int:
    """决策窗 ticks = decision_window_s × 25Hz（docs/02 心态表：0.7–1.4s）。"""
    return max(14, int(side.sp.get("decision_window_s", 1.0) * 25))


def decide_carrier(w: World, side: Side, p: TPlayer, rng: random.Random) -> None:
    """持球效用评分（阶段3 起点）：比较 传球各选项 / 射门 / 盘带，取最高。"""
    fwd_risk = side.sp.get("tempo", {}).get("forward_risk_weight", 1.0)
    press = nearest_opp_dist(w, p)
    gxw = side.dir * GOAL_X
    mates = [q for q in side.lineup.values() if q.idx != p.idx]
    opps = [q for q in w.players if q.team != side.team]

    # 后卫解围：本方 1/3 持球的后卫遇压不大脚更待何时
    if p.pos in ("DC", "DL", "DR", "WBL", "WBR") and side.dir * p.x + 52.5 < 22 \
            and press < 5.0:
        onside = [q for q in mates if not is_offside(side, q, w.ball.p[0], opps)]
        m = max(onside or mates, key=lambda q: side.dir * q.x)
        execute_pass(w, side, p, m, rng, intent="long")
        return

    best = ("dribble", None, -99.0)
    # ---- 射门（xG 门槛：杜绝低质量浪射）----
    s_shoot, s_xg = shoot_score(w, side, p, rng)
    if s_shoot > -1 and s_xg >= 0.050:
        shoot_v = s_xg * 7.0 + 0.8 * p.attr("finishing") + rng.uniform(0, 0.3)
        if shoot_v > best[2]:
            best = ("shoot", s_xg, shoot_v)
    # ---- 传球选项（量纲与盘带对齐 ≈ 0..2.5；越位队友不可传）----
    for m in mates:
        if m.idx == w.ball.pass_from_idx:   # 不做烫手回传
            continue
        if _clearly_offside(side, m, w.ball.p[0], opps):
            continue
        fwd = (side.dir * (m.x - p.x)) / PITCH_L
        opn = lane_openness(w, p, m)
        d = dist(p.x, p.y, m.x, m.y)
        if d < 4 or d > 55:
            continue
        recv_space = nearest_opp_dist(w, m)
        pen = 0.018 if side.dir * m.x > 35 else 0.035
        v = 0.32 * opn + 0.12 * recv_space + fwd * fwd_risk * 3.5 - d * pen
        if side.dir * m.x > 78 and opn > 1.5:
            v += 0.9                     # 传进禁区 = 制造机会，重奖 \
            + 0.30 * p.attr("passing") \
            + (0.20 if fwd < 0 and p.x * side.dir < -10 else 0.0)
        if v > best[2]:
            intent = "through" if fwd_through(side, p, m) else "safe"
            best = ("pass", (m, intent), v)
    # ---- 盘带（身前空间大时最优；进攻三区加鼓励，制造禁区 entries）----
    space_ahead = nearest_opp_dist(w, p)
    xt_self = side.dir * p.x + 52.5
    dribble_v = 0.22 * space_ahead + 0.55 * p.attr("dribbling") + 0.30 * p.attr("pace") \
        - (0.60 if press < 2.2 else 0.0) \
        
    if dribble_v > best[2]:
        best = ("dribble", None, dribble_v)

    act, arg, _ = best
    if act == "shoot":
        execute_shot(w, side, p, rng)
    elif act == "pass":
        m, intent = arg
        execute_pass(w, side, p, m, rng, intent=intent)
    else:
        wingers = p.pos in ("AMR", "AML", "MR", "ML", "DR", "DL", "WBR", "WBL")
        # 底线附近 + 禁区有队友 → 传中
        if wingers and side.dir * p.x > GOAL_X - 16 and abs(p.y) > 14:
            box = [m for m in mates
                   if side.dir * m.x > GOAL_X - 16 and abs(m.y) < 18 and not m.is_gk]
            if box:
                execute_pass(w, side, p, max(box, key=lambda m: -dist(m.x, m.y, gxw, 0)),
                             rng, intent="cross")
                return
        ty = (PITCH_W / 2 - 4) * (1 if p.y > 0 else -1) if wingers else p.y * 0.6
        p.target = (gxw * 0.92, ty)


def fwd_through(side: Side, p: TPlayer, mate: TPlayer) -> bool:
    return side.dir * (mate.x - p.x) > 14 and side.dir * mate.x > 10


def execute_pass(w: World, side: Side, p: TPlayer, mate: TPlayer,
                 rng: random.Random, intent: str) -> None:
    b = w.ball
    tx, ty = mate.x, mate.y
    if intent == "through":                     # 身后球：给跑动前方的空间
        tx += side.dir * 3.0
    d0 = dist(p.x, p.y, tx, ty)
    # 按飞行时间预判队友跑动（单一提前量：落点 = 人 + v×飞行时间×0.85）
    fly0 = d0 / max(5.5 + d0 * 0.34, 7.5)
    tx += mate.vx * fly0 * 0.85
    ty += mate.vy * fly0 * 0.85
    if intent == "through":
        tx += side.dir * 2.5          # 穿透引导（单一提前量之外的身前空间）
    d = dist(p.x, p.y, tx, ty)
    # 误差：passing 越好越小；压力放大（阶段1 粗模型）
    sigma = 0.085 - 0.07 * p.attr("passing") + 0.03 * (1 - min(nearest_opp_dist(w, p) / 6, 1))
    ang = math.atan2(ty - p.y, tx - p.x) + rng.gauss(0, max(sigma, 0.02))
    speed = max(9.0, min(24.0, 8.0 + d * 0.55))
    # 落点钳制在场内（避免传向界外直接送出界）
    if side.dir > 0:
        tx = min(tx, GOAL_X - 6)        # 身后球不出底线
    else:
        tx = max(tx, -(GOAL_X - 6))
    ty = max(-PITCH_W / 2 + 1.0, min(PITCH_W / 2 - 1.0, ty))
    d = dist(p.x, p.y, tx, ty)
    ang = math.atan2(ty - p.y, tx - p.x) + rng.gauss(0, max(sigma, 0.02))
    # 速度上限按接球人 first_touch：摩擦减速后到达速度必须可停（12+9×ft）
    ft = mate.attr("first_touch")
    speed = min(5.5 + d * 0.34, 10.5 + 9.0 * ft + 3.4 * (d / max(speed, 1e-3)))
    speed = max(7.5, speed)
    loft = d > 30 or (intent == "long") or (intent == "cross")
    vz = min(9.5, d * 0.16) if loft else 0.0
    release(w, p)
    b.v = [math.cos(ang) * speed, math.sin(ang) * speed, vz]
    b.spin[2] = rng.gauss(0, 4.0)
    b.intended_to = mate.idx
    b.pass_from = p.pid
    b.pass_from_idx = p.idx
    b.offside_receiver = mate.idx if is_offside(side, mate, p.x, [q for q in w.players if q.team != side.team], tol=1.0) else -1
    b.last_touch_team = side.team
    quality = max(0.0, 1.0 - sigma * 3)
    b.pass_quality = quality
    p.action = "idle"
    w.emit("pass_attempt", **{"from": p.pid, "to": mate.pid, "intent": intent,
                              "quality": round(quality, 2)})


def execute_shot(w: World, side: Side, p: TPlayer, rng: random.Random) -> None:
    """射门：出脚时按属性+处境判定结果（xG 守恒），物理轨迹按结论演出（FIFA 式混合）。"""
    b = w.ball
    gxw = side.dir * GOAL_X
    d = dist(p.x, p.y, gxw, 0.0)
    fin = p.attr("finishing") * 0.6 + p.attr("composure") * 0.4
    press = nearest_opp_dist(w, p)
    angle_open = max(0.0, 1.0 - abs(p.y) / (d + 6))
    base_xg = 0.62 * math.exp(-d / 9) * (0.4 + 0.6 * angle_open) \
        - (0.015 if press < 2.0 else 0.0)
    xg = max(0.02, min(0.75, base_xg * (0.75 + 0.5 * fin)))

    roll = rng.random()
    if roll < xg:
        outcome = "goal"
    elif roll < xg + 0.34:
        outcome = "saved"
    else:
        outcome = "off_target"

    # 按结论安排轨迹终点
    sigma = max(0.02, 0.10 - 0.07 * p.attr("finishing"))
    if outcome == "goal":
        ty = rng.choice([-1, 1]) * rng.uniform(1.2, 2.6)
        tz = rng.uniform(0.2, 2.0)
    elif outcome in ("saved", "on_target"):
        ty = rng.uniform(-3.2, 3.2)
        tz = rng.uniform(0.3, 1.9)
    else:
        ty = rng.choice([-1, 1]) * rng.uniform(3.9, 5.6)
        tz = rng.uniform(0.2, 2.2)
    ang = math.atan2(ty - p.y, gxw - p.x) + rng.gauss(0, sigma * 0.5)
    speed = 21.0 + 8.0 * p.attr("finishing") + rng.uniform(0, 4)
    t_est = d / (speed * 0.92)
    vz = max(0.0, tz / max(t_est, 0.2) + 4.9 * t_est)     # 弹道：到期恰好到达 tz 高度
    release(w, p)
    b.v = [math.cos(ang) * speed, math.sin(ang) * speed, min(vz, 9.0)]
    b.spin[2] = rng.gauss(0, 8.0)
    b.intended_to = -1
    b.last_touch_team = side.team
    b.shot_xg = xg
    b.shot_fin = fin
    b.shot_outcome = outcome
    w.emit("shot", shooter=p.pid, origin=[round(p.x, 1), round(p.y, 1)],
           outcome=outcome, xg=round(xg, 3),
           prep_time=round(rng.uniform(0.2, 1.1), 2), body_part="foot")


def release(w: World, p: TPlayer) -> None:
    w.ball.carrier = -1
    w.ball.last_kicker = p.idx
    w.ball.pickup_until = w.tick + 15   # 0.6s 内不可自己再拿
    p.has_ball = False
