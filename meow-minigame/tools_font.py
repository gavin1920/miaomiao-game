# -*- coding: utf-8 -*-
# 像素字体子集生成器：从打包产物 bundle.js 提取全部用字 →
# Fusion Pixel 像素字体子集化 → 家族名统一改为 "Fusion Pixel"。
# 这样游戏内所有 '"Fusion Pixel",...' 字体栈无需任何代码改动即可命中内置字体
# （wx.loadFont 返回值即家族名）。网页版文本更新后重跑 sync-minigame.sh 会自动重跑本脚本。
# 依赖：pip install fonttools brotli
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLE = os.path.join(HERE, 'bundle.js')
SRC_WOFF2 = r'C:\Users\gavin\Desktop\Games\miaomiao-deploy\assets\fonts\fusion-pixel-12px-monospaced-zh_hans.ttf.woff2'
OUT_TTF = os.path.join(HERE, 'assets', 'fonts', 'meow-pixel.ttf')
CHARSET = os.path.join(HERE, 'assets', 'fonts', 'charset.txt')

FAMILY = 'Fusion Pixel'
BASE_CHARS = ('0123456789'
              'abcdefghijklmnopqrstuvwxyz'
              'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
              '，。！？：；、（）《》【】·—…“”‘’％！？'
              '%+-×÷↑↓←→[]{}:;?./\\|~^@#$&*_=<>()"\' ')

def collect_chars():
    s = io.open(BUNDLE, encoding='utf-8').read()
    chars = set(BASE_CHARS)
    for pat in (r'"((?:[^"\\\n]|\\.)*)"', r"'((?:[^'\\\n]|\\.)*)'", r'`((?:[^`\\]|\\.)*)`'):
        for m in re.finditer(pat, s):
            chars.update(m.group(1))
    chars.discard('\n'); chars.discard('\r'); chars.discard('\t')
    return ''.join(sorted(c for c in chars if ord(c) >= 32))

def main():
    if not os.path.exists(BUNDLE):
        print('✗ 先构建 bundle.js（跑 sync-minigame.sh）'); sys.exit(1)
    text = collect_chars()
    os.makedirs(os.path.dirname(CHARSET), exist_ok=True)
    io.open(CHARSET, 'w', encoding='utf-8').write(text)
    print('用字数:', len(text))

    try:
        from fontTools.ttLib import TTFont
        from fontTools import subset
    except ImportError:
        print('✗ 缺依赖：pip install fonttools brotli'); sys.exit(1)

    f = TTFont(SRC_WOFF2)  # woff2 解压需要 brotli
    opts = subset.Options()
    opts.notdef_outline = True
    opts.recommended_glyphs = True
    opts.glyph_names = False
    opts.hinting = False
    ss = subset.Subsetter(opts)
    ss.populate(text=text)
    ss.subset(f)

    # 家族名统一改为 "Fusion Pixel"（nameID 1/16 家族、4 全名、6 PostScript 名）
    for rec in f['name'].names:
        if rec.nameID in (1, 4, 16):
            rec.string = FAMILY
        elif rec.nameID == 6:
            rec.string = 'FusionPixel-Regular'
    f.flavor = None  # 输出 ttf
    os.makedirs(os.path.dirname(OUT_TTF), exist_ok=True)
    f.save(OUT_TTF)
    print('✓ 生成', OUT_TTF, '(%d KB)' % (os.path.getsize(OUT_TTF) // 1024))

if __name__ == '__main__':
    main()
