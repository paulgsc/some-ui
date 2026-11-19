export * from "./components"
//
export * from "./lib/short-window"
export type { CodeLanguage, CodeToken } from "./lib/code-tokens"
export { tokenizeCode } from "./lib/code-tokens"
export type { ShelfItem, ShelfPort } from "./lib/shelf"
export { keepWithoutReplacing, plainShelfKey } from "./lib/shelf"
export { lockOf, SLOP_PX } from "./lib/pager"
export { CLAIMS_POINTER, claimsAxis } from "./lib/pager/runtime"
export type { DotMeaning } from "./lib/dot-meaning"
export { DOT_MEANINGS, dotClass } from "./lib/dot-meaning"
export type { Prompter, PrompterEvent } from "./lib/teleprompter"
export {
  bandOf,
  DEFAULT_PACE_WPM,
<<<<<<< HEAD
  heardOf,
=======
>>>>>>> origin/main
  NO_PROMPTER,
  PACE_STEP_WPM,
  paceOf,
  stepPace,
  stepPrompter,
  totalOf,
} from "./lib/teleprompter"
