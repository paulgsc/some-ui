/**
 * What the renderer can draw, as the schemas a cut list is checked against
 * and the types `plan.ts` matches with exhaustive switches, so a member it
 * can't draw doesn't type-check, and the phone's menus read these lists.
 * Text drawn into the frame is not here: those are burn-ins (STUDIO ST15).
 */

import { z } from "zod"

/** A time or length in whole milliseconds. */
export const ms = z.number().int().nonnegative()

const SEGMENT = "[A-Za-z0-9_][A-Za-z0-9._-]*"

/**
 * A file inside the video's folder: plain path segments only, so no
 * absolute path, `..`, ffmpeg protocol (`file:`, `http:`, `concat:`) or
 * option-like name reaches ffmpeg.
 */
export const path = z
  .string()
  .regex(new RegExp(`^${SEGMENT}(/${SEGMENT})*$`), {
    message: "names a file inside the video's folder",
  })
  .refine((p) => !p.split("/").includes(".."), {
    message: "names a file inside the video's folder",
  })

/** Times that only move forward. */
export const increasing = (xs: ReadonlyArray<number>): boolean =>
  xs.every((x, i) => i === 0 || x > (xs[i - 1] ?? -1))

/** A file the renderer reads, named by the checksum it must still have. */
export const CheckedFileSchema = z.object({
  file: path,
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
})
export type CheckedFile = z.infer<typeof CheckedFileSchema>

/** How one scene gives way to the next. */
export const TRANSITIONS = [
  "cut",
  "crossfade",
  "dip-to-black",
  "slide-up",
  "wipe",
  "zoom",
] as const
export type Transition = (typeof TRANSITIONS)[number]

/** How long each transition overlaps the two scenes it joins, in ms. */
export const TRANSITION_MS: Readonly<Record<Transition, number>> = {
  cut: 0,
  crossfade: 400,
  "dip-to-black": 500,
  "slide-up": 350,
  wipe: 400,
  zoom: 400,
}

/** How the picture moves over a scene. Times are ms into the scene. */
export const MotionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("still") }),
  /** A slow zoom in over the whole scene, by `amount` (0.1 is 10%). */
  z.object({ kind: z.literal("push-in"), amount: z.number().gt(0).max(1) }),
  /** The reverse: starts zoomed in by `amount`, ends on the whole window. */
  z.object({ kind: z.literal("pull-out"), amount: z.number().gt(0).max(1) }),
  /**
   * The window moves through `keys`, each a time and a height into the
   * screen in the capture's CSS px, eased between keys.
   */
  z.object({
    kind: z.literal("pan"),
    keys: z
      .array(z.tuple([ms, z.number().nonnegative()]).readonly())
      .min(1)
      .readonly()
      .refine((ks) => increasing(ks.map(([t]) => t)), {
        message: "pan keys move forward in time",
      }),
  }),
  /** At the first time a quick zoom in by `amount`, back out at the next, and so on. */
  z.object({
    kind: z.literal("punch-in"),
    at: z.array(ms).min(1).readonly().refine(increasing, {
      message: "punch-in times move forward",
    }),
    amount: z.number().gt(0).max(1),
  }),
  /** The picture stops at `atMs` and holds that frame to the scene's end. */
  z.object({ kind: z.literal("freeze"), atMs: ms }),
])
export type Motion = z.infer<typeof MotionSchema>
export type MotionKind = Motion["kind"]
export const MOTION_KINDS = MotionSchema.options.map((o) => o.shape.kind.value)

/** The sound kit's names. A series maps each to a CC0 file. */
export const SOUNDS = [
  "whoosh",
  "click",
  "pop",
  "thud",
  "riser",
  "ding",
] as const
export type Sound = (typeof SOUNDS)[number]

/** A sound placed at a time in the scene. */
export const CueSchema = z.object({ sound: z.enum(SOUNDS), atMs: ms })
export type SoundCue = z.infer<typeof CueSchema>

/** The music bed under a whole video. */
export const MUSIC_MODES = ["off", "under-voice", "up-between-lines"] as const
export type MusicMode = (typeof MUSIC_MODES)[number]

/** What fills the frame behind the picture's window. */
export const BackgroundSchema = z.discriminatedUnion("kind", [
  /** The series' ground colour: the picture as recorded, in its window. */
  z.object({ kind: z.literal("as-captured") }),
  /** The picture itself, blurred and filling the frame. */
  z.object({ kind: z.literal("blurred") }),
  /** An image, read by its checksum so a changed one is named, never used. */
  z.object({ kind: z.literal("image"), image: CheckedFileSchema }),
])
export type Background = z.infer<typeof BackgroundSchema>
export type BackgroundKind = Background["kind"]
export const BACKGROUND_KINDS = BackgroundSchema.options.map(
  (o) => o.shape.kind.value
)
