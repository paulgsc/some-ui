/**
 * A voiced feed's cut list (FEED3 #2646): one recorded still per scene, held
 * for its take, as the weekly call (`call.ts`) and Playoff Delta make them.
 * The template's code decides the scenes and what each says; this lays them
 * on a timeline the renderer draws.
 *
 * CV1 (promise, #2671): every scene shows the whole still the stage
 * recorded, held still (`__tests__/call-video.test.ts`). Captions draw only
 * in the band at the frame's foot, which a stage leaves empty for them
 * (`@some-ui/burn-ins`' `captionSpace`).
 */

import { CUT_LIST_SCHEMA } from "./cut-list"
import type { Composition, CutList, TimedWord } from "./cut-list"
import { markThemeOf } from "./format"
import type { Format, Shape } from "./format"
import type { Look } from "./plans"

/** How long a brand slide holds, with nothing said over it. */
export const BRAND_MS = 3_000

/** The speech model that says every scene of a voiced feed: home's Kokoro. */
export const FEED_SPEAKER = "kokoro"

/** When a scene's take starts, and the beat after it ends, in ms. */
const VOICE_IN_MS = 300
export const TAIL_MS = 700

/** How long a scene with no take holds: its words read at a calm pace. */
export const readingMs = (said: string): number =>
  Math.max(3_000, said.trim().split(/\s+/).length * 400 + 1_200)

/** How long a scene holds before anything is said: a brand slide's, or its words' reading time. */
export const unsaidMs = (said: string): number =>
  said === "" ? BRAND_MS : readingMs(said)

/** About how long `scenes` run before anything is said: each for `unsaidMs`. */
export const estimatedMs = (
  scenes: ReadonlyArray<{ readonly said: string }>
): number => scenes.reduce((total, scene) => total + unsaidMs(scene.said), 0)

/** Whether a format version's shape draws captions, which need each word's time. */
export const hasCaptions = (format: Format): boolean =>
  (format.shape?.subtitles ?? "off") !== "off"

/** Scene `index`'s files in the video's folder, without their extension: "03-board". */
export const stillFile = (index: number, scene: string): string =>
  `${String(index + 1).padStart(2, "0")}-${scene}`

/** A scene's take: how long it runs, and each word in it, when the speaker gave them. */
export type StillTake = {
  readonly ms: number
  readonly words?: ReadonlyArray<TimedWord>
  /**
   * The owner said it (a Rust Rounds answer, `essay.ts`), not the speaker:
   * the cut list names no speech model for it, so the authorship mark
   * reports a person's voice.
   */
  readonly owner?: boolean
}

/**
 * `text`'s words placed across a take of `ms` with no word times of its
 * own, each for a share as long as its letters: captions for a take the
 * speaker didn't say, as an owner's take is when home kept no times for it.
 */
export function spreadWords(text: string, ms: number): Array<TimedWord> {
  const said = text.trim().split(/\s+/).filter(Boolean)
  const weight = said.reduce((total, word) => total + word.length + 1, 0)
  let at = 0
  return said.map((word) => {
    const startMs = Math.round((at / weight) * ms)
    at += word.length + 1
    return { text: word, startMs, endMs: Math.round((at / weight) * ms) }
  })
}

/** A scene of a voiced feed: its id, its files' name without extension, and what is said. */
export type StillScene = {
  readonly id: string
  readonly file: string
  /** Empty for a brand slide, which says nothing. */
  readonly said: string
}

/** The composition that draws the brand intro and outro, from HYPER5 (#2728). */
export const BRAND_MOTION = "brand-v1"

/**
 * Brand scene `id` ("brand-in" or "brand-out") as the composition `shape`
 * names draws it (HYPER5, #2728): its open or close, the mark in the shape's
 * mark theme. Null for any other scene, and where the shape names none, so
 * the stage's slide is the picture.
 */
export function brandPicture(
  shape: Shape | undefined,
  id: string
): Composition | null {
  const ref = shape?.brand.motion
  if (ref === undefined || (id !== "brand-in" && id !== "brand-out"))
    return null
  const theme = markThemeOf(shape)
  return {
    kind: "composition",
    ref,
    variables: {
      part: id === "brand-in" ? "open" : "close",
      ...(theme === undefined ? {} : { theme }),
    },
    files: [],
  }
}

/**
 * The feed as a cut list: each scene's still (`<file>.png`), and its take
 * (`<file>.wav`) where one was said, `takes[i]`; a scene with none holds for
 * `unsaidMs`. With `captions`, each scene's are drawn from its take's words,
 * and the music bed plays under the voice once the series names one
 * (`bed`). The brand intro and outro are the composition `shape` names,
 * where it names one (`brandPicture`), and their stills go unused.
 */
export function stillsCutList(
  feed: {
    readonly title: string
    readonly series: CutList["series"]
    readonly look: Look
    readonly captions: boolean
    readonly bed: boolean
    /** The format version's shape, which may draw the brand scenes. */
    readonly shape?: Shape
  },
  scenes: ReadonlyArray<StillScene>,
  takes: ReadonlyArray<StillTake | null>
): CutList {
  return {
    schema: CUT_LIST_SCHEMA,
    title: feed.title,
    series: feed.series,
    look: feed.look,
    voice: "read",
    // The look's mode (calm: under the voice) once the series has a bed.
    ...(feed.bed ? {} : { music: "off" as const }),
    shots: scenes.map((scene, i) => {
      const take = takes[i] ?? null
      const motion = brandPicture(feed.shape, scene.id)
      return {
        id: scene.id,
        picture: motion ?? { kind: "still", source: `${scene.file}.png` },
        durationMs:
          take !== null
            ? VOICE_IN_MS + take.ms + TAIL_MS
            : unsaidMs(scene.said),
        ...(take === null
          ? {}
          : {
              take: {
                file: `${scene.file}.wav`,
                inMs: 0,
                outMs: take.ms,
                ...(take.words ? { words: [...take.words] } : {}),
              },
              ...(take.owner ? {} : { speaker: FEED_SPEAKER }),
            }),
        voiceInMs: VOICE_IN_MS,
        // CV1: the still's text runs to the frame's edges, which any zoom
        // would crop; the look's crossfade and music still apply. A
        // composition draws its own picture.
        overrides: motion ? {} : { motion: { kind: "still" as const } },
        burnIns: [],
        idea: { origin: "agent" },
      }
    }),
    // In the look the series names (`designs.captions`).
    burnIns: feed.captions ? [{ kind: "captions", params: {} }] : [],
    revisions: [],
    notes: [],
  }
}
