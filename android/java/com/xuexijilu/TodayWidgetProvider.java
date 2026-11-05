package app.xuexijilu;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * v1.9：今日进度桌面小组件。
 * 数字由 JS 通过桥 updateWidget(minutes, streak) 推送并存进 SharedPreferences，
 * 这里只负责按存档重画；系统半小时一次的 tick 发现存档日期不是今天
 * （今天还没打开过应用）就回落到零状态，避免小组件显示昨天的数字。
 */
public class TodayWidgetProvider extends AppWidgetProvider {

    public static final String PREFS = "widget";
    public static final String KEY_MINUTES = "minutes";
    public static final String KEY_STREAK = "streak";
    public static final String KEY_DATE = "date";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        updateAll(context);
    }

    /** JS 桥 updateWidget(minutes, streak)：先存数字，再重画。 */
    public static void push(Context context, String minutes, String streak) {
        try {
            SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            sp.edit()
                    .putString(KEY_MINUTES, String.valueOf(parse(minutes)))
                    .putString(KEY_STREAK, String.valueOf(parse(streak)))
                    .putString(KEY_DATE, today())
                    .apply();
        } catch (Throwable ignored) {}
        updateAll(context);
    }

    /** 重画桌面上的全部小组件实例。 */
    public static void updateAll(Context context) {
        try {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            if (manager == null) return;
            SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            boolean fresh = today().equals(sp.getString(KEY_DATE, ""));
            int minutes = fresh ? parse(sp.getString(KEY_MINUTES, "0")) : 0;
            int streak = fresh ? parse(sp.getString(KEY_STREAK, "0")) : 0;

            RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_today);
            if (minutes > 0) {
                rv.setTextViewText(R.id.widget_min, minutes >= 60
                        ? (minutes / 60) + " 小时 " + (minutes % 60) + " 分钟"
                        : minutes + " 分钟");
            } else {
                rv.setTextViewText(R.id.widget_min, "今天还没记录");
            }
            if (streak > 0) {
                rv.setTextViewText(R.id.widget_streak, "已连续记录 " + streak + " 天");
            } else {
                rv.setTextViewText(R.id.widget_streak, "打开应用记一笔");
            }

            Intent tap = context.getPackageManager()
                    .getLaunchIntentForPackage(context.getPackageName());
            if (tap == null) tap = new Intent(context, MainActivity.class);
            PendingIntent pi = PendingIntent.getActivity(context, 2003, tap,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            rv.setOnClickPendingIntent(R.id.widget_root, pi);

            manager.updateAppWidget(new ComponentName(context, TodayWidgetProvider.class), rv);
        } catch (Throwable t) {
            Log.w("xuexijilu", "updateWidget failed", t);
        }
    }

    private static int parse(String s) {
        try { return Integer.parseInt(s.trim()); } catch (Throwable t) { return 0; }
    }

    private static String today() {
        return new SimpleDateFormat("yyyyMMdd", Locale.US).format(new Date());
    }
}
