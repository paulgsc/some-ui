// Adapter types, for a host that supplies its own backend through
// `SpeechConfig.adapters` - but no adapter factories. An applet that could
// build an adapter could speak outside the page's session, with its own
// voice and deaf to mute, which is what Honeycomb did. Inside this package,
// import them from `@speech/lib/adapters`.
export type {
  SpeakOptions,
  SpeechAdapter,
  SpeechAdapterFactory,
  SpeechAdapterId,
  SpeechAdapterRegistry,
  SpeechConfig,
} from "./adapters"
export * from "./engine"
export * from "./hooks"
export * from "./promise"
export * from "./promise/abort"
export * from "./queue"
export * from "./speaker"
export * from "./status"
export * from "./types"
export * from "./voices"
