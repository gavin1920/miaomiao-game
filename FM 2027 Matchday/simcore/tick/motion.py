"""运动学：球员转向意图模型（docs/03 §四）+ 球物理（§三）。

球员：AI 给目标点 → 运动模型限制能到达什么。
  v_max = f(pace) × 疲劳 × 持球折扣；a_max = f(acceleration)；转向速率 = f(agility)
球：自由飞行走纯物理（滚动摩擦/反弹/马格努斯侧旋）；持球时粘在carrier脚前。
"""
import math

from .world import DT, TPlayer, World, dist

V_MAX_BASE = 6.2       # pace 0.5 附近
V_MAX_SPAN = 5.0       # pace 1.0 → ≈ 11.2 m/s（英超冲刺量级）
A_MAX_BASE = 4.0
A_MAX_SPAN = 4.5
TURN_RATE_BASE = 2.4   # rad/s @ agility 0.5
TURN_RATE_SPAN = 2.4
DRIBBLE_SLOWDOWN = 0.72  # 持球速度折扣（f(Dribbling) 微调）
BALL_FRICTION = 3.4      # 滚动减速度 m/s²（草皮）
BALL_BOUNCE = 0.55
MAGNUS_K = 0.012         # 侧向加速度 = k × spin_z × speed
CONTROL_RADIUS = 1.55    # 停球/拿球半径


def v_max_of(p: TPlayer) -> float:
    s = 0.55 + 0.45 * p.stamina
    base = (V_MAX_BASE + V_MAX_SPAN * p.attr("pace")) * s
    if p.has_ball:
        base *= DRIBBLE_SLOWDOWN + 0.1 * p.attr("dribbling")
    return base


def a_max_of(p: TPlayer) -> float:
    return A_MAX_BASE + A_MAX_SPAN * p.attr("acceleration")


def turn_rate_of(p: TPlayer) -> float:
    return TURN_RATE_BASE + TURN_RATE_SPAN * p.attr("agility")


def step_player(p: TPlayer) -> None:
    """朝 p.target 的转向意图积分一个 tick。"""
    tx, ty = p.target
    dx, dy = tx - p.x, ty - p.y
    d = math.hypot(dx, dy)
    want_speed = v_max_of(p) * min(1.0, d / 2.0)   # 到点前 2m 减速
    want_dir = math.atan2(dy, dx) if d > 1e-4 else math.radians(p.heading)
    cur = math.atan2(p.vy, p.vx) if (abs(p.vx) + abs(p.vy)) > 1e-6 else want_dir
    # 限转向速率
    diff = (want_dir - cur + math.pi) % (2 * math.pi) - math.pi
    max_turn = turn_rate_of(p) * DT
    cur += max(-max_turn, min(max_turn, diff))
    # 速度沿当前朝向逼近 want_speed
    cur_speed = math.hypot(p.vx, p.vy)
    dv = want_speed - cur_speed
    acc = a_max_of(p) * DT
    new_speed = cur_speed + max(-acc * 1.6, min(acc, dv))   # 减速比加速快
    p.vx = math.cos(cur) * new_speed
    p.vy = math.sin(cur) * new_speed
    p.x += p.vx * DT
    p.y += p.vy * DT
    # 场地钳制（球员不出界，留 0.5m 缓冲）
    p.x = max(-52.5, min(52.5, p.x))
    p.y = max(-34.0, min(34.0, p.y))
    p.heading = (math.degrees(cur)) % 360
    p.speed = new_speed
    # 动作标签（呈现层动画机的输入）
    if new_speed < 0.5:
        p.action = "idle"
    elif want_speed < cur_speed - 0.5:
        p.action = "decel"
    elif new_speed > v_max_of(p) * 0.85:
        p.action = "sprint"
    elif new_speed > 4.5:
        p.action = "run"
    else:
        p.action = "jog"
    # 疲劳：速度越快耗越多（标定：均值 5m/s 跑 90 分钟 ≈ 掉 35%）
    drain = (max(new_speed - 2.0, 0.0) / 9.0) ** 2 * 2.5e-5
    p.stamina = max(0.55, p.stamina - drain)


