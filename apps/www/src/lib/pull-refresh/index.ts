/**
 * Drag down from the top of a phone page to check again (epic #2456).
 *
 * `./model` is the gesture's policy (a state union and pure `step`),
 * `./runtime` runs it over a page scroller's touches, `./reads` is what a
 * pull reads again, `./refreshers` is the port a screen's runtime registers
 * its own reads on, and `./words` is everything the indicator says. Phone
 * only (D4): the shell attaches it in the Android app's build, on a page
 * route, never a bounded one (D2).
 */
export type { Phase } from "./model"
export { ARM_PX, MAX_PX } from "./model"
export { createPullRuntime } from "./runtime"
export { readsOnScreen } from "./reads"
export { pullWords, PULL_WORDS } from "./words"
