package __PACKAGE__;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.health.connect.AggregateRecordsRequest;
import android.health.connect.AggregateRecordsResponse;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.InsertRecordsResponse;
import android.health.connect.ReadRecordsRequestUsingFilters;
import android.health.connect.ReadRecordsResponse;
import android.health.connect.RecordIdFilter;
import android.health.connect.TimeInstantRangeFilter;
import android.health.connect.datatypes.ActiveCaloriesBurnedRecord;
import android.health.connect.datatypes.ExerciseSessionRecord;
import android.health.connect.datatypes.HeartRateRecord;
import android.health.connect.datatypes.Metadata;
import android.health.connect.datatypes.Record;
import android.health.connect.datatypes.RestingHeartRateRecord;
import android.health.connect.datatypes.WeightRecord;
import android.health.connect.datatypes.units.Energy;
import android.os.OutcomeReceiver;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Executor;

/**
 * The Health Connect calls of CalorieCompassHealthPlugin (Android 14 / API 34 and newer only: the plugin
 * creates and calls this class only after checking the version). Each method reads its own arguments from
 * the PluginCall ("start" and "end" are ISO-8601 times) and settles the call exactly once; Health Connect
 * errors become rejections with a short code ("permission", "rate-limit", "invalid", "failed") that
 * src/health/api.ts turns into a message.
 *
 * Generated from scripts/android/native/ by scripts/android/customize-android.mjs. Edit the template.
 * Keep this file ASCII-only.
 */
final class HealthConnectAccess {
    /**
     * Heart-rate records are found by their start time, and one record can hold the samples of a long
     * stretch (a whole workout or day), so records that started up to this long before the wanted samples
     * are read too.
     */
    private static final Duration HEART_RATE_RECORD_SPAN = Duration.ofHours(24);
    private static final int MAX_SAMPLES = 300;
    private static final String SESSION_SUFFIX = "#session";
    private static final String CALORIES_SUFFIX = "#active";

    private final Context context;
    private final HealthConnectManager manager;
    private final Executor executor;

    HealthConnectAccess(Context context, Executor executor) {
        this.context = context;
        this.manager = context.getSystemService(HealthConnectManager.class);
        this.executor = executor;
    }

    boolean isReady() {
        return manager != null;
    }

    void readHeartRate(final PluginCall call) {
        Instant[] range = range(call);
        if (range == null) return;
        final Instant from = range[0];
        final Instant to = range[1];
        ReadRecordsRequestUsingFilters<HeartRateRecord> request = new ReadRecordsRequestUsingFilters.Builder<>(HeartRateRecord.class)
            .setTimeRangeFilter(filter(from.minus(HEART_RATE_RECORD_SPAN), to))
            .setAscending(false)
            .setPageSize(1000)
            .build();
        try {
            manager.readRecords(request, executor, new OutcomeReceiver<ReadRecordsResponse<HeartRateRecord>, HealthConnectException>() {
                @Override
                public void onResult(ReadRecordsResponse<HeartRateRecord> response) {
                    List<Sample> samples = new ArrayList<>();
                    for (HeartRateRecord record : response.getRecords()) {
                        String source = source(record);
                        for (HeartRateRecord.HeartRateSample sample : record.getSamples()) {
                            Instant time = sample.getTime();
                            if (time.isBefore(from) || time.isAfter(to)) continue;
                            samples.add(new Sample(sample.getBeatsPerMinute(), time, source));
                        }
                    }
                    call.resolve(samplesResult(samples));
                }

                @Override
                public void onError(HealthConnectException error) {
                    reject(call, error);
                }
            });
        } catch (RuntimeException error) {
            reject(call, error);
        }
    }

    void heartRateAverage(final PluginCall call) {
        Instant[] range = range(call);
        if (range == null) return;
        AggregateRecordsRequest<Long> request = new AggregateRecordsRequest.Builder<Long>(filter(range[0], range[1]))
            .addAggregationType(HeartRateRecord.BPM_AVG)
            .addAggregationType(HeartRateRecord.HEART_MEASUREMENTS_COUNT)
            .build();
        try {
            manager.aggregate(request, executor, new OutcomeReceiver<AggregateRecordsResponse<Long>, HealthConnectException>() {
                @Override
                public void onResult(AggregateRecordsResponse<Long> response) {
                    Long average = response.get(HeartRateRecord.BPM_AVG);
                    Long count = response.get(HeartRateRecord.HEART_MEASUREMENTS_COUNT);
                    JSObject result = new JSObject();
                    result.put("bpm", average == null ? JSObject.NULL : average);
                    result.put("count", count == null ? 0 : count);
                    call.resolve(result);
                }

                @Override
                public void onError(HealthConnectException error) {
                    reject(call, error);
                }
            });
        } catch (RuntimeException error) {
            reject(call, error);
        }
    }

