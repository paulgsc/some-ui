package dev.paulgsc.someui;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Bundle;
import android.util.Log;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
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
 * - someWayReachesHome: the same, then, if that finds nothing, HomeRoutes
 *   over each other network, Wi-Fi first: the fix's way.
 *
 * Instrumentation argument: url, home's stand-in address.
 */
@RunWith(AndroidJUnit4.class)
public class HomeRouteTest {
    private static final String TAG = "SomeUI";

    @Test
    public void theDefaultWayReachesHome() throws Exception {
        ConnectivityManager connectivity = connectivity();
        Log.i(TAG, "home route test: networks " + networks(connectivity));
        assertEquals(200, viaDefault(url()));
    }

    @Test
    public void someWayReachesHome() throws Exception {
        ConnectivityManager connectivity = connectivity();
        Log.i(TAG, "home route test: networks " + networks(connectivity));
        try {
            assertEquals(200, viaDefault(url()));
            Log.i(TAG, "home route test: the default way answered");
            return;
        } catch (Exception | AssertionError first) {
            Log.i(TAG, "home route test: the default way failed: " + first);
        }
        HomeRoutes.Request request = new HomeRoutes.Request();
        request.url = url();
        List<String> tried = new ArrayList<>();
        for (Network network : HomeRoutes.candidates(connectivity, connectivity.getActiveNetwork())) {
            String kind = HomeRoutes.describe(connectivity, network);
            try {
                HomeRoutes.Answer answer = HomeRoutes.send(network, request);
                Log.i(TAG, "home route test: answered " + answer.status + " over " + kind);
                assertEquals(200, answer.status);
                return;
            } catch (Exception failed) {
                tried.add(kind + ": " + failed);
            }
        }
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

    private static String networks(ConnectivityManager connectivity) {
        Network active = connectivity.getActiveNetwork();
        List<String> all = new ArrayList<>();
        for (Network network : connectivity.getAllNetworks()) all.add(HomeRoutes.describe(connectivity, network));
        return "active " + (active == null ? "none" : HomeRoutes.describe(connectivity, active)) + ", all " + all;
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
