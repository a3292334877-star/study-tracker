import sys
from PIL import Image

src, dst, h = sys.argv[1], sys.argv[2], int(sys.argv[3])
scale = float(sys.argv[4]) if len(sys.argv) > 4 else 0.55
im = Image.open(src)
w, hh = im.size
top = im.crop((0, 0, w, min(hh, h)))
top = top.resize((int(w * scale), int(min(hh, h) * scale)))
top.save(dst, quality=82)
print(top.size)