    void readExerciseSessions(final PluginCall call) {
        Instant[] range = range(call);
        if (range == null) return;
        ReadRecordsRequestUsingFilters<ExerciseSessionRecord> request = new ReadRecordsRequestUsingFilters.Builder<>(ExerciseSessionRecord.class)
            .setTimeRangeFilter(filter(range[0], range[1]))
            .setAscending(false)
            .setPageSize(100)
            .build();
        try {
            manager.readRecords(request, executor, new OutcomeReceiver<ReadRecordsResponse<ExerciseSessionRecord>, HealthConnectException>() {
                @Override
                public void onResult(ReadRecordsResponse<ExerciseSessionRecord> response) {
                    JSArray sessions = new JSArray();
                    for (ExerciseSessionRecord record : response.getRecords()) {
                        String source = source(record);
                        CharSequence title = record.getTitle();
                        JSObject session = new JSObject();
                        session.put("start", record.getStartTime().toString());
                        session.put("end", record.getEndTime().toString());
                        session.put("type", record.getExerciseType());
                        session.put("title", title == null ? "" : title.toString());
                        session.put("source", source);
                        session.put("own", context.getPackageName().equals(source));
                        sessions.put(session);
                    }
                    JSObject result = new JSObject();
                    result.put("sessions", sessions);
                    call.resolve(result);
                }

                @Override
                public void onError(HealthConnectException error) {
                    reject(call, error);
                }
            });
        } catch (RuntimeException error) {
            reject(call, error);
        }
    }

    void readLatestWeight(final PluginCall call) {
        Instant[] range = range(call);
        if (range == null) return;
        ReadRecordsRequestUsingFilters<WeightRecord> request = new ReadRecordsRequestUsingFilters.Builder<>(WeightRecord.class)
            .setTimeRangeFilter(filter(range[0], range[1]))
            .setAscending(false)
            .setPageSize(1)
            .build();
        try {
            manager.readRecords(request, executor, new OutcomeReceiver<ReadRecordsResponse<WeightRecord>, HealthConnectException>() {
                @Override
                public void onResult(ReadRecordsResponse<WeightRecord> response) {
                    JSObject result = new JSObject();
                    List<WeightRecord> records = response.getRecords();
                    if (!records.isEmpty()) {
                        WeightRecord record = records.get(0);
                        result.put("kg", record.getWeight().getInGrams() / 1000.0);
                        result.put("time", record.getTime().toString());
                        result.put("source", source(record));
                    }
                    call.resolve(result);
                }

                @Override
                public void onError(HealthConnectException error) {
                    reject(call, error);
                }
            });
        } catch (RuntimeException error) {
            reject(call, error);
        }
    }

    void readRestingHeartRate(final PluginCall call) {
        Instant[] range = range(call);
        if (range == null) return;
        ReadRecordsRequestUsingFilters<RestingHeartRateRecord> request = new ReadRecordsRequestUsingFilters.Builder<>(RestingHeartRateRecord.class)
            .setTimeRangeFilter(filter(range[0], range[1]))
            .setAscending(false)
            .setPageSize(MAX_SAMPLES)
            .build();
        try {
            manager.readRecords(request, executor, new OutcomeReceiver<ReadRecordsResponse<RestingHeartRateRecord>, HealthConnectException>() {
                @Override
                public void onResult(ReadRecordsResponse<RestingHeartRateRecord> response) {
                    List<Sample> samples = new ArrayList<>();
                    for (RestingHeartRateRecord record : response.getRecords()) {
                        samples.add(new Sample(record.getBeatsPerMinute(), record.getTime(), source(record)));
                    }
                    call.resolve(samplesResult(samples));
                }

                @Override
                public void onError(HealthConnectException error) {
                    reject(call, error);
                }
            });
        } catch (RuntimeException error) {
            reject(call, error);
        }
    }

    /** { id, start, end, exerciseType, title, kcal, version }: one exercise session plus its active calories. */
    void writeWorkout(final PluginCall call) {
        Instant[] range = range(call);
        if (range == null) return;
        Instant start = range[0];
        Instant end = range[1];
        String id = call.getString("id");
        String title = call.getString("title", "");
        // optInt/optDouble/optLong accept any JSON number (getLong only accepts values that arrive as a Long).
        int exerciseType = call.getData().optInt("exerciseType", -1);
        double kcal = call.getData().optDouble("kcal", Double.NaN);
        long version = call.getData().optLong("version", -1);
        if (id == null || id.isEmpty() || id.length() > 200 || exerciseType < 0 || version < 0) {
            call.reject("Missing workout fields", "invalid");
            return;
        }
        // Health Connect refuses records that start in the future; the app never writes those.
        if (!(kcal > 0) || kcal > 20000 || !end.isAfter(start) || start.isAfter(Instant.now())) {
            call.reject("Workout values out of range", "invalid");
            return;
        }
        if (title == null) title = "";
        List<Record> records = new ArrayList<>();
        try {
            ExerciseSessionRecord.Builder session = new ExerciseSessionRecord.Builder(metadata(id + SESSION_SUFFIX, version), start, end, exerciseType);
            if (!title.isEmpty()) session.setTitle(title);
            records.add(session.build());
            // Energy is in small calories: 1 kcal = 1000 cal.
            records.add(new ActiveCaloriesBurnedRecord.Builder(metadata(id + CALORIES_SUFFIX, version), start, end, Energy.fromCalories(kcal * 1000.0)).build());
            manager.insertRecords(records, executor, new OutcomeReceiver<InsertRecordsResponse, HealthConnectException>() {
                @Override
                public void onResult(InsertRecordsResponse response) {
                    JSObject result = new JSObject();
                    result.put("records", response.getRecords().size());
                    call.resolve(result);
                }

                @Override
                public void onError(HealthConnectException error) {
                    reject(call, error);
                }
            });
        } catch (RuntimeException error) {
            reject(call, error);
        }
    }

