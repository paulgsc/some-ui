package dev.paulgsc.someui;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;

/**
 * Hears a video idea as it is spoken (www's lib/device-listen, Studio ST18):
 * Android's own speech recognizer, asked to listen on the phone and never
 * over the network, with the words so far sent as they settle.
 *
 * No sound is kept: the recognizer is handed the microphone and returns
 * only text, and nothing here writes a file. Recognition runs offline
 * (EXTRA_PREFER_OFFLINE, and the on-device recognizer where Android has one),
 * so a phone without its offline language pack answers UNAVAILABLE and the
 * question takes typed words instead.
 *
 * One listening at a time. start resolves with the words heard, empty when
 * nothing was; "words" events carry the partial words; stop ends the
 * listening and lets start resolve with what was heard; cancel lets it go,
 * rejecting start with CANCELLED. SpeechRecognizer must be used on the main
 * thread, so every call to it is posted there.
 */
@CapacitorPlugin(
    name = "Listen",
    permissions = @Permission(alias = ListenPlugin.MICROPHONE, strings = { Manifest.permission.RECORD_AUDIO })
)
public class ListenPlugin extends Plugin {

    static final String MICROPHONE = "microphone";

    /** The owner says ideas in English. */
    private static final String LANGUAGE = "en-US";

    /**
     * How long a pause may run before the recognizer decides the person has
     * finished: an idea comes with pauses. A hint some recognizers ignore.
     */
    private static final int PAUSE_MS = 4_000;

    private SpeechRecognizer recognizer;
    private PluginCall listening;

    @PluginMethod
    public void available(PluginCall call) {
        Context context = getContext();
        boolean available = SpeechRecognizer.isRecognitionAvailable(context) || onDevice(context);
        JSObject result = new JSObject();
        result.put("available", available);
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState(MICROPHONE) != PermissionState.GRANTED) {
            requestPermissionForAlias(MICROPHONE, call, "microphoneAnswered");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void microphoneAnswered(PluginCall call) {
        if (getPermissionState(MICROPHONE) == PermissionState.GRANTED) {
            begin(call);
        } else {
            call.reject("The microphone was refused", "DENIED");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (recognizer != null) recognizer.stopListening();
            call.resolve();
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            end("CANCELLED");
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        end("CANCELLED");
    }

    private static boolean onDevice(Context context) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(context);
    }

    private void begin(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            end("CANCELLED");
            Context context = getContext();
            SpeechRecognizer created;
            if (onDevice(context)) {
                created = SpeechRecognizer.createOnDeviceSpeechRecognizer(context);
            } else if (SpeechRecognizer.isRecognitionAvailable(context)) {
                created = SpeechRecognizer.createSpeechRecognizer(context);
            } else {
                call.reject("No speech recognizer on this phone", "UNAVAILABLE");
                return;
            }
            recognizer = created;
            listening = call;
            created.setRecognitionListener(new Heard(created));
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, LANGUAGE);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, PAUSE_MS);
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, PAUSE_MS);
            created.startListening(intent);
        });
    }

    /** Lets the listening under way go, rejecting its start with `code`. Main thread. */
    private void end(String code) {
        if (recognizer != null) recognizer.cancel();
        if (listening != null) listening.reject("The listening was let go", code);
        release();
    }

    /** Forgets the listening and destroys its recognizer. Main thread. */
    private void release() {
        if (recognizer != null) recognizer.destroy();
        recognizer = null;
        listening = null;
    }

    private static String wordsIn(Bundle results) {
        if (results == null) return "";
        ArrayList<String> found = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return found == null || found.isEmpty() || found.get(0) == null ? "" : found.get(0);
    }

    /**
     * What a recognizer's error means for the idea screen: nothing heard is
     * an answer (empty words), a phone that can't listen offline or won't
     * hand over the microphone is UNAVAILABLE, the rest FAILED.
     */
    private static String codeOf(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "DENIED";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
            case SpeechRecognizer.ERROR_SERVER:
            case SpeechRecognizer.ERROR_SERVER_DISCONNECTED:
            case SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED:
            case SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE:
                return "UNAVAILABLE";
            default:
                return "FAILED";
        }
    }

    /** Reports to the listening that `owner` was made for, and to no later one. */
    private final class Heard implements RecognitionListener {

        private final SpeechRecognizer owner;

        Heard(SpeechRecognizer owner) {
            this.owner = owner;
        }

        private boolean current() {
            return recognizer == owner && listening != null;
        }

        private void settle(String words) {
            JSObject result = new JSObject();
            result.put("words", words);
            listening.resolve(result);
            release();
        }

        @Override
        public void onPartialResults(Bundle partial) {
            if (!current()) return;
            String words = wordsIn(partial);
            if (words.isEmpty()) return;
            JSObject event = new JSObject();
            event.put("words", words);
            notifyListeners("words", event);
        }

        @Override
        public void onResults(Bundle results) {
            if (current()) settle(wordsIn(results));
        }

        @Override
        public void onError(int error) {
            if (!current()) return;
            if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                settle("");
                return;
            }
            listening.reject("The recognizer stopped: " + error, codeOf(error));
            release();
        }

        @Override
        public void onReadyForSpeech(Bundle params) {}

        @Override
        public void onBeginningOfSpeech() {}

        @Override
        public void onRmsChanged(float rmsdB) {}

        @Override
        public void onBufferReceived(byte[] buffer) {}

        @Override
        public void onEndOfSpeech() {}

        @Override
        public void onEvent(int eventType, Bundle params) {}
    }
}
