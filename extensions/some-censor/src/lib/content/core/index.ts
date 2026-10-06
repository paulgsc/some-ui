/**
 * The Core (BC3): a pure reducer over the Sensor's token stream and
 * the extension's own inputs, emitting actions for the Actuator.
 *
 * Nothing under `core/` imports the DOM, `browser.*`, a clock or a session
 * counter — `core.test.ts` runs under vitest's node environment to prove it,
 * and `eslint.config.js` puts every file here under
 * `extension-charter/no-logic-layer-side-effects`.
 */

export type { Action } from "./actions"
export { WHITELIST_REVEAL_DELAY_MS } from "./actions"
export type { CoreEvent } from "./events"
export { cardKey } from "./keys"
export type { Observation } from "./observation"
export { reduce } from "./reduce"
export type { CoreState } from "./state"
export { initialState, snapshot } from "./state"
