"""把 web 源码同步到 android/assets/www（打包前必须跑一次）。"""
import os, shutil, filecmp

PROJ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(PROJ, "android", "assets", "www")

FILES = ["index.html", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png"]
DIRS = ["css", "js"]

def sync_file(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if not (os.path.exists(dst) and filecmp.cmp(src, dst, shallow=False)):
        shutil.copy2(src, dst)
        return True
    return False

changed = 0
for name in FILES:
    src = os.path.join(PROJ, name)
    if os.path.exists(src):
        changed += sync_file(src, os.path.join(DST, name))

for d in DIRS:
    root = os.path.join(PROJ, d)
    for base, _dirs, files in os.walk(root):
        for f in files:
            if f.endswith((".map", ".DS_Store")):
                continue
            src = os.path.join(base, f)
            rel = os.path.relpath(src, PROJ)
            changed += sync_file(src, os.path.join(DST, rel))

# 删掉 dst 里源目录已不存在的文件
for d in DIRS:
    root = os.path.join(DST, d)
    for base, _dirs, files in os.walk(root):
        for f in files:
            dst = os.path.join(base, f)
            rel = os.path.relpath(dst, DST)
            if not os.path.exists(os.path.join(PROJ, rel)):
                os.remove(dst)
                changed += 1
                print("removed stale", rel)

print("synced", changed, "file(s) ->", DST)
