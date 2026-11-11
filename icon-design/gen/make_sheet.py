# -*- coding: utf-8 -*-
from PIL import Image, ImageDraw, ImageFont
import os
base=r"D:\DeepseekH\project\study-tracker\icon-design\gen"
items=[
 ("qwen-stopwatch.png","Qwen-Image-2.1","秒表 + 对勾  · 推荐"),
 ("qwen-notebook.png","Qwen-Image-2.1","课本 + 对勾"),
 ("krea-stopwatch.png","Krea2","秒表 + 对勾"),
 ("krea-notebook.png","Krea2","课本 + 对勾"),
]
W,H=1240,1400
canvas=Image.new("RGB",(W,H),"#eef1f8")
d=ImageDraw.Draw(canvas)
font_title=ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc",42)
font_name=ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc",24)
font_sub=ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc",22)
d.text((40,26),"Study Tracker 图标方案 · 本地模型生成",font=font_title,fill="#1f2540")
d.text((42,84),"本机 ComfyUI：Qwen-Image-2.1 / Krea2 实测出图",font=font_sub,fill="#6a7085")
tile=500; gapx=40; left=60; tops=[185,790]
for idx,(fn,model,label) in enumerate(items):
    col=idx%2; row=idx//2
    x=left+col*(tile+gapx); y=tops[row]
    img=Image.open(os.path.join(base,fn)).convert("RGB").resize((tile,tile),Image.LANCZOS)
    d.rounded_rectangle([x+5,y+9,x+tile+5,y+tile+9],radius=58,fill="#c9cee0")
    d.rounded_rectangle([x,y,x+tile,y+tile],radius=58,fill="white")
    mask=Image.new("L",(tile,tile),0); md=ImageDraw.Draw(mask); md.rounded_rectangle([0,0,tile-1,tile-1],radius=56,fill=255)
    canvas.paste(img,(x,y),mask)
    d.text((x,y-74),model,font=font_name,fill="#4f6df5")
    d.text((x,y-37),label,font=font_sub,fill="#5a6070")
canvas.save(os.path.join(base,"contact-sheet.png"))
print("saved",canvas.size)
