#!/usr/bin/env python3
"""多源球员数据整合管线。

将 data/raw/ 下的外部数据源（EA FC26 等）与本地数据库 data/players/*.csv
按球员实体匹配，逐属性做加权融合：
  - 有外部值的属性: new = round(w_ext * ext + (1-w_ext) * prior)
  - 无外部值的属性: 保留本地值（prior）
身高/体重/惯用脚: 有外部值则直接采用外部值（实测元数据优先）。

用法: python scripts/integrate_sources.py [--dry-run]
输入: data/raw/eafc26_players.csv (必需), data/raw/fm24_players.csv (可选, 预留)
输出: 覆盖 data/players/*.csv + data/integration_report.csv
"""
import argparse
import csv
import glob
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
W_EXT = 0.6  # 外部源权重（EA 是量化评分体系），本地合成值作先验 0.4

ATTR_MAP = {
    # 我们的属性: (EA 列, 说明)
    "crossing": "attacking_crossing",
    "dribbling": "skill_dribbling",
    "finishing": "attacking_finishing",
    "first_touch": "skill_ball_control",
    "free_kicks": "skill_fk_accuracy",
    "heading": "attacking_heading_accuracy",
    "long_shots": "power_long_shots",
    "marking": "defending_marking_awareness",
    "passing": "attacking_short_passing",
    "tackling": None,  # (standing + sliding) / 2，特殊处理
    "technique": None,  # (ball_control + dribbling) / 2，特殊处理
    "penalties": "mentality_penalties",
    "aggression": "mentality_aggression",
    "anticipation": None,  # (positioning + interceptions) / 2
    "composure": "mentality_composure",
    "off_the_ball": "mentality_positioning",
    "positioning": "defending_marking_awareness",
    "vision": "mentality_vision",
    "acceleration": "movement_acceleration",
    "agility": "movement_agility",
    "balance": "movement_balance",
    "jumping": "power_jumping",
    "stamina": "power_stamina",
    "strength": "power_strength",
    "pace": "movement_sprint_speed",
}
GK_MAP = {
    "handling": "goalkeeping_handling",
    "kicking": "goalkeeping_kicking",
    "reflexes": "goalkeeping_reflexes",
    "command_of_area": "goalkeeping_positioning",
}
# EA 无对应项，保留本地先验:
# corners, long_throws, bravery, concentration, decisions, determination,
# flair, leadership, teamwork, natural_fitness
# GK: aerial_reach, communication, eccentricity, gk_first_touch, one_on_ones,
#     punching, rushing_out, throwing

WR = {"High": 88, "Medium": 68, "Low": 48, "": None}

META_COLS = {"height_cm": "height_cm", "weight_kg": "weight_kg"}


TRANSLIT = str.maketrans({
    "ø": "o", "Ø": "O", "æ": "ae", "Æ": "AE", "ß": "ss", "đ": "dj", "Đ": "Dj",
    "ł": "l", "Ł": "L", "ð": "d", "Ð": "D", "þ": "th", "œ": "oe", "ə": "e",
    "ı": "i", "ğ": "g", "ş": "s",
})

ALIASES = {
    "ollie": "oliver", "matt": "matthew", "matty": "matthew|mateusz", "tom": "thomas",
    "ben": "benjamin", "joe": "joseph", "eddie": "edward", "eddy": "edward",
    "dan": "daniel", "danny": "daniel", "jim": "james", "tony": "anthony",
    "gabe": "gabriel", "gabe": "gabriel", "nico": "nicolas|nicola|nikola",
    "leo": "leonardo", "alexis": "aleksis", "alex": "alexander|alexandre",
    "jc": "", "will": "william|guillermo", "jake": "jacob", "harry": "henry",
}


def norm_name(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.translate(TRANSLIT))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z ]", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def name_tokens(s: str):
    toks = norm_name(s).split()
    return {t for t in toks if t not in ("jr", "jr.")}


