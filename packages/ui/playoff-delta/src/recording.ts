/**
 * What the recorders read on Node (`apps/www/tests/record/playoff-delta.ts`),
 * served from source with no React and no CSS: the show's formats and
 * episodes, the narration's check, and the voiced episode (FEED3).
 */
export { checkNarration, type Narration } from "./lib/narration"
export {
  episodeFor,
  formatOf,
  kindOf,
  RECORDING,
  VOICED_VERSION,
} from "./lib/show"
export { parseStorySeason, type StorySeason } from "./lib/story"
export { PD_VOICE, voicedCutList, voicedScenes } from "./lib/voiced"
