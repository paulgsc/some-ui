package dev.paulgsc.someui;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // The app's own plugins register before the bridge starts; the
        // npm-installed ones are found from capacitor.plugins.json.
        registerPlugin(VoiceDataPlugin.class);
        super.onCreate(savedInstanceState);

        // Back (the button or the edge swipe) walks the app's own history,
        // so leaving the composer half-configured returns to the page that
        // opened it, and leaves the app from Home. Without this, Android's
        // default closes the app from any page: Capacitor only handles back
        // through @capacitor/app, which this app does not carry. The
        // dispatcher, not onBackPressed, which predictive back (a targetSdk 36
        // app on Android 16+) never calls.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                // No bridge when the phone has no usable WebView (Capacitor
                // shows its no_webview screen instead).
                WebView webView = getBridge() == null ? null : getBridge().getWebView();
                if (webView != null && webView.canGoBack() && !isHome(webView.getUrl())) {
                    webView.goBack();
                    return;
                }
                // Home, or nothing behind this page: Android's own back, which
                // leaves the app. Home is a root, not a step in the history, or
                // back from it would reopen what its Home link just left.
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }

    /** www's `MOBILE_HOME` (apps/www/src/lib/app-surface), where the app opens. */
    private static final String HOME_PATH = "/today";

    private static boolean isHome(String url) {
        if (url == null) return false;
        String path = Uri.parse(url).getPath();
        return HOME_PATH.equals(path) || (HOME_PATH + "/").equals(path);
    }
}
