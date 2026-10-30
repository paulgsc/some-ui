/**
 * Cut list v2: the one file the phone, home and Claude all edit, and the
 * only thing the renderer reads about a video. The renderer applies no
 * judgement: every duration is a number someone wrote (the phone fits a
 * scene to its take, `timing.ts`), and every choice is a plan or an
 * override from `vocabulary.ts`.
 *
 * Times are whole milliseconds. Paths are relative to the video's folder.
 * Takes, footage and backgrounds stay out of the repo (Drive, or home);
 * only their names and checksums are written here.
 */

import { z } from "zod"

import { LOOKS, VOICES } from "./plans"
import { MUSIC_MODES, SOUNDS, TRANSITIONS } from "./vocabulary"

export const CUT_LIST_SCHEMA = "some-ui.cut-list/2"

const ms = z.number().int().nonnegative()
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/)
const path = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/") && !p.split("/").includes(".."), {
    message: "a path inside the video's folder",
  })
const sha256 = z.string().regex(/^[0-9a-f]{64}$/)

export const CheckedFileSchema = z.object({ file: path, sha256 })

/** Where the capture sits in the window: the whole screen, or a crop of it. */
const FramingSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("full") }),
  z.object({
    mode: z.literal("crop"),
    /** Above 1 crops narrower than the screen. */
    zoom: z.number().min(1).max(4).default(1),
    /** The crop's left edge and top, in the capture's CSS px. */
    x: z.number().nonnegative().default(0),
    y: z.number().nonnegative().default(0),
  }),
])

const PictureSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("capture"),
    source: path,
    inMs: ms.default(0),
    /** Plays to `outMs`, then holds that frame to the scene's end. */
    outMs: ms.optional(),
    speed: z.number().min(0.25).max(8).default(1),
    /** The screen's width in CSS px, to read `x`, `y` and pan heights. */
    cssWidth: z.number().int().positive().default(412),
    framing: FramingSchema.default({ mode: "crop", zoom: 1, x: 0, y: 0 }),
    /** When the recorder tapped, in ms into the scene. */
    taps: z.array(ms).default([]),
  }),
  z.object({ kind: z.literal("still"), source: path }),
  /** The series' ground alone, for a card burn-in to draw on. */
  z.object({ kind: z.literal("card") }),
])

const MotionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("still") }),
  z.object({ kind: z.literal("push-in"), amount: z.number().gt(0).max(1) }),
  z.object({ kind: z.literal("pull-out"), amount: z.number().gt(0).max(1) }),
  z.object({
    kind: z.literal("pan"),
    keys: z
      .array(z.tuple([ms, z.number().nonnegative()]).readonly())
      .min(1)
      .readonly(),
  }),
  z.object({
    kind: z.literal("punch-in"),
    at: z.array(ms).min(1).readonly(),
    amount: z.number().gt(0).max(1),
  }),
  z.object({ kind: z.literal("freeze"), atMs: ms }),
])

const BackgroundSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("as-captured") }),
  z.object({ kind: z.literal("blurred") }),
  z.object({ kind: z.literal("image"), image: CheckedFileSchema }),
])

const CueSchema = z.object({ sound: z.enum(SOUNDS), atMs: ms })

/**
 * A layer code draws into the frame (STUDIO ST15): its kind, the frozen
 * design it is drawn in, and this video's data for it. The burn-ins
 * workspace validates `params`; the renderer only passes them on.
 */
export const BurnInSchema = z.object({
  kind: z.string().regex(/^[a-z][a-z-]{0,31}$/),
  design: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  params: z.record(z.string(), z.unknown()).default({}),
})

const TakeSchema = z.object({
  /** A take on its own (one cut's), relative to the video's folder. */
  file: path,
  inMs: ms,
  outMs: ms,
})

