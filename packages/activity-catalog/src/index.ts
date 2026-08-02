export {
  ACTIVITY_CATALOG,
  ACTIVITY_IDS,
  getActivity,
  getActivityByRegistryKey,
} from "./lib/catalog"
export type {
  ActivityConfigValues,
  ActivityDefinition,
  ActivityIconKey,
  ActivityId,
  ActivityMaturity,
  AudioChannelId,
  LayoutTreeId,
  TopikLevel,
} from "./lib/types"
export {
  layoutTreeFor,
  resequence,
  sequenceScenes,
  toSceneConfig,
  totalDurationOfScenes,
} from "./lib/to-scene-config"
export type { SceneBuildOptions, SessionActivity } from "./lib/to-scene-config"
export { defaultSessionName, summarizeConfig } from "./lib/summary"
export {
  pickRecommended,
  rankActivities,
  rankActivitiesWithScores,
} from "./lib/rank"
export type {
  ActivityPlay,
  RankedActivity,
  RankingSignals,
} from "./lib/rank"
export { searchActivities } from "./lib/search"
export type { SearchOptions } from "./lib/search"
export {
  MAX_RECOMMENDED_COUNT,
  recommendedCount,
  SEARCH_RESULT_LIMIT,
} from "./lib/fit"

/**
 * Test fixtures, exported from the package root rather than a `/testing`
 * subpath: they are ~150 lines of pure data builders with no dependencies,
 * and a second export condition costs more to maintain than it saves. Nothing
 * in the app imports them, and `apps/www/tests` does.
 */
export {
  CHARACTERIZATION_SIZES,
  syntheticActivity,
  syntheticCatalogue,
} from "./testing/synthetic-catalogue"
export type { SyntheticCatalogueOptions } from "./testing/synthetic-catalogue"
