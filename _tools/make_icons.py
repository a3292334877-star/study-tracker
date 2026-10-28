import math
from PIL import Image, ImageDraw

def make(size, path):
    S = 1024
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 圆角矩形渐变背景
    grad = Image.new("RGB", (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        for_t = y / (S - 1)
        r = int(79 + (125 - 79) * for_t)
        g = int(109 + (92 - 109) * for_t)
        b = int(245 + (255 - 245) * for_t)
        gd.line([(0, y), (S, y)], fill=(r, g, b))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=232, fill=255)
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)
    cx, cy = S // 2, int(S * 0.525)

    # 外圈
    r = 252
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255, 90), width=52)
    # 进度弧（约 68%）
    d.arc([cx - r, cy - r, cx + r, cy + r], start=-90, end=-90 + 245,
          fill=(255, 255, 255, 255), width=52)
    # 指针
    d.line([(cx, cy - 96), (cx, cy + 12)], fill=(255, 255, 255, 255), width=42)
    d.line([(cx, cy + 6), (cx + 108, cy + 78)], fill=(255, 255, 255, 255), width=42)
    d.ellipse([cx - 20, cy - 8, cx + 20, cy + 32], fill=(255, 255, 255, 255))
    # 顶部按钮
    d.rounded_rectangle([cx - 40, cy - r - 96, cx + 40, cy - r - 40], radius=26, fill=(255, 255, 255, 190))

    img = img.resize((size, size), Image.LANCZOS)
    img.save(path)
    print("saved", path, size)

make(192, r"D:/DeepseekH/project/study-tracker/icon-192.png")
make(512, r"D:/DeepseekH/project/study-tracker/icon-512.png")
make(180, r"D:/DeepseekH/project/study-tracker/icon-180.png")
