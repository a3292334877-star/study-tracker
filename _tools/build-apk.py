
import os, subprocess, sys, zipfile, shutil

SDK = r"D:\android-sdk"
BT  = os.path.join(SDK, "build-tools", "35.0.0")  # 34.0.0 的 d8 (R8 8.2.2-dev) 在 JDK 25 上打包必 NPE，用 35.0.0
PLAT= os.path.join(SDK, "platforms", "android-34", "android.jar")
JAVA= r"D:\java\jdk-25_windows-x64_bin\jdk-25.0.2\bin"
PROJ= r"D:\DeepseekH\project\study-tracker\android"
OUT = os.path.join(PROJ, "build")
os.makedirs(OUT, exist_ok=True)
env = dict(os.environ)
env["JAVA_HOME"] = r"D:\java\jdk-25_windows-x64_bin\jdk-25.0.2"
env["PATH"] = JAVA + os.pathsep + env.get("PATH","")

def run(args, **kw):
    print(">>", " ".join(args))
    r = subprocess.run(args, capture_output=True, text=True, env=env, **kw)
    if r.stdout.strip(): print(r.stdout[-3000:])
    if r.returncode != 0:
        print("EXIT", r.returncode); print(r.stderr[-4000:]); sys.exit(1)
    if r.stderr.strip(): print("[stderr]", r.stderr[-1500:])
    return r

# 1) aapt2 compile
reszip = os.path.join(OUT, "res.zip")
run([os.path.join(BT,"aapt2.exe"), "compile", "--dir", os.path.join(PROJ,"res"), "-o", reszip])

# 2) aapt2 link
base_apk = os.path.join(OUT, "app.base.apk")
gen = os.path.join(OUT, "gen"); shutil.rmtree(gen, ignore_errors=True); os.makedirs(gen)
run([os.path.join(BT,"aapt2.exe"), "link",
     "-o", base_apk,
     "-I", PLAT,
     "--manifest", os.path.join(PROJ,"AndroidManifest.xml"),
     "--java", gen,
     "--min-sdk-version", "24", "--target-sdk-version", "34",
     "--auto-add-overlay",
     "-A", os.path.join(PROJ, "assets"),   # 把 assets/www 打进 base apk（WebView 壳的页面资源）
     reszip])
print("link ok, R.java at:", os.path.join(gen,"app","xuexijilu","R.java"))

# 3) javac
classes = os.path.join(OUT, "classes"); shutil.rmtree(classes, ignore_errors=True); os.makedirs(classes)
srcs = []
for root,_,fs2 in os.walk(os.path.join(PROJ,"java")):
    srcs += [os.path.join(root,f) for f in fs2 if f.endswith(".java")]
srcs += [os.path.join(gen,"app","xuexijilu","R.java")]
javac = os.path.join(JAVA,"javac.exe")
run([javac, "--release", "11", "-nowarn", "-encoding", "UTF-8",
     "-classpath", PLAT, "-d", classes] + srcs)

# 4) d8 -> classes.dex
dexdir = os.path.join(OUT, "dex"); shutil.rmtree(dexdir, ignore_errors=True); os.makedirs(dexdir)
cls_files = []
for root,_,fs2 in os.walk(classes):
    cls_files += [os.path.join(root,f) for f in fs2 if f.endswith(".class")]
run([os.path.join(JAVA,"java.exe"), "-cp",
     os.path.join(BT,"lib","d8.jar"), "com.android.tools.r8.D8",
     "--release", "--lib", PLAT, "--min-api", "24",
     "--output", dexdir] + cls_files)
print("dex ok:", os.listdir(dexdir))

# 5) 把 classes.dex 塞进 apk
final_unaligned = os.path.join(OUT, "app.unsigned.apk")
shutil.copy(base_apk, final_unaligned)
with zipfile.ZipFile(final_unaligned, "a", zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(dexdir,"classes.dex"), "classes.dex")

# 6) zipalign（目标目录必须已存在，否则 zipalign 静默失败）
aligned = os.path.join(OUT, "aligned")
os.makedirs(aligned, exist_ok=True)
aligned = os.path.join(aligned, "app.aligned.apk")
run([os.path.join(BT,"zipalign.exe"), "-f", "4", final_unaligned, aligned])

# 7) keystore（首次生成）
ks = os.path.join(OUT, "release.keystore")
if not os.path.exists(ks):
    run([os.path.join(JAVA,"keytool.exe"), "-genkeypair", "-v",
         "-keystore", ks, "-alias", "xuexijilu",
         "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
         "-storepass", "xuexijilu123", "-keypass", "xuexijilu123",
         "-dname", "CN=Xuexi Jilu, OU=Study, O=XuexiJilu, L=Tokyo, C=JP"])

# 8) apksigner
signed = os.path.join(OUT, "study-tracker.apk")
run([os.path.join(BT,"apksigner.bat"), "sign",
     "--ks", ks, "--ks-pass", "pass:xuexijilu123",
     "--key-pass", "pass:xuexijilu123", "--out", signed, aligned])
run([os.path.join(BT,"apksigner.bat"), "verify", "--print-certs", signed])
sz = os.path.getsize(signed)
print("APK-DONE", signed, sz, "bytes", round(sz/1024/1024,2), "MB")