def token_credit(t: str, u: str, cache={}) -> float:
    key = (t, u) if t < u else (u, t)
    if key in cache:
        return cache[key]
    if t == u and len(t) > 1:
        c = 1.0
    elif t in ALIASES and u in ALIASES[t].split("|"):
        c = 1.0
    elif u in ALIASES and t in ALIASES[u].split("|"):
        c = 1.0
    elif len(t) > 1 and len(u) > 1 and (t.startswith(u) or u.startswith(t)):
        c = 0.8
    elif len(t) == 1 or len(u) == 1:
        c = 0.5 if t[0] == u[0] else -1
    else:
        from difflib import SequenceMatcher
        c = 0.7 if SequenceMatcher(None, t, u).ratio() >= 0.78 else -1
    cache[key] = c
    return c


def expand_tokens(toks):
    """token -> token + 别名扩展（用于倒排索引召回）。"""
    out = set(toks)
    for t in toks:
        if t in ALIASES:
            out.update(a for a in ALIASES[t].split("|") if a)
    return out


def index_ea(ea_all):
    """倒排索引: token -> [(row_idx, side)]，只索引完整 token。"""
    inv = {}
    recs = []
    for i, ea in enumerate(ea_all):
        ts = name_tokens(ea.get("long_name", "")) | name_tokens(ea.get("short_name", ""))
        recs.append(ts)
        for t in ts:
            inv.setdefault(t, []).append(i)
    return recs, inv


def match_score(ours: str, ea_short: str, ea_long: str) -> float:
    """短名每个 token 都要命中；全等/别名词典 1 分，前缀 0.8，首字母 0.5，模糊 0.7。"""
    best = 0.0
    for cand in (ea_long, ea_short):
        a, b = name_tokens(ours), name_tokens(cand)
        if not a or not b:
            continue
        short, long_ = (a, b) if len(a) <= len(b) else (b, a)
        credits = []
        ok = True
        for t in short:
            best_c = max((token_credit(t, u) for u in long_), default=-1)
            if best_c < 0:
                ok = False
                break
            credits.append(best_c)
        if ok:
            best = max(best, 0.6 + 0.4 * (sum(credits) / len(credits)))
    return best


def clamp(v):
    return max(1, min(99, int(round(v))))


def load_ours():
    cols = None
    players = []
    for p in sorted(glob.glob(str(ROOT / "data/players/*.csv"))):
        with open(p, encoding="utf-8") as f:
            rows = list(csv.reader(f))
        cols = cols or rows[0]
        club = Path(p).stem
        for r in rows[1:]:
            players.append({"club": club, "row": r})
    return cols, players