    /** { id }: removes what writeWorkout wrote for this id; ids that were never written are ignored. */
    void deleteWorkout(final PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("Missing id", "invalid");
            return;
        }
        List<RecordIdFilter> ids = new ArrayList<>();
        ids.add(RecordIdFilter.fromClientRecordId(ExerciseSessionRecord.class, id + SESSION_SUFFIX));
        ids.add(RecordIdFilter.fromClientRecordId(ActiveCaloriesBurnedRecord.class, id + CALORIES_SUFFIX));
        try {
            manager.deleteRecords(ids, executor, new OutcomeReceiver<Void, HealthConnectException>() {
                @Override
                public void onResult(Void ignored) {
                    call.resolve();
                }

                @Override
                public void onError(HealthConnectException error) {
                    reject(call, error);
                }
            });
        } catch (RuntimeException error) {
            reject(call, error);
        }
    }

    void openSettings(PluginCall call, Activity activity) {
        Intent intent = new Intent(HealthConnectManager.ACTION_MANAGE_HEALTH_PERMISSIONS);
        intent.putExtra(Intent.EXTRA_PACKAGE_NAME, context.getPackageName());
        try {
            if (activity != null) {
                activity.startActivity(intent);
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            }
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Could not open Health Connect", "failed");
        }
    }

    // ---------------------------------------------------------------- helpers

    /** The call's ISO-8601 "start" and "end", or null after rejecting the call. */
    private static Instant[] range(PluginCall call) {
        String start = call.getString("start");
        String end = call.getString("end");
        if (start == null || end == null) {
            call.reject("start and end are required", "invalid");
            return null;
        }
        try {
            Instant from = Instant.parse(start);
            Instant to = Instant.parse(end);
            if (to.isBefore(from)) {
                call.reject("end is before start", "invalid");
                return null;
            }
            return new Instant[] { from, to };
        } catch (DateTimeParseException error) {
            call.reject("Invalid time: " + error.getParsedString(), "invalid");
            return null;
        }
    }

    private static TimeInstantRangeFilter filter(Instant from, Instant to) {
        return new TimeInstantRangeFilter.Builder().setStartTime(from).setEndTime(to).build();
    }

    /** Entered by the user in this app (the estimate of a workout they did), versioned for updates. */
    private static Metadata metadata(String clientRecordId, long version) {
        return new Metadata.Builder()
            .setClientRecordId(clientRecordId)
            .setClientRecordVersion(version)
            .setRecordingMethod(Metadata.RECORDING_METHOD_MANUAL_ENTRY)
            .build();
    }

    private static String source(Record record) {
        String name = record.getMetadata().getDataOrigin().getPackageName();
        return name == null ? "" : name;
    }

    private static JSObject samplesResult(List<Sample> samples) {
        Collections.sort(samples, (a, b) -> b.time.compareTo(a.time));
        JSArray array = new JSArray();
        for (int index = 0; index < samples.size() && index < MAX_SAMPLES; index++) {
            Sample sample = samples.get(index);
            JSObject item = new JSObject();
            item.put("bpm", sample.bpm);
            item.put("time", sample.time.toString());
            item.put("source", sample.source);
            array.put(item);
        }
        JSObject result = new JSObject();
        result.put("samples", array);
        return result;
    }

    private static void reject(PluginCall call, Exception error) {
        String code = "failed";
        if (error instanceof HealthConnectException) {
            int value = ((HealthConnectException) error).getErrorCode();
            if (value == HealthConnectException.ERROR_SECURITY) code = "permission";
            else if (value == HealthConnectException.ERROR_RATE_LIMIT_EXCEEDED) code = "rate-limit";
            else if (value == HealthConnectException.ERROR_INVALID_ARGUMENT) code = "invalid";
        } else if (error instanceof SecurityException) {
            code = "permission";
        } else if (error instanceof IllegalArgumentException) {
            code = "invalid";
        }
        String message = error.getMessage();
        call.reject(message == null || message.isEmpty() ? code : message, code);
    }

    private static final class Sample {
        final long bpm;
        final Instant time;
        final String source;

        Sample(long bpm, Instant time, String source) {
            this.bpm = bpm;
            this.time = time;
            this.source = source;
        }
    }
}
