#!/usr/bin/env python3
"""校验 data/players/*.csv 与 data/clubs.csv 的结构与取值范围。

用法: python scripts/validate_data.py  (在仓库根目录运行)
"""
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

COLUMNS = [
    # 元信息 9
    "id", "name", "club", "age", "height_cm", "weight_kg", "foot_l", "foot_r", "positions",
    # 技术 11
    "crossing", "dribbling", "finishing", "first_touch", "free_kicks", "heading",
    "long_shots", "marking", "passing", "tackling", "technique",
    # 定位球 3
    "corners", "long_throws", "penalties",
    # 精神 14
    "aggression", "anticipation", "bravery", "composure", "concentration", "decisions",
    "determination", "flair", "leadership", "off_the_ball", "positioning", "teamwork",
    "vision", "work_rate",
    # 身体 8
    "acceleration", "agility", "balance", "jumping", "natural_fitness", "pace",
    "stamina", "strength",
    # 门将 12
    "aerial_reach", "command_of_area", "communication", "eccentricity", "gk_first_touch",
    "handling", "kicking", "one_on_ones", "punching", "reflexes", "rushing_out", "throwing",
    # 隐藏 5
    "consistency", "important_matches", "injury_proneness", "versatility", "dirtiness",
    # 特性
    "traits",
]

GK_COLS = {"aerial_reach", "command_of_area", "communication", "eccentricity",
           "gk_first_touch", "handling", "kicking", "one_on_ones", "punching",
           "reflexes", "rushing_out", "throwing"}
GK_ALLOWED_TECH = {"first_touch", "passing"}

VALID_POSITIONS = {"GK", "DR", "DL", "DC", "WBR", "WBL", "DM", "MR", "ML",
                   "MC", "AMR", "AML", "AMC", "ST"}

TRAITS = {"喜欢远射", "爱盘带过人", "喜欢直塞身后", "回做型", "喜欢抢点近门柱",
          "高举高打", "喜欢利用速度", "拉边型前腰", "喜欢内切", "贴地传中",
          "犯规战术型", "大力手抛球"}

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def parse_val(v, col: str, who: str):
    if v is None:
        err(f"{who}: 列 {col} 缺失（行字段数不足）")
        return None
    v = str(v).strip()
    if v == "":
        return None
    try:
        n = int(v)
    except ValueError:
        err(f"{who}: 列 {col} 不是整数: {v!r}")
        return None
    if not 0 <= n <= 100:
        err(f"{who}: 列 {col} 超出 0-100: {n}")
    return n


def parse_int(v: str, who: str):
    v = v.strip()
    try:
        return int(v)
    except ValueError:
        err(f"{who}: 不是整数: {v!r}")
        return None


def parse_range(v: str, lo: int, hi: int, col: str, who: str) -> None:
    n = parse_int(v, who)
    if n is not None and not lo <= n <= hi:
        err(f"{who}: 列 {col} 超出 {lo}-{hi}: {n}")


def main() -> int:
    # clubs.csv
    clubs = {}
    with open(ROOT / "data" / "clubs.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            clubs[row["id"]] = row
    if len(clubs) != 20:
        err(f"clubs.csv 应有 20 队，实际 {len(clubs)}")

    total = 0
    for path in sorted((ROOT / "data" / "players").glob("*.csv")):
        club_id = path.stem
        if club_id not in clubs:
            err(f"{path.name}: club id {club_id} 不在 clubs.csv 中")
            continue
        with open(path, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            header = reader.fieldnames or []
            if header != COLUMNS:
                missing = [c for c in COLUMNS if c not in header]
                extra = [c for c in header if c not in COLUMNS]
                err(f"{path.name}: 表头不符 63 列 (缺: {missing}, 多: {extra})")
                continue
            n = 0
            gk_count = 0
            for row in reader:
                n += 1
                who = f"{club_id}/{row['id']} {row['name']}"
                if row["club"] != club_id:
                    err(f"{who}: club 列 {row['club']} 与文件名不符")
                age = parse_val(row["age"], "age", who)
                if age is not None and not 16 <= age <= 40:
                    err(f"{who}: 年龄异常 {age}")
                parse_range(row["height_cm"], 150, 220, "height_cm", who)
                parse_range(row["weight_kg"], 50, 110, "weight_kg", who)
                parse_val(row["foot_l"], "foot_l", who)
                parse_val(row["foot_r"], "foot_r", who)

                # positions
                is_gk = False
                pos_field = row["positions"] or ""
                for tok in [t.strip() for t in pos_field.split(",") if t.strip()]:
                    suffix = ""
                    if tok.endswith("*"):
                        suffix, base = "*", tok[:-1]
                    elif tok.endswith("+"):
                        suffix, base = "+", tok[:-1]
                    else:
                        base = tok
                    if base not in VALID_POSITIONS:
                        err(f"{who}: 未知位置 {tok}")
                    if base == "GK":
                        is_gk = True
                if not pos_field.strip():
                    err(f"{who}: positions 为空")

                # 属性列
                attr_vals = {}
                for col in COLUMNS:
                    if col in ("id", "name", "club", "age", "height_cm", "weight_kg",
                               "foot_l", "foot_r", "positions", "traits"):
                        continue
                    v = parse_val(row[col], col, who)
                    if v is not None:
                        attr_vals[col] = v

                gk_filled = [c for c in GK_COLS if c in attr_vals]
                if is_gk:
                    gk_count += 1
                    missing_gk = GK_COLS - set(gk_filled)
                    if missing_gk:
                        err(f"{who}: 门将列缺失 {sorted(missing_gk)}")
                    bad_tech = [c for c in attr_vals
                                if c in {"crossing", "dribbling", "finishing", "free_kicks",
                                         "heading", "long_shots", "marking", "tackling",
                                         "technique", "corners", "long_throws", "penalties"}
                                and c not in GK_ALLOWED_TECH]
                    if bad_tech:
                        warnings.append(f"{who}: 门将填了场上技术列 {bad_tech}（允许，仅提示）")
                else:
                    if gk_filled:
                        err(f"{who}: 非门将却填了门将列 {gk_filled}")

                for t in [t.strip() for t in (row["traits"] or "").split("|") if t.strip()]:
                    if t not in TRAITS:
                        err(f"{who}: 未知特性 {t!r}")
            total += n
            print(f"{club_id}: {n} 人 (GK {gk_count})")

    print(f"\n合计: {total} 人, {len(clubs)} 队")
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
