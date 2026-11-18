package __PACKAGE__;

import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Health Connect for the Android app (v2.10): reads heart rate, workouts, weight and resting heart rate,
 * and writes finished workouts back. src/health/api.ts is the JavaScript side and holds the decisions
 * (which reading to use, what to write); this plugin only moves data.
 *
 * Uses the Health Connect API built into Android 14 (API 34) and newer (android.health.connect), so it
 * needs no extra library. On older Android versions getStatus() reports "android-version" and the
 * app keeps manual entry. Health permissions are ordinary runtime permissions on Android 14: the
 * built-in checkPermissions/requestPermissions methods of Capacitor handle them by alias.
 *
 * This class is loaded on every Android version the app supports (minSdk 24), and Capacitor reflects
 * over all of its methods at startup. So no field or method signature here may name java.time (Android 8+)
 * or anything from android.health.connect: HealthConnectAccess holds all of that and is only created and
 * called on Android 14+.
 *
 * Generated from scripts/android/native/ by scripts/android/customize-android.mjs. Edit the template.
 * Keep this file ASCII-only.
 */
@CapacitorPlugin(
    name = "CalorieCompassHealth",
    permissions = {
        @Permission(alias = "heartRate", strings = { "android.permission.health.READ_HEART_RATE" }),
        @Permission(alias = "exercise", strings = { "android.permission.health.READ_EXERCISE" }),
        @Permission(alias = "weight", strings = { "android.permission.health.READ_WEIGHT" }),
        @Permission(alias = "restingHeartRate", strings = { "android.permission.health.READ_RESTING_HEART_RATE" }),
        @Permission(
            alias = "writeWorkouts",
            strings = { "android.permission.health.WRITE_EXERCISE", "android.permission.health.WRITE_ACTIVE_CALORIES_BURNED" }
        )
    }
)
public class CalorieCompassHealthPlugin extends Plugin {
    /** Android 14: the first version with Health Connect in the system. */
    static final int MIN_SDK = 34;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    /** The HealthConnectAccess once created (Android 14+ only); typed as Object, see the class comment. */
    private Object access;

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("sdkInt", Build.VERSION.SDK_INT);
        if (Build.VERSION.SDK_INT < MIN_SDK) {
            result.put("available", false);
            result.put("reason", "android-version");
        } else if (connect() == null) {
            result.put("available", false);
            result.put("reason", "no-health-connect");
        } else {
            result.put("available", true);
        }
        call.resolve(result);
    }

    /** Heart-rate samples with a time in [start, end], newest first: { samples: [{ bpm, time, source }] }. */
    @PluginMethod
    public void readHeartRate(PluginCall call) {
        if (ready(call)) ((HealthConnectAccess) access).readHeartRate(call);
    }

    /** Average heart rate over [start, end] across all apps: { bpm (null when there is none), count }. */
    @PluginMethod
    public void heartRateAverage(PluginCall call) {
        if (ready(call)) ((HealthConnectAccess) access).heartRateAverage(call);
    }

    /** Workouts that start within [start, end], newest first: { sessions: [{ start, end, type, title, source, own }] }. */
    @PluginMethod
    public void readExerciseSessions(PluginCall call) {
        if (ready(call)) ((HealthConnectAccess) access).readExerciseSessions(call);
    }

    /** The newest weight within [start, end]: { kg, time, source }, or {} when there is none. */
    @PluginMethod
    public void readLatestWeight(PluginCall call) {
        if (ready(call)) ((HealthConnectAccess) access).readLatestWeight(call);
    }

    /** Resting heart rate within [start, end], newest first: { samples: [{ bpm, time, source }] }. */
    @PluginMethod
    public void readRestingHeartRate(PluginCall call) {
        if (ready(call)) ((HealthConnectAccess) access).readRestingHeartRate(call);
    }

    /**
     * Writes one finished workout ({ id, start, end, exerciseType, title, kcal, version }) as an exercise
     * session plus its active calories. `id` is the app's entry id; writing the same id again with a higher
     * version replaces the earlier records (Health Connect matches client record ids).
     */
    @PluginMethod
    public void writeWorkout(PluginCall call) {
        if (ready(call)) ((HealthConnectAccess) access).writeWorkout(call);
    }

    /** Removes what writeWorkout wrote for { id } (nothing happens when it was never written). */
    @PluginMethod
    public void deleteWorkout(PluginCall call) {
        if (ready(call)) ((HealthConnectAccess) access).deleteWorkout(call);
    }

    /** Opens the Health Connect page where the user manages this app's permissions. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        if (ready(call)) ((HealthConnectAccess) access).openSettings(call, getActivity());
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdown();
        super.handleOnDestroy();
    }

    /** The HealthConnectAccess, or null before Android 14 or when the system has no Health Connect. */
    private Object connect() {
        if (Build.VERSION.SDK_INT < MIN_SDK) return null;
        if (access == null) {
            HealthConnectAccess created = new HealthConnectAccess(getContext(), executor);
            if (created.isReady()) access = created;
        }
        return access;
    }

    /** True when Health Connect can be used; otherwise rejects the call with "unavailable". */
    private boolean ready(PluginCall call) {
        if (connect() != null) return true;
        call.reject(Build.VERSION.SDK_INT < MIN_SDK ? "Needs Android 14" : "Health Connect is not available", "unavailable");
        return false;
    }
}