def step_ball(w: World) -> None:
    b = w.ball
    if b.carrier >= 0:
        p = w.players[b.carrier]
        # 粘在脚前 0.55m，随朝向
        rad = math.radians(p.heading)
        b.p[0] = p.x + math.cos(rad) * 0.55
        b.p[1] = p.y + math.sin(rad) * 0.55
        b.p[2] = 0.0
        b.v = [p.vx, p.vy, 0.0]
        b.spin = [0.0, 0.0, 0.0]
        return
    speed = math.hypot(b.v[0], b.v[1])
    if b.p[2] <= 1e-3 and speed > 0:
        # 地面滚动摩擦
        f = BALL_FRICTION * DT
        ns = max(0.0, speed - f)
        if speed > 0:
            b.v[0] *= ns / speed
            b.v[1] *= ns / speed
        b.p[2] = 0.0
    # 马格努斯侧旋（z 轴自旋 → 横向加速度）
    if abs(b.spin[2]) > 1e-3:
        ax = -b.v[1] / max(speed, 1e-6) * MAGNUS_K * b.spin[2] * speed
        ay = b.v[0] / max(speed, 1e-6) * MAGNUS_K * b.spin[2] * speed
        b.v[0] += ax * DT
        b.v[1] += ay * DT
    if b.p[2] > 0.05:                    # 空气阻力（空中球）
        b.v[0] *= 1 - 0.10 * DT
        b.v[1] *= 1 - 0.10 * DT
    b.p[0] += b.v[0] * DT
    b.p[1] += b.v[1] * DT
    b.p[2] += b.v[2] * DT
    if b.p[2] <= 0:                 # 落地（无条件钳制，防 z 负值发散）
        b.p[2] = 0.0
        if b.v[2] < 0:
            b.v[2] = -b.v[2] * BALL_BOUNCE
            b.v[0] *= 0.85
            b.v[1] *= 0.85
    else:
        b.v[2] -= 9.81 * DT
    b.spin = [s * 0.995 for s in b.spin]


def try_gain_possession(w: World, events: bool = True) -> None:
    """自由球进入任何人控制半径 → 拿球。可控球速随 first_touch（卸球缓冲）。"""
    b = w.ball
    if b.carrier >= 0:
        return
    speed = math.hypot(b.v[0], b.v[1])
    best, bd = None, 1e9
    for p in w.players:
        if p.idx == b.last_kicker and w.tick < b.pickup_until:
            continue    # 出球者冷却（否则传球瞬间自己再拿）
        d = dist(p.x, p.y, b.p[0], b.p[1])
        reach = CONTROL_RADIUS * (1.25 if p.is_gk and b.p[2] < 2.4 else 1.0)
        if p.idx == b.intended_to:
            reach *= 1.45                      # 预期接球人的预判卡位
        limit = 12.0 + 9.0 * p.attr("first_touch")      # 12–21 m/s 可控
        if speed > limit:
            continue
        if d < reach and d < bd:
            best, bd = p, d
    if best is None:
        return
    prev_intended = b.intended_to
    b.carrier = best.idx
    b.last_touch_team = best.team
    b.intended_to = -1
    b.shot_outcome = ""
    b.offside_receiver = -1
    for q in w.players:
        q.has_ball = (q.idx == best.idx)
    if best.is_gk and bd < 2.2 and b.p[2] < 2.4:
        best.action = "gk_hold"
    # 传球结果事件：预期接收人拿到 = 完成；对方拿到 = 拦截
    if prev_intended >= 0:
        passer = b.pass_from
        if best.idx == prev_intended:
            w.emit("pass_completed", **{"from": passer, "to": best.pid})
        elif best.team != w.players[prev_intended].team:
            w.emit("interception", player=best.pid)
        b.pass_from = ""
