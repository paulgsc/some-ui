/**
 * What every video carries, whatever it is about (#3476, C1480): the
 * brand's intro and outro, and a music bed under the silences. They are one
 * family, `Bookend`, and each series either carries all three or names the
 * ones it leaves out, as policy here, with why. A video never opts out on
 * its own: the series it pins decides.
 *
 * A video reaches its bookends by one of two doors, which this module reads
 * as one:
 *
 * - a show's template (`format.ts`): its shape's `brand.intro` and
 *   `brand.outro`;
 * - its series alone, for a video drawn with no template (a cards essay):
 *   the series' own `intro` and `outro` (`series.ts`).
 *
 * The bed is always the series' `music`. Ours (`MUSIC_BED`) is synthesised
 * by home itself where a video is rendered (`placeBrandFiles`), so a series
 * that names it needs nothing laid on home. Older videos keep the versions
 * they pinned.
 */

import { assertNever } from "@some-ui/core-utils"

import type { Shape } from "./format"
import type { Series } from "./series"

const BOOKENDS = ["intro", "outro", "bed"] as const

export type Bookend = (typeof BOOKENDS)[number]

/**
 * Every series a video is drawn in, by its folder under `sample/series/`,
 * or `@some-ui/video-motion`'s `series/` (`vertical`).
 * A new series is added here, and carries every bookend unless
 * `BOOKEND_OPT_OUTS` names it.
 */
export const SERIES_IDS = [
  "build-journal-short",
  "cheat-sheet",
  "conference-call",
  "long-episode",
  "playoff-delta-week",
  "vertical",
] as const

export type SeriesId = (typeof SERIES_IDS)[number]

export const isSeriesId = (id: string): id is SeriesId =>
  SERIES_IDS.some((known) => known === id)

/** A series' bookends left out, and why, in a sentence. */
type OptOut = {
  readonly off: ReadonlyArray<Bookend>
  readonly why: string
}

/**
 * The bookends a series leaves out, as policy (C771: moved with the story,
 * each move a call). Every bookend of a series not named here is on.
 */
const BOOKEND_OPT_OUTS: Readonly<Partial<Record<SeriesId, OptOut>>> = {
  "build-journal-short": {
    off: BOOKENDS,
    why: "The Build Journal's shorts are the owner's own, cut on the phone in Soundbites, which pins this series' version 1 and draws no composition; they move when Soundbites does",
  },
  vertical: {
    off: BOOKENDS,
    why: "Promos and walkthroughs open and close on their own compositions (promo-hook and promo-close, `bookendedCutList`), and play muted behind the landing's words, so a bed would never be heard",
  },
  "long-episode": {
    off: BOOKENDS,
    why: "A fixture for the timeline's tests: no video is published in it",
  },
}

/** The bookends series `id` carries. */
export function bookendsOf(id: SeriesId): ReadonlySet<Bookend> {
  const off = new Set(BOOKEND_OPT_OUTS[id]?.off ?? [])
  return new Set(BOOKENDS.filter((b) => !off.has(b)))
}

/** What each bookend is called in a line for the person who wrote it. */
const NAMES: Readonly<Record<Bookend, string>> = {
  intro: "an intro carrying the brand",
  outro: "an outro carrying the brand",
  bed: "a music bed",
}

/** Whether `series`, drawn with `shape` where a template draws it, carries `bookend`. */
function carries(
  bookend: Bookend,
  series: Series,
  shape: Shape | undefined
): boolean {
  switch (bookend) {
    case "intro": {
      return series.intro !== undefined || shape?.brand.intro === true
    }
    case "outro": {
      return series.outro !== undefined || shape?.brand.outro === true
    }
    case "bed": {
      return series.music !== undefined
    }
    default: {
      return assertNever(bookend)
    }
  }
}

/**
 * Every bookend a video drawn in `series` (through a template's `shape`,
 * where one draws it) lacks that its series' policy keeps on, as lines for
 * whoever pinned it; a series the policy doesn't know is one line.
 */
export function bookendProblems(series: Series, shape?: Shape): Array<string> {
  const at = `${series.id} v${series.version}`
  if (!isSeriesId(series.id))
    return [
      `${at}: the series isn't in the bookend policy (bookends.ts' SERIES_IDS)`,
    ]
  return [...bookendsOf(series.id)]
    .filter((b) => !carries(b, series, shape))
    .map(
      (b) =>
        `${at}: it lacks ${NAMES[b]}, which every video in ${series.id} carries (bookends.ts)`
    )
}
