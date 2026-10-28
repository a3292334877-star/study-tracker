
import sys
from PIL import Image
src = r"D:/DeepseekH/project/study-tracker/_shots/full-log.png"
im = Image.open(src)
w,h = im.size
print("orig", w, h)
# split into two halves for readability
top = im.crop((0,0,w,h//2))
bot = im.crop((0,h//2,w,h))
def save(img, path, maxh=3600):
    iw,ih = img.size
    scale = min(1.0, maxh/ih)
    if scale < 1.0:
        img = img.resize((int(iw*scale), int(ih*scale)), Image.LANCZOS)
    img.convert("RGB").save(path, "JPEG", quality=88)
    print(path, img.size)
save(top, r"D:/DeepseekH/project/study-tracker/_shots/log-part1.jpg")
save(bot, r"D:/DeepseekH/project/study-tracker/_shots/log-part2.jpg")
