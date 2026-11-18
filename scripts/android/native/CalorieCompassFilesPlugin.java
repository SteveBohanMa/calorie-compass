package __PACKAGE__;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.view.PixelCopy;
import android.webkit.WebView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Saves data backups and weekly-report images for the Android app. It is the Android side of
 * window.calorieCompass.exportBackup / exportReport (src/native/bridge.ts), which the Windows app
 * implements in desktop/main.cjs, and returns the same { saved, canceled, filePath, error } shape.
 *
 * Android 10 and newer: written through MediaStore into Download/<app> and Pictures/<app>, where the
 * file manager and the gallery show them; no storage permission is needed.
 * Android 7 to 9: written into this app's own folder on shared storage (also no permission).
 *
 * Generated from scripts/android/native/ by scripts/android/customize-android.mjs. Edit the template.
 * Keep this file ASCII-only; non-ASCII text is written as Unicode escapes.
 */
@CapacitorPlugin(name = "CalorieCompassFiles")
public class CalorieCompassFilesPlugin extends Plugin {
    /** Folder name shown in Download and Pictures: the app name. */
    private static final String FOLDER = "\u71c3\u5361\u5feb\u67e5";
    private static final int MAX_BACKUP_BYTES = 5 * 1024 * 1024;

    @PluginMethod
    public void saveBackup(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.isEmpty()) {
            call.resolve(failure("Empty backup"));
            return;
        }
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BACKUP_BYTES) {
            call.resolve(failure("Backup is larger than 5 MB"));
            return;
        }
        String fileName = cleanName(call.getString("fileName"), "calorie-compass-backup.json", ".json");
        try {
            call.resolve(success(save(bytes, fileName, "application/json", Environment.DIRECTORY_DOWNLOADS, false)));
        } catch (Exception error) {
            call.resolve(failure(error));
        }
    }

    @PluginMethod
    public void saveReport(PluginCall call) {
        final double scale = number(call, "scale", 1);
        final double x = Math.max(0, number(call, "x", 0));
        final double y = Math.max(0, number(call, "y", 0));
        final double width = number(call, "width", 0);
        final double height = number(call, "height", 0);
        final String fileName = cleanName(call.getString("fileName"), "calorie-compass-report.png", ".png");
        final Activity activity = getActivity();
        if (activity == null || scale <= 0 || width <= 0 || height <= 0) {
            call.resolve(failure("Nothing to capture"));
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                WebView webView = getBridge().getWebView();
                int viewWidth = webView.getWidth();
                int viewHeight = webView.getHeight();
                if (viewWidth <= 0 || viewHeight <= 0) {
                    call.resolve(failure("The app is not on screen"));
                    return;
                }
                // CSS pixels to device pixels, clipped to what the WebView shows.
                int left = clamp((int) Math.floor(x * scale), 0, viewWidth - 1);
                int top = clamp((int) Math.floor(y * scale), 0, viewHeight - 1);
                int right = clamp((int) Math.ceil((x + width) * scale), left + 1, viewWidth);
                int bottom = clamp((int) Math.ceil((y + height) * scale), top + 1, viewHeight);
                final Bitmap bitmap = Bitmap.createBitmap(right - left, bottom - top, Bitmap.Config.ARGB_8888);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    // Copies exactly what is on screen, like Electron's capturePage on Windows.
                    int[] origin = new int[2];
                    webView.getLocationInWindow(origin);
                    Rect source = new Rect(origin[0] + left, origin[1] + top, origin[0] + right, origin[1] + bottom);
                    PixelCopy.request(activity.getWindow(), source, bitmap, (result) -> {
                        if (result == PixelCopy.SUCCESS) {
                            saveImageInBackground(call, bitmap, fileName);
                        } else {
                            bitmap.recycle();
                            call.resolve(failure("Screen copy failed (" + result + ")"));
                        }
                    }, new Handler(Looper.getMainLooper()));
                } else {
                    Canvas canvas = new Canvas(bitmap);
                    canvas.translate(-left, -top);
                    webView.draw(canvas);
                    saveImageInBackground(call, bitmap, fileName);
                }
            } catch (Exception error) {
                call.resolve(failure(error));
            }
        });
    }

    private void saveImageInBackground(PluginCall call, Bitmap bitmap, String fileName) {
        new Thread(() -> {
            try {
                ByteArrayOutputStream png = new ByteArrayOutputStream();
                if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, png)) {
                    throw new IOException("PNG encoding failed");
                }
                call.resolve(success(save(png.toByteArray(), fileName, "image/png", Environment.DIRECTORY_PICTURES, true)));
            } catch (Exception error) {
                call.resolve(failure(error));
            } finally {
                bitmap.recycle();
            }
        }).start();
    }

    /** Writes the file and returns the path to show the user. */
    private String save(byte[] bytes, String fileName, String mimeType, String directory, boolean image) throws IOException {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContext().getContentResolver();
            Uri collection = image
                ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                : MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            String relativePath = directory + "/" + FOLDER;
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri item = resolver.insert(collection, values);
            if (item == null) {
                throw new IOException("Could not create " + fileName);
            }
            try (OutputStream out = resolver.openOutputStream(item)) {
                if (out == null) {
                    throw new IOException("Could not open " + fileName);
                }
                out.write(bytes);
            } catch (IOException | RuntimeException error) {
                resolver.delete(item, null, null);
                throw error;
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(item, done, null, null);
            // MediaStore renames the file when the name is taken, e.g. "name (1).json".
            return relativePath + "/" + displayName(resolver, item, fileName);
        }

        File folder = getContext().getExternalFilesDir(directory);
        if (folder == null) {
            folder = new File(getContext().getFilesDir(), directory);
        }
        if (!folder.isDirectory() && !folder.mkdirs()) {
            throw new IOException("Could not create " + folder);
        }
        File file = uniqueFile(folder, fileName);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return file.getAbsolutePath();
    }

    private static String displayName(ContentResolver resolver, Uri item, String fallback) {
        try (Cursor cursor = resolver.query(item, new String[] { MediaStore.MediaColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.isEmpty()) {
                    return name;
                }
            }
        } catch (Exception ignored) {
            // The file is saved; only its final name could not be read back.
        }
        return fallback;
    }

    private static File uniqueFile(File folder, String fileName) {
        File file = new File(folder, fileName);
        int dot = fileName.lastIndexOf('.');
        String base = dot > 0 ? fileName.substring(0, dot) : fileName;
        String extension = dot > 0 ? fileName.substring(dot) : "";
        for (int index = 1; file.exists() && index < 1000; index++) {
            file = new File(folder, base + " (" + index + ")" + extension);
        }
        return file;
    }

    private static String cleanName(String requested, String fallback, String extension) {
        String name = requested == null ? "" : requested.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "-").trim();
        while (name.startsWith(".")) {
            name = name.substring(1);
        }
        if (name.isEmpty()) {
            name = fallback;
        }
        if (!name.toLowerCase(Locale.ROOT).endsWith(extension)) {
            name = name + extension;
        }
        if (name.length() > 120) {
            name = name.substring(0, 120 - extension.length()) + extension;
        }
        return name;
    }

    private static double number(PluginCall call, String key, double fallback) {
        Object value = call.getData().opt(key);
        if (value instanceof Number) {
            double number = ((Number) value).doubleValue();
            if (!Double.isNaN(number) && !Double.isInfinite(number)) {
                return number;
            }
        }
        return fallback;
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static JSObject success(String filePath) {
        JSObject result = new JSObject();
        result.put("saved", true);
        result.put("canceled", false);
        result.put("filePath", filePath);
        return result;
    }

    private static JSObject failure(Object error) {
        JSObject result = new JSObject();
        result.put("saved", false);
        result.put("canceled", false);
        String message = error instanceof Throwable ? ((Throwable) error).getMessage() : String.valueOf(error);
        result.put("error", message == null ? error.getClass().getSimpleName() : message);
        return result;
    }
}
