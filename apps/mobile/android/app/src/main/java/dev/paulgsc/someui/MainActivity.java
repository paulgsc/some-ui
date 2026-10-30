package dev.paulgsc.someui;

import android.app.ActivityManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    /**
     * www's FOYER (apps/www/src/lib/wings): where the plain launcher
     * icon opens the app, and the entry root until a wing's icon is used.
     */
    private static final String FOYER_PATH = "/foyer";

    /**
     * The notification's own extra (@capacitor/local-notifications,
     * LocalNotificationManager.NOTIFICATION_INTENT_KEY). A nudge tap starts
     * .MainActivity with MAIN and LAUNCHER, just like the plain icon; this
     * extra is the only thing that tells them apart.
     */
    private static final String NOTIFICATION_EXTRA = "LocalNotificationId";

    /**
     * The root path of the wing each launcher alias opens (the
     * <activity-alias> entries in AndroidManifest.xml), by the alias's simple
     * class name. www's WINGS (apps/www/src/lib/wings) hold the same table,
     * and a www test reads these lines to check the two agree, so keep each
     * case on one line. The path comes only from here, never from the
     * intent's extras or data: every alias is exported, so any app can start
     * one with anything attached. Null for .MainActivity (the plain icon) and
     * anything else. Every alias is named Wing<Id>; <id>, lower-cased, is
     * what the native log names it.
     */
    static String wingRoot(String alias) {
        switch (alias) {
            case "WingPractice": return "/practice";
            case "WingSelf": return "/aph";
            case "WingStudio": return "/journal";
            case "WingJobs": return "/jobs";
            default: return null;
        }
    }

    /**
     * The page each launcher shortcut opens (res/xml/shortcuts.xml), by the
     * fixed action its intent names. www's SHORTCUT_ROOTS (apps/www/src/lib
     * /wings/entry.ts) hold the same table, and a www test reads these lines
     * to check the two agree, so keep each case on one line. Any app can
     * start .MainActivity with one of these actions, which opens no more
     * than the page a long-press does. Null for any other action.
     */
    static String shortcutRoot(String action) {
        if (action == null) return null;
        switch (action) {
            case "dev.paulgsc.someui.NEW_IDEA": return "/journal/idea";
            default: return null;
        }
    }

    /**
     * Where back leaves the app: the root of the wing the app was last
     * entered through, or the foyer if it was entered through the plain
     * icon. Set before onCreate runs, because Capacitor delivers the cold
     * start's intent from inside super.onCreate.
     */
    private String entryRoot = FOYER_PATH;

    /**
     * Whether the WebView has finished loading a page since the activity was
     * created. Until it has, an entry replaces the page being loaded; after,
     * it asks the page to navigate, so nothing in flight is torn down.
     */
    private boolean pageLoaded = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // The app's own plugins register before the bridge starts; the
        // npm-installed ones are found from capacitor.plugins.json.
        registerPlugin(VoiceDataPlugin.class);
        registerPlugin(NativeLogPlugin.class);
        registerPlugin(HomeCredentialPlugin.class);
        registerPlugin(ListenPlugin.class);
        // Before the bridge is built, so no page can finish loading unseen.
        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                pageLoaded = true;
            }
        });
        super.onCreate(savedInstanceState);

        // Back (the button or the edge swipe) walks the app's own history,
        // so leaving the composer half-configured returns to the page that
        // opened it, and leaves the app from where it was entered: the wing
        // root of the icon it was opened with, or the foyer from the plain
        // icon. Without this, Android's default closes the app from any page:
        // Capacitor only handles back through @capacitor/app, which this app
        // does not carry. The dispatcher, not onBackPressed, which predictive
        // back (a targetSdk 36 app on Android 16+) never calls.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                // No bridge when the phone has no usable WebView (Capacitor
                // shows its no_webview screen instead).
                WebView webView = getBridge() == null ? null : getBridge().getWebView();
                if (webView != null && webView.canGoBack() && !isEntryRoot(webView.getUrl())) {
                    webView.goBack();
                    return;
                }
                // The entry root, or nothing behind this page: Android's own
                // back, which leaves the app. The entry root is a root, not a
                // step in the history: back from a wing entered by its icon
                // never walks into the foyer or into a wing used before it,
                // whose pages may still sit behind it in the WebView's history.
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }

    /**
     * Every way into the app: Capacitor's BridgeActivity.load() calls this
     * with getIntent() on a cold start, right after building the bridge, and
     * Android calls it on a warm one (singleTask hands the running instance
     * the new intent).
     */
    @Override
    protected void onNewIntent(Intent intent) {
        // Plugins (local notifications) read the intent here.
        super.onNewIntent(intent);
        setIntent(intent);
        Bridge bridge = getBridge();
        if (bridge == null || intent == null) return;
        // A notification tap: www's own listener (lib/study-nudge) opens the
        // page it names, and the entry root stays where it was.
        if (intent.hasExtra(NOTIFICATION_EXTRA)) return;

        String alias = simpleName(intent.getComponent());
        String root = alias == null ? null : wingRoot(alias);
        String shortcut = shortcutRoot(intent.getAction());
        String id;
        if (root != null) {
            id = alias.substring("Wing".length()).toLowerCase(Locale.ROOT);
        } else if (shortcut != null) {
            // A shortcut opens its page whether or not the app is running:
            // it was asked for by name, as a wing's icon is.
            root = shortcut;
            id = "shortcut " + root;
        } else if (pageLoaded) {
            // The plain icon on a running app resumes where it was: the
            // Android convention, and it never yanks a session or a
            // recording out from under the person. Wing icons switch wings.
            return;
        } else {
            root = FOYER_PATH;
            id = "foyer";
        }

        entryRoot = root;
        followInRecents(intent.getComponent());
        // The app's native log (NativeLogPlugin's tag), which the launch test
        // reads (launch/launch-test.sh), in release builds too.
        Log.i(NativeLogPlugin.TAG, "wing entered: " + id);
        if (!pageLoaded) {
            // The bridge's own load of the app's start URL was issued a
            // moment ago on this same main-thread pass; this replaces it
            // before it commits. The local server answers any path with
            // index.html.
            bridge.getWebView().loadUrl(bridge.getLocalUrl() + root);
        } else {
            // A router navigation in www (lib/wings), not a reload:
            // `event.root` on window's "someui:wing". The root is one of
            // wingRoot's constants, so it needs no escaping.
            bridge.triggerWindowJSEvent("someui:wing", "{\"root\":\"" + root + "\"}");
        }
    }

    /**
     * The class name after its last dot, so "dev.paulgsc.someui.WingSelf"
     * and ".WingSelf" both give "WingSelf". Null with no component.
     */
    private static String simpleName(ComponentName component) {
        if (component == null) return null;
        String name = component.getClassName();
        return name.substring(name.lastIndexOf('.') + 1);
    }

    /**
     * All the app's icons share one task, so the Recents card keeps the label
     * and icon of whichever icon created it unless told otherwise. This gives
     * it the entering component's own label and icon from the manifest: the
     * wing's, or the app's for the plain icon (and so for the foyer).
     */
    private void followInRecents(ComponentName component) {
        if (component == null || !getPackageName().equals(component.getPackageName())) {
            component = new ComponentName(this, MainActivity.class);
        }
        ActivityInfo info;
        try {
            info = getPackageManager().getActivityInfo(component, 0);
        } catch (PackageManager.NameNotFoundException e) {
            return;
        }
        String label = info.loadLabel(getPackageManager()).toString();
        int icon = info.getIconResource();
        ActivityManager.TaskDescription description;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            description = new ActivityManager.TaskDescription.Builder().setLabel(label).setIcon(icon).build();
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            description = new ActivityManager.TaskDescription(label, icon);
        } else {
            description = new ActivityManager.TaskDescription(label);
        }
        setTaskDescription(description);
    }

    private boolean isEntryRoot(String url) {
        if (url == null) return false;
        String path = Uri.parse(url).getPath();
        return entryRoot.equals(path) || (entryRoot + "/").equals(path);
    }
}
