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
  type Shape,
  type UploadCopy,
} from "@some-ui/video-render"

import { callOf, sentence } from "./reading"
import {
  HOLD_MS,
  LEGEND_SLIDES,
  LEGEND_WEEK,
  legendFacts,
  MODEL,
  SCENES,
  slidesOf,
  WEEK_SLIDES,
  weekFacts,
} from "./slides"
import type { StorySeason, StoryWeek } from "./story"
import { nameOf } from "./story"
import { CALLS, UPLOAD } from "./words"

export type FormatKind = "week" | "legend"

/** Which format week `week` is an episode of: week 0 is the legend. */
export const kindOf = (week: number): FormatKind =>
  week === LEGEND_WEEK ? "legend" : "week"

/**
 * The newest version `formatOf` gives of each, pinned as `v<n>.json` in its
 * folder. A fill names the version it was written for, and is drawn in it.
 *
 * 2 (FEED3 #2646): voiced, in the shape (`SHAPE`).
 */
export const FORMAT_VERSION: Readonly<Record<FormatKind, number>> = {
  week: 2,
  legend: 2,
}

/** The first version voiced and drawn in a shape. */
export const VOICED_VERSION = 2

/** The version Studio's episode for my own voice stays on, until FEED6 (#2649). */
export const CLIPS_VERSION = 1

/**
 * Each format's shape from version 2 (SFEED2 #2680): the locked intro
 * (`INTRO`, filled by code), the brand intro and outro, a chapter slide said
 * aloud before each marked scene, and captions in the series' look. The
 * chapters mark where an episode turns.
 */
const SHAPE: Readonly<Record<FormatKind, Shape>> = {
  week: {
    brand: { intro: true, outro: true },
    chapters: ["division", "results", "standings"],
    subtitles: "word",
  },
  legend: {
    brand: { intro: true, outro: true },
    chapters: ["pieces", "poles", "objectives"],
    subtitles: "word",
  },
}

/** The size the recorder records the stage at, in CSS px: a 9:16 frame. */
export const RECORDING = { width: 1080, height: 1920 } as const

/**
 * Both formats are drawn in the week's series (`@some-ui/video-render`'s
 * sample): version 1 places a recorded clip in a window, version 2 a still
 * the size of the frame.
 */
const seriesOf = (version: number): Format["series"] => ({
  id: "playoff-delta-week",
  version: version >= VOICED_VERSION ? 2 : 1,
})

/** A format's id: its folder's name. */
export const formatId = (kind: FormatKind): string => `playoff-delta-${kind}`

/**
 * The show's format at `version` (the newest by default): every scene a week
 * (or the legend) has, in order, and from version 2 its shape.
 */
export function formatOf(
  kind: FormatKind,
  version: number = FORMAT_VERSION[kind]
): Format {
  const slides = slidesOf(kind)
  return {
    schema: FORMAT_SCHEMA,
    id: formatId(kind),
    version,
    title: kind === "week" ? "Playoff Delta week" : "Playoff Delta, the legend",
    series: seriesOf(version),
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
    ...(version >= VOICED_VERSION ? { shape: SHAPE[kind] } : {}),
  }
}

/** What an episode is called: "Playoff Delta, 2026 week 8". */
export const episodeTitle = (season: StorySeason, week: number): string =>
  week === LEGEND_WEEK
    ? "Playoff Delta, the legend"
    : `Playoff Delta, ${season.label} week ${week}`

/** Where the season's data is published, by its label and team. */
const sourceOf = (season: StorySeason): string =>
  `playoff-delta/${season.label}/${season.team}.json`

/** The show both formats are episodes of, as Studio names it. */
const SHOW = "Playoff Delta"

/**
 * The upload's copy for one week (null for the legend), from the same reading
 * the short says: whose side, our own game, the week's sentence (the
 * outro's) and the model every number is read under. `UPLOAD` holds the
 * words.
 */
export function uploadOf(
  season: StorySeason,
  week: StoryWeek | null
): UploadCopy {
  const team = nameOf(season, season.team)
  if (week === null) {
    return {
      title: UPLOAD.legendTitle(season.label),
      description: [UPLOAD.legendOpening(season.label, team), MODEL].join(
        "\n\n"
      ),
    }
  }
  const game =
    week.game === null
      ? UPLOAD.bye
      : week.game.won
        ? UPLOAD.won(nameOf(season, week.game.opponent))
        : UPLOAD.lost(nameOf(season, week.game.opponent))
  return {
    title: UPLOAD.weekTitle(
      season.label,
      week.week,
      CALLS[callOf(week)].phrase
    ),
    description: [
      UPLOAD.weekOpening(season.label, week.week, team, game),
      sentence(week),
      MODEL,
    ].join("\n\n"),
  }
}

/**
 * The facts each scene of week `week`'s episode keeps, in its format's
 * order (`LEGEND_WEEK`, 0, for the legend), or why there is no such week.
 */
export function factsOf(
  season: StorySeason,
  week: number
): Parsed<ReadonlyArray<ReadonlyArray<string>>> {
  if (week === LEGEND_WEEK) {
    return {
      ok: true,
      value: LEGEND_SLIDES.map((id) => legendFacts(season, id)),
    }
  }
  const shown = season.weeks.find((w) => w.week === week)
  if (!shown) return { ok: false, problems: [`the season has no week ${week}`] }
  return {
    ok: true,
    value: WEEK_SLIDES.map((id) => weekFacts(season, shown, id)),
  }
}

/**
 * One week's episode for my own voice (`LEGEND_WEEK`, 0, for the legend), or
 * every reason there isn't one. It stays on the last version before the
 * voiced shape, whose clips Studio's takes are cut over, until FEED6 (#2649)
 * retires my voice from episodes. `sha256` is the sum of the season as the stage read it
 * (`seasonData`), and `inMs` says where scene `index`'s slide starts in its
 * recorded clip.
 */
export function episodeFor(
  season: StorySeason,
  week: number,
  sha256: string,
  inMs: (index: number) => number
): Parsed<Episode> {
  const keep = factsOf(season, week)
  if (!keep.ok) return keep
  const data = { source: sourceOf(season), sha256 }
  // factsOf has refused a week the season doesn't have.
  const shown =
    week === LEGEND_WEEK ? undefined : season.weeks.find((w) => w.week === week)
  const common = { show: SHOW, data, keep: keep.value, inMs }
  if (shown === undefined) {
    return episodeOf(formatOf("legend", CLIPS_VERSION), {
      ...common,
      title: episodeTitle(season, LEGEND_WEEK),
      period: `${season.label}, the legend`,
      upload: uploadOf(season, null),
    })
  }
  return episodeOf(formatOf("week", CLIPS_VERSION), {
    ...common,
    title: episodeTitle(season, week),
    period: `${season.label} week ${week}`,
    upload: uploadOf(season, shown),
  })
}
