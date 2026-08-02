/**
 * Temporary re-export shim (UTL-HOIST S4, #533).
 *
 * The speech/TTS/audio concern - the queue, its singleton, the hooks and
 * the two backends behind them - now lives in `@some-ui/speech`, which owns
 * it end to end. This shim exists so that a consumer that has not yet been
 * repointed keeps compiling; it is removed in UTL-CUTOVER once none remain.
 *
 * Deliberately explicit rather than `export *`: `@some-ui/speech` exports
 * its own `createStore`/`Store`/`Reducer` (the trimmed reducer store the
 * queue runs on), which would collide with the orchestrator store this
 * package exports under the same names.
 *
 * New code should import from `@some-ui/speech` directly.
 */

export {
  createSpeechAdapter,
  getSpeechQueue,
  initializeSpeechQueue,
  peekSpeechQueue,
  releaseSpeechQueue,
  resetSpeechQueue,
  SpeechProvider,
  useAudioFromStorage,
  useSpeechAdapter,
  useSpeechQueue,
  useSpeechQueueActions,
  useSpeechQueueMetrics,
  useSpeechSession,
} from "@some-ui/speech"
export type {
  SpeakOptions,
  SpeechAdapter,
  SpeechAdapterId,
  SpeechConfig,
  SpeechProviderProps,
  SpeechQueueState,
  SpeechSession,
} from "@some-ui/speech"
