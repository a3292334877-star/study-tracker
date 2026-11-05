package app.xuexijilu;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import java.util.Calendar;

/**
 * v1.8：每日提醒的闹钟调度。
 * 设置存在 SharedPreferences（Java 侧为唯一事实来源，开机后由 BootReceiver 重排）：
 *   - 时间点：KEY_TIME，形如 "20:00"
 *   - 开关：  KEY_ENABLED
 * 精确闹钟：API 31+ 需要 SCHEDULE_EXACT_ALARM 且用户允许（canScheduleExactAlarms），
 * 未允许时退回 setWindow（10 分钟窗口），提醒类场景足够。
 */
public final class ReminderScheduler {
    public static final String PREFS = "reminder";
    public static final String KEY_TIME = "time";
    public static final String KEY_ENABLED = "enabled";

    private static final long WINDOW_MS = 10 * 60 * 1000L; // 非精确路径的窗口

    private ReminderScheduler() {}

    static PendingIntent pending(Context ctx) {
        Intent i = new Intent(ctx, DailyReminderReceiver.class);
        return PendingIntent.getBroadcast(ctx, 2001, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** 按当前设置重排或取消闹钟。返回下一次触发时间（未开启返回 0）。 */
    public static long apply(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return 0;
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!sp.getBoolean(KEY_ENABLED, false)) {
            am.cancel(pending(ctx));
            Log.i("xuexijilu", "reminder canceled");
            return 0;
        }
        String t = sp.getString(KEY_TIME, "20:00");
        int h = 20, m = 0;
        try {
            String[] parts = t.split(":");
            h = Integer.parseInt(parts[0].trim());
            m = parts.length > 1 ? Integer.parseInt(parts[1].trim()) : 0;
        } catch (Exception ignored) {}
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, h);
        cal.set(Calendar.MINUTE, m);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis()) {
            cal.add(Calendar.DAY_OF_YEAR, 1);
        }
        long at = cal.getTimeInMillis();
        boolean exact = true;
        if (Build.VERSION.SDK_INT >= 31) exact = am.canScheduleExactAlarms();
        if (exact) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(ctx));
        } else {
            am.setWindow(AlarmManager.RTC_WAKEUP, at, WINDOW_MS, pending(ctx));
        }
        Log.i("xuexijilu", "reminder set at=" + at + " exact=" + exact);
        return at;
    }
}
