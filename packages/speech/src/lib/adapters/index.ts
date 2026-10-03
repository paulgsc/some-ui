export type {
  SpeakOptions,
  SpeechAdapter,
  SpeechAdapterId,
  VoiceReport,
} from "./types"
export type {
  NativeSpeechBackend,
  SpeechAdapterFactory,
  SpeechAdapterRegistry,
  SpeechConfig,
} from "./registry"
export { createSpeechAdapter, resolveSpeechConfig } from "./registry"
export type {
  NativeSpeechEngine,
  NativeSpeechRequest,
  NativeVoice,
} from "./native"
export { VOICE_MISSING_ERROR_NAME } from "./native"
