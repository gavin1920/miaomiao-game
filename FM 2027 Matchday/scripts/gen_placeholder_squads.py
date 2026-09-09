#!/usr/bin/env python3
"""为尚无球员数据的俱乐部生成 v0 占位阵容（合成球员，非真人）。

用途：M0 批测需要全联赛 20 队。ARS/AVL 已有人工标定数据，其余 18 队生成
分档（T1-T4）占位阵容，让统计校准能在"有强弱分化"的联赛上跑。
这些文件是**校准脚手架**：真实标定数据逐队就位后直接覆盖同名文件。

用法: python scripts/gen_placeholder_squads.py   （幂等，覆盖生成）
"""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COLUMNS = next(csv.reader(open(ROOT / "data/players/ARS.csv", encoding="utf-8")))

# 档位基准（0-100 语义见 data/README.md 分档表）：
#   T1 争冠 / T2 欧战区 / T3 中游 / T4 保级与升班马
TIERS = {
    "T1": ["MCI", "LIV", "CHE"],
    "T2": ["MUN", "TOT", "NEW"],
    "T3": ["BOU", "BRE", "BHA", "CRY", "EVE", "FUL", "NFO", "SUN", "LEE"],
    "T4": ["COV", "HUL", "IPS"],
}
TIER_BASE = {"T1": 82, "T2": 76, "T3": 70, "T4": 63}

# 每队 18 人模板：(位置, 主属性偏置组)
TEMPLATE = [
    ("GK", "gk"), ("GK", "gk"),
    ("DR", "def"), ("DL", "def"), ("DC", "def"), ("DC", "def"), ("DC", "def"),
    ("DM", "mid6"), ("MC", "mid8"), ("MC", "mid8"), ("MC", "mid8"),
    ("MR", "wing"), ("ML", "wing"),
    ("AMR", "att"), ("AML", "att"), ("AMC", "am"),
    ("ST", "st"), ("ST", "st"),
]

# 属性模板：组名 → {属性: 与档位基准的偏移}
OFF = {
    "gk":   {},
    "def":  {"positioning": 4, "tackling": 3, "marking": 3, "heading": 3, "jumping": 3,
             "strength": 3, "finishing": -18, "dribbling": -8, "off_the_ball": -8,
             "long_shots": -10, "crossing": -5},
    "mid6": {"positioning": 3, "tackling": 3, "passing": 3, "concentration": 3,
             "finishing": -10, "pace": -4},
    "mid8": {"passing": 4, "stamina": 4, "work_rate": 3, "teamwork": 3,
             "marking": -6, "tackling": -3},
    "wing": {"pace": 5, "acceleration": 5, "dribbling": 3, "agility": 3,
             "marking": -10, "tackling": -8, "jumping": -10},
    "att":  {"dribbling": 4, "acceleration": 4, "agility": 3, "flair": 4,
             "marking": -14, "tackling": -12, "jumping": -8},
    "am":   {"vision": 5, "passing": 4, "technique": 4, "first_touch": 3,
             "marking": -12, "tackling": -12},
    "st":   {"finishing": 6, "off_the_ball": 5, "composure": 3, "pace": 3,
             "marking": -18, "tackling": -18},
}
SECOND_POS = {"DC": "DR+", "DM": "MC+", "MC": "AMC+", "MR": "AMR+", "ML": "AML+",
              "AMR": "ST+", "AML": "ST+", "AMC": "MC+", "ST": "AMC+"}
MENTAL_SKIP_GK = {"crossing", "dribbling", "finishing", "free_kicks", "heading",
                  "long_shots", "marking", "tackling", "technique",
                  "corners", "long_throws", "penalties"}

ATTRS = COLUMNS[9:-1]  # 53 个属性列（traits 单列处理）


def gen_player(rng, club, i, pos, group, base, is_starter):
    level = base + rng.randint(2, 6) if is_starter else base + rng.randint(-9, -2)
    pid = f"{club}{i:02d}"
    name = f"{club} Player {i:02d}"  # 合成球员：占位名，真实标定后覆盖
    age = rng.randint(20, 33)
    if pos == "GK":
        height = rng.randint(186, 196)
    elif pos in ("DC", "ST"):
        height = rng.randint(183, 193)
    else:
        height = rng.randint(174, 186)
    weight = height - rng.randint(95, 112)
    foot_r = rng.randint(78, 95)
    foot_l = foot_r - rng.choice([0, 10, 20, 30, 40])
    foot_l = max(30, min(95, foot_l))
    pos_field = pos + "*"
    if pos in SECOND_POS and rng.random() < 0.5:
        pos_field += f",{SECOND_POS[pos]}"

    row = {c: "" for c in COLUMNS}
    row.update(id=pid, name=name, club=club, age=age, height_cm=height,
               weight_kg=weight, foot_l=foot_l, foot_r=foot_r, positions=pos_field)

    def val(attr):
        return max(20, min(99, level + OFF.get(group, {}).get(attr, 0) + rng.randint(-5, 5)))

    if pos == "GK":
        row["first_touch"] = val("passing")
        row["passing"] = val("passing")
        for a in ("aerial_reach", "command_of_area", "communication", "handling",
                  "kicking", "one_on_ones", "reflexes", "rushing_out", "throwing"):
            row[a] = val(a)
        row["eccentricity"] = rng.randint(20, 55)
        row["punching"] = rng.randint(25, 70)
        row["gk_first_touch"] = val("passing")
    else:
        for a in ATTRS:
            if a in MENTAL_SKIP_GK or a in ("gk_first_touch", "eccentricity",
                                            "aerial_reach", "command_of_area",
                                            "communication", "handling", "kicking",
                                            "one_on_ones", "punching", "reflexes",
                                            "rushing_out", "throwing", "consistency",
                                            "important_matches", "injury_proneness",
                                            "versatility", "dirtiness"):
                continue
            row[a] = val(a)
        row["corners"] = val("crossing")
        row["long_throws"] = rng.randint(20, 60)
        row["penalties"] = max(25, level + rng.randint(-20, 10))
    # 精神/身体/隐藏（GK 同样有）
    for a in ("consistency", "important_matches", "injury_proneness",
              "versatility", "dirtiness"):
        row[a] = rng.randint(30, 85)
    return row


def main():
    clubs = [r["id"] for r in csv.DictReader(open(ROOT / "data/clubs.csv", encoding="utf-8"))]
    existing = {p.stem for p in (ROOT / "data/players").glob("*.csv")}
    rng = random.Random(2027)
    made = []
    for club in clubs:
        if club in existing:
            continue
        tier = next(t for t, ids in TIERS.items() if club in ids)
        rows = [gen_player(rng, club, i + 1, pos, g, TIER_BASE[tier], i < 11)
                for i, (pos, g) in enumerate(TEMPLATE)]
        with open(ROOT / f"data/players/{club}.csv", "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=COLUMNS)
            w.writeheader()
            w.writerows(rows)
        made.append(f"{club} ({tier}, {len(rows)} 人)")
    print(f"生成占位阵容 {len(made)} 队: {', '.join(made)}")
    if not made:
        print("全部 20 队已有数据，未生成。")


if __name__ == "__main__":
    main()
