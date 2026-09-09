#!/usr/bin/env python3
"""修复由旧版生成器产生的球员 CSV 结构性错位（幂等）。

病根：positions 多值字段未加引号 → 整行字段右移；GK 行的 first_touch 被
写到 marking 位；行尾存在悬空的 overhang 值；部分行缺尾部字段/短行。

修复规则（保值不动位）：
- csv 感知解析；恰好 63 字段的行视为已修复，原样保留。
- positions 吞并 field[8:] 起的连续位置记法 token，余下为值流 stream。
- 场上行：stream[0:35] 按位映射 36 核心列（空值照实保留）；
  stream[36:] 的非空尾部 ≥6 → 首个=异常 aerial_reach（舍弃并记录），
  末 5 个=隐藏属性，其后首个非数字=traits；=5 → 全部为隐藏属性。
- GK 行：stream[7] 的单值 → first_touch；stream[16:28]→bravery..work_rate；
  stream[28:36]→身体 8 列；stream[36:48]→门将 12 列（按位）；
  stream[48:] 非空尾部取末 5 个=隐藏属性（overhang 舍弃）。

用法: python scripts/repair_player_csv.py
"""
import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_data import COLUMNS  # noqa: E402

META = COLUMNS[:9]
ATTR = COLUMNS[9:]
TRAITS_VOCAB = {"喜欢远射", "爱盘带过人", "喜欢直塞身后", "回做型", "喜欢抢点近门柱",
                "高举高打", "喜欢利用速度", "拉边型前腰", "喜欢内切", "贴地传中",
                "犯规战术型", "大力手抛球"}
POS_RE = re.compile(r"^(GK|DR|DL|DC|WBR|WBL|DM|MR|ML|MC|AMR|AML|AMC|ST)[*+]?$")
FIXED = [c for c in ATTR if c != "traits"]  # 52 列按位/块映射 + traits 单独


def split_positions(fields):
    k = 8
    while k < len(fields) and fields[k] and POS_RE.match(fields[k].strip()):
        k += 1
    return fields[8:k], fields[k:]


def is_trait(v):
    return v and not v.isdigit() and (v in TRAITS_VOCAB or not v.replace(".", "").isdigit())


def repair_row(fields, who, dropped):
    fields = [(f if f is not None else "") for f in fields]
    if len(fields) == 63:
        return None  # 已是正确布局
    positions, stream = split_positions(fields)
    if not positions:
        raise ValueError(f"{who}: 第 9 列不是位置记法")
    is_gk = positions[0].startswith("GK")
    vals = {c: "" for c in ATTR}

    def tail_hidden(tail_vals, who):
        traits = ""
        vals = list(tail_vals)
        if vals and is_trait(vals[-1]):
            traits = vals.pop()
        if len(vals) >= 5:
            return vals[-5:], vals[:-5], traits
        if not vals:
            return [""] * 5, [], traits
        print(f"  WARN {who}: 隐藏属性仅 {len(vals)} 个，前补空（请人工复核该行）")
        return [""] * (5 - len(vals)) + vals, [], traits

    if is_gk:
        # stream[7] = 唯一技术值（应为 first_touch）
        if len(stream) > 7 and stream[7]:
            vals["first_touch"] = stream[7]
            if len(stream) > 3:
                pass  # marking 位保持空
        if len(stream) >= 48:
            for c, v in zip(ATTR[16:28], stream[16:28]):
                vals[c] = v
            for c, v in zip(ATTR[28:36], stream[28:36]):
                vals[c] = v
            for c, v in zip(ATTR[36:48], stream[36:48]):
                vals[c] = v
            tail = [v for v in stream[48:] if v != ""]
            hid, overhang, traits = tail_hidden(tail, who)
            for c, v in zip(ATTR[48:53], hid):
                vals[c] = v
            vals["traits"] = traits if traits else ""
            if overhang:
                dropped.append((who, "GK overhang", "|".join(overhang)))
        else:
            raise ValueError(f"{who}: GK 行值流过短 ({len(stream)})")
    else:
        for c, v in zip(ATTR[0:36], stream[0:36]):
            vals[c] = v
        tail = [v for v in stream[36:] if v != ""]
        if len(tail) >= 6:
            dropped.append((who, "aerial_reach", tail[0]))
            hid, rest, traits = tail_hidden(tail[1:], who)
        else:
            hid, rest, traits = tail_hidden(tail, who)
        for c, v in zip(ATTR[48:53], hid):
            vals[c] = v
        vals["traits"] = traits
    row = {m: fields[i] for i, m in enumerate(META[:8])}
    row["positions"] = ",".join(p.strip() for p in positions)
    row.update(vals)
    return row


def main():
    dropped = []
    fixed_n = 0
    for path in sorted((ROOT / "data/players").glob("*.csv")):
        with open(path, encoding="utf-8", newline="") as f:
            rows = list(csv.reader(f))
        header, body = rows[0], rows[1:]
        if header != COLUMNS:
            print(f"{path.name}: 表头不符，跳过")
            continue
        out, changed = [], False
        for fields in body:
            if not any((f or "").strip() for f in fields):
                continue
            try:
                r = repair_row(fields, f"{path.stem}/{fields[0]}", dropped)
            except Exception as e:  # noqa: BLE001
                print(f"ERROR {path.stem}/{fields[0]}: 无法自动修复 ({e})；原行存入 data/players/_needs_manual_fix.txt")
                with open(ROOT / "data/players/_needs_manual_fix.txt", "a", encoding="utf-8") as log:
                    log.write(",".join(fields) + "\n")
                r = {m: (fields[i] if i < len(fields) else "") for i, m in enumerate(META)} | \
                    {c: "" for c in ATTR}
            if r is None:
                row = {m: fields[i] for i, m in enumerate(META)} | \
                    {c: fields[i + 9] for i, c in enumerate(ATTR)}
                # 修复上一版把特性误写进 dirtiness 的行
                dparts = [t.strip() for t in (row.get("dirtiness") or "").split("|") if t.strip()]
                if dparts and all(t in TRAITS_VOCAB for t in dparts) and not (row.get("traits") or "").strip():
                    row["traits"], row["dirtiness"] = row["dirtiness"], ""
                    changed = True
                out.append(row)
            else:
                out.append(r)
                changed = True
        if changed:
            with open(path, "w", encoding="utf-8", newline="") as f:
                w = csv.DictWriter(f, fieldnames=COLUMNS)
                w.writeheader()
                w.writerows(out)
            fixed_n += 1
            print(f"{path.name}: 修复 {sum(1 for _ in out)} 行")
    if dropped:
        print("\n舍弃的多余值（生成器写入的 schema 外数据）:")
        for who, kind, v in dropped:
            print(f"  {who} [{kind}] = {v}")


if __name__ == "__main__":
    main()
