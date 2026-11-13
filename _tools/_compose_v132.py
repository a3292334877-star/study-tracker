from PIL import Image
import os
base = r"D:/DeepseekH/project/study-tracker/_shots"
names = ["v132-home-overdue.png", "v132-todos-pending.png", "v132-todos-done.png", "v132-me-todos-row.png"]
imgs = [Image.open(os.path.join(base, n)).convert("RGB") for n in names]
w, h = imgs[0].size
gap = 24
out = Image.new("RGB", (w*2+gap, h*2+gap), (245,247,251))
for i, im in enumerate(imgs):
    x = (i % 2) * (w + gap)
    y = (i // 2) * (h + gap)
    out.paste(im, (x, y))
p = os.path.join(base, "v132-summary.png")
out.save(p, optimize=True)
print(p, out.size, os.path.getsize(p))
