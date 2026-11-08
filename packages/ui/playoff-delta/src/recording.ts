/**
 * What the recorders read on Node (`apps/www/tests/record/playoff-delta.ts`),
 * served from source with no React and no CSS: the show's formats and
 * episodes, the narration's check, the voiced episode (FEED3), and the
 * sample season with its fill, which a template's preview is said from
 * (SFEED12).
 */
export { checkNarration, type Narration } from "./lib/narration"
export { SAMPLE_SEASON, sampleWeekOf } from "./lib/sample"
export { sampleFill } from "./lib/sample-fill"
export {
  formatOf,
  kindOf,
  RECORDING,
  VOICED_VERSION,
  type FormatKind,
} from "./lib/show"
export { parseStorySeason, seasonData, type StorySeason } from "./lib/story"
export { PD_VOICE, voicedCutList, voicedScenes } from "./lib/voiced"
