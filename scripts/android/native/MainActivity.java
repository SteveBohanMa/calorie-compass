package __PACKAGE__;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * Calorie Compass Android app. Generated from scripts/android/native/ by
 * scripts/android/customize-android.mjs; edit the template, not this copy.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App plugins must be registered before the bridge starts in super.onCreate.
        registerPlugin(CalorieCompassFilesPlugin.class);
        registerPlugin(CalorieCompassHealthPlugin.class);
        super.onCreate(savedInstanceState);

        Bridge bridge = getBridge();
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) {
            return;
        }
        // The app scrolls its own pages; the WebView itself should neither glow nor zoom.
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = webView.getSettings();
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
    }
}
