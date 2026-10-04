export type {
  SpeakOptions,
  SpeechAdapter,
  SpeechAdapterId,
  VoiceAvailability,
  VoiceReport,
} from "./types"
export type {
  SpeechAdapterFactory,
  SpeechAdapterRegistry,
  SpeechConfig,
} from "./registry"
export { createSpeechAdapter, resolveSpeechConfig } from "./registry"
