# -*- coding: utf-8 -*-
from PIL import Image, ImageDraw, ImageFont
BASE=r"D:/DeepseekH/project/study-tracker"
src=Image.open(BASE+"/icon-design/gen/qwen-notebook.png").convert("RGB")
def mask(size,radius):
    m=Image.new("L",(size,size),0); ImageDraw.Draw(m).rounded_rectangle([0,0,size-1,size-1],radius=radius,fill=255); return m
# variant crop 800
c=src.crop((112,112,912,912)).resize((1024,1024),Image.LANCZOS).convert("RGBA")
c.putalpha(mask(1024,200))
c.save(BASE+"/icon-design/gen/zoom-master-1024.png")
W,H=900,430
im=Image.new("RGBA",(W,H),(244,246,251,255)); d=ImageDraw.Draw(im)
try: f=ImageFont.truetype(r"C:/Windows/Fonts/msyh.ttc",22)
except: f=ImageFont.load_default()
d.text((30,20),"对比：当前（左） vs 内容放大版（右）",font=f,fill=(28,32,48))
for i,(img,label) in enumerate([(src.convert("RGBA"),"当前"),(c,"放大")]):
    x=90+i*440
    d.rounded_rectangle([x-40,70,x+300,410],radius=23,fill=(255,255,255,255))
    im.alpha_composite(img.resize((260,260),Image.LANCZOS),(x,90))
    d.text((x-40,360),label,font=f,fill=(90,98,120))
im.convert("RGB").save(BASE+"/icon-design/gen/zoom-compare.png")
print("ok")
