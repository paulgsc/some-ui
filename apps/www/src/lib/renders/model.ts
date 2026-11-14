/**
 * What home is rendering (SFEED13, #2761): home's one read of its render
 * jobs, `GET /renders` (paulgsc/server `routes::renders`, `feeds::renders`),
 * as the phone reads it. Pure, so every answer is held by a test; what the
 * screen says of it is `./words`.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import { z } from "zod"

const PhaseSchema = z.enum(["waiting", "rendering", "paused", "finishing"])

const HeldBySchema = z.enum([
  "busy",
  "memory",
  "pressure",
  "settling",
  "unknown",
  "clear",
  "silent",
])

const EstimateSchema = z.object({
  share: z.number().min(0).max(1),
  secondsLeft: z.number().int().nonnegative().nullable(),
})

/**
 * What a row names beyond its feed and key (#2899), each optional so a home
 * from before it still reads: a preview's template, and when home lets a
 * finished preview go.
 */
const TEMPLATE = z.string().min(1).optional()

/**
 * How far the worker has got with what home is making (#2899): where it is
 * on the line and which scene, from a home that says so. The station is read
 * as text, so one a later home adds reads as none rather than unreadable.
 */
const ProgressSchema = z.object({
  station: z.string().min(1),
  scene: z.number().int().positive().nullable(),
  scenes: z.number().int().positive().nullable(),
  since: z.number().int(),
})

const NowSchema = z.object({
  feed: z.string().min(1),
  key: z.string().min(1),
  template: TEMPLATE,
  state: PhaseSchema,
  since: z.number().int(),
  stateSince: z.number().int(),
  gaveWay: z.number().int().nonnegative(),
  heldBy: HeldBySchema.nullable(),
  stuck: z.boolean(),
  estimate: EstimateSchema.nullable(),
  progress: ProgressSchema.nullable().optional(),
})

const EpisodeSchema = z.object({
  feed: z.string().min(1),
  key: z.string().min(1),
  at: z.number().int(),
  template: TEMPLATE,
  expiresAt: z.number().int().nonnegative().optional(),
  /** The video's size, where home said it: what the phone brings to watch it. */
  bytes: z.number().int().nonnegative().optional(),
})

const FailedSchema = EpisodeSchema.extend({
  by: z.enum(["recorder", "home"]),
  exit: z.number().int().nullable(),
  /** Why, where home knows one the person can act on (`no-sample`). */
  reason: z.string().min(1).optional(),
})

const ComingSchema = z.object({
  feed: z.string().min(1),
  on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const BoardSchema = z.object({
  now: NowSchema.nullable(),
  waiting: z.array(EpisodeSchema),
  failed: z.array(FailedSchema),
  done: z.array(EpisodeSchema),
  coming: z.array(ComingSchema),
})

/** Home's read of its render jobs. */
export type Board = z.infer<typeof BoardSchema>
export type Now = z.infer<typeof NowSchema>
export type Progress = z.infer<typeof ProgressSchema>
export type Phase = z.infer<typeof PhaseSchema>
export type HeldBy = z.infer<typeof HeldBySchema>
export type RenderFailed = z.infer<typeof FailedSchema>
export type RenderEpisode = z.infer<typeof EpisodeSchema>

/** What home's answer says. */
export type BoardRead =
  | { readonly kind: "read"; readonly board: Board }
  /** A home from before the read: it serves no such path. */
  | { readonly kind: "older" }
  | { readonly kind: "unreadable" }

export function readBoard(answer: HomeAnswer): BoardRead {
  if (answer.status === 404) return { kind: "older" }
  if (answer.status !== 200) return { kind: "unreadable" }
  const board = readAs(BoardSchema, answer.body)
  return board === null ? { kind: "unreadable" } : { kind: "read", board }
}

/**
 * Whether home has something under way (making it, paused, or waiting for
 * room): the page then reads again on its own, since what it says can move.
 */
export const underWay = (board: Board): boolean => board.now !== null

/** How often the page reads again while something is under way. */
export const WHILE_UNDER_WAY_MS = 30_000
