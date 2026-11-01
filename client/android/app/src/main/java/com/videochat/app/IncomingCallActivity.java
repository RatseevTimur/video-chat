package com.videochat.app;

import android.app.KeyguardManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Full-screen incoming-call trampoline shown over the lock screen.
 * Forwards into MainActivity with /room/:id?ring=… so the WebView can answer.
 */
public class IncomingCallActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            if (km != null) {
                km.requestDismissKeyguard(this, null);
            }
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            );
        }

        String roomId = getIntent() != null ? getIntent().getStringExtra("roomId") : null;
        String ringId = getIntent() != null ? getIntent().getStringExtra("ringId") : null;
        String path = "/";
        if (roomId != null && roomId.length() >= 6) {
            path = "/room/" + roomId;
            if (ringId != null && !ringId.isEmpty()) {
                path += "?ring=" + ringId;
            }
        }

        Intent launch = new Intent(this, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launch.putExtra("incoming_path", path);
        if (roomId != null) launch.putExtra("roomId", roomId);
        if (ringId != null) launch.putExtra("ringId", ringId);
        startActivity(launch);
        finish();
    }
}
