package dev.paulgsc.someui;

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
        // opened it. Without this, Android's default closes the app from any
        // page: Capacitor only handles back through @capacitor/app, which
        // this app does not carry. The dispatcher, not onBackPressed, because
        // a targetSdk 36 app gets predictive back, which skips that method.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge().getWebView();
                if (webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                // Nothing behind this page (Home, as the app opens): Android's
                // own back, which leaves the app.
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }
}
