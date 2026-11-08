/**
 * Playoff Delta voiced (FEED3, #2646): an episode as the scenes Kokoro says
 * and the stage draws in its format version's shape (`SHAPE` in `./show`),
 * and the cut list the renderer lays them in. The fill (`./narration`) says
 * each slide; code says the rest.
 */

import {
  hasCaptions,
  stillFile,
  stillsCutList,
  storyboardOf,
  type BoardScene,
  type CutList,
  type StillTake,
  type Storyboard,
} from "@some-ui/video-render"

import type { Narration } from "./narration"
import { SAMPLE_SEASON } from "./sample"
import { episodeTitle, formatOf, kindOf, type FormatKind } from "./show"
import { LEGEND_WEEK, SCENES, slidesOf, type SlideId } from "./slides"
import { nameOf, type StorySeason } from "./story"
import { INTRO } from "./words"

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
  | SlideScene

/** A slide of the format, in its place: the stage's `slide`. */
type SlideScene = {
  readonly kind: "slide"
  readonly id: SlideId
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
  const kind = kindOf(week)
  const slides: ReadonlyArray<SlideScene> = slidesOf(kind).map((id, i) => ({
    kind: "slide",
    id,
    slide: i,
    said: fill?.scenes.find((s) => s.id === id)?.said ?? SCENES[id].point,
  }))
  const shape = formatOf(kind, version).shape
  if (shape === undefined) return slides
  const scenes: Array<VoicedScene> = [
    { kind: "intro", id: "intro", said: introOf(season, week, version).said },
  ]
  if (shape.brand.intro)
    scenes.push({ kind: "brand-in", id: "brand-in", said: "" })
  for (const scene of slides) {
    if (shape.chapters.includes(scene.id))
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

/**
 * The episode as a cut list (`stillsCutList`, which holds CV1): scene `i`'s
 * still is `stillFile(i, id)`.png and its take, `takes[i]`, the WAV beside
 * it. Captions as the shape says; the music bed under the voice once the
 * series names one (`bed`).
 */
export function voicedCutList(
  season: StorySeason,
  week: number,
  fill: Narration,
  takes: ReadonlyArray<StillTake | null>,
  { bed = false }: { readonly bed?: boolean } = {}
): CutList {
  const format = formatOf(kindOf(week), fill.format.version)
  return stillsCutList(
    {
      title: episodeTitle(season, week),
      series: format.series,
      look: format.look,
      captions: hasCaptions(format),
      bed,
      ...(format.shape ? { shape: format.shape } : {}),
    },
    voicedScenes(season, week, fill.format.version, fill).map((scene, i) => ({
      id: scene.id,
      file: stillFile(i, scene.id),
      said: scene.said,
    })),
    takes
  )
}

/**
 * A format's storyboard (SFEED3, #2744): every scene of an episode of the
 * sample season, its newest week for the week's format, as `voicedScenes`
 * lays it out before the fill. Pinned as `storyboard.json` beside the
 * format's versions in `@some-ui/video-render`'s `templates/`, so the phone,
 * which can't carry this workspace, draws it; `show.test.ts` holds the pin
 * to this.
 */
export function storyboardFor(kind: FormatKind): Storyboard {
  const week =
    kind === "legend"
      ? LEGEND_WEEK
      : (SAMPLE_SEASON.weeks.at(-1)?.week ?? LEGEND_WEEK + 1)
  const format = formatOf(kind)
  return storyboardOf(
    format,
    episodeTitle(SAMPLE_SEASON, week),
    voicedScenes(SAMPLE_SEASON, week, format.version, null).map(
      (scene): BoardScene => {
        if (scene.kind === "slide")
          return { kind: "section", id: scene.id, scene: scene.id }
        if (scene.kind === "chapter")
          return {
            kind: "chapter",
            id: scene.id,
            of: scene.of,
            said: scene.said,
          }
        return { kind: scene.kind, id: scene.id, said: scene.said }
      }
    )
  )
}
