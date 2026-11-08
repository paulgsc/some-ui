/**
 * Playoff Delta as a show (SHOW SH1): its two formats, the week's and the
 * legend's, made from this workspace's own slides, and the facts each scene
 * keeps. Home's speaker says an episode from a fill (`./voiced`). The format
 * is a compile-time template: `formatOf` reads the slides' order, names and
 * holds, and each version is pinned under `@some-ui/video-render`'s
 * `src/templates/` (its test holds the newest equal to `formatOf`), so a
 * change to the slides fails until a new version is written.
 */

import {
  BRAND_MOTION,
  FORMAT_SCHEMA,
  inTheme,
  type Format,
  type Parsed,
  type Shape,
} from "@some-ui/video-render"

import {
  HOLD_MS,
  LEGEND_SLIDES,
  LEGEND_WEEK,
  legendFacts,
  SCENES,
  slidesOf,
  WEEK_SLIDES,
  weekFacts,
} from "./slides"
import type { StorySeason } from "./story"

export type FormatKind = "week" | "legend"

/** Which format week `week` is an episode of: week 0 is the legend. */
export const kindOf = (week: number): FormatKind =>
  week === LEGEND_WEEK ? "legend" : "week"

/**
 * The newest version `formatOf` gives of each, pinned as `v<n>.json` in its
 * folder. A fill names the version it was written for, and is drawn in it.
 *
 * 2 (FEED3 #2646): voiced, in the shape (`SHAPE`).
 * 3 (SFEED10 #2675, SFEED14 #2766): drawn in Mochi Night, the palette made
 *   for video, the mark too, in the series' version 3, which is Mochi
 *   Night's ground and plays our music bed (#2673).
 * 4 (HYPER5, #2728): the brand intro and outro are `brand-v1`, the code's
 *   mark moving in the mark's theme, rather than the stage's slides.
 */
export const FORMAT_VERSION: Readonly<Record<FormatKind, number>> = {
  week: 4,
  legend: 4,
}

const NIGHT_VERSION = 3

/** The first version whose brand intro and outro move (HYPER5). */
const MOTION_VERSION = 4

/** The first version voiced and drawn in a shape. */
export const VOICED_VERSION = 2

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
  version: version >= NIGHT_VERSION ? 3 : version >= VOICED_VERSION ? 2 : 1,
})

function shapeOf(kind: FormatKind, version: number): Shape {
  if (version < NIGHT_VERSION) return SHAPE[kind]
  const night = inTheme(SHAPE[kind], "mochi-night")
  return version >= MOTION_VERSION
    ? { ...night, brand: { ...night.brand, motion: BRAND_MOTION } }
    : night
}

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
    ...(version >= VOICED_VERSION ? { shape: shapeOf(kind, version) } : {}),
  }
}

/** What an episode is called: "Playoff Delta, 2026 week 8". */
export const episodeTitle = (season: StorySeason, week: number): string =>
  week === LEGEND_WEEK
    ? "Playoff Delta, the legend"
    : `Playoff Delta, ${season.label} week ${week}`

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
