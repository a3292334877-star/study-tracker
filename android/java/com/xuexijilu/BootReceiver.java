package app.xuexijilu;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** v1.8：开机完成 → 按已保存的设置重排每日提醒闹钟（闹钟不跨重启，必须补排）。 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)) return;
        Log.i("xuexijilu", "boot completed -> reschedule reminder");
        try {
            ReminderScheduler.apply(context);
        } catch (Exception e) {
            Log.e("xuexijilu", "reschedule reminder failed", e);
        }
    }
}
