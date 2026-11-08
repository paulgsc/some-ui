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
import type { CutList, TimedWord } from "./cut-list"
import type { Format } from "./format"
import type { Look } from "./plans"

/** How long a brand slide holds, with nothing said over it. */
export const BRAND_MS = 3_000

/** The speech model that says every scene of a voiced feed: home's Kokoro. */
export const FEED_SPEAKER = "kokoro"

/** When a scene's take starts, and the beat after it ends, in ms. */
const VOICE_IN_MS = 300
const TAIL_MS = 700

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
}

/** A scene of a voiced feed: its id, its files' name without extension, and what is said. */
export type StillScene = {
  readonly id: string
  readonly file: string
  /** Empty for a brand slide, which says nothing. */
  readonly said: string
}

/**
 * The feed as a cut list: each scene's still (`<file>.png`), and its take
 * (`<file>.wav`) where one was said, `takes[i]`; a scene with none holds for
 * `unsaidMs`. With `captions`, each scene's are drawn from its take's words,
 * and the music bed plays under the voice once the series names one
 * (`bed`).
 */
export function stillsCutList(
  feed: {
    readonly title: string
    readonly series: CutList["series"]
    readonly look: Look
    readonly captions: boolean
    readonly bed: boolean
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
      return {
        id: scene.id,
        picture: { kind: "still", source: `${scene.file}.png` },
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
              speaker: FEED_SPEAKER,
            }),
        voiceInMs: VOICE_IN_MS,
        // CV1: the still's text runs to the frame's edges, which any zoom
        // would crop; the look's crossfade and music still apply.
        overrides: { motion: { kind: "still" } },
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
