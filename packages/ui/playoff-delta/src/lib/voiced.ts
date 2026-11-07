/**
 * Playoff Delta voiced (FEED3, #2646): an episode as the scenes Kokoro says
 * and the stage draws in the format's shape (`formatOf`, version 2 on), and
 * the cut list the renderer lays them in. A fill (`./narration`) gives what
 * is said over each slide; code fills the rest: the locked intro, the brand
 * slides, which say nothing, and the chapters, which say their scene's name.
 *
 * Each scene is one still the stage records (`/playoff-delta?record`), held
 * for its take: the same fill and season give the same video.
 */

import {
  stillFile,
  stillsCutList,
  type CutList,
  type Format,
  type StillTake,
} from "@some-ui/video-render"

import type { Narration } from "./narration"
import { formatOf, kindOf } from "./show"
import {
  LEGEND_SLIDES,
  LEGEND_WEEK,
  SCENES,
  WEEK_SLIDES,
  type SlideId,
} from "./slides"
import { nameOf, type StorySeason } from "./story"
import { INTRO, UPLOAD } from "./words"

/**
 * The voice every scene is said in, by Kokoro's name (home's speaker,
 * paulgsc/server `infra/kokoro/say.py`): one host, as a short has.
 */
export const PD_VOICE = "af_heart"

/** One scene of a voiced episode, in the order said. */
export type VoicedScene =
  | { readonly kind: "intro"; readonly id: "intro"; readonly said: string }
  | {
      readonly kind: "brand-in" | "brand-out"
      readonly id: "brand-in" | "brand-out"
      readonly said: ""
    }
  | {
      readonly kind: "chapter"
      readonly id: string
      /** The slide the chapter opens. */
      readonly of: SlideId
      readonly said: string
    }
  | {
      readonly kind: "slide"
      readonly id: SlideId
      /** Its place among the format's slides: the stage's `slide`. */
      readonly slide: number
      readonly said: string
    }

/** The intro's rows, and what it says aloud, for one episode. */
export function introOf(
  season: StorySeason,
  week: number,
  version: number
): {
  readonly rows: ReadonlyArray<{
    readonly label: string
    readonly says: string
  }>
  readonly said: string
} {
  const team = nameOf(season, season.team)
  const episode =
    week === LEGEND_WEEK
      ? INTRO.legend(season.label)
      : INTRO.week(season.label, week)
  return {
    rows: [
      { label: INTRO.rows.written, says: INTRO.written },
      { label: INTRO.rows.numbers, says: INTRO.numbers },
      { label: INTRO.rows.drawn, says: INTRO.drawn(version) },
      { label: INTRO.rows.voices, says: INTRO.voices },
      { label: INTRO.rows.side, says: INTRO.side(team) },
    ],
    said: INTRO.said(episode, team),
  }
}

/** The format an episode of week `week` is drawn in, at `version`. */
const voicedFormat = (week: number, version: number): Format =>
  formatOf(kindOf(week), version)

/**
 * The scenes of week `week`'s episode (`LEGEND_WEEK` for the legend), in the
 * order said: in a version with a shape, the locked intro, the brand intro,
 * a chapter before each marked slide, the slides, and the brand outro. Each
 * slide says what `fill` says over it; with no fill, nothing is said yet, and
 * a slide shows its point in the recorder's place.
 */
export function voicedScenes(
  season: StorySeason,
  week: number,
  version: number,
  fill: Narration | null
): ReadonlyArray<VoicedScene> {
  const format = voicedFormat(week, version)
  // The format's scenes are these slides, in this order (`formatOf`).
  const ids: ReadonlyArray<SlideId> =
    week === LEGEND_WEEK ? LEGEND_SLIDES : WEEK_SLIDES
  const slides: ReadonlyArray<VoicedScene> = ids.map((id, i) => ({
    kind: "slide",
    id,
    slide: i,
    said: fill?.scenes.find((s) => s.id === id)?.said ?? SCENES[id].point,
  }))
  const shape = format.shape
  if (shape === undefined) return slides
  const scenes: Array<VoicedScene> = [
    { kind: "intro", id: "intro", said: introOf(season, week, version).said },
  ]
  if (shape.brand.intro)
    scenes.push({ kind: "brand-in", id: "brand-in", said: "" })
  for (const scene of slides) {
    if (scene.kind === "slide" && shape.chapters.includes(scene.id))
      scenes.push({
        kind: "chapter",
        id: `chapter-${scene.id}`,
        of: scene.id,
        said: `${SCENES[scene.id].name}.`,
      })
    scenes.push(scene)
  }
  if (shape.brand.outro)
    scenes.push({ kind: "brand-out", id: "brand-out", said: "" })
  return scenes
}

/** The scene `id` names in week `week`'s episode at `version`, if it has one. */
export const voicedSceneOf = (
  season: StorySeason,
  week: number,
  version: number,
  id: string
): VoicedScene | undefined =>
  voicedScenes(season, week, version, null).find((s) => s.id === id)

/** What the upload and the cut list call week `week`'s episode. */
const titleOf = (season: StorySeason, week: number): string =>
  week === LEGEND_WEEK
    ? UPLOAD.legendTitle(season.label)
    : `Playoff Delta · ${season.label} week ${week}`

/**
 * The episode as a cut list (`stillsCutList`, which holds CV1): scene `i`'s
 * still is `stillFile(i, id)`.png and its take, `takes[i]`, the WAV beside
 * it. Subtitles as the shape says; the music bed under the voice once the
 * series names one (`bed`).
 */
export function voicedCutList(
  season: StorySeason,
  week: number,
  fill: Narration,
  takes: ReadonlyArray<StillTake | null>,
  { bed = false }: { readonly bed?: boolean } = {}
): CutList {
  const format = voicedFormat(week, fill.format.version)
  return stillsCutList(
    {
      title: titleOf(season, week),
      series: format.series,
      look: format.look,
      subtitles: format.shape?.subtitles ?? "off",
      bed,
    },
    voicedScenes(season, week, fill.format.version, fill).map((scene, i) => ({
      id: scene.id,
      file: stillFile(i, scene.id),
      said: scene.said,
    })),
    takes
  )
}
