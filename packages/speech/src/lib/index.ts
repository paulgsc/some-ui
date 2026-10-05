// Adapter types, for a host that supplies its own backend through
// `SpeechConfig.adapters` - but no adapter factories. An applet that could
// build an adapter could speak outside the page's session, with its own
// voice and deaf to mute, which is what Honeycomb did. The real backends are
// their own entries (`@some-ui/speech/http`, `/web-speech`, `/native`), and
// export inert tokens only the session can use (`adapters/backend`). Nothing
// here imports one at runtime: that is what keeps each out of the builds
// that never run it (`../entries.test.ts`).
export type {
  NativeSpeechBackend,
  NativeSpeechEngine,
  NativeSpeechRequest,
  NativeVoice,
  DeviceVoiceChoice,
  SpeakOptions,
  SpeechAdapter,
  SpeechAdapterFactory,
  SpeechAdapterId,
  SpeechAdapterRegistry,
  SpeechBackend,
  SpeechConfig,
  VoiceAvailability,
  VoiceReport,
} from "./adapters"
export * from "./hooks"
export * from "./language"
export * from "./promise"
export * from "./promise/abort"
export * from "./queue"
export * from "./speaker"
export * from "./status"
export * from "./types"
export * from "./voices"
