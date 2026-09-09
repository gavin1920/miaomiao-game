"""状态流写盘：JSONL，首行 meta，其后每 N tick 一帧（schemas/state_stream.schema.json 结构）。"""
import json
from pathlib import Path

from .world import ACTIONS, World


class StateWriter:
    def __init__(self, path: Path, home_club: str, away_club: str, seed: int):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.f = open(path, "w", encoding="utf-8")
        self.path = path
        self.ev_i = 0          # World.events 已写到的下标（增量 flush）
        self.f.write(json.dumps({
            "meta": True, "home": home_club, "away": away_club, "seed": seed,
            "schema": "state_stream v0.1",
        }, ensure_ascii=False) + "\n")

    def write(self, w: World) -> None:
        r2 = lambda v: round(v, 2)  # noqa: E731
        events = w.events[self.ev_i:]
        self.ev_i = len(w.events)
        frame = {
            "tick": w.tick, "phase": w.phase,
            "clock": w.clock(),
            "score": list(w.score),
            "ball": {"p": [r2(v) for v in w.ball.p], "v": [r2(v) for v in w.ball.v],
                     "spin": [r2(v) for v in w.ball.spin]},
            "players": [
                {"id": p.idx, "pid": p.pid, "team": p.team, "slot": p.slot,
                 "p": [r2(p.x), r2(p.y)], "heading": r2(p.heading),
                 "speed": r2(p.speed), "action": p.action,
                 "has_ball": p.has_ball, "stamina": r2(p.stamina)}
                for p in w.players],
            "events": events,
        }
        self.f.write(json.dumps(frame, ensure_ascii=False, separators=(",", ":")) + "\n")

    def close(self, score) -> None:
        self.f.write(json.dumps({"meta": True, "final": True, "score": list(score)},
                                ensure_ascii=False) + "\n")
        self.f.close()
