package com.videochat.app;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        routeIncoming(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        routeIncoming(intent);
    }

    private void routeIncoming(Intent intent) {
        if (intent == null) return;
        final String path = intent.getStringExtra("incoming_path");
        if (path == null || path.isEmpty()) return;
        intent.removeExtra("incoming_path");

        final Bridge bridge = getBridge();
        if (bridge == null) return;
        final WebView webView = bridge.getWebView();
        if (webView == null) return;

        final String js = "window.location.href=" + org.json.JSONObject.quote(path);
        webView.post(() -> {
            try {
                webView.evaluateJavascript(js, null);
            } catch (Exception ignored) {
                // WebView may not be ready yet; cold start still lands via notification URL later.
            }
        });
    }
}
