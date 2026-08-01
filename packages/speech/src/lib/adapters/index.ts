export type { SpeakOptions, SpeechAdapter, SpeechAdapterId } from "./types"
export type {
  ResolvedSpeechConfig,
  SpeechAdapterFactory,
  SpeechAdapterRegistry,
  SpeechConfig,
} from "./registry"
export {
  createSpeechAdapter,
  DEFAULT_SPEECH_ADAPTERS,
  resolveSpeechConfig,
} from "./registry"
export type { HttpSpeechAdapterOptions } from "./http"
export { createHttpSpeechAdapter } from "./http"
export type { WebSpeechAdapterOptions } from "./web-speech"
export { createWebSpeechAdapter } from "./web-speech"
