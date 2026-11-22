package dev.paulgsc.someui;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import android.annotation.TargetApi;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.DnsResolver;
import android.net.Network;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.util.Log;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.net.UnknownHostException;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * #3411: a name this phone failed to look up once, asked again once the
 * network answers it. The request goes the way Capacitor's HTTP plugin sends
 * home's (HttpURLConnection, in the app's own process), against the staged
 * resolver of apps/mobile/compat/staged-dns.py, which fails the name's first
 * lookup and answers every later one.
 *
 * Passes when the second request, made past libcore's own short cache of a
 * failed name, reaches the address the resolver now gives. Fails as the
 * S21 Ultra did: the phone still says the name has no address.
 *
 * The second test is the candidate fix's half: the same, for a second staged
 * name, but the second lookup asks Android's DnsResolver past its cache
 * (FLAG_NO_CACHE_LOOKUP, API 29+). It passes where the resolver's memory of
 * the failure is what held the first test back.
 *
 * Instrumentation arguments: host, fresh (the second name), port. Run only by the reproduction
 * workflow (`-e class dev.paulgsc.someui.NameLookupTest`), where the
 * emulator's resolver is the staged one; anywhere else the first lookup
 * does not fail and the test says the stage is not set.
 */
@RunWith(AndroidJUnit4.class)
public class NameLookupTest {
    private static final String TAG = "SomeUI";
    /** Longer than libcore's AddressCache keeps a failed name in the process. */
    private static final long PAST_PROCESS_CACHE_MS = 15_000;

    @Test
    public void aNameThatFailedOnceIsFoundOnceItAnswers() throws Exception {
        Bundle args = InstrumentationRegistry.getArguments();
        URL url = new URL("http://" + args.getString("host") + ":" + args.getString("port") + "/");
        try {
            status(url);
            fail("the stage is not set: the first lookup did not fail");
        } catch (UnknownHostException expected) {
            Log.i(TAG, "name lookup: first failed as staged: " + expected.getMessage());
        }
        Thread.sleep(PAST_PROCESS_CACHE_MS);
        try {
            int status = status(url);
            Log.i(TAG, "name lookup: second reached home: " + status);
            assertEquals(200, status);
        } catch (UnknownHostException stuck) {
            Log.i(TAG, "name lookup: second still failed: " + stuck.getMessage());
            fail("the name still has no address after the resolver answered it: " + stuck.getMessage());
        }
    }

    private static int status(URL url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(10_000);
        connection.setReadTimeout(10_000);
        try {
            return connection.getResponseCode();
        } finally {
            connection.disconnect();
        }
    }

    @Test
    @SdkSuppress(minSdkVersion = 29)
    @TargetApi(29)
    public void aLookupPastTheCacheFindsTheNameOnceItAnswers() throws Exception {
        Bundle args = InstrumentationRegistry.getArguments();
        String host = args.getString("fresh");
        URL url = new URL("http://" + host + ":" + args.getString("port") + "/");
        try {
            status(url);
            fail("the stage is not set: the first lookup did not fail");
        } catch (UnknownHostException expected) {
            Log.i(TAG, "name lookup past the cache: first failed as staged");
        }
        Thread.sleep(PAST_PROCESS_CACHE_MS);
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Network network = context.getSystemService(ConnectivityManager.class).getActiveNetwork();
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<List<InetAddress>> found = new AtomicReference<>();
        AtomicReference<Throwable> failed = new AtomicReference<>();
        DnsResolver.getInstance().query(network, host, DnsResolver.FLAG_NO_CACHE_LOOKUP,
            Runnable::run, new CancellationSignal(), new DnsResolver.Callback<List<InetAddress>>() {
                @Override
                public void onAnswer(List<InetAddress> answer, int rcode) {
                    found.set(answer);
                    done.countDown();
                }

                @Override
                public void onError(DnsResolver.DnsException error) {
                    failed.set(error);
                    done.countDown();
                }
            });
        if (!done.await(15, TimeUnit.SECONDS)) fail("the lookup past the cache never answered");
        if (failed.get() != null) fail("the lookup past the cache failed: " + failed.get());
        Log.i(TAG, "name lookup past the cache: found " + found.get());
        if (found.get() == null || found.get().isEmpty()) {
            fail("the lookup past the cache found no address either");
        }
    }
}
