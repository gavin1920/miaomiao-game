#!/usr/bin/env python3
"""校验 02/03/04 同步落成的数据与接口工件。

覆盖：
  data/tactics/        阵型/角色/心态/指令/定位球/示例战术包（docs/02）
  schemas/             simparams / state_stream / telemetry_events 契约（docs/03）
  data/calibration/    英超基线 + 战术敏感性用例（docs/03 §十四）
  data/presentation/   转播导演/动画映射/图文包装/音频规则（docs/04）
  交叉引用             呈现层事件 ⊆ 遥测词表、战术包↔球员数据、schema 枚举 ↔ 动画动作集

用法: python scripts/validate_tactics.py  (在仓库根目录运行)
球员数据本体由 scripts/validate_data.py 校验，本脚本只读它做引用检查。
"""
import csv
import json
import sys
from pathlib import Path

from validate_data import COLUMNS, VALID_POSITIONS  # 同目录，单一事实来源

ROOT = Path(__file__).resolve().parent.parent

DUTIES = {"de", "su", "at"}
MENTALITY_PRESETS = {"extreme_defensive", "defensive", "cautious", "balanced",
                     "positive", "attacking", "extreme_attacking"}
PRESS_LINES = {"own_box_edge", "own_third", "halfway_deep", "halfway",
               "halfway_high", "opp_third", "opp_box_edge"}
IN_INSTRUCTIONS = ["width", "buildup", "tempo", "crossing", "final_third_play",
                   "short_pass_chains", "time_wasting"]
OUT_INSTRUCTIONS = ["def_line", "def_width", "press_intensity", "press_trigger",
                    "tackling", "offside_trap", "counter_press", "counter",
                    "gk_distribution", "press_gk"]
ATTR_COLS = [c for c in COLUMNS if c not in
             ("id", "name", "club", "age", "height_cm", "weight_kg",
              "foot_l", "foot_r", "positions", "traits")]
CAMERA_DWELL_EXEMPT = {"goal_live", "goal_replay", "deadball_setup", "deadball_taker",
                       "tactical_lock"}
UI_PSEUDO_EVENTS = {"ui_lock_camera", "ui_unlock_camera"}

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        err(f"{path.relative_to(ROOT)}: JSON 解析失败: {e}")
        return None


