package dev.paulgsc.someui;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class SQLiteLifecycleTest {
    private static final String DATABASE = "lifecycle-test";

    @Test
    public void recreationRollsBackAbandonedTransaction() throws Exception {
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            nativeOnly(activity);
            call(activity, "createConnection", data(), CapacitorSQLitePlugin::createConnection);
            call(activity, "open", data(), CapacitorSQLitePlugin::open);
            call(activity, "execute", data().put("statements",
                "DROP TABLE IF EXISTS records; CREATE TABLE records (value TEXT); INSERT INTO records VALUES ('kept');"
            ).put("transaction", false), CapacitorSQLitePlugin::execute);
            call(activity, "beginTransaction", data(), CapacitorSQLitePlugin::beginTransaction);
            call(activity, "run", data().put("statement", "INSERT INTO records VALUES ('unfinished')")
                .put("transaction", false), CapacitorSQLitePlugin::run);

            activity.recreate();
            nativeOnly(activity);
            call(activity, "createConnection", data(), CapacitorSQLitePlugin::createConnection);
            call(activity, "open", data(), CapacitorSQLitePlugin::open);
            JSObject result = call(activity, "query", data().put("statement", "SELECT value FROM records"),
                CapacitorSQLitePlugin::query);
            assertEquals(1, result.getJSONArray("values").length());
            assertEquals("kept", result.getJSONArray("values").getJSONObject(0).getString("value"));
            call(activity, "deleteDatabase", data(), CapacitorSQLitePlugin::deleteDatabase);
        }
    }

    // The web app's startup consistency check closes connections absent from
    // its JS registry. Keep it out of this native lifecycle regression.
    private static void nativeOnly(ActivityScenario<MainActivity> activity) throws InterruptedException {
        CountDownLatch blank = new CountDownLatch(1);
        activity.onActivity(current -> {
            WebView webView = current.getBridge().getWebView();
            webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    if ("about:blank".equals(url)) blank.countDown();
                }
            });
            webView.loadUrl("about:blank");
        });
        assertTrue("WebView did not stop the web app", blank.await(30, TimeUnit.SECONDS));
    }

    private static JSObject data() {
        return new JSObject().put("database", DATABASE).put("readonly", false)
            .put("encrypted", false).put("mode", "no-encryption").put("version", 1);
    }

    private interface Operation {
        void run(CapacitorSQLitePlugin plugin, PluginCall call);
    }

    private static JSObject call(ActivityScenario<MainActivity> activity, String method, JSObject data,
        Operation operation) throws InterruptedException {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<JSObject> result = new AtomicReference<>();
        AtomicReference<String> failure = new AtomicReference<>();
        PluginCall call = new PluginCall(null, "CapacitorSQLite", "test", method, data) {
            @Override
            public void resolve(JSObject value) {
                result.set(value);
                done.countDown();
            }

            @Override
            public void resolve() {
                done.countDown();
            }

            @Override
            public void reject(String message, String code, Exception error, JSObject details) {
                failure.set(message);
                done.countDown();
            }
        };
        activity.onActivity(current -> {
            var bridge = current.getBridge();
            var plugin = (CapacitorSQLitePlugin) bridge.getPlugin("CapacitorSQLite").getInstance();
            bridge.execute(() -> operation.run(plugin, call));
        });
        assertTrue(method + " did not finish", done.await(30, TimeUnit.SECONDS));
        assertNull(method + " failed", failure.get());
        return result.get();
    }
}
