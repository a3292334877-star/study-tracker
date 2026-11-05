package app.xuexijilu;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

/**
 * v1.8：每日提醒闹钟到点 → 发一条通知，并把明天的闹钟排上。
 * 精确闹钟路径必须由接收方自己续排；setWindow 路径重排一次也无害。
 */
public class DailyReminderReceiver extends BroadcastReceiver {
    public static final String CH_REMINDER = "daily_reminder";
    private static final int NOTIF_ID = 1002;

    @Override
    public void onReceive(Context context, Intent intent) {
        SharedPreferences sp = context.getSharedPreferences(
                ReminderScheduler.PREFS, Context.MODE_PRIVATE);
        if (!sp.getBoolean(ReminderScheduler.KEY_ENABLED, false)) return;
        notifyDaily(context);
        ReminderScheduler.apply(context);
    }

    static void notifyDaily(Context context) {
        try {
            NotificationManager nm =
                    (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel ch = new NotificationChannel(CH_REMINDER, "每日提醒",
                        NotificationManager.IMPORTANCE_DEFAULT);
                ch.setDescription("每天定时提醒记一笔学习记录");
                nm.createNotificationChannel(ch);
            }
            if (Build.VERSION.SDK_INT >= 33
                    && context.checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                            != PackageManager.PERMISSION_GRANTED) {
                Log.i("xuexijilu", "reminder skipped: no notification permission");
                return;
            }
            Intent open = context.getPackageManager()
                    .getLaunchIntentForPackage(context.getPackageName());
            if (open == null) open = new Intent(context, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pi = PendingIntent.getActivity(context, 2002, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26
                    ? new Notification.Builder(context, CH_REMINDER)
                    : new Notification.Builder(context);
            b.setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
             .setContentTitle("今天学了什么？")
             .setContentText("花 10 秒，把今天的学习记一笔")
             .setContentIntent(pi)
             .setAutoCancel(true);
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_DEFAULT);
            nm.notify(NOTIF_ID, b.build());
            Log.i("xuexijilu", "reminder notified");
        } catch (Exception e) {
            Log.e("xuexijilu", "notifyDaily failed", e);
        }
    }
}
