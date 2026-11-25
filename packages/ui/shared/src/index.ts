export * from "./components"
//
export * from "./lib/short-window"
export type { CodeLanguage, CodeToken } from "./lib/code-tokens"
export { tokenizeCode } from "./lib/code-tokens"
export type { ShelfItem, ShelfPort } from "./lib/shelf"
export { keepWithoutReplacing, plainShelfKey } from "./lib/shelf"
export type { Deck, PagerState, Turn } from "./lib/pager"
export { lockOf, offsetOf, SLOP_PX } from "./lib/pager"
export type { PagerRuntime } from "./lib/pager/runtime"
export { CLAIMS_POINTER, claimsAxis, createPager } from "./lib/pager/runtime"
export type { FramePort, LoopClock } from "./lib/loop-clock"
export {
  createLoopClock,
  LOOP_FPS,
  LOOP_MS,
  loopTimeAt,
  STILL_MS,
} from "./lib/loop-clock"
export type { DotMeaning } from "./lib/dot-meaning"
export { DOT_MEANINGS, dotClass } from "./lib/dot-meaning"
export type { Prompter, PrompterEvent } from "./lib/teleprompter"
export {
  bandOf,
  DEFAULT_PACE_WPM,
  heardOf,
  NO_PROMPTER,
  PACE_STEP_WPM,
  paceOf,
  phrasesOf,
  stepPace,
  stepPrompter,
  totalOf,
} from "./lib/teleprompter"
