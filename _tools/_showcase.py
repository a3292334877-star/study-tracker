from PIL import Image
import os, sys

SH = r"D:/DeepseekH/project/study-tracker/_shots"
names = sys.argv[1:] or ["v14-home.png", "v14-log.png", "v14-subjects.png", "v14-stats.png", "v14-me.png"]
W_TARGET = 540

ims = []
for n in names:
    im = Image.open(os.path.join(SH, n)).convert("RGB")
    h = round(im.height * W_TARGET / im.width)
    ims.append(im.resize((W_TARGET, h), Image.LANCZOS))

gap = 20
pad = 20
W = sum(i.width for i in ims) + gap * (len(ims) - 1) + pad * 2
H = max(i.height for i in ims) + pad * 2
canvas = Image.new("RGB", (W, H), (236, 238, 245))
x = pad
for im in ims:
    canvas.paste(im, (x, pad + (H - pad * 2 - im.height) // 2))
    x += im.width + gap
out = os.path.join(SH, "showcase.png")
canvas.save(out, optimize=True)
print(canvas.size, os.path.getsize(out))
