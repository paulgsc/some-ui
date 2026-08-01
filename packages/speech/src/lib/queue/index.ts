export type { SpeechAction } from "./actions"
export { createSpeechItem, generateId } from "./actions"
export type { SpeechQueueManagerOptions } from "./manager"
export { SpeechQueueManager } from "./manager"
export { speechReducer } from "./reducer"
export {
  getSpeechQueue,
  initializeSpeechQueue,
  peekSpeechQueue,
  releaseSpeechQueue,
  resetSpeechQueue,
} from "./singleton"
export type { Action, Reducer, Selector, Store } from "./store"
export { createStore } from "./store"
export type { SpeechItem, SpeechQueueState } from "./types"
