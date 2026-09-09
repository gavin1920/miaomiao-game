#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
喵都幸存者 —— 掉落物像素画生成器（可复跑）
==========================================
每个素材 = ASCII 像素画字符串 + 调色板字典。
逐字符映射颜色，'.' 为透明；PNG 尺寸 = 字符串行×列（不缩放）。
游戏端 js/art_pixel.js 会把 PNG 按原生尺寸 ×2 最近邻烘焙，
所以这里的网格尺寸 ×2 就是游戏内尺寸。

配色 VI：墨线 #453244 / 奶油白 #fff6e0 / 项圈红 #e05656 / 铃铛金 #ffd76e
基准（原版矢量）：gem1 44×36, gem2 48×40, gem3 54×44,
coin 36×36, milk 40×44, firework 40×46, vacuum 44×40
→ 本脚本网格 = 基准 ÷2 ±15% 内。

跑法：  python tools/gen/pixel_drops.py
输出：  7 张 PNG + tools/gen/drops_preview.png（对比图）
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "pixel-assets"
PREVIEW = ROOT / "tools" / "gen" / "drops_preview.png"

# ---------------------------------------------------------------- 调色板
def C(h, a=255):
    """'#rrggbb' -> RGBA"""
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), a)

INK     = C("#453244")   # 统一墨线
CREAM   = C("#fff6e0")   # 奶油白
RED     = C("#e05656")   # 项圈红
GOLD    = C("#ffd76e")   # 铃铛金
WHITE   = C("#ffffff")
PINK    = C("#ffb3b3")   # 烟花高光粉
DGOLD   = C("#e8a53d")   # 金币暗部
DRED    = C("#b23f3f")   # 磁铁暗部
SILVER  = C("#eef2f8")   # 磁极银白
LBLUE   = C("#bfe8f7")   # 牛奶标签淡蓝
BLUE    = C("#6fb7ff")   # 标签小鱼蓝

# 三档鱼主色（原版矢量取色）
GEM1 = {"B": C("#cfe0f2"), "F": C("#9db8d4"), "L": C("#aebfd6")}  # 浅银蓝
GEM2 = {"B": C("#6fb7ff"), "F": C("#3f80dd"), "L": C("#4d90e8")}  # 亮蓝
GEM3 = {"B": C("#ffd34d"), "F": C("#ef9c2e"), "L": C("#eda93c")}  # 金黄

# ---------------------------------------------------------------- 素材定义
# 图例（鱼）：K 墨线 / B 身体 / F 鳍尾 / L 腹部 / W 眼高光
# 造型：圆头大头鱼（朝左）+ 上扬三角尾（原版 -0.35rad 倾斜的摆尾感）
FISH_1 = [
    "..................",
    "..................",
    "..................",
    ".....KKKK.........",
    "....KFFFFK....KKKK",
    "...KBBBBBBKFFFFFK.",
    "..KBBBBBBBKFFFFK..",
    ".KBWKBBBBBKFFFK...",
    "KBBKKBBBBBKFFK....",
    "KBBBBFFBBBKFK.....",
    ".KLLLLLLLKK.......",
    "...KKKKK..........",
    "..................",
    "..................",
    "..................",
]

FISH_2 = [
    "....................",
    "....................",
    "....................",
    "....................",
    ".....KFFFFK....KKKKK",
    "....KBBBBBBKFFFFFFFK",
    "..KBBBBBBBBKFFFFK...",
    ".KBWKBBBBBBKFFFK....",
    "KBBKKBBBBBBKFFK.....",
    "KBBBBFFBBBBKFK......",
    ".KLLLLLLLLKK........",
    "..KLLLLLLK..........",
    "....KKKKK...........",
    "....................",
    "....................",
    "....................",
]

