/**
 * Where the Playoff Delta stage's real season lives: `paulgsc/testing`, where
 * a weekly workflow runs `paulgsc/server`'s `playoff-delta` job on ESPN's
 * scoreboards and commits one file per team and season. Public, and served
 * with `Access-Control-Allow-Origin: *`, so the stage reads it directly.
 *
 * No import from `@some-ui/playoff-delta` here: this module is plain data, so
 * it can be tested without loading the stage's chunk.
 */

const PLAYOFF_DELTA_DATA =
  "https://raw.githubusercontent.com/paulgsc/testing/main/playoff-delta"

/** The team the vlog follows. */
export const STORY_TEAM = "SF"

/**
 * The season `date` belongs to. The regular season runs from September to
 * early January, so January to May still read last autumn's season.
 */
export const seasonOf = (date: Date): number =>
  date.getUTCMonth() < 5 ? date.getUTCFullYear() - 1 : date.getUTCFullYear()

export type SeasonFeed = { readonly season: number; readonly team: string }

export const locateSeason = ({ season, team }: SeasonFeed): URL =>
  new URL(`${PLAYOFF_DELTA_DATA}/${season}/${team}.json`)
