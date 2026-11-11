# -*- coding: utf-8 -*-
"""学习记录 APP 图标生成：以 icon-design/gen/qwen-notebook.png 为母本，
生成 PWA 图标、Android 传统 mipmap 与自适应图标前景。"""
import os
from PIL import Image, ImageDraw, ImageFont

BASE = r"D:/DeepseekH/project/study-tracker"
SRC  = os.path.join(BASE, "icon-design", "gen", "qwen-notebook.png")
AND  = os.path.join(BASE, "android")

def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(v)))

def rounded_alpha(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m

# 1) 母本 1024：裁掉四角白边，并略微裁近中心让白色 glyph 在桌面上更饱满
src = Image.open(SRC).convert("RGB")
assert src.size == (1024, 1024), src.size
# 800×800 中心裁切 -> 放大到 1024，glyph 占比从约 51% 提升到约 65%，
# 在小尺寸 launcher 上更清晰，也与自适应前景视觉一致。
master = src.crop((112, 112, 912, 912)).resize((1024, 1024), Image.LANCZOS).convert("RGBA")
master.putalpha(rounded_alpha(1024, 200))
master_path = os.path.join(BASE, "icon-design", "gen", "applied-master-1024.png")
master.save(master_path)

# 2) PWA 图标
for px, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "icon-180.png")]:
    im = master.resize((px, px), Image.LANCZOS)
    im.save(os.path.join(BASE, name))
    print("saved", name, px)

# 3) Android 传统 launcher 图标（直接用整图母本，颜色风格与 PWA 一致）
icon512 = master.resize((512, 512), Image.LANCZOS)
for dpi, px in [("mdpi",48),("hdpi",72),("xhdpi",96),("xxhdpi",144),("xxxhdpi",192)]:
    d = os.path.join(AND, "res", "mipmap-" + dpi)
    os.makedirs(d, exist_ok=True)
    icon512.resize((px, px), Image.LANCZOS).save(os.path.join(d, "ic_launcher.png"))
    print("saved mipmap", dpi, px)

# 4) 自适应图标前景：从母本抠出白色「课本 + 对勾」glyph，
#    放进 432x432 透明画布的安全区内（内容最大边约 296px，66% 安全区）。
crop_box = (250, 205, 752, 795)  # 覆盖 glyph bbox 284..718 / 240..758，四周留一点
crop = src.crop(crop_box)
cw, ch = crop.size
glyph = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
gp = glyph.load()
cp = crop.load()
for y in range(ch):
    for x in range(cw):
        r, g, b = cp[x, y]
        mn = min(r, g, b)
        a = clamp((mn - 185) / 55.0 * 255.0)
        if a:
            gp[x, y] = (255, 255, 255, a)
# 裁到可见范围
bbox = glyph.getbbox()
glyph = glyph.crop(bbox)
gw, gh = glyph.size
target = 296
scale = min(target / gw, target / gh)
glyph = glyph.resize((max(1, round(gw * scale)), max(1, round(gh * scale))), Image.LANCZOS)
fg = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
fg.alpha_composite(glyph, ((432 - glyph.width) // 2, (432 - glyph.height) // 2))
fgpath = os.path.join(AND, "res", "mipmap-xxxhdpi", "ic_launcher_foreground.png")
os.makedirs(os.path.dirname(fgpath), exist_ok=True)
fg.save(fgpath)
print("saved adaptive foreground", fg.size, "glyph", glyph.size)

# 5) 预览图：浅色/深色桌面上的 launcher、传统尺寸、自适应圆形与 squircle 模拟
W, H = 1200, 760
preview = Image.new("RGB", (W, H), (244, 246, 251))
pd = ImageDraw.Draw(preview)
try:
    font = ImageFont.truetype(r"C:/Windows/Fonts/msyh.ttc", 24)
    font_s = ImageFont.truetype(r"C:/Windows/Fonts/msyh.ttc", 18)
except Exception:
    font = ImageFont.load_default(); font_s = font

def paste_center(canvas, im, box, bg=None):
    x0, y0, x1, y1 = box
    if bg:
        ImageDraw.Draw(canvas).rounded_rectangle(box, radius=22, fill=bg)
    canvas.alpha_composite(im, (x0 + (x1-x0-im.width)//2, y0 + (y1-y0-im.height)//2))

preview = preview.convert("RGBA")
# 三个大图标：192 原尺寸在浅色卡片
paste_center(preview, master.resize((192,192), Image.LANCZOS), (40, 90, 300, 350), (255,255,255))
paste_center(preview, master.resize((192,192), Image.LANCZOS), (330, 90, 590, 350), (24,28,40))
# 自适应模拟：432 缩到 192；圆形 mask 与 squircle mask
grad = Image.new("RGBA", (1024,1024))
gd = ImageDraw.Draw(grad)
for y in range(1024):
    t=y/1023.0
    gd.line([(0,y),(1024,y)], fill=(int(79+(125-79)*t), int(109+(92-109)*t), int(245+(255-245)*t),255))
adaptive = grad.copy(); adaptive.alpha_composite(fg.resize((1024,1024), Image.LANCZOS))
for i, radius in enumerate([512, 190]):
    m = Image.new("L", (1024,1024), 0)
    ImageDraw.Draw(m).rounded_rectangle([0,0,1023,1023], radius=radius, fill=255)
    a = adaptive.copy(); a.putalpha(m)
    paste_center(preview, a.resize((192,192), Image.LANCZOS), (620+i*270, 90, 880+i*270, 350), (255,255,255))

pd = ImageDraw.Draw(preview)
pd.text((40, 40), "新图标预览（Qwen-Image-2.1 课本 + 对勾）", font=font, fill=(28,32,48))
pd.text((40, 365), "PWA/桌面图标（浅色 / 深色背景）", font=font_s, fill=(90,98,120))
pd.text((620, 365), "Android 自适应图标（圆形 / 圆角方形遮罩）", font=font_s, fill=(90,98,120))

# 传统 mipmap 尺寸条
pd.text((40, 430), "Android 传统 launcher 实际尺寸：", font=font_s, fill=(90,98,120))
x = 40
for dpi, px in [("mdpi",48),("hdpi",72),("xhdpi",96),("xxhdpi",144),("xxxhdpi",192)]:
    im = icon512.resize((px,px), Image.LANCZOS)
    preview.alpha_composite(im, (x, 480 + (192-px)//2))
    pd.text((x, 690), "%s %dpx" % (dpi, px), font=font_s, fill=(90,98,120))
    x += px + 34

# 右下展示原始母本
pd.text((760, 430), "原始生成图", font=font_s, fill=(90,98,120))
preview.alpha_composite(master.resize((220,220), Image.LANCZOS), (760, 470))
prev_path = os.path.join(BASE, "icon-design", "gen", "applied-preview.png")
preview.convert("RGB").save(prev_path)
print("saved preview", prev_path)