def check_tactics() -> dict:
    # ---- formations ----
    formations = load_json(ROOT / "data/tactics/formations.json") or {}
    formation_map = {}
    for f in formations.get("formations", []):
        fid = f.get("id", "?")
        formation_map[fid] = f
        slots = f.get("slots", [])
        if len(slots) != 11:
            err(f"formations/{fid}: 槽位数 {len(slots)} ≠ 11")
        ids = [s.get("id") for s in slots]
        if len(set(ids)) != len(ids):
            err(f"formations/{fid}: 槽位 id 重复")
        gk_slots = [s for s in slots if s.get("pos") == "GK"]
        if len(gk_slots) != 1:
            err(f"formations/{fid}: GK 槽位应有 1 个，实际 {len(gk_slots)}")
        for s in slots:
            if s.get("pos") not in VALID_POSITIONS:
                err(f"formations/{fid}/{s.get('id')}: 非法位置 {s.get('pos')}")
            if s.get("duty") not in DUTIES:
                err(f"formations/{fid}/{s.get('id')}: 非法职责 {s.get('duty')}")
            if not 0 <= s.get("x", -1) <= 1:
                err(f"formations/{fid}/{s.get('id')}: x 超出 [0,1]: {s.get('x')}")
            if not -1 <= s.get("y", -2) <= 1:
                err(f"formations/{fid}/{s.get('id')}: y 超出 [-1,1]: {s.get('y')}")
    print(f"formations.json: {len(formation_map)} 套阵型")
    if len(formation_map) != 10:
        err(f"formations.json 应有 10 套预设，实际 {len(formation_map)}")

    # ---- roles ----
    roles = load_json(ROOT / "data/tactics/roles.json") or {}
    vocab = roles.get("vocab", {})
    role_map = {}
    for r in roles.get("roles", []):
        rid = r.get("id", "?")
        role_map[rid] = r
        if set(r.get("positions", [])) - VALID_POSITIONS:
            err(f"roles/{rid}: 非法位置 {set(r['positions']) - VALID_POSITIONS}")
        if set(r.get("duties", [])) - DUTIES:
            err(f"roles/{rid}: 非法职责 {set(r['duties']) - DUTIES}")
        bad_ob = set(r.get("on_ball", {})) - set(vocab.get("on_ball", []))
        if bad_ob:
            err(f"roles/{rid}: on_ball 词表外键 {sorted(bad_ob)}")
        bad_of = set(r.get("off_ball", {})) - set(vocab.get("off_ball", []))
        if bad_of:
            err(f"roles/{rid}: off_ball 词表外键 {sorted(bad_of)}")
        d = r.get("defense", {})
        bad_d = set(d) - set(vocab.get("defense", []))
        if bad_d:
            err(f"roles/{rid}: defense 词表外键 {sorted(bad_d)}")
        if d.get("marking") not in set(vocab.get("marking", [])):
            err(f"roles/{rid}: 非法 marking {d.get('marking')}")
        if d.get("cover") not in set(vocab.get("cover", [])):
            err(f"roles/{rid}: 非法 cover {d.get('cover')}")
        bad_attr = set(r.get("attrs", {})) - set(ATTR_COLS)
        if bad_attr:
            err(f"roles/{rid}: attrs 含非球员属性列 {sorted(bad_attr)}")
    print(f"roles.json: {len(role_map)} 个角色")
    if len(role_map) != 27:
        err(f"roles.json 应有 27 个角色（docs/02 §五），实际 {len(role_map)}")

    # ---- mentality ----
    mentality = load_json(ROOT / "data/tactics/mentality.json") or {}
    preset_ids = set()
    for p in mentality.get("presets", []):
        pid = p.get("id", "?")
        preset_ids.add(pid)
        if p.get("press_trigger_line") not in PRESS_LINES:
            err(f"mentality/{pid}: 非法逼抢触发线 {p.get('press_trigger_line')}")
        if not 20 <= p.get("def_line_height_m", -1) <= 50:
            err(f"mentality/{pid}: 防线高度越界 {p.get('def_line_height_m')}")
        if not 0.5 <= p.get("decision_window_s", -1) <= 2.0:
            err(f"mentality/{pid}: 决策时间窗越界 {p.get('decision_window_s')}")
        if not 1 <= p.get("press_intensity", -1) <= 5:
            err(f"mentality/{pid}: 逼抢强度越界 {p.get('press_intensity')}")
    if preset_ids != MENTALITY_PRESETS:
        err(f"mentality.json 档位不符: 缺 {MENTALITY_PRESETS - preset_ids} 多 {preset_ids - MENTALITY_PRESETS}")
    print(f"mentality.json: {len(preset_ids)} 档心态")

    # ---- instructions ----
    instructions = load_json(ROOT / "data/tactics/instructions.json") or {}
    instr_map: dict[str, dict] = {}
    for inst in instructions.get("instructions", []):
        iid = inst.get("id", "?")
        instr_map[iid] = inst
        opts = [o.get("id") for o in inst.get("options", [])]
        if len(set(opts)) != len(opts) or not opts:
            err(f"instructions/{iid}: 档位 id 重复或为空")
        for o in inst.get("options", []):
            if not str(o.get("compile", "")).strip():
                err(f"instructions/{iid}/{o.get('id')}: 缺 compile 编译目标")
    missing_in = [i for i in IN_INSTRUCTIONS if i not in instr_map]
    missing_out = [i for i in OUT_INSTRUCTIONS if i not in instr_map]
    if missing_in:
        err(f"instructions.json 缺有球指令 {missing_in}")
    if missing_out:
        err(f"instructions.json 缺无球指令 {missing_out}")
    print(f"instructions.json: {len(instr_map)} 条指令（应 17）")
    if len(instr_map) != 17:
        err(f"instructions.json 应为 有球7+无球10=17 条，实际 {len(instr_map)}")

    # ---- set pieces ----
    sp = load_json(ROOT / "data/tactics/set_pieces.json") or {}
    sp_options: dict[str, set] = {}
    for cat, body in sp.get("catalogs", {}).items():
        sp_options[cat] = {o.get("id") for o in body.get("options", [])}
    for need in ("corner_atk", "corner_def", "fk_near", "fk_deep", "throw_in", "penalties"):
        if need not in sp_options:
            err(f"set_pieces.json 缺目录 {need}")
    print(f"set_pieces.json: {len(sp_options)} 类定位球目录")

    return {"formations": formation_map, "roles": role_map, "presets": preset_ids,
            "instructions": instr_map, "set_pieces": sp_options}


