package com.videochat.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Replaces Capacitor's default FCM service so we can show a full-screen call
 * notification over the lock screen, while still forwarding events to JS.
 */
public class CallMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "vc_calls";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        super.onMessageReceived(message);
        try {
            PushNotificationsPlugin.sendRemoteMessage(message);
        } catch (Throwable ignored) {
            // Plugin may not be loaded yet
        }

        Map<String, String> data = message.getData();
        if (data == null || data.isEmpty()) return;
        if ("cancel".equals(data.get("type"))) {
            NotificationManagerCompat.from(this).cancel(safeId(data.get("roomId")));
            return;
        }
        String roomId = data.get("roomId");
        if (roomId == null || roomId.isEmpty()) return;
        showCallNotification(roomId, data.get("ringId"), data.get("title"), data.get("body"));
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        try {
            PushNotificationsPlugin.onNewToken(token);
        } catch (Throwable ignored) {
            // Plugin may not be loaded yet
        }
    }

    private void showCallNotification(String roomId, String ringId, String title, String body) {
        ensureChannel();
        String rid = ringId == null ? "" : ringId;

        Intent full = new Intent(this, IncomingCallActivity.class);
        full.putExtra("roomId", roomId);
        full.putExtra("ringId", rid);
        full.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent fullScreen = PendingIntent.getActivity(this, roomId.hashCode(), full, flags);

        Intent open = new Intent(this, MainActivity.class);
        String path = "/room/" + roomId + (rid.isEmpty() ? "" : ("?ring=" + rid));
        open.putExtra("incoming_path", path);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(this, roomId.hashCode() + 7, open, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title != null && !title.isEmpty() ? title : "Входящий звонок")
            .setContentText(body != null && !body.isEmpty() ? body : "Нажмите, чтобы ответить")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(true)
            .setContentIntent(content)
            .setFullScreenIntent(fullScreen, true);

        try {
            NotificationManagerCompat.from(this).notify(safeId(roomId), builder.build());
        } catch (SecurityException ignored) {
            // notifications permission denied
        }
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Звонки",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Входящие видеозвонки");
        channel.enableVibration(true);
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.createNotificationChannel(channel);
    }

    private static int safeId(String roomId) {
        return (roomId == null ? "call" : roomId).hashCode();
    }
}
