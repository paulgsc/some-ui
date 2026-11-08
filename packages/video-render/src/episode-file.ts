/**
 * An episode file (SHOW SH2), as tests and fixtures write and read one: a
 * format applied to one period's data by a pure function (`episodeOf`). The
 * file is a primer, version 2: one cut per scene shown, each with the
 * format's point and the facts it keeps, beside the episode's pins
 * (`./episode`) and a cut list whose pictures are recorded clips. Nothing in
 * production writes or reads one: home makes and voices each episode
 * (FEED6, #2649). Fixtures build the Studio projects a phone already holds
 * from it.
 */

import { isRecord } from "@some-ui/core-utils"
import { z } from "zod"

import { CUT_LIST_SCHEMA, parseCutList, problemsOf } from "./cut-list"
import type { CutList, Parsed } from "./cut-list"
import { EPISODE_SCHEMA, EpisodePinSchema } from "./episode"
import type { UploadCopy } from "./episode"
import {
  PRIMER_CUT_TARGET_MIN_MS,
  PRIMER_V2_BUDGET_MS,
  PRIMER_V2_CUTS,
  sceneId,
  words,
} from "./format"
import type { Format } from "./format"

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
  episode: EpisodePinSchema,
})

export type Episode = z.infer<typeof EpisodeSchema> & {
  readonly cutList: CutList
}

export type EpisodeInput = {
  readonly show: string
  readonly title: string
  readonly period: string
  readonly data: { readonly source: string; readonly sha256: string }
  /** The upload's copy, as the show fills it from the period's data. */
  readonly upload: UploadCopy
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
  const repeated = format.scenes.filter((scene) => scene.repeat !== undefined)
  if (repeated.length > 0) {
    return {
      ok: false,
      problems: repeated.map(
        (scene) =>
          `${scene.id}: an episode voices each scene once, and this one repeats`
      ),
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
  return parseEpisode({
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
      show: input.show,
      format: { id: format.id, version: format.version },
      period: input.period,
      data: input.data,
      upload: input.upload,
    },
    cutList: {
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
    },
  })
}

/**
 * An episode file as the phone reads it: the primer, the pins and a cut list
 * the renderer can draw, whose scenes are the primer's cuts, in order. Any
 * other file is not an episode, whatever primer it may also be.
 */
export function parseEpisode(raw: unknown): Parsed<Episode> {
  const parsed = EpisodeSchema.safeParse(raw)
  if (!parsed.success)
    return { ok: false, problems: problemsOf(parsed.error, "episode") }
  const cutList = parseCutList(isRecord(raw) ? raw["cutList"] : undefined)
  if (!cutList.ok) return cutList
  const cuts = parsed.data.cuts.map((cut) => cut.id)
  const shots = cutList.value.shots.map((shot) => shot.cut ?? shot.id)
  if (cuts.join("\n") !== shots.join("\n"))
    return {
      ok: false,
      problems: ["cutList: its scenes are not the primer's cuts, in order"],
    }
  return { ok: true, value: { ...parsed.data, cutList: cutList.value } }
}
