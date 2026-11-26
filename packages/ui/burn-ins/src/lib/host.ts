/**
 * The host (HOST1, #3522): the essays' living cast as a burn-in kind. The
 * characters, their emotions, ceremonies, shots and placements are closed
 * unions keyed by character, and the drawing is a pure function of the beats,
 * a seed and t, both in `@some-ui/styles/brand/host`, where the Cast wing and
 * the signature read them too. This module is what the video adds: the cut
 * list's params checked against those unions, and the host drawn over the
 * frame's safe area.
 *
 * The host claims no region (C1485): it is a layer of its own over the card,
 * which keeps its whole room, so it may cover part of what any other burn-in
 * draws, except the captions: its area is the safe area above the lower
 * third (HOST5, #3526), so no shot covers what is said. A speaking beat
 * names its words (`words`), from which it lives beyond the floor. `boxesOf` gives it no box, and so `clash` and the placement tests
 * never weigh it against another kind; `hostBox` gives where it is drawn, for
 * its own tests and the stage.
 */

import {
  hostAt as castHostAt,
  CEREMONIES,
  EMOTIONS,
  FRAMES,
  PLACEMENTS,
  SHOTS,
  type Beat,
  type HostFrame as CastHostFrame,
  type HostCharacter,
} from "@some-ui/styles/brand/host"
import type { SpokenWordOf } from "@some-ui/styles/brand/host-live"
import { ROLES } from "@some-ui/styles/brand/host-role"
import { z } from "zod"

import type { Box, Geometry } from "./geometry"
import type { Parsed } from "./parsed"

/** The host's looks; a published video's is never edited, a change is a new design. */
export const HOST_DESIGNS = ["cast-v1"] as const

const SpotSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})

const common = {
  atMs: z.number().nonnegative(),
  shot: z.enum(SHOTS),
  placement: z.enum(PLACEMENTS),
  speaking: z.boolean(),
  opacity: z.number().min(0).max(1).optional(),
  lookAt: SpotSchema.optional(),
  target: SpotSchema.optional(),
  frame: z.enum(FRAMES).optional(),
}

/** A word as said, on the video's clock, with the notes it carries in `emotions`' terms (`@some-ui/styles/brand/host-live`). */
const wordsOf = <C extends HostCharacter>(
  emotions: (typeof EMOTIONS)[C]
): z.ZodType<ReadonlyArray<SpokenWordOf<C>>> =>
  z
    .array(
      z.strictObject({
        startMs: z.number().nonnegative(),
        endMs: z.number().nonnegative(),
        stress: z.number().min(0).max(1).optional(),
        notes: z
          .array(
            z.strictObject({
              emotion: z.enum(emotions),
              weight: z.number().min(0).max(1),
            })
          )
          .optional(),
        cue: z.boolean().optional(),
      })
    )
    .refine(
      (ws) =>
        ws.every(
          (w, i) =>
            w.endMs >= w.startMs &&
            (i === 0 || w.startMs >= (ws[i - 1]?.startMs ?? 0))
        ),
      {
        message: "each word ends after it starts, and the words come in order",
      }
    )

/**
 * A beat in the cut list: its `character` decides which emotions,
 * ceremonies and roles it may name (a beat with no role is the character's
 * everyday self, HOST7). Strict, so a ceremony on a character that has none
 * is refused rather than dropped.
 */
const BeatSchema = z.discriminatedUnion("character", [
  z.strictObject({
    ...common,
    character: z.literal("tin-owlet"),
    emotion: z.enum(EMOTIONS["tin-owlet"]),
    words: wordsOf<"tin-owlet">(EMOTIONS["tin-owlet"]).optional(),
    role: z.enum(ROLES["tin-owlet"]).optional(),
  }),
  z.strictObject({
    ...common,
    character: z.literal("mochi"),
    emotion: z.enum(EMOTIONS.mochi),
    words: wordsOf<"mochi">(EMOTIONS.mochi).optional(),
    role: z.enum(ROLES.mochi).optional(),
    animation: z.enum(CEREMONIES.mochi).optional(),
  }),
])

export const HostParamsSchema = z.object({
  /** What the idle life is seeded with: the same seed, the same blinks and glances. */
  seed: z.number().int().nonnegative(),
  /** The beats, in the order they start. */
  beats: z
    .array(BeatSchema)
    .min(1)
    .refine(
      (beats) =>
        beats.every((b, i) => i === 0 || b.atMs >= (beats[i - 1]?.atMs ?? 0)),
      { message: "the beats start in order" }
    )
    .refine(
      (beats) => beats.every((b) => !b.speaking || b.words !== undefined),
      {
        message:
          "a speaking beat names its words (HOST5): the mouth moves with them",
      }
    ),
})

export type HostParams = z.infer<typeof HostParamsSchema>

/** The host's beats and seed, checked, and the area it is drawn over. */
export type HostDrawing = {
  readonly seed: number
  readonly beats: ReadonlyArray<Beat>
  readonly area: Box
}

/** What the host shows at a moment; null before it has anything to show. */
export type HostFrame = CastHostFrame | null

/** The safe area above the lower third, where the captions are: the host never covers them (HOST5). */
const aboveCaptions = (g: Geometry): Box => {
  const band = g.regions["lower-third"]
  return { ...g.safeArea, height: Math.max(0, band.y - g.safeArea.y) }
}

/** The host's params set over the frame's safe area above the captions. */
export const drawHost = (
  params: HostParams,
  g: Geometry
): Parsed<HostDrawing> => ({
  ok: true,
  value: { seed: params.seed, beats: params.beats, area: aboveCaptions(g) },
})

/** What the host shows `t` ms into its run. */
export const hostAt = (d: HostDrawing, t: number): HostFrame =>
  castHostAt(d.beats, d.seed, t, d.area)

/** Where the host is drawn at a moment, for its own checks; it claims no region (C1485). */
export const hostBox = (f: HostFrame): ReadonlyArray<Box> =>
  f === null ? [] : [f.box]
