/**
 * The Core (BC3, #1436): a pure reducer over the Sensor's token stream and
 * the extension's own inputs, emitting actions for the Actuator.
 *
 * Nothing under `core/` imports the DOM, `browser.*`, a clock or a session
 * counter — `core.test.ts` runs under vitest's node environment to prove it,
 * and `eslint.config.js` puts every file here under
 * `extension-charter/no-logic-layer-side-effects`.
 */

export type { Action, CoreFact } from "./actions"
export { WHITELIST_REVEAL_DELAY_MS } from "./actions"
export type { CensorCommand, CoreEvent, Gesture, Input, Token } from "./events"
export type { CardKey } from "./keys"
export { cardKey, keyVideoId } from "./keys"
export type { Observation, ShapeConfidence } from "./observation"
export { mergeObservation } from "./observation"
export { parseChannelHref, parseVideoHref } from "./parse"
export type { Step } from "./reduce"
export { reduce } from "./reduce"
export type {
  CardState,
  ChannelState,
  CoreSnapshot,
  CoreState,
  Phase,
} from "./state"
export { initialState, snapshot } from "./state"
