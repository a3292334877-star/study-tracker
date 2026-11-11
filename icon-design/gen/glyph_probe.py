# -*- coding: utf-8 -*-
from PIL import Image
im=Image.open(r"D:\DeepseekH\project\study-tracker\icon-design\gen\qwen-notebook.png").convert("RGB")
w,h=im.size
minx,miny,maxx,maxy=w,h,0,0
n=0
for y in range(120,905,2):
    for x in range(120,905,2):
        r,g,b=im.getpixel((x,y))
        mn=min(r,g,b); mx=max(r,g,b)
        if mn>205 and mx-mn<28:
            n+=1
            if x<minx:minx=x
            if x>maxx:maxx=x
            if y<miny:miny=y
            if y>maxy:maxy=y
print("bbox",minx,miny,maxx,maxy,"count",n,"size",maxx-minx,maxy-miny)
