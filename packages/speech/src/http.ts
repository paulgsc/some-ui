/**
 * `@some-ui/speech/http`: the hosted voice service, and the fetch-and-play
 * engine only it uses. An app that speaks through a TTS service passes
 * `httpSpeech` in `SpeechConfig.adapters`; a build that imports nothing from
 * here carries none of it.
 */
export { httpSpeech } from "@speech/lib/adapters/http"
export * from "@speech/lib/engine"
