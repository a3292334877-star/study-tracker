# -*- coding: utf-8 -*-
from PIL import Image
im=Image.open(r"D:\DeepseekH\project\study-tracker\icon-design\gen\qwen-notebook.png").convert("RGB")
w,h=im.size
for y in [10,30,50,80,100,120,150,512]:
    row=[]
    prev=None
    for x in range(0,w,4):
        p=im.getpixel((x,y))
        # simplify bucket
        if p[2]>245 and p[0]>235 and p[1]>235: c='W'      # white
        elif p[2]>200 and p[0]>150: c='L'                  # light blue/lavender
        elif p[2]>150: c='B'                               # blue
        else: c='D'
        if c!=prev: row.append((x,c,p)); prev=c
    print('y',y,row[:15])
print('center pixels')
for x in [0,10,20,30,40,50,60,80,100,120,512,900,950,1000,1023]:
    print(x, im.getpixel((x,512)))
