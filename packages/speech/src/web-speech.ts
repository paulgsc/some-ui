/**
 * `@some-ui/speech/web-speech`: the browser's own `speechSynthesis`. An app
 * passes `webSpeech` in `SpeechConfig.adapters` where the browser is the
 * device voice; a build that imports nothing from here carries none of it.
 */
export { webSpeech } from "@speech/lib/adapters/web-speech"
