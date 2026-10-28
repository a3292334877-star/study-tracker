
from PIL import Image
import os
base = r"D:/DeepseekH/project/study-tracker/"
A = base + "android" + os.sep
src = Image.open(base + "icon-512.png").convert("RGBA")
for dpi, px in [("mdpi",48),("hdpi",72),("xhdpi",96),("xxhdpi",144),("xxxhdpi",192)]:
    d = A + "res" + os.sep + "mipmap-" + dpi + os.sep
    src.resize((px,px), Image.LANCZOS).save(d + "ic_launcher.png")

# 5b. 自适应图标前景：432x432 透明底，白色表盘居中，落在 72dp 安全区（66%）内
fg = Image.new("RGBA",(432,432),(0,0,0,0))
from PIL import ImageDraw
dr = ImageDraw.Draw(fg)
cx = cy = 216
# 表盘：圆环 + 刻度 + 指针（与 icon.svg 造型一致）
r_ring = 132
dr.ellipse([cx-r_ring,cy-r_ring,cx+r_ring,cy+r_ring], outline=(255,255,255,255), width=24)
# 12/3/6/9 刻度
for ang,(dx,dy) in [(0,(0,-1)),(90,(1,0)),(180,(0,1)),(270,(-1,0))]:
    import math
    x1 = cx + dx*(r_ring-38); y1 = cy + dy*(r_ring-38)
    x2 = cx + dx*(r_ring-24); y2 = cy + dy*(r_ring-24)
    dr.line([x1,y1,x2,y2], fill=(255,255,255,255), width=14)
# 指针：时针+分针
dr.line([cx,cy+6,cx,cy-70], fill=(255,255,255,255), width=18)   # 分针向上
dr.line([cx,cy,cx+48,cy+26], fill=(255,255,255,255), width=18)  # 时针向右下
dr.ellipse([cx-11,cy-11,cx+11,cy+11], fill=(255,255,255,255))
fd = A + "res" + os.sep + "mipmap-xxxhdpi" + os.sep
fg.save(fd + "ic_launcher_foreground.png")
print("icons done")
