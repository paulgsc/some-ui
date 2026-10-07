package dev.paulgsc.someui;

import android.util.Log;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The app's own diagnostic lines in logcat, under the tag "SomeUI", in every
 * build. Capacitor forwards the WebView's console to logcat only in debug
 * builds (`loggingBehavior` defaults to "debug"), and turning that on for
 * release would also log every plugin call with its arguments: SQL and what
 * the person wrote. This logs only what www sends it (apps/www
 * src/lib/native-log): a reported failure with its cause, and the device
 * storage opening, which the launch test reads (launch/launch-test.sh).
 *
 *   adb logcat -s SomeUI
 */
@CapacitorPlugin(name = "NativeLog")
public class NativeLogPlugin extends Plugin {

    private static final String TAG = "SomeUI";

    @PluginMethod
    public void write(PluginCall call) {
        String line = call.getString("line", "");
        if ("error".equals(call.getString("level"))) {
            Log.e(TAG, line);
        } else {
            Log.i(TAG, line);
        }
        call.resolve();
    }
}
