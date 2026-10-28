import zipfile,hashlib,os,time
p=r"D:\DeepseekH\project\study-tracker\android\build\study-tracker.apk"
print("mtime", time.strftime("%H:%M:%S", time.localtime(os.path.getmtime(p))), "size", os.path.getsize(p))
z=zipfile.ZipFile(p)
dex=z.read("classes.dex")
for k in [b"saveImage", b"saveBackupQuietly", b"openNotifSettings", b"updateTimerNotification"]:
    print(k.decode(), k in dex)
js=z.read("assets/www/js/views/stats.js").decode("utf-8")
print("stats new toast:", "海报已保存到相册" in js)
print("sha256", hashlib.sha256(open(p,"rb").read()).hexdigest()[:16])
