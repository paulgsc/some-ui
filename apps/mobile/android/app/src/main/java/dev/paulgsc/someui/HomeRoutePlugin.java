package dev.paulgsc.someui;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Build;
import android.util.Base64;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Home asked over the phone's other networks, Wi-Fi first, once a request
 * over the network Android gave this app found no way there (#3411, NA2;
 * the routes themselves are HomeRoutes'). www's native-http calls it only
 * after Capacitor's HTTP plugin failed with no answer or a name not found,
 * through callForeign.
 *
 * - request: the same request over each other network until one answers.
 *   Resolves home's answer and `over`, the network's kind; rejects
 *   "HELD" when Android says it keeps this app off the network
 *   (onBlockedStatusChanged), else "NO_ROUTE", each with what it tried.
 * - networks: what the native log says of the phone's networks on a
 *   failure: the one this app is on, every one, and whether it is kept off.
 *
 * Each request writes HomeRoutes.diagnosis under the "SomeUI" tag first
 * (the app's network, every network with its metered and validated state,
 * Data Saver for this app, and whether Android says it holds the app), then
 * one line saying which network answered, or what each one found, so the
 * next log of a phone that can't reach home says why.
 */
@CapacitorPlugin(name = "HomeRoute")
public class HomeRoutePlugin extends Plugin {

    /** One request at a time, off the plugin thread: a network's wait never holds up the database. */
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    /** Whether Android last said this app is kept off its network (API 29+); null until it says. */
    private volatile Boolean held = null;
    private ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback watch;

    @Override
    public void load() {
        connectivity = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        watch = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onBlockedStatusChanged(Network network, boolean blocked) {
                held = blocked;
            }

            @Override
            public void onLost(Network network) {
                held = null;
            }
        };
        connectivity.registerDefaultNetworkCallback(watch);
    }

    @Override
    protected void handleOnDestroy() {
        if (watch != null) connectivity.unregisterNetworkCallback(watch);
        worker.shutdownNow();
    }

    @PluginMethod
    public void request(PluginCall call) {
        HomeRoutes.Request request;
        try {
            request = requestOf(call);
        } catch (IllegalArgumentException bad) {
            call.reject(bad.getMessage(), "BAD_REQUEST");
            return;
        }
        worker.execute(() -> {
            // Said on every failure that reaches here, so a phone's log says
            // what kept it from home whichever way this ends.
            Log.i(NativeLogPlugin.TAG, "home route: " + HomeRoutes.diagnosis(connectivity, held));
            Network active = connectivity.getActiveNetwork();
            List<String> tried = new ArrayList<>();
            for (Network network : HomeRoutes.candidates(connectivity, active)) {
                String kind = HomeRoutes.describe(connectivity, network);
                try {
                    HomeRoutes.Answer answer = HomeRoutes.send(network, request);
                    Log.i(NativeLogPlugin.TAG, "home route: answered over " + kind + ", not "
                        + (active == null ? "no network" : HomeRoutes.describe(connectivity, active)));
                    JSObject headers = new JSObject();
                    for (java.util.Map.Entry<String, String> h : answer.headers.entrySet()) headers.put(h.getKey(), h.getValue());
                    JSObject result = new JSObject();
                    result.put("status", answer.status);
                    result.put("headers", headers);
                    result.put("data", answer.data);
                    result.put("over", HomeRoutes.kindOf(connectivity, network));
                    call.resolve(result);
                    return;
                } catch (Exception failed) {
                    tried.add(kind + ": " + failed.getClass().getSimpleName() + " " + failed.getMessage());
                }
            }
            boolean keptOff = Boolean.TRUE.equals(held);
            String said = (keptOff ? "kept off the network" : "no other network reached home")
                + "; on " + (active == null ? "no network" : HomeRoutes.describe(connectivity, active))
                + "; tried " + (tried.isEmpty() ? "nothing else" : String.join(" | ", tried));
            Log.i(NativeLogPlugin.TAG, "home route: " + said);
            JSObject data = new JSObject();
            data.put("tried", tried.size());
            call.reject(said, keptOff ? "HELD" : "NO_ROUTE", data);
        });
    }

    @PluginMethod
    public void networks(PluginCall call) {
        Network active = connectivity.getActiveNetwork();
        JSArray all = new JSArray();
        for (Network network : connectivity.getAllNetworks()) all.put(HomeRoutes.describe(connectivity, network));
        JSObject result = new JSObject();
        result.put("active", active == null ? null : HomeRoutes.describe(connectivity, active));
        result.put("all", all);
        result.put("held", held);
        result.put("said", HomeRoutes.diagnosis(connectivity, held));
        call.resolve(result);
    }

    private static HomeRoutes.Request requestOf(PluginCall call) {
        HomeRoutes.Request request = new HomeRoutes.Request();
        request.url = call.getString("url");
        if (request.url == null || !request.url.startsWith("https://") && !request.url.startsWith("http://")) {
            throw new IllegalArgumentException("not a home address");
        }
        request.method = call.getString("method", "GET");
        JSObject headers = call.getObject("headers", new JSObject());
        for (Iterator<String> keys = headers.keys(); keys.hasNext(); ) {
            String key = keys.next();
            request.headers.put(key, headers.getString(key));
        }
        String data = call.getString("data");
        if (data != null) {
            request.body = "file".equals(call.getString("dataType"))
                ? Base64.decode(data, Base64.DEFAULT)
                : data.getBytes(StandardCharsets.UTF_8);
        }
        request.bytes = "blob".equals(call.getString("responseType"));
        request.timeoutMs = call.getInt("timeout", 10_000);
        return request;
    }
}
