
from PIL import Image
src = r"D:/DeepseekH/project/study-tracker/_shots/full-log.png"
im = Image.open(src)
crop = im.crop((0,0,1560,1400))
crop.convert("RGB").save(r"D:/DeepseekH/project/study-tracker/_shots/log-top.jpg","JPEG",quality=92)
print(crop.size)
