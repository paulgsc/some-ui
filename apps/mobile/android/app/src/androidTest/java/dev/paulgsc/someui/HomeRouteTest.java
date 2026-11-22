package dev.paulgsc.someui;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import android.content.Context;
import android.net.ConnectivityManager;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * #3411 (NA2): home asked from a phone whose networks are set up as the
 * route scenario left them (apps/mobile/compat/route.sh): as the S26 is,
 * Wi-Fi the default; or as the S21 Ultra was, this app's traffic on mobile
 * data while home answers only on Wi-Fi.
 *
 * - theDefaultWayReachesHome: a request as Capacitor's HTTP plugin sends
 *   it, over the network Android gives the app. The S21's symptom fails it.
 * - someWayReachesHome: the same, then, if that finds nothing,
 *   HomeRoutes.route, which HomeRoutePlugin runs: the fix's way.
 *
 * Instrumentation argument: url, home's stand-in address.
 */
@RunWith(AndroidJUnit4.class)
public class HomeRouteTest {
    private static final String TAG = "SomeUI";

    @Test
    public void theDefaultWayReachesHome() throws Exception {
        ConnectivityManager connectivity = connectivity();
        Log.i(TAG, "home route test: " + HomeRoutes.diagnosis(connectivity, null));
        assertEquals(200, viaDefault(url()));
    }

    @Test
    public void someWayReachesHome() throws Exception {
        ConnectivityManager connectivity = connectivity();
        Log.i(TAG, "home route test: " + HomeRoutes.diagnosis(connectivity, null));
        try {
            assertEquals(200, viaDefault(url()));
            Log.i(TAG, "home route test: the default way answered");
            return;
        } catch (Exception | AssertionError first) {
            Log.i(TAG, "home route test: the default way failed: " + first);
        }
        HomeRoutes.Request request = new HomeRoutes.Request();
        request.url = url();
        // The plugin's own route (HomeRoutePlugin calls the same), with its budget.
        HomeRoutes.Routed routed = HomeRoutes.route(connectivity, request, SystemClock.uptimeMillis() + 40_000);
        if (routed.answer != null) {
            Log.i(TAG, "home route test: answered " + routed.answer.status + " over "
                + HomeRoutes.describe(connectivity, routed.over));
            assertEquals(200, routed.answer.status);
            return;
        }
        List<String> tried = routed.tried;
        fail("no way reached home; tried " + tried);
    }

    private static String url() {
        Bundle args = InstrumentationRegistry.getArguments();
        return args.getString("url");
    }

    private static ConnectivityManager connectivity() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        return context.getSystemService(ConnectivityManager.class);
    }

    private static int viaDefault(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(10_000);
        connection.setReadTimeout(10_000);
        try {
            return connection.getResponseCode();
        } finally {
            connection.disconnect();
        }
    }
}
