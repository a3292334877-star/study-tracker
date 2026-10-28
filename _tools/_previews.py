from PIL import Image
import os
SH = os.path.join(r"D:/DeepseekH/project/study-tracker", "_shots")

def small(src, dst, w):
    im = Image.open(os.path.join(SH, src)).convert("RGB")
    h = round(im.height * w / im.width)
    im.resize((w, h), Image.LANCZOS).save(os.path.join(SH, dst), optimize=True)
    print(dst, (w, h), os.path.getsize(os.path.join(SH, dst)))

small("poster-web.png", "poster-preview.png", 750)
small("v13-notification.png", "notify-preview.png", 540)
