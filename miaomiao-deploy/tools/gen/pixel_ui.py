#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
喵都幸存者 —— UI 像素件生成器（VI v2.2 可爱像素，可复跑）
==========================================================
每个素材 = ASCII 像素画字符串 + 调色板字典。
逐字符映射颜色，'.' 为透明；PNG 尺寸 = 网格 × SCALE（最近邻整数倍，保持像素锐利）。

gear.png（⚙ 平衡设置入口按钮，意见5）：
  21×21 网格 ×2 = 42×42 —— 与游戏内右上角 Lv 圆徽章（直径 42px）同尺寸成组。
  造型：六齿圆齿轮，铃铛金身 + 墨线 #453244 勾边 + 透明背景，
  左上受光面用浅金提亮 + 一粒奶白高光。index.html #btn-cfg 以
  background-image 1:1 引用（image-rendering:pixelated），hover 轻转 20deg。

配色 VI（与 tools/gen/pixel_drops.py 同源）：
  墨线 #453244 / 奶油白 #fff6e0 / 铃铛金 #ffd76e / 浅金 #ffe9a8

跑法：  python tools/gen/pixel_ui.py
输出：  pixel-assets/ui/gear.png + tools/gen/ui_preview.png（放大对比图）
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "pixel-assets" / "ui"
PREVIEW = ROOT / "tools" / "gen" / "ui_preview.png"
SCALE = 2  # 网格 → PNG 倍率：21×21 → 42×42（与 Lv 徽章直径一致）

# ---------------------------------------------------------------- 调色板
def C(h, a=255):
    """'#rrggbb' -> RGBA"""
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), a)

INK   = C("#453244")   # 统一墨线（勾边）
GOLD  = C("#ffd76e")   # 铃铛金（齿轮主体）
LGOLD = C("#ffe9a8")   # 浅金（左上受光面）
CREAM = C("#fff6e0")   # 奶油白（高光点）

# ---------------------------------------------------------------- 素材定义
# 图例：K 墨线 / L 浅金受光 / B 铃铛金主体 / W 奶白高光 / '.' 透明
# 造型：六齿齿轮（齿位 30°+k·60°，正上正下各一整齿）+ 中轴圆孔，
# 轮廓整圆、齿肩见圆弧，是「圆形齿轮按钮」的素体。
GEAR = [
    ".......KLLLLLK.......",
    ".......KLWLLLK.......",
    ".......KLLLLLK.......",
    "...KK..KLLLLLK..KK...",
    "..KKKKKKLLLLLKKKKKK..",
    ".KKLLLLLLLLLLBBBBBKK.",
    ".KLLLLLLKKKKKBBBBBBK.",
    "KKLLLLLKK...KKBBBBBKK",
    "KKKKLLKK.....KKBBKKKK",
    "...KLLK.......KBBK...",
    "...KLLK.......KBBK...",
    "...KLLK.......KBBK...",
    "KKKKLLKK.....KKBBKKKK",
    "KKLLLBBKK...KKBBBBBKK",
    ".KLLBBBBKKKKKBBBBBBK.",
    ".KKBBBBBBBBBBBBBBBKK.",
    "..KKKKKKBBBBBKKKKKK..",
    "...KK..KBBBBBK..KK...",
    ".......KBBBBBK.......",
    ".......KBBBBBK.......",
    ".......KBBBBBK.......",
]

PALETTES = {"gear": {"K": INK, "L": LGOLD, "B": GOLD, "W": CREAM}}

# ---------------------------------------------------------------- 渲染
def render(grid, palette, scale):
    """ASCII 网格 + 调色板 → RGBA Image（透明底，最近邻整数倍放大）"""
    h, w = len(grid), len(grid[0])
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    im.putdata([palette.get(ch, (0, 0, 0, 0)) for row in grid for ch in row])
    return im.resize((w * scale, h * scale), Image.NEAREST)


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    gear = render(GEAR, PALETTES["gear"], SCALE)
    gear.save(ASSETS / "gear.png")
    print("wrote", ASSETS / "gear.png", gear.size)

    # 预览图：深底上 1x/4x/8x 三档，检查勾边与透明背景
    px = gear.width
    pv = Image.new("RGBA", (px * 8 + 240, px * 8 + 32), (34, 30, 52, 255))
    for i, s in enumerate((1, 2, 4, 8)):
        big = gear.resize((px * s, px * s), Image.NEAREST)
        pv.alpha_composite(big, (16, 16 + (px * 8 - px * s)))
        if i:
            d = ImageDraw.Draw(pv)
            d.text((16, 8), "", fill=(255, 255, 255, 255))
    pv.save(PREVIEW)
    print("wrote", PREVIEW, pv.size)


if __name__ == "__main__":
    main()
