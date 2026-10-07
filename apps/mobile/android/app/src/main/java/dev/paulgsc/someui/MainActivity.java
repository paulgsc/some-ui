package dev.paulgsc.someui;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // The app's own plugins register before the bridge starts; the
        // npm-installed ones are found from capacitor.plugins.json.
        registerPlugin(VoiceDataPlugin.class);
        registerPlugin(NativeLogPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
