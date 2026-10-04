package dev.paulgsc.someui;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.speech.tts.TextToSpeech;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens the screen that downloads text-to-speech voice data, for Settings'
 * and the missing-voice toast's Install button.
 *
 * The text-to-speech plugin's own openInstall launches ACTION_CHECK_TTS_DATA
 * and discards its result: a verification step, which can return without
 * offering any download. ACTION_INSTALL_TTS_DATA is the engine's installer;
 * a phone whose engine has none gets the system's text-to-speech settings.
 *
 * Each intent is started and its absence caught, rather than resolved
 * first: resolving an implicit intent needs a queries entry on Android 11+
 * (package visibility), starting one does not.
 */
@CapacitorPlugin(name = "VoiceData")
public class VoiceDataPlugin extends Plugin {

    @PluginMethod
    public void openInstall(PluginCall call) {
        if (start(new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA)) || start(new Intent(TTS_SETTINGS))) {
            call.resolve();
        } else {
            call.reject("No voice installer on this phone");
        }
    }

    /** The system's text-to-speech settings; not a public Settings constant. */
    private static final String TTS_SETTINGS = "com.android.settings.TTS_SETTINGS";

    private boolean start(Intent intent) {
        try {
            getActivity().startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }
}