export const ShotSchema = z.object({
  id,
  /** The primer's cut this scene says. */
  cut: id.optional(),
  picture: PictureSchema,
  durationMs: ms.min(100),
  take: TakeSchema.optional(),
  /** When the take starts, after the scene does. */
  voiceInMs: ms.default(200),
  /** This scene's own look, over the video's. */
  look: z.enum(LOOKS).optional(),
  /** Single levers set for this scene only, over any plan. */
  overrides: z
    .object({
      transitionIn: z.enum(TRANSITIONS).optional(),
      motion: MotionSchema.optional(),
      cues: z.array(CueSchema).optional(),
      background: BackgroundSchema.optional(),
    })
    .default({}),
  burnIns: z.array(BurnInSchema).default([]),
})

const RevisionSchema = z.object({
  rev: z.number().int().positive(),
  author: z.enum(["owner", "claude"]),
  message: z.string().min(1),
  at: z.iso.datetime(),
})

/** A note pinned to a moment: scene `shot`, `offsetMs` into it, at `rev`. */
const NoteSchema = z.object({
  id,
  rev: z.number().int().positive(),
  shot: id,
  offsetMs: ms,
  author: z.enum(["owner", "claude"]),
  text: z.string().min(1),
  status: z.enum(["open", "applied", "declined", "confirmed"]),
  /** Why it was declined. */
  reason: z.string().min(1).optional(),
})

export const CutListSchema = z.object({
  schema: z.literal(CUT_LIST_SCHEMA),
  title: z.string().min(1),
  /** The series version this video pins (ST11). */
  series: z.object({ id, version: z.number().int().positive() }),
  look: z.enum(LOOKS),
  voice: z.enum(VOICES),
  /** The music bed, if this video sets one over its look's. */
  music: z.enum(MUSIC_MODES).optional(),
  shots: z.array(ShotSchema).min(1),
  /** Burn-ins over the whole video, such as captions. */
  burnIns: z.array(BurnInSchema).default([]),
  revisions: z.array(RevisionSchema).default([]),
  notes: z.array(NoteSchema).default([]),
})

export type CutList = z.infer<typeof CutListSchema>
export type Shot = z.infer<typeof ShotSchema>
export type Picture = Shot["picture"]
export type Capture = Extract<Picture, { kind: "capture" }>
export type BurnIn = z.infer<typeof BurnInSchema>

export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: ReadonlyArray<string> }

/** The cut list, or every reason it can't be rendered as written. */
export function parseCutList(raw: unknown): Parsed<CutList> {
  const parsed = CutListSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "cut list"}: ${i.message}`
      ),
    }
  }
  const problems = shotProblems(parsed.data.shots)
  return problems.length
    ? { ok: false, problems }
    : { ok: true, value: parsed.data }
}

function shotProblems(shots: ReadonlyArray<Shot>): Array<string> {
  const problems: Array<string> = []
  const seen = new Set<string>()
  for (const s of shots) {
    if (seen.has(s.id)) problems.push(`${s.id}: two scenes share this id`)
    seen.add(s.id)
    const p = s.picture
    if (p.kind === "capture" && p.outMs !== undefined && p.outMs <= p.inMs) {
      problems.push(`${s.id}: the capture ends before it starts`)
    }
    if (s.take && s.take.outMs <= s.take.inMs) {
      problems.push(`${s.id}: the take ends before it starts`)
    }
    if (s.take && s.voiceInMs + s.take.outMs - s.take.inMs > s.durationMs) {
      problems.push(`${s.id}: the take runs past the scene's end`)
    }
    const m = s.overrides.motion
    const times =
      m?.kind === "punch-in"
        ? m.at
        : m?.kind === "freeze"
          ? [m.atMs]
          : m?.kind === "pan"
            ? m.keys.map(([t]) => t)
            : []
    if (times.some((t) => t > s.durationMs)) {
      problems.push(`${s.id}: a motion time is past the scene's end`)
    }
    if (p.kind === "capture" && p.taps.some((t) => t > s.durationMs)) {
      problems.push(`${s.id}: a tap is past the scene's end`)
    }
    if (s.overrides.cues?.some((c) => c.atMs > s.durationMs)) {
      problems.push(`${s.id}: a sound cue is past the scene's end`)
    }
  }
  return problems
}
