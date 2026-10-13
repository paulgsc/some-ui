/**
 * Where the stage's real season lives (the pipeline: the playoff-delta
 * package README). Public, and served with `Access-Control-Allow-Origin: *`,
 * so the stage reads it directly.
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
