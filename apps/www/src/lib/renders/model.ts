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
  /**
   * Why, as a short class: a preview's (`no-sample`, …), and from contract
   * epoch 15 (paulgsc/server#932) any row the render policy refused
   * (`too-long`, `too-large`), and from epoch 16 (server#977) one whose
   * scenes don't fit their frame (`overflow`), with its numbers below.
   */
  reason: z.string().min(1).optional(),
  /** How long a refused video would run, and its kind's cap, in minutes. */
  minutes: z.number().nonnegative().optional(),
  capMinutes: z.number().positive().optional(),
  /** How large a refused video came out, and the cap, in MB. */
  mb: z.number().nonnegative().optional(),
  capMb: z.number().positive().optional(),
  /**
   * A video whose scenes don't fit its frame (`overflow`, paulgsc/server#977):
   * the first of them by name (home sends up to 12), and how many in all.
   * Read leniently, so a field this phone can't read leaves the row an
   * ordinary failure rather than the whole board unread.
   */
  scenes: z.array(z.string().min(1)).optional().catch(undefined),
  sceneCount: z.number().int().positive().optional().catch(undefined),
  /**
   * What home's refusal of an essay names, by id (RETRY,
   * paulgsc/server `essay_media::Refusal`'s items): for `take-unheard` and
   * `take-missing`, the takes. Read leniently, as `scenes` is.
   */
  items: z.array(z.string().min(1)).optional().catch(undefined),
  /**
   * The names of the scenes that don't fit (`overflow`), in `scenes`' order,
   * from the essay home holds (RETRY, the owner: "which scene, by its name,
   * not an id"). Read leniently; absent from a home that doesn't send them,
   * and then the scenes are counted, never named by id.
   */
  sceneNames: z.array(z.string().min(1).max(200)).optional().catch(undefined),
  /**
   * The names of a refusal's takes (`take-unheard`, `take-missing`), in
   * `items`' order: the card and exchange each was said for (RETRY). Named
   * whole or not at all; read leniently.
   */
  itemNames: z.array(z.string().min(1).max(200)).optional().catch(undefined),
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
 * What the render policy refused a row for, where home says (RNR1): a home
 * from before contract epoch 15 sends no numbers, and a row without both of
 * its reason's numbers is no refusal, so the screen says what it said before.
 */
export type Refusal =
  | {
      readonly kind: "too-long"
      readonly minutes: number
      readonly capMinutes: number
    }
  | { readonly kind: "too-large"; readonly mb: number; readonly capMb: number }
  | {
      readonly kind: "overflow"
      readonly scenes: ReadonlyArray<string>
      readonly sceneCount: number
    }

export function refusalOf(failed: RenderFailed): Refusal | null {
  const { reason, minutes, capMinutes, mb, capMb, scenes, sceneCount } = failed
  if (
    reason === "too-long" &&
    minutes !== undefined &&
    capMinutes !== undefined
  )
    return { kind: "too-long", minutes, capMinutes }
  if (reason === "too-large" && mb !== undefined && capMb !== undefined)
    return { kind: "too-large", mb, capMb }
  if (
    reason === "overflow" &&
    scenes !== undefined &&
    scenes.length > 0 &&
    sceneCount !== undefined
  )
    return { kind: "overflow", scenes, sceneCount }
  return null
}

/**
 * Whether home has something under way (making it, paused, or waiting for
 * room): the page then reads again on its own, since what it says can move.
 */
export const underWay = (board: Board): boolean => board.now !== null

/** How often the page reads again while something is under way. */
export const WHILE_UNDER_WAY_MS = 30_000

/**
 * When a page that shows home's work reads again on its own: every
 * `WHILE_UNDER_WAY_MS` while something it shows is under way, never
 * otherwise. Studio › Renders' board (`rendersAgainIn`) and an episode's
 * files (`components/episode-files.tsx`) both read by it.
 */
export const againWhileUnderWay = (underWay: boolean): number | false =>
  underWay ? WHILE_UNDER_WAY_MS : false
