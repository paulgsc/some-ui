/**
 * An episode of a show (SHOW SH2, #2527): its format (`format.ts`) applied
 * to one period's data, made by a pure function, so the same format and data
 * give the same bytes. It pins the format version, the series version (in
 * its cut list) and the SHA-256 of the data it read, so an episode rendered
 * again after the data moves on still says what it said.
 *
 * The file is a primer, version 2, that the phone's Studio opens where it
 * opens any primer (soundbites' `journal/primer.ts` reads it and ignores the
 * rest): one cut per scene shown, each with its point and the facts a take
 * may neither drop nor contradict, voiced in your own words, its target the
 * scene's hold. Beside the primer it carries the episode's pins and a cut
 * list whose pictures are the recorded clips, ready for the renderer once
 * the takes are in.
 */

import { z } from "zod"

import { CUT_LIST_SCHEMA, CutListSchema, problemsOf } from "./cut-list"
import type { Parsed } from "./cut-list"
import { FORMAT_SCENES_MAX, sceneId } from "./format"
import type { Format } from "./format"

export const EPISODE_SCHEMA = "some-ui.show-episode/1"

const EpisodeCutSchema = z.object({
  id: sceneId,
  /** What the video shows during the cut: the scene's name. */
  artifact: z.string().min(1),
  /** What to make the case for, in your own words. */
  point: z.string().min(1),
  /** Facts a take may neither drop nor contradict. */
  keep: z.array(z.string().min(1)),
  targetSec: z.number().min(3),
})

export const EpisodeSchema = z
  .object({
    version: z.literal(2),
    title: z.string().min(1),
    voice: z.literal("ad-lib"),
    cuts: z.array(EpisodeCutSchema).min(1).max(FORMAT_SCENES_MAX),
    episode: z.object({
      schema: z.literal(EPISODE_SCHEMA),
      format: z.object({ id: z.string().min(1), version: z.number().int() }),
      /** Which period it is: "2026 week 7". */
      period: z.string().min(1),
      /** The data it read: where it came from, and its bytes' sum. */
      data: z.object({
        source: z.string().min(1),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    }),
    cutList: CutListSchema,
  })
  .refine(
    (e) =>
      e.cuts.length === e.cutList.shots.length &&
      e.cuts.every((c, i) => e.cutList.shots[i]?.cut === c.id),
    {
      message: "each cut is one scene of the cut list, in order",
      path: ["cuts"],
    }
  )

export type Episode = z.infer<typeof EpisodeSchema>

/** What one scene says this period: `null` leaves the scene out. */
export type SceneSays = {
  readonly point: string
  readonly keep: ReadonlyArray<string>
} | null

export type EpisodeInput = {
  readonly title: string
  readonly period: string
  readonly data: { readonly source: string; readonly sha256: string }
  /** Per scene of the format, in order. */
  readonly says: ReadonlyArray<SceneSays>
  /** Each scene's clip, and where in it the scene starts. */
  readonly clip: (
    sceneId: string,
    index: number
  ) => { readonly source: string; readonly inMs: number }
}

/** `format` applied to one period's data, or every reason it can't be. */
export function episodeOf(
  format: Format,
  input: EpisodeInput
): Parsed<Episode> {
  if (input.says.length !== format.scenes.length) {
    return {
      ok: false,
      problems: [
        `the format has ${format.scenes.length} scenes, and ${input.says.length} were said`,
      ],
    }
  }
  const shown = format.scenes.flatMap((scene, i) => {
    const says = input.says[i]
    return says ? [{ scene, says }] : []
  })
  const raw = {
    version: 2,
    title: input.title,
    voice: "ad-lib",
    cuts: shown.map(({ scene, says }) => ({
      id: scene.id,
      artifact: scene.name,
      point: says.point,
      keep: says.keep,
      targetSec: scene.holdMs / 1_000,
    })),
    episode: {
      schema: EPISODE_SCHEMA,
      format: { id: format.id, version: format.version },
      period: input.period,
      data: input.data,
    },
    cutList: {
      schema: CUT_LIST_SCHEMA,
      title: input.title,
      series: format.series,
      look: format.look,
      voice: "ad-lib",
      shots: shown.map(({ scene }, i) => ({
        id: scene.id,
        cut: scene.id,
        picture:
          scene.picture.kind === "card"
            ? { kind: "card" }
            : {
                kind: "capture",
                ...input.clip(scene.id, i),
                framing: { mode: "full" },
              },
        durationMs: scene.holdMs,
        voice: "ad-lib",
      })),
    },
  }
  const parsed = EpisodeSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "episode") }
}

/** A clip's file in the episode's folder: "01-division.webm". */
export const clipFile = (scene: string, index: number): string =>
  `${String(index + 1).padStart(2, "0")}-${scene}.webm`