def load_players() -> dict[str, dict]:
    players = {}
    for path in sorted((ROOT / "data/players").glob("*.csv")):
        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                players[row["id"]] = row
    return players


def position_tokens(positions_field: str) -> set[str]:
    out = set()
    for tok in positions_field.split(","):
        tok = tok.strip()
        if tok.endswith("*") or tok.endswith("+"):
            tok = tok[:-1]
        if tok:
            out.add(tok)
    return out


def check_examples(bundle: dict, players: dict) -> None:
    for path in sorted((ROOT / "data/tactics/examples").glob("*.json")):
        ex = load_json(path) or {}
        who = path.name
        fid = ex.get("formation")
        if fid not in bundle["formations"]:
            err(f"{who}: 阵型 {fid} 不在预设库")
            continue
        slots = {s["id"]: s for s in bundle["formations"][fid]["slots"]}
        if ex.get("mentality") not in bundle["presets"]:
            err(f"{who}: 心态 {ex.get('mentality')} 不在预设库")

        # instructions：键集合与档位合法性
        instr = ex.get("instructions", {})
        if set(instr.get("in", {})) != set(IN_INSTRUCTIONS):
            err(f"{who}: 有球指令键不符（应 {IN_INSTRUCTIONS}）")
        if set(instr.get("out", {})) != set(OUT_INSTRUCTIONS):
            err(f"{who}: 无球指令键不符（应 {OUT_INSTRUCTIONS}）")
        for grp, ids in (("in", IN_INSTRUCTIONS), ("out", OUT_INSTRUCTIONS)):
            for iid in ids:
                val = instr.get(grp, {}).get(iid)
                opts = bundle["instructions"].get(iid, {}).get("options", [])
                if val not in {o.get("id") for o in opts}:
                    err(f"{who}: {grp}.{iid}={val!r} 不是合法档位")

        # roles / lineup：槽位覆盖 + 角色-槽位-球员三级兼容
        roles_cfg = ex.get("roles", {})
        lineup = ex.get("lineup", {})
        if set(roles_cfg) != set(slots):
            err(f"{who}: roles 槽位覆盖不符（缺 {set(slots) - set(roles_cfg)} 多 {set(roles_cfg) - set(slots)}）")
        if set(lineup) != set(slots):
            err(f"{who}: lineup 槽位覆盖不符（缺 {set(slots) - set(lineup)} 多 {set(lineup) - set(lineup)}）")
        for sid, slot in slots.items():
            rc = roles_cfg.get(sid, "")
            try:
                rid, duty = rc.split(":")
            except ValueError:
                err(f"{who}: 槽位 {sid} 角色配置 {rc!r} 应为 '角色id:职责'")
                continue
            role = bundle["roles"].get(rid)
            if role is None:
                err(f"{who}: 槽位 {sid} 未知角色 {rid}")
                continue
            if duty not in role["duties"]:
                err(f"{who}: 槽位 {sid} 角色 {rid} 不支持职责 {duty}（可选 {role['duties']}）")
            if slot["pos"] not in role["positions"]:
                err(f"{who}: 槽位 {sid}({slot['pos']}) 角色不匹配 {rid}（{role['positions']}）")
            pid = lineup.get(sid)
            player = players.get(pid)
            if player is None:
                err(f"{who}: 槽位 {sid} 球员 {pid} 不在球员数据库")
                continue
            ptoks = position_tokens(player["positions"])
            if slot["pos"] not in ptoks:
                err(f"{who}: 槽位 {sid}({slot['pos']}) 与球员 {pid} {player['name']} 位置不符（{player['positions']}）")
            elif f"{slot['pos']}*" not in player["positions"] and f"{slot['pos']}+" not in player["positions"]:
                warn(f"{who}: 球员 {pid} {player['name']} 在 {slot['pos']} 仅生疏")
        gk_pid = lineup.get("gk")
        if gk_pid and "GK" not in position_tokens(players.get(gk_pid, {}).get("positions", "")):
            err(f"{who}: gk 槽位球员 {gk_pid} 不是门将")

        # set pieces
        sp_cfg = ex.get("set_pieces", {})
        for cat in ("corner_atk", "corner_def", "fk_near", "fk_deep", "throw_in"):
            if sp_cfg.get(cat) not in bundle["set_pieces"].get(cat, set()):
                err(f"{who}: 定位球 {cat}={sp_cfg.get(cat)!r} 不在目录")
        for pid in sp_cfg.get("penalties_order", []):
            if pid not in players:
                err(f"{who}: 点球顺位球员 {pid} 不在球员数据库")


