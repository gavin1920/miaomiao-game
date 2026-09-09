"""世界状态：场地常数、球员/球实体、tick 级状态容器。"""
import math
from dataclasses import dataclass, field

# 场地（米，坐标原点=中圈）：x ∈ [-52.5, 52.5]（主队进攻 +x），y ∈ [-34, 34]
PITCH_L, PITCH_W = 105.0, 68.0
GOAL_W = 7.32
GOAL_X = PITCH_L / 2
DT = 0.04          # 25Hz
TICKS_PER_MIN = int(60 / DT)   # 1500

ACTIONS = ("idle", "jog", "run", "sprint", "decel", "dribble", "tackle",
           "aerial_challenge", "block", "fall", "gk_dive", "gk_hold",
           "gk_distribute", "set_piece_ready")


@dataclass
class Ball:
    p: list = field(default_factory=lambda: [0.0, 0.0, 0.0])   # [x, y, z]
    v: list = field(default_factory=lambda: [0.0, 0.0, 0.0])
    spin: list = field(default_factory=lambda: [0.0, 0.0, 0.0])  # rad/s，绕 z=侧旋
    carrier: int = -1          # 持球球员 idx；-1 = 自由球
    last_touch_team: int = -1  # 0=home 1=away（出界判罚用）
    intended_to: int = -1      # 传球意图接收人 idx（完成/拦截判定）
    pass_from: str = ""        # 传球人 pid（事件记录）
    pass_from_idx: int = -1    # 传球人 idx（禁回传判定）
    pass_quality: float = 0.0
    shot_xg: float = 0.0       # 最近一次射门的 xG（GK 扑救语义用）
    shot_fin: float = 0.6      # 射门人终结质量（扑救概率修正）
    shot_outcome: str = ""     # 出脚时已判定：goal|saved|on_target|off_target（物理按结论演出）
    offside_receiver: int = -1  # 出球瞬间处于越位位置的预期接球人 idx（接球即吹）
    last_kicker: int = -1      # 最近出球者 idx（pickup 冷却，防即踢即拿）
    pickup_until: int = 0      # 该 idx 在此 tick 前不可再拿球


@dataclass
class TPlayer:
    idx: int
    pid: str
    team: int                  # 0=home 1=away
    slot: str
    pos: str                   # 位置码（DR/DC/…，槽位位置）
    is_gk: bool
    attrs: dict                # 球员属性（已含 0-100 原始值）
    pos_fam: float             # 位置熟悉度乘数
    x: float = 0.0
    y: float = 0.0
    vx: float = 0.0
    vy: float = 0.0
    heading: float = 0.0       # 度
    speed: float = 0.0
    stamina: float = 1.0
    action: str = "idle"
    has_ball: bool = False
    # 决策缓存（brain 使用）
    target: tuple = (0.0, 0.0)
    next_decide: int = 0       # 下次决策 tick（决策窗口节流）
    tackle_cd: int = 0         # 抢断尝试冷却 tick
    stumble_until: int = 0     # 被抢断后踉跄（不可立即反抢）

    def attr(self, key: str) -> float:
        v = self.attrs.get(key)
        return (v if v is not None else 62) / 100.0


@dataclass
class World:
    tick: int = 0
    phase: str = "kickoff"
    minute: float = 0.0
    score: list = field(default_factory=lambda: [0, 0])
    ball: Ball = field(default_factory=Ball)
    players: list = field(default_factory=list)
    events: list = field(default_factory=list)
    restart: dict = field(default_factory=dict)   # 死球重开状态 {kind, team, until_tick, at}

    def emit(self, etype: str, **fields):
        ev = dict(fields)
        ev["type"] = etype            # 事件 id 权威，字段不可覆盖
        self.events.append(ev)

    def clock(self) -> str:
        s = int(self.minute * 60)
        return f"{s // 60:02d}:{s % 60:02d}"


def dist(ax, ay, bx, by) -> float:
    return math.hypot(ax - bx, ay - by)