def load_ea():
    p = ROOT / "data/raw/eafc26_players.csv"
    if not p.exists():
        return []
    with open(p, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def ea_val(ea, col):
    v = (ea.get(col) or "").strip()
    if v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def ea_attrs(ea, is_gk: bool) -> dict:
    """EA 记录 -> 我们 schema 的属性值（0-100）。"""
    out = {}
    for ours, eacol in ATTR_MAP.items():
        if eacol is None:
            continue
        v = ea_val(ea, eacol)
        if v is not None:
            out[ours] = clamp(v)
    for spec, cols in (("tackling", ("defending_standing_tackle", "defending_sliding_tackle")),
                       ("technique", ("skill_ball_control", "skill_dribbling")),
                       ("anticipation", ("mentality_positioning", "mentality_interceptions"))):
        vs = [ea_val(ea, c) for c in cols]
        if all(v is not None for v in vs):
            out[spec] = clamp(sum(vs) / len(vs))
    wr = (ea.get("work_rate") or "").split("/")
    wrs = [WR.get(w.strip()) for w in wr]
    wrs = [v for v in wrs if v is not None]
    if wrs:
        out["work_rate"] = clamp(sum(wrs) / len(wrs))
    if is_gk:
        for ours, eacol in GK_MAP.items():
            v = ea_val(ea, eacol)
            if v is not None:
                out[ours] = clamp(v)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cols, ours = load_ours()
    ea_all = load_ea()
    if not ea_all:
        print("缺少 data/raw/eafc26_players.csv，无法整合")
        return 1
    ea_tokens, ea_inv = index_ea(ea_all)
    idx = cols.index
    i_name, i_age, i_pos, i_ftl, i_ftr = idx("name"), idx("age"), idx("positions"), idx("foot_l"), idx("foot_r")
    i_h, i_w = idx("height_cm"), idx("weight_kg")
    attr_cols = cols[9:57]  # 技术11+定位球3+精神14+身体8+门将12

    report = []
    n_match = n_age_reject = 0
    changed = 0
    for p in ours:
        r = p["row"]
        our_age = int(r[i_age])
        is_gk = "GK" in r[i_pos]
        toks = expand_tokens(name_tokens(r[i_name]))
        cand_idx = {i for t in toks for i in ea_inv.get(t, [])}
        # 候选: 姓名相似度 >= 0.9, 年龄差 = 0/1/2（EA 快照早 1 年）
        cands = []
        for i in cand_idx:
            ea = ea_all[i]
            s = match_score(r[i_name], ea.get("short_name", ""), ea.get("long_name", ""))
            if s < 0.9:
                continue
            ea_age = ea_val(ea, "age")
            if ea_age is None or (our_age - ea_age) not in (0, 1, 2):
                continue
            cands.append((s, ea))
        if not cands:
            report.append([r[0], r[i_name], p["club"], "UNMATCHED", "", ""])
            continue
        cands.sort(key=lambda x: -x[0])
        score, ea = cands[0]
        if len(cands) > 1:
            report.append([r[0], r[i_name], p["club"], f"AMBIGUOUS({len(cands)})", "", ""])
        ea_age = ea_val(ea, "age")
        if (our_age - ea_age) not in (0, 1, 2):
            n_age_reject += 1
            continue
        n_match += 1
        ext = ea_attrs(ea, is_gk)
        n_upd = 0
        if not args.dry_run:
            # 元数据直接采用 EA（实测值）
            for ours_col, eacol in META_COLS.items():
                v = ea_val(ea, eacol)
                if v:
                    r[idx(ours_col)] = str(int(v))
            foot = (ea.get("preferred_foot") or "").strip()
            weak = ea_val(ea, "weak_foot")
            if foot in ("Right", "Left") and weak:
                strong, off = (i_ftr, i_ftl) if foot == "Right" else (i_ftl, i_ftr)
                r[strong] = str(clamp(84 + weak * 2))
                r[off] = str(clamp(40 + weak * 10))
            # 属性加权融合
            for c in attr_cols:
                if c in ext and r[idx(c)] != "":
                    old = int(r[idx(c)])
                    new = clamp(W_EXT * ext[c] + (1 - W_EXT) * old)
                    if new != old:
                        r[idx(c)] = str(new)
                        changed += 1
                elif c in ext and r[idx(c)] == "" and is_gk:
                    r[idx(c)] = str(ext[c])
                    n_upd += 1
        report.append([r[0], r[i_name], p["club"], "MATCHED",
                       f"score={score:.2f}", f"ea_overall={ea.get('overall','')}",
                       f"attrs_from_ea={len(ext)}"])

    print(f"匹配 {n_match}/{len(ours)}, 年龄校验拒绝 {n_age_reject}")
    print(f"属性值更新 {changed} 处")
    if not args.dry_run:
        for p in ours:
            club = p["club"]
            with open(ROOT / f"data/players/{club}.csv", "w", encoding="utf-8", newline="") as f:
                w = csv.writer(f)
                w.writerow(cols)
                for q in ours:
                    if q["club"] == club:
                        w.writerow(q["row"])
        with open(ROOT / "data/integration_report.csv", "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(["player_id", "name", "club", "status", "match_score", "ea_overall", "detail"])
            w.writerows(report)
        print("已写回 data/players/*.csv, 报告: data/integration_report.csv")
    unmatched = [r for r in report if r[3] == "UNMATCHED"]
    print(f"未匹配 {len(unmatched)}: " + ", ".join(f"{r[2]}:{r[1]}" for r in unmatched[:20]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
