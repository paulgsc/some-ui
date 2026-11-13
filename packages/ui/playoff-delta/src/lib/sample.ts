/**
 * The 2025 season as paulgsc/server's engine evaluates it, parsed through the
 * contract like any feed would be. It stands in where no season is given (the
 * Pages build, or a failed fetch).
 */

import raw from "@playoff-delta/fixtures/season-2025.json"

import type { FormatKind } from "./show"
import { LEGEND_WEEK } from "./slides"
import { parseStorySeason, type StorySeason } from "./story"

export const SAMPLE_SEASON: StorySeason = parseStorySeason(raw)

/**
 * The sample's episode of `kind`: the legend, or the season's newest week,
 * which the format's storyboard and its preview (SFEED12) both draw.
 */
export const sampleWeekOf = (kind: FormatKind): number =>
  kind === "legend"
    ? LEGEND_WEEK
    : (SAMPLE_SEASON.weeks.at(-1)?.week ?? LEGEND_WEEK + 1)
