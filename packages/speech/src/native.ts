/**
 * `@some-ui/speech/native`: the phone's own text-to-speech, over the engine
 * the app passes as `SpeechConfig.native`. The Android app passes
 * `nativeSpeech` in `SpeechConfig.adapters`; a build that imports nothing
 * from here carries none of it. The engine's types are the main entry's, so
 * the app can implement one without importing this.
 */
export {
  nativeSpeech,
  VOICE_MISSING_ERROR_NAME,
} from "@speech/lib/adapters/native"
