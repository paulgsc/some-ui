package dev.paulgsc.someui;

import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.SystemClock;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Timer;
import java.util.TimerTask;

/**
 * Home asked over each network the phone has, Wi-Fi first (#3411, NA2):
 * the way past a phone that sends this app's requests over a network home
 * isn't on. The S21 Ultra's log showed home's address tried "from /100.x",
 * a carrier's address, while the phone sat on home's Wi-Fi; Android had put
 * this app's traffic on mobile data. A request through Capacitor's HTTP
 * plugin goes over whatever network Android gives the app; one opened on a
 * Network here goes over that network.
 *
 * Plain Java over ConnectivityManager, with no plugin of its own, so
 * HomeRoutePlugin and the reproduction's instrumentation test
 * (HomeRouteTest, android-compat.yml's route scenario) run the same code:
 * `route`.
 */
final class HomeRoutes {

    private HomeRoutes() {}

    /** A network's kind, as the native log and the answer name it. */
    static String kindOf(ConnectivityManager connectivity, Network network) {
        NetworkCapabilities caps = connectivity.getNetworkCapabilities(network);
        if (caps == null) return "gone";
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return "wifi";
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) return "ethernet";
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "cellular";
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return "vpn";
        return "other";
    }

    /** "wifi validated metered", "cellular": a network as the native log says it. */
    static String describe(ConnectivityManager connectivity, Network network) {
        NetworkCapabilities caps = connectivity.getNetworkCapabilities(network);
        boolean validated = caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        boolean metered = caps != null && !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED);
        return kindOf(connectivity, network) + (validated ? " validated" : "") + (metered ? " metered" : "");
    }

    /**
     * What decides where this app's traffic goes, in one native log line
     * (#3411): the network Android gives the app, every network the phone
     * has, Data Saver as it stands for this app (getRestrictBackgroundStatus:
     * off, allowed for this app, or on for it), and whether Android last said
     * it keeps the app off the network (`held`, null when it hasn't said). A
     * per-app setting Android doesn't report (One UI's per-app network
     * choices) shows only as each network's own failure, which the request
     * logs beside this.
     */
    static String diagnosis(ConnectivityManager connectivity, Boolean held) {
        Network active = connectivity.getActiveNetwork();
        List<String> all = new ArrayList<>();
        for (Network network : connectivity.getAllNetworks()) all.add(describe(connectivity, network));
        String saver;
        switch (connectivity.getRestrictBackgroundStatus()) {
            case ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED:
                saver = "on for this app";
                break;
            case ConnectivityManager.RESTRICT_BACKGROUND_STATUS_WHITELISTED:
                saver = "on, this app allowed";
                break;
            default:
                saver = "off";
        }
        return "app on " + (active == null ? "no network" : describe(connectivity, active))
            + "; networks " + all
            + "; data saver " + saver
            + "; held " + (held == null ? "not said" : held);
    }

    /**
     * The networks to ask home over: Wi-Fi and Ethernet only, as home is on
     * the local network, which a carrier's network can't reach (asking over
     * it could only wait out its timeout). `skip`, the network already
     * tried, is left out.
     */
    static List<Network> candidates(ConnectivityManager connectivity, Network skip) {
        List<Network> local = new ArrayList<>();
        for (Network network : connectivity.getAllNetworks()) {
            if (network.equals(skip)) continue;
            String kind = kindOf(connectivity, network);
            if ("wifi".equals(kind) || "ethernet".equals(kind)) local.add(network);
        }
        return local;
    }

    /** How one route ended: home's answer and the network it came over, or what each network found. */
    static final class Routed {
        Answer answer;
        Network over;
        final List<String> tried = new ArrayList<>();
    }

    /**
     * `request` over each candidate network, Wi-Fi and Ethernet, but the one
     * Android gives the app (already tried), until one answers; none is
     * started that could not end, connect and read, by `endsAt`
     * (SystemClock.uptimeMillis), so nothing is sent after the caller has
     * stopped waiting for it.
     */
    static Routed route(ConnectivityManager connectivity, Request request, long endsAt) {
        Routed routed = new Routed();
        for (Network network : candidates(connectivity, connectivity.getActiveNetwork())) {
            String kind = describe(connectivity, network);
            if (SystemClock.uptimeMillis() + 2L * request.timeoutMs > endsAt) {
                routed.tried.add(kind + ": not asked, no time left");
                break;
            }
            try {
                routed.answer = send(network, request, endsAt);
                routed.over = network;
                return routed;
            } catch (NotConnected failed) {
                // Nothing reached home over this one: the next may be asked.
                routed.tried.add(kind + ": " + failed.getCause().getClass().getSimpleName() + " " + failed.getCause().getMessage());
            } catch (Exception failed) {
                // The connection opened, so home may have the request: asking
                // again could send it twice (a pairing's single-use code).
                routed.tried.add(kind + ": " + failed.getClass().getSimpleName() + " " + failed.getMessage() + " (after connecting; not asked again)");
                break;
            }
        }
        return routed;
    }

    /** One request, as homeRequest sends it. */
    static final class Request {
        String method = "GET";
        String url;
        Map<String, String> headers = new LinkedHashMap<>();
        /** The body's bytes, or null for none. */
        byte[] body;
        /** Read the answer as base64 bytes (a range, or a whole file), else as text. */
        boolean bytes;
        int timeoutMs = 10_000;
    }

    /** What home answered. */
    static final class Answer {
        int status;
        Map<String, String> headers = new LinkedHashMap<>();
        /** The body as text, or as base64 when the request asked for bytes. */
        String data;
    }

    /** A connection that never opened: nothing of the request reached home. */
    static final class NotConnected extends IOException {
        NotConnected(IOException cause) {
            super(cause);
        }
    }

    /**
     * `request` over `network`, following no redirect, and cut off at
     * `endsAt` (SystemClock.uptimeMillis) however the answer trickles in.
     * Throws NotConnected when the connection never opened, else what the
     * connection throws.
     */
    static Answer send(Network network, Request request, long endsAt) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) network.openConnection(new URL(request.url));
        // A read timeout bounds each stall, not the whole answer: this ends it.
        Timer watchdog = new Timer("home-route-deadline", true);
        watchdog.schedule(new TimerTask() {
            @Override
            public void run() {
                connection.disconnect();
            }
        }, Math.max(0, endsAt - SystemClock.uptimeMillis()));
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(request.timeoutMs);
            connection.setReadTimeout(request.timeoutMs);
            connection.setRequestMethod(request.method);
            for (Map.Entry<String, String> header : request.headers.entrySet()) {
                connection.setRequestProperty(header.getKey(), header.getValue());
            }
            try {
                connection.connect();
            } catch (IOException never) {
                throw new NotConnected(never);
            }
            if (request.body != null) {
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(request.body.length);
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(request.body);
                }
            }
            Answer answer = new Answer();
            answer.status = connection.getResponseCode();
            for (Map.Entry<String, List<String>> header : connection.getHeaderFields().entrySet()) {
                if (header.getKey() != null && !header.getValue().isEmpty()) {
                    answer.headers.put(header.getKey(), header.getValue().get(0));
                }
            }
            InputStream in = answer.status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            byte[] read = in == null ? new byte[0] : readAll(in);
            answer.data = request.bytes
                ? Base64.encodeToString(read, Base64.NO_WRAP)
                : new String(read, StandardCharsets.UTF_8);
            return answer;
        } finally {
            watchdog.cancel();
            connection.disconnect();
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        try (InputStream stream = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[16 * 1024];
            for (int n; (n = stream.read(buffer)) != -1; ) out.write(buffer, 0, n);
            return out.toByteArray();
        }
    }
}