FISH_3 = [
    ".......................",
    ".......................",
    ".......................",
    ".......KKKK............",
    "......KFFFFK......KKKKK",
    ".....KBBBBBBKFFFFFFFFK.",
    "...KBBBBBBBBKFFFFFFFK..",
    "..KBBBBBBBBBKFFFFFFK...",
    ".KBBBBBBBBBBKFFFFFK....",
    "KBBWKBBBBBBBKFFFFK.....",
    "KBBKKBBBBBBBKFFK.......",
    "KBBBBBFFBBBBKFFK.......",
    "KBBBBBFFBLLLKFK........",
    ".KBLLLLLLLLK.K.........",
    "..KLLLLLLLK............",
    "....KKKKK..............",
    ".......................",
    ".......................",
]

# 图例（金币）：K 墨线 / G 金 / C 奶油高光内环 / D 暗金内环+小鱼压印
COIN = [
    ".................",
    ".................",
    "......KKKKK......",
    "....KCGGGGGGK....",
    "...KCGGGGGGGGK...",
    "..KCGGGGGGGGGGK..",
    ".KCGGGGGGGGGGGGK.",
    ".KCGGGDDDGDGGGGK.",
    ".KCGGDDDDDDGGGGK.",
    ".KCGGGDDDGDGGGDK.",
    ".KGGGGGGGGGGGGDK.",
    "..KGGGGGGGGGGDK..",
    "...KGGGGGGGGDK...",
    "....KGGGGGGDK....",
    "......KKKKK......",
    ".................",
    ".................",
]

# 图例（牛奶）：K 墨线 / R 红瓶盖 / C 奶油瓶身 / L 淡蓝标签 / B 标签小鱼 / W 高光
MILK = [
    ".....KKKKKKKKKK.....",
    ".....KRRRRRRRRK.....",
    ".....KRRRRRRRRK.....",
    ".....KKKKKKKKKK.....",
    "......KWCCCCCK......",
    "......KCCCCCCK......",
    "......KCCCCCCK......",
    ".....KCCCCCCCCK.....",
    "....KCCCCCCCCCCK....",
    "....KCCCCCCCCCCK....",
    "....KCCCCCCCCCCK....",
    "....KKKKKKKKKKKK....",
    "....KLLLLLLLLLLK....",
    "....KLLLKKKLKLLK....",
    "....KLLKBBBKKLLK....",
    "....KLLLKKKLKLLK....",
    "....KLLLLLLLLLLK....",
    "....KKKKKKKKKKKK....",
    "....KCCCCCCCCCCK....",
    "....KCCCCCCCCCCK....",
    "....KCCCCCCCCCCK....",
    "....KKKKKKKKKKKK....",
]

# 图例（烟花）：K 墨线 / G 金弹头+鳍 / R 红炮身 / P 粉高光 / C 火花芯 / O 星花金
FIREWORK = [
    "....................",
    ".................KGK",
    "....G...........KGGK",
    "...GCG.........KGGGK",
    "....G..........KGGGK",
    "..............KPRRK.",
    ".............KPRRK..",
    "............KPRRK...",
    "...........KPRRK....",
    "..........KPRRK.....",
    ".........KPRRK...G..",
    "........KPRRK...GCG.",
    ".......KPRRK.....G..",
    "...KGKKPRRK.........",
    "..KGKKPRRK..........",
    "....KPRRKKGGK.......",
    "...KKKKKKGGGK.......",
    ".GCG.....KGK........",
    "GCG.................",
    "G...G...............",
    ".G...G..............",
    "....................",
    "....................",
]

# 图例（磁铁）：K 墨线 / R 红磁体 / D 暗红弧底 / S 银白磁极 / G 被吸的小鱼干
VACUUM = [
    ".......KKK.K........",
    "......KGGGKK........",
    ".......KKK.K........",
    "...KKKKK....KKKKK...",
    "...KSSSK....KSSSK...",
    "...KSSSK....KSSSK...",
    "...KSSSK....KSSSK...",
    "...KRRRK....KRRRK...",
    "...KRRRK....KRRRK...",
    "...KRRRKKKKKKRRRK...",
    "..KRRRRRRRRRRRRRRK..",
    "..KRRRRRRRRRRRRRRK..",
    "...KRRRRRRRRRRRRK...",
    "....KRRRRDDDDRRK....",
    ".....KRDDDDDDRK.....",
    ".......KDDDDK.......",
    "........KKKK........",
    "....................",
]

