package app.xuexijilu;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.pm.PackageManager;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * 学习记录 - Android 壳。
 * WebView 拦截 https://appassets.local/ 并直接从 assets/www 读文件，
 * 给页面一个 https 源，ES Module / localStorage 都能正常工作。
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.local";
    private static final String BASE_URL = "https://" + HOST + "/index.html";
    private static final int REQ_PICK_FILE = 42;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingSaveName;
    private String pendingSaveContent;

    private static final String CH_TIMER = "timer";
    private static final int NOTIF_TIMER_ID = 1001;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createTimerChannel();
        createReminderChannel();
        TodayWidgetProvider.updateAll(this);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#f4f6fb"));
        setContentView(web);
        try { WebView.setWebContentsDebuggingEnabled(true); } catch (Throwable ignored) {}
        Log.i("xuexijilu", "onCreate -> " + BASE_URL);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " xuexijilu-android/1.2");

        web.setWebViewClient(new LocalClient());
        web.setWebChromeClient(new Chrome());
        web.addJavascriptInterface(new Bridge(), "AndroidApp");

        web.setDownloadListener((url, ua, cd, mime, len) ->
                Toast.makeText(this, "请在应用内导出", Toast.LENGTH_SHORT).show());

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(BASE_URL);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    /* ================= 返回键 ================= */
    @Override
    public void onBackPressed() {
        // 1) 弹层开着 → 让页面自己关（JS 判定后返回 'sheet' 或 'none'）
        web.evaluateJavascript(
            "(function(){try{return (window.__closeSheetForBack&&window.__closeSheetForBack())?'sheet':'none';}catch(e){return 'none';}})()",
            v -> {
                if (v != null && v.contains("sheet")) return;
                // 2) WebView 有历史 → 后退
                if (web.canGoBack()) web.goBack();
                else finish();
            });
    }

    /* ================= 资源拦截 ================= */
    private class LocalClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri url = req.getUrl();
            if (!HOST.equals(url.getHost())) return null;
            String path = url.getPath();
            if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
            path = path.substring(1);
            try {
                InputStream is = getAssets().open("www/" + path);
                return response(is, mimeOf(path), corsHeaders());
            } catch (IOException e) {
                return notFound();
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri url = req.getUrl();
            if (HOST.equals(url.getHost())) return false;
            try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (Exception ignored) {}
            return true;
        }

        @Override
        public void onReceivedError(WebView view, int code, String desc, String failingUrl) {
            Log.e("xuexijilu", "onReceivedError " + code + " " + desc + " " + failingUrl);
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest req, WebResourceResponse res) {
            Log.e("xuexijilu", "httpError " + res.getStatusCode() + " " + req.getUrl());
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            Log.i("xuexijilu", "onPageFinished " + url);
            view.evaluateJavascript(
                "(function(){try{return 'title='+document.title+' bodyLen='+document.body.innerHTML.length+' tabs='+document.querySelectorAll('#tabbar a').length+' err='+(window.__bootErr||'none');}catch(e){return 'eval-fail:'+e.message}})()",
                v -> Log.i("xuexijilu", "probe " + v));
            // 深浅主题跟随系统：把 WebView 的深色偏好交给 CSS 变量（auto 模式由页面自己判断）
            view.evaluateJavascript(
                "document.dispatchEvent(new CustomEvent('android-ready'))", null);
        }
    }

    private static WebResourceResponse response(InputStream is, String mime, Map<String, String> headers) {
        WebResourceResponse r = new WebResourceResponse(mime, "utf-8", is);
        r.setResponseHeaders(headers);
        return r;
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                null, new ByteArrayInputStream("not found".getBytes(StandardCharsets.UTF_8)));
    }

    private static Map<String, String> corsHeaders() {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Cache-Control", "no-store");
        return h;
    }

    private static String mimeOf(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".gif")) return "image/gif";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

    /* ================= Chrome Client：文件选择 / 控制台 ================= */
    private class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = cb;
            Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            try {
                startActivityForResult(Intent.createChooser(intent, "选择备份文件"), REQ_PICK_FILE);
            } catch (Exception e) {
                fileCallback = null;
                return false;
            }
            return true;
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage cm) {
            Log.i("xuexijilu", "console[" + cm.messageLevel() + "] " + cm.message() + " @" + cm.lineNumber());
            return true;
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
            Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
            result.confirm();
            return true;
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_PICK_FILE) {
            Uri[] out = null;
            if (res == RESULT_OK && data != null && data.getData() != null) out = new Uri[]{ data.getData() };
            if (fileCallback != null) { fileCallback.onReceiveValue(out); fileCallback = null; }
            return;
        }
        super.onActivityResult(req, res, data);
    }

    /* ================= 计时常驻通知 ================= */
    private void createTimerChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CH_TIMER, "专注计时", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("计时进行中的常驻提醒");
            ch.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    /** v1.8：每日提醒通知渠道（提前建好，系统通知设置里可见） */
    private void createReminderChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(DailyReminderReceiver.CH_REMINDER,
                    "每日提醒", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("每天定时提醒记一笔学习记录");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private boolean notifAllowed() {
        if (Build.VERSION.SDK_INT >= 33) {
            return checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    /** 更新/显示计时常驻通知；running=false 表示暂停态 */
    private void showTimerNotification(final String text, final boolean running) {
        runOnUiThread(() -> {
            try {
                if (!notifAllowed()) return;
                Intent tap = new Intent(this, MainActivity.class);
                tap.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
                PendingIntent pi = PendingIntent.getActivity(this, 0, tap,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                Notification.Builder b = Build.VERSION.SDK_INT >= 26
                        ? new Notification.Builder(this, CH_TIMER)
                        : new Notification.Builder(this);
                b.setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                 .setContentTitle("学习计时进行中")
                 .setContentText(text)
                 .setOngoing(true)
                 .setOnlyAlertOnce(true)
                 .setContentIntent(pi)
                 .setShowWhen(false);
                if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_LOW);
                NotificationManager nm = getSystemService(NotificationManager.class);
                if (nm != null) nm.notify(NOTIF_TIMER_ID, b.build());
            } catch (Exception ignored) {}
        });
    }

    private void stopTimerNotification() {
        runOnUiThread(() -> {
            try {
                NotificationManager nm = getSystemService(NotificationManager.class);
                if (nm != null) nm.cancel(NOTIF_TIMER_ID);
            } catch (Exception ignored) {}
        });
    }

    /* ================= JS 桥 ================= */
    private class Bridge {
        /** dark=true 时把状态栏/导航栏切深色底浅字，false 反之 */
        @JavascriptInterface
        public void openNotifSettings() {
            runOnUiThread(() -> {
                try {
                    Intent i;
                    if (Build.VERSION.SDK_INT >= 26) {
                        i = new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                        i.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName());
                    } else {
                        i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                        i.setData(Uri.parse("package:" + getPackageName()));
                    }
                    startActivity(i);
                } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public void setTheme(final boolean dark) {
            runOnUiThread(() -> {
                Window w = getWindow();
                int bg = Color.parseColor(dark ? "#0d0f15" : "#f4f6fb");
                w.setStatusBarColor(bg);
                w.setNavigationBarColor(bg);
                View decor = w.getDecorView();
                int flags = decor.getSystemUiVisibility();
                int lightFlag = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                int navFlag = Build.VERSION.SDK_INT >= 26 ? View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0;
                if (dark) flags &= ~(lightFlag | navFlag);
                else flags |= (lightFlag | navFlag);
                decor.setSystemUiVisibility(flags);
            });
        }

        @JavascriptInterface
        public void toast(final String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }

        /** 触觉反馈，毫秒 */
        @JavascriptInterface
        public void haptic(final long ms) {
            runOnUiThread(() -> {
                android.os.Vibrator v = (android.os.Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (v != null) { try { v.vibrate(ms); } catch (Exception ignored) {} }
            });
        }

        /** 导出：把 JSON 写入 Downloads（学习记录-日期.json） */
        @JavascriptInterface
        public void saveFile(String name, String content) {
            saveFileAs(name, content, "application/json");
        }

        /** v1.7：CSV 等文本导出可指定 MIME 类型。 */
        @JavascriptInterface
        public void saveFile(String name, String content, final String mime) {
            saveFileAs(name, content, mime == null || mime.isEmpty() ? "application/json" : mime);
        }

        private void saveFileAs(String name, String content, final String mime) {
            pendingSaveName = name;
            pendingSaveContent = content;
            runOnUiThread(() -> {
                try {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, pendingSaveName);
                    cv.put(MediaStore.Downloads.MIME_TYPE, mime);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        cv.put(MediaStore.Downloads.RELATIVE_PATH, "Download/学习记录");
                    }
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) throw new IOException("insert failed");
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    os.write(pendingSaveContent.getBytes(StandardCharsets.UTF_8));
                    os.close();
                    Toast.makeText(MainActivity.this, "已导出到下载目录：" + pendingSaveName, Toast.LENGTH_LONG).show();
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "导出失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
                }
                pendingSaveName = null; pendingSaveContent = null;
            });
        }

        /**
         * 保存应用生成的图片（周报海报）：dataUrl 形如 data:image/png;base64,...
         * 写入相册 Pictures/学习记录/，成功返回 true，失败返回 false。
         */
        @JavascriptInterface
        public boolean saveImage(String name, String dataUrl) {
            try {
                if (dataUrl == null || dataUrl.isEmpty()) return false;
                int comma = dataUrl.indexOf(',');
                String base64 = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
                byte[] bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                if (bytes.length == 0) return false;
                String fileName = (name == null || name.trim().isEmpty()) ? "学习周报.png" : name.trim();
                if (!fileName.toLowerCase().endsWith(".png")) fileName = fileName + ".png";
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                cv.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    cv.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/学习记录");
                }
                Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) {
                    Log.e("xuexijilu", "saveImage insert failed");
                    return false;
                }
                OutputStream os = getContentResolver().openOutputStream(uri);
                if (os == null) return false;
                os.write(bytes);
                os.flush();
                os.close();
                Log.i("xuexijilu", "saveImage ok -> " + uri + " (" + bytes.length + " bytes)");
                return true;
            } catch (Exception e) {
                Log.e("xuexijilu", "saveImage failed: " + e);
                return false;
            }
        }

        /** 静默落一份备份到应用私有目录（不出通知、不打扰），供自动备份做外部留档 */
        @JavascriptInterface
        public void saveBackupQuietly(String name, String content) {
            try {
                File dir = new File(getFilesDir(), "backup");
                if (!dir.exists() && !dir.mkdirs()) return;
                File f = new File(dir, (name == null || name.trim().isEmpty()) ? "backup.json" : name.trim());
                try (FileWriter fw = new FileWriter(f, false)) {
                    fw.write(content == null ? "{}" : content);
                }
            } catch (Exception e) {
                Log.e("xuexijilu", "saveBackupQuietly failed: " + e);
            }
        }

        /** 当前运行环境 */
        @JavascriptInterface
        public boolean isApp() { return true; }

        /** 计时常驻通知：running=true 显示进行中，false 显示已暂停；text 为时间与状态文案 */
        @JavascriptInterface
        public void updateTimerNotification(final String text, final boolean running) {
            showTimerNotification(text, running);
        }

        @JavascriptInterface
        public void stopTimerNotification() {
            MainActivity.this.stopTimerNotification();
        }

        @JavascriptInterface
        public boolean notifPermissionGranted() { return notifAllowed(); }

        /** v1.8：每日提醒当前设置，"HH:mm"（开启）或 ""（关闭） */
        @JavascriptInterface
        public String getDailyReminder() {
            SharedPreferences sp = getSharedPreferences(ReminderScheduler.PREFS, MODE_PRIVATE);
            if (!sp.getBoolean(ReminderScheduler.KEY_ENABLED, false)) return "";
            return sp.getString(ReminderScheduler.KEY_TIME, "20:00");
        }

        /** v1.8：设置每日提醒。time 形如 "20:00"；enabled=false 取消。返回是否成功。 */
        @JavascriptInterface
        public boolean setDailyReminder(final String time, final boolean enabled) {
            try {
                if (time == null || !time.matches("\\d{1,2}:\\d{2}")) return false;
                SharedPreferences sp = getSharedPreferences(ReminderScheduler.PREFS, MODE_PRIVATE);
                sp.edit().putBoolean(ReminderScheduler.KEY_ENABLED, enabled)
                        .putString(ReminderScheduler.KEY_TIME, time).apply();
                ReminderScheduler.apply(MainActivity.this);
                Log.i("xuexijilu", "setDailyReminder " + time + " enabled=" + enabled);
                return true;
            } catch (Exception e) {
                Log.e("xuexijilu", "setDailyReminder failed", e);
                return false;
            }
        }

        /** v1.9：桌面小组件推送。JS 在启动与每次数据变化时调用。 */
        @JavascriptInterface
        public void updateWidget(final String minutes, final String streak) {
            TodayWidgetProvider.push(MainActivity.this, minutes, streak);
            Log.i("xuexijilu", "updateWidget minutes=" + minutes + " streak=" + streak);
        }
    }

    @Override
    protected void onDestroy() {
        stopTimerNotification();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
