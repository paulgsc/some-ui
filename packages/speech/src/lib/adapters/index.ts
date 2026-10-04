export type { SpeechBackend } from "./backend"
export type {
  DeviceVoiceChoice,
  SpeakOptions,
  SpeechAdapter,
  SpeechAdapterId,
  VoiceAvailability,
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
