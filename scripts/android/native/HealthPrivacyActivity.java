package __PACKAGE__;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * The page Health Connect opens from "why does this app need access?" (Android 14 and newer require an
 * activity for VIEW_PERMISSION_USAGE with the HEALTH_PERMISSIONS category before they grant any health
 * permission; see the manifest entries written by scripts/android/customize-android.mjs). It explains,
 * in the phone's language, what the app reads and writes and that nothing leaves the phone. The text is
 * in res/values(-zh)/cc_health.xml (templates in scripts/android/res/).
 *
 * Generated from scripts/android/native/ by scripts/android/customize-android.mjs. Edit the template.
 * Keep this file ASCII-only.
 */
public class HealthPrivacyActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        int padding = dp(22);

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText(R.string.cc_health_privacy_title);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(Color.rgb(24, 77, 62));
        column.addView(title);

        TextView body = new TextView(this);
        body.setText(R.string.cc_health_privacy_body);
        body.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        body.setTextColor(Color.rgb(31, 41, 38));
        body.setLineSpacing(0, 1.25f);
        body.setPadding(0, dp(14), 0, 0);
        column.addView(body);

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(245, 252, 248));
        // Keeps the text clear of the status and navigation bars, also when Android draws edge to edge.
        scroll.setFitsSystemWindows(true);
        scroll.addView(column, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(scroll);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
