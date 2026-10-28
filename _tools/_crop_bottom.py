from PIL import Image
import sys
im = Image.open(sys.argv[1])
w,h = im.size
im.crop((0, h-520, w, h)).save(sys.argv[2])
print(w, h)