def check_schemas() -> dict:
    tel = load_json(ROOT / "schemas/telemetry_events.json") or {}
    events = tel.get("events", [])
    tel_ids = [e.get("id") for e in events]
    if len(set(tel_ids)) != len(tel_ids):
        err("telemetry_events.json: 事件 id 重复")
    if len(tel_ids) != 22:
        err(f"telemetry_events.json 应为 22 个事件，实际 {len(tel_ids)}")
    for e in events:
        if not str(e.get("zh", "")).strip():
            err(f"telemetry_events/{e.get('id')}: 缺中文名")
        bad = set(e.get("consumers", [])) - {"sim", "broadcast", "graphics", "audio", "ui"}
        if bad:
            err(f"telemetry_events/{e.get('id')}: 非法 consumers {sorted(bad)}")

    for name in ("simparams.schema.json", "state_stream.schema.json"):
        s = load_json(ROOT / "schemas" / name) or {}
        if "$schema" not in s or "required" not in s:
            err(f"schemas/{name}: 缺 $schema 或 required")
    ss = load_json(ROOT / "schemas/state_stream.schema.json") or {}
    action_enum = set(ss.get("properties", {}).get("players", {})
                      .get("items", {}).get("properties", {}).get("action", {})
                      .get("enum", []))
    print(f"telemetry_events.json: {len(tel_ids)} 个事件；state_stream 动作 enum {len(action_enum)} 个")
    return {"telemetry": set(tel_ids), "actions": action_enum}