SPRITES = [
    {
        "name": "一级小鱼",
        "path": "items/pickups/gem_1/tier_1.png",
        "palette": {"K": INK, "W": WHITE, **GEM1},
        "art": FISH_1,
    },
    {
        "name": "二级小鱼",
        "path": "items/pickups/gem_2/tier_1.png",
        "palette": {"K": INK, "W": WHITE, **GEM2},
        "art": FISH_2,
    },
    {
        "name": "三级小鱼",
        "path": "items/pickups/gem_3/tier_1.png",
        "palette": {"K": INK, "W": WHITE, **GEM3},
        "art": FISH_3,
    },
    {
        "name": "金币",
        "path": "items/pickups/coin/coin_1.png",
        "palette": {"K": INK, "G": GOLD, "C": CREAM, "D": DGOLD},
        "art": COIN,
    },
    {
        "name": "牛奶",
        "path": "items/icons/milk.png",
        "palette": {"K": INK, "R": RED, "C": CREAM, "L": LBLUE, "B": BLUE, "W": WHITE},
        "art": MILK,
    },
    {
        "name": "烟花",
        "path": "items/icons/firework.png",
        "palette": {"K": INK, "G": GOLD, "R": RED, "P": PINK, "C": CREAM},
        "art": FIREWORK,
    },
    {
        "name": "磁铁",
        "path": "items/icons/vacuum.png",
        "palette": {"K": INK, "R": RED, "D": DRED, "S": SILVER, "G": GOLD},
        "art": VACUUM,
    },
]

# 质检：调色板里不许有没画到的颜色（防止手滑多配色）
EXPECTED_SIZE = {
    "一级小鱼": (18, 15),
    "二级小鱼": (20, 16),
    "三级小鱼": (23, 18),
    "金币": (17, 17),
    "牛奶": (20, 22),
    "烟花": (20, 23),
    "磁铁": (20, 18),
}


def render(sprite):
    """ASCII -> RGBA Image，尺寸=行列数，不做任何缩放。"""
    art, pal = sprite["art"], sprite["palette"]
    w = len(art[0])
    h = len(art)
    want = EXPECTED_SIZE[sprite["name"]]
    assert (w, h) == want, f"{sprite['name']}: 画布 {w}x{h} != 目标 {want[0]}x{want[1]}"
    used = set()
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(art):
        assert len(row) == w, f"{sprite['name']} 第{y}行长度 {len(row)} != {w}: {row!r}"
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            assert ch in pal, f"{sprite['name']} 用了未定义色 {ch!r} @({x},{y})"
            px[x, y] = pal[ch]
            used.add(ch)
    unused = set(pal) - used
    assert not unused, f"{sprite['name']} 调色板有未使用颜色: {unused}"
    n_colors = len({pal[c] for c in used})
    assert n_colors <= 6, f"{sprite['name']} 用色 {n_colors} > 6"
    return img


