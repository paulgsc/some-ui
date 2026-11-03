/**
 * An episode of a show (SHOW SH2, #2527): its format (`format.ts`) applied
 * to one period's data, made by a pure function, so the same format, data
 * and clip starts give the same bytes. It pins the format version, the
 * series version (in its cut list) and a sum of the data it read, so an
 * episode rendered again after the data moves on still says what it said.
 *
 * The file is a primer, version 2, that the phone's Studio opens where it
 * opens any primer (soundbites' `journal/primer.ts` reads it and ignores the
 * rest): one cut per scene shown, each with the format's point and the facts
 * a take may neither drop nor contradict, voiced in your own words, its
 * target the scene's hold. Beside the primer it carries the episode's pins
 * and a cut list whose pictures are the recorded clips, ready for the
 * renderer once the takes are in. An episode follows its format strictly: a
 * scene is left out only where the format says it may be.
 */

import { z } from "zod"

import { CUT_LIST_SCHEMA, parseCutList, problemsOf } from "./cut-list"
import type { CutList, Parsed } from "./cut-list"
import {
  PRIMER_CUT_TARGET_MIN_MS,
  PRIMER_V2_BUDGET_MS,
  PRIMER_V2_CUTS,
  sceneId,
  words,
} from "./format"
import type { Format } from "./format"

export const EPISODE_SCHEMA = "some-ui.show-episode/1"

const EpisodeCutSchema = z.object({
  id: sceneId,
  /** What the video shows during the cut: the scene's name. */
  artifact: words,
  /** What to make the case for, in your own words. */
  point: words,
  /** Facts a take may neither drop nor contradict. */
  keep: z.array(words),
  targetSec: z
    .number()
    .min(PRIMER_CUT_TARGET_MIN_MS / 1_000)
    .max(PRIMER_V2_BUDGET_MS / 1_000),
})

const EpisodeSchema = z.object({
  version: z.literal(2),
  title: words,
  voice: z.literal("ad-lib"),
  cuts: z.array(EpisodeCutSchema).min(1).max(PRIMER_V2_CUTS),
  episode: z.object({
    schema: z.literal(EPISODE_SCHEMA),
    format: z.object({ id: words, version: z.number().int() }),
    /** Which period it is: "2026 week 7". */
    period: words,
    /** The data it read: where it came from, and a sum its `source` names. */
    data: z.object({
      source: words,
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  }),
})

export type Episode = z.infer<typeof EpisodeSchema> & {
  readonly cutList: CutList
}

export type EpisodeInput = {
  readonly title: string
  readonly period: string
  readonly data: { readonly source: string; readonly sha256: string }
  /**
   * Per scene of the format, in order: the facts a take over it keeps, or
   * `null` to leave it out, which only a scene with a `skip` may be.
   */
  readonly keep: ReadonlyArray<ReadonlyArray<string> | null>
  /** Where scene `index` of the format starts in its clip. */
  readonly inMs: (index: number) => number
}

/** Scene `index`'s clip in the episode's folder: "01-division.webm". */
export const clipFile = (scene: string, index: number): string =>
  `${String(index + 1).padStart(2, "0")}-${scene}.webm`

/** `format` applied to one period's data, or every reason it can't be. */
export function episodeOf(
  format: Format,
  input: EpisodeInput
): Parsed<Episode> {
  if (input.keep.length !== format.scenes.length) {
    return {
      ok: false,
      problems: [
        `the format has ${format.scenes.length} scenes, and facts were given for ${input.keep.length}`,
      ],
    }
  }
  const refused = format.scenes.filter(
    (scene, i) => input.keep[i] === null && scene.skip === undefined
  )
  if (refused.length > 0) {
    return {
      ok: false,
      problems: refused.map(
        (scene) => `${scene.id}: the format never leaves this scene out`
      ),
    }
  }
  const shown = format.scenes.flatMap((scene, index) => {
    const keep = input.keep[index]
    return keep ? [{ scene, index, keep }] : []
  })
  const parsed = EpisodeSchema.safeParse({
    version: 2,
    title: input.title,
    voice: "ad-lib",
    cuts: shown.map(({ scene, keep }) => ({
      id: scene.id,
      artifact: scene.name,
      point: scene.point,
      keep,
      targetSec: scene.holdMs / 1_000,
    })),
    episode: {
      schema: EPISODE_SCHEMA,
      format: { id: format.id, version: format.version },
      period: input.period,
      data: input.data,
    },
  })
  if (!parsed.success)
    return { ok: false, problems: problemsOf(parsed.error, "episode") }
  const cutList = parseCutList({
    schema: CUT_LIST_SCHEMA,
    title: input.title,
    series: format.series,
    look: format.look,
    voice: "ad-lib",
    shots: shown.map(({ scene, index }) => ({
      id: scene.id,
      cut: scene.id,
      picture:
        scene.picture.kind === "card"
          ? { kind: "card" }
          : {
              kind: "capture",
              source: clipFile(scene.id, index),
              inMs: input.inMs(index),
              cssWidth: scene.picture.cssWidth,
              framing: { mode: "full" },
            },
      durationMs: scene.holdMs,
    })),
  })
  if (!cutList.ok) return cutList
  return { ok: true, value: { ...parsed.data, cutList: cutList.value } }
}