def check_presentation(contract: dict) -> None:
    # camera director
    cd = load_json(ROOT / "data/presentation/camera_director.json") or {}
    states = cd.get("states", [])
    sids = [s.get("id") for s in states]
    if len(set(sids)) != len(sids):
        err("camera_director.json: 状态 id 重复")
    if cd.get("rules", {}).get("min_dwell_s") != 8:
        err("camera_director.json: rules.min_dwell_s 应为 8（防眩晕基线）")
    for s in states:
        dwell = s.get("min_dwell_s")
        if dwell is not None and dwell < 8 and s.get("id") not in CAMERA_DWELL_EXEMPT:
            err(f"camera_director/{s.get('id')}: min_dwell_s={dwell} < 8 且未列入豁免")
        on = str(s.get("enter", {}).get("on", ""))
        base = on.split(":")[0]
        if base and base not in contract["telemetry"] and base not in UI_PSEUDO_EVENTS:
            err(f"camera_director/{s.get('id')}: enter.on {on!r} 不在遥测词表/UI 伪事件")

    # animation map：动作 enum 与 schema 对齐 + 事件引用合法
    am = load_json(ROOT / "data/presentation/animation_map.json") or {}
    am_actions = set(am.get("locomotion", {}).get("actions", {}))
    if am_actions != contract["actions"]:
        err(f"animation_map: locomotion.actions 与 state_stream 动作 enum 不一致（差 {am_actions ^ contract['actions']}）")
    valid_events = contract["telemetry"] | contract["actions"]
    for v in am.get("event_variants", []):
        base = str(v.get("event", "")).split(":")[0]
        if base not in valid_events:
            err(f"animation_map: event {v.get('event')!r} 不在遥测词表/动作 enum")
    for g in am.get("gk_saves", {}).get("variants", []):
        for k in g.get("modulators", {}):
            if k not in ATTR_COLS:
                err(f"animation_map/gk_saves/{g.get('id')}: 非法属性调制键 {k}")

    # graphics panels
    gp = load_json(ROOT / "data/presentation/graphics_panels.json") or {}
    panel_ids = {p.get("id") for p in gp.get("panels", [])}
    for p in gp.get("panels", []):
        bad = set(p.get("data_events", [])) - contract["telemetry"]
        if bad:
            err(f"graphics_panels/{p.get('id')}: data_events 含词表外事件 {sorted(bad)}")
    if not set(gp.get("always_on", [])) <= panel_ids:
        err("graphics_panels.json: always_on 含未定义面板")
    for seq, ids in gp.get("sequences", {}).items():
        bad = set(ids) - panel_ids
        if bad:
            err(f"graphics_panels/sequences/{seq}: 引用未定义面板 {sorted(bad)}")

    # audio rules
    ar = load_json(ROOT / "data/presentation/audio_rules.json") or {}
    for t in ar.get("touch_sounds", []):
        base = str(t.get("event", "")).split(":")[0]
        if base not in contract["telemetry"]:
            err(f"audio_rules: touch_sounds 事件 {t.get('event')!r} 不在遥测词表")
    print(f"camera_director: {len(sids)} 状态；graphics_panels: {len(panel_ids)} 面板；animation_map: 动作集与 schema 对齐")


def check_calibration() -> None:
    base = ROOT / "data/calibration/epl_baseline.csv"
    with open(base, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    ids = [r.get("metric") for r in rows]
    if len(set(ids)) != len(ids):
        err("epl_baseline.csv: metric id 重复")
    for r in rows:
        try:
            lo, hi = float(r["min"]), float(r["max"])
        except (KeyError, ValueError):
            err(f"epl_baseline.csv: {r.get('metric')} min/max 非数值")
            continue
        if lo >= hi:
            err(f"epl_baseline.csv: {r.get('metric')} min({lo}) ≥ max({hi})")
    print(f"calibration/epl_baseline.csv: {len(rows)} 行")

    sens = ROOT / "data/calibration/tactics_sensitivity.csv"
    with open(sens, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    need = ["id", "name", "setup_a", "setup_b", "metric", "expected_direction",
            "min_effect", "batch_n"]
    for r in rows:
        for col in need:
            if not str(r.get(col, "")).strip():
                err(f"tactics_sensitivity/{r.get('id')}: 缺列 {col}")
        if r.get("batch_n") != "500":
            err(f"tactics_sensitivity/{r.get('id')}: batch_n 应为 500")
        fields = ["mentality", "def_line_base_m", "def_line_stretch", "press", "buildup",
                  "tempo", "width_m", "counter_press", "counter", "offside_trap",
                  "roles", "set_pieces", "familiarity", "manager"]
        sa = str(r.get("setup_a", ""))
        if not any(fd in sa for fd in fields) and "=" not in sa:
            err(f"tactics_sensitivity/{r.get('id')}: setup_a 未引用 SimParams 字段")
    if len(rows) != 6:
        err(f"tactics_sensitivity.csv 应为 6 条用例，实际 {len(rows)}")
    print(f"calibration/tactics_sensitivity.csv: {len(rows)} 行")


def main() -> int:
    bundle = check_tactics()
    players = load_players()
    check_examples(bundle, players)
    contract = check_schemas()
    check_presentation(contract)
    check_calibration()
    print(f"\n球员引用检查: {len(players)} 人可用")
    for w in warnings:
        print(f"WARN: {w}")
    if errors:
        print(f"\n{len(errors)} 个错误:")
        for e in errors:
            print(f"  ERROR: {e}")
        return 1
    print("\n校验通过 ✔")
    return 0


if __name__ == "__main__":
    sys.exit(main())
