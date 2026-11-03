/**
 * Playoff Delta as a show (SHOW SH1, SH2): its two formats, the week's and
 * the legend's, made from this workspace's own slides, and an episode, the
 * format applied to one week of the season (`@some-ui/video-render`'s
 * `episodeOf`). The format is a compile-time template: `formatOf` reads the
 * slides' order, names and holds, and each version is pinned under
 * `src/show/formats/` (its test holds the newest equal to `formatOf`), so a
 * change to the slides fails until a new version is written.
 */

import {
  episodeOf,
  FORMAT_SCHEMA,
  type Episode,
  type Format,
  type Parsed,
} from "@some-ui/video-render"

import {
  HOLD_MS,
  LEGEND_SLIDES,
  LEGEND_WEEK,
  legendFacts,
  SCENES,
  WEEK_SLIDES,
  weekFacts,
} from "./slides"
import type { StorySeason } from "./story"

export type FormatKind = "week" | "legend"

/** The version `formatOf` gives of each, pinned as `v<n>.json` in its folder. */
export const FORMAT_VERSION: Readonly<Record<FormatKind, number>> = {
  week: 1,
  legend: 1,
}

/** The size the recorder records the stage at, in CSS px: a 9:16 frame. */
export const RECORDING = { width: 1080, height: 1920 } as const

/** Both formats are drawn in the week's series (`@some-ui/video-render`'s sample). */
const SERIES = { id: "playoff-delta-week", version: 1 } as const

/** A format's id: its folder's name. */
export const formatId = (kind: FormatKind): string => `playoff-delta-${kind}`

/** The show's format: every scene a week (or the legend) has, in order. */
export function formatOf(kind: FormatKind): Format {
  const slides = kind === "week" ? WEEK_SLIDES : LEGEND_SLIDES
  return {
    schema: FORMAT_SCHEMA,
    id: formatId(kind),
    version: FORMAT_VERSION[kind],
    title: kind === "week" ? "Playoff Delta week" : "Playoff Delta, the legend",
    series: SERIES,
    look: "calm",
    scenes: slides.map((id) => ({
      id,
      name: SCENES[id].name,
      point: SCENES[id].point,
      picture: {
        kind: "capture",
        from: `the stage's ${id} slide`,
        cssWidth: RECORDING.width,
      },
      holdMs: HOLD_MS[id],
    })),
  }
}

/** Where the season's data is published, by its label and team. */
const sourceOf = (season: StorySeason): string =>
  `playoff-delta/${season.label}/${season.team}.json`

/**
 * One week's episode (`LEGEND_WEEK`, 0, for the legend), or every reason
 * there isn't one. `sha256` is the sum of the season as the stage read it
 * (its contract JSON), and `inMs` says where scene `index`'s slide starts in
 * its recorded clip.
 */
export function episodeFor(
  season: StorySeason,
  week: number,
  sha256: string,
  inMs: (index: number) => number
): Parsed<Episode> {
  const data = { source: sourceOf(season), sha256 }
  if (week === LEGEND_WEEK) {
    return episodeOf(formatOf("legend"), {
      title: "Playoff Delta, the legend",
      period: `${season.label}, the legend`,
      data,
      keep: LEGEND_SLIDES.map((id) => legendFacts(season, id)),
      inMs,
    })
  }
  const shown = season.weeks.find((w) => w.week === week)
  if (!shown) return { ok: false, problems: [`the season has no week ${week}`] }
  return episodeOf(formatOf("week"), {
    title: `Playoff Delta, ${season.label} week ${week}`,
    period: `${season.label} week ${week}`,
    data,
    keep: WEEK_SLIDES.map((id) => weekFacts(season, shown, id)),
    inMs,
  })
}