def build_preview(images):
    """左：主角/灰灰鼠参照物；右：7 个掉落物按游戏内(×2)尺寸摆放 + ×4 放大质检行。"""
    W, H = 980, 700
    bg = Image.new("RGBA", (W, H), C("#fff6e0"))
    d = ImageDraw.Draw(bg)
    try:
        f_big = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 20)
        f_name = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 15)
        f_small = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 12)
    except OSError:
        f_big = f_name = f_small = ImageFont.load_default()

    ink = C("#453244")
    sub = C("#8a7580")

    d.text((24, 16), "参照物（游戏内烘焙尺寸）", font=f_big, fill=ink)
    d.line([(24, 48), (W - 24, 48)], fill=C("#e8d9b8"), width=2)

    # 主角大橘 96px
    daju = Image.open(ASSETS / "characters/daju/idle_1.png").convert("RGBA")
    daju = daju.resize((96, 96), Image.NEAREST)
    bg.alpha_composite(daju, (52, 78))
    d.text((36, 182), "大橘（主角）96×96", font=f_name, fill=ink)

    # 灰灰鼠 64px
    rat = Image.open(ASSETS / "characters/rat/idle_1.png").convert("RGBA")
    rat = rat.resize((64, 64), Image.NEAREST)
    bg.alpha_composite(rat, (70, 226))
    d.text((44, 298), "灰灰鼠（小怪）64×64", font=f_name, fill=ink)

    # 比例参考线：原版基准里鱼宽 ≈ 主角宽的 0.40~0.48
    d.text((24, 348), "原版基准：一级鱼宽≈主角宽 0.40", font=f_small, fill=sub)
    d.text((24, 368), "三级鱼宽≈主角宽 0.48；本图所有", font=f_small, fill=sub)
    d.text((24, 386), "掉落物均为 ×2 烘焙后实际大小", font=f_small, fill=sub)

    d.line([(252, 60), (252, H - 30)], fill=C("#e8d9b8"), width=2)
    d.text((276, 16), "掉落物重制（×2 烘焙后实际游戏尺寸）", font=f_big, fill=ink)

    cells = [
        ("一级小鱼", 0), ("二级小鱼", 1), ("三级小鱼", 2), ("金币", 3),
        ("牛奶", 4), ("烟花", 5), ("磁铁", 6),
    ]
    xs = [276, 436, 596, 756]
    for i, (name, idx) in enumerate(cells):
        spr = SPRITES[idx]
        img = images[name]
        bw, bh = img.width * 2, img.height * 2
        big = img.resize((bw, bh), Image.NEAREST)
        cx = xs[i] if i < 4 else xs[i - 4]
        cy = 92 if i < 4 else 268
        # 底座阴影线
        d.line([(cx + 8, cy + 128), (cx + 138, cy + 128)], fill=C("#ecdcb9"), width=2)
        bg.alpha_composite(big, (cx + (150 - bw) // 2, cy + (110 - bh) // 2))
        d.text((cx + 8, cy + 134), spr["name"], font=f_name, fill=ink)
        d.text((cx + 8, cy + 154), f"{img.width}×{img.height} → ×2 = {bw}×{bh}",
               font=f_small, fill=sub)

    # ---- ×4 放大质检行（检查勾边/杂点/造型） ----
    d.text((24, 448), "放大 ×4 质检", font=f_big, fill=ink)
    d.line([(24, 480), (W - 24, 480)], fill=C("#e8d9b8"), width=2)
    for i, (name, idx) in enumerate(cells):
        img = images[name]
        z = 4
        big = img.resize((img.width * z, img.height * z), Image.NEAREST)
        cx = 24 + i * 138
        cy = 500
        d.rectangle([cx - 6, cy - 6, cx + img.width * z + 6, cy + img.height * z + 6],
                    outline=C("#e8d9b8"), width=2)
        bg.alpha_composite(big, (cx, cy))
        d.text((cx, cy + 100), name, font=f_small, fill=sub)

    bg.convert("RGB").save(PREVIEW)
    return PREVIEW


def main():
    images = {}
    print("== 生成掉落物 ==")
    for spr in SPRITES:
        img = render(spr)
        out = ASSETS / spr["path"]
        out.parent.mkdir(parents=True, exist_ok=True)
        img.save(out)
        images[spr["name"]] = img
        print(f"  {spr['name']:<6} {spr['path']:<38} 网格 {img.width}×{img.height}"
              f"  烘焙 {img.width*2}×{img.height*2}")

    # 复核：重新读盘核对实际尺寸
    print("== 读盘复核 ==")
    ok = True
    for spr in SPRITES:
        p = ASSETS / spr["path"]
        with Image.open(p) as im:
            real = im.size
        want = EXPECTED_SIZE[spr["name"]]
        flag = "OK" if real == want else "FAIL"
        ok &= real == want
        print(f"  [{flag}] {p.name:<12} 实际 {real[0]}×{real[1]}（目标 {want[0]}×{want[1]}）")
    assert ok, "有素材尺寸不达标！"

    p = build_preview(images)
    print(f"== 对比图 == {p}")
    print("全部完成。")


if __name__ == "__main__":
    main()
