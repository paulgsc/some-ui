/**
 * `@some-ui/speech/http`: the hosted voice service, and the fetch-and-play
 * engine only it uses. An app that speaks through a TTS service passes
 * `httpSpeech` in `SpeechConfig.adapters`; a build that imports nothing from
 * here carries none of it.
 */
export { httpSpeech } from "@speech/lib/adapters/http"
export * from "@speech/lib/engine"
export type { UseAudioPlayerReturn } from "@speech/lib/hooks/use-audio-player"
export { useAudioPlayer } from "@speech/lib/hooks/use-audio-player"
export { useAudioFromStorage } from "@speech/lib/hooks/use-audio-storage"
