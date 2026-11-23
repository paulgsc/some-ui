/**
 * An episode's files beside its video, on its page (ASSETS-R, C1300): each
 * member of `@some-ui/video-render/assets`'s `EpisodeAsset` the page shows,
 * where home says each stands, and what asking home to make one came to.
 * Pure, so every answer is held by a test; the page reads each file with its
 * own query and asks with one send (`./index`).
 *
 * The page reads each file itself (`GET /feeds/:feed/videos/:key/<asset>`),
 * so a home from before the list's steps still shows what it serves. The
 * list's `assets` (`./model`) carries a `Step` per file (paulgsc/server
 * `routes::feed_videos`): where a file home lacks stands on the line, which
 * the page draws as the conveyor every render moves along (`./conveyor`,
 * the owner, 2026-11-22). The video is the page's own row, so it is not
 * among these.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { assertNever, readAs } from "@some-ui/core-utils"
import { EPISODE_ASSETS, isAloneAsset } from "@some-ui/video-render/assets"
import type { AloneAsset, EpisodeAsset } from "@some-ui/video-render/assets"
import { z } from "zod"

/** The files the page shows beside the video: every asset but the video. */
export type ShownAsset = Exclude<EpisodeAsset, "video">

/** Those files, in the asset union's order. */
export const SHOWN_ASSETS: ReadonlyArray<ShownAsset> = EPISODE_ASSETS.filter(
  (asset): asset is ShownAsset => asset !== "video"
)

/**
 * Where a file stands, as home says (`Step`): not made; asked for; waiting
 * its turn on home's one line; being made; made; or stopped, either tried and
 * not made (`failed`, which asking again would not change) or held by
 * something that has to change first (`blocked`, with its `reason`).
 */
export const STEP_STATES = [
  "missing",
  "asked",
  "waiting",
  "rendering",
  "done",
  "failed",
  "blocked",
] as const

export type StepState = (typeof STEP_STATES)[number]

/**
 * Why home holds a step (`reason`): its render policy refused the video, a
 * cards essay's input isn't on home, there's no video yet, or the recorder
 * made nothing. A step reads by its reason, failed or held alike
 * (`./step-conveyor`).
 */
const STEP_REASONS = [
  "too-long",
  "too-large",
  "overflow",
  "no-video",
  "take-missing",
  "take-unheard",
  "snip-missing",
  "snip-gone",
  "clip-missing",
  "recorder",
] as const

export type StepReason = (typeof STEP_REASONS)[number]

export const isStepReason = (value: string): value is StepReason =>
  STEP_REASONS.some((reason) => reason === value)

/**
 * One file's step. Its times are home's, in Unix seconds as the renders
 * board gives them, from what is on its drive: when it
 * was asked for and when home started on it only while it is under way,
 * when it ended once it has.
 */
const StepSchema = z.object({
  asset: z.enum(EPISODE_ASSETS),
  state: z.enum(STEP_STATES),
  askedAt: z.number().int().nonnegative().optional(),
  startedAt: z.number().int().nonnegative().optional(),
  endedAt: z.number().int().nonnegative().optional(),
  reason: z.string().min(1).optional(),
  itemCount: z.number().int().nonnegative().optional(),
})

export type Step = z.infer<typeof StepSchema>

/** Which steps are on the line and can still move by themselves. */
const UNDER_WAY = {
  missing: false,
  asked: true,
  waiting: true,
  rendering: true,
  done: false,
  failed: false,
  blocked: false,
} as const satisfies Record<StepState, boolean>

/** Whether a step is on the line and can still move: asked, waiting or being made. */
export const stepUnderWay = (step: Step | undefined): boolean =>
  step === undefined ? false : UNDER_WAY[step.state]

/**
 * Each file's step, as far as home's list says: absent from an older home. A
 * step this phone can't read (a state home learned since) is dropped alone,
 * so it never takes the episode's list down with it.
 */
export const AssetsSchema = z
  .object({
    video: StepSchema.optional().catch(undefined),
    thumbnail: StepSchema.optional().catch(undefined),
    description: StepSchema.optional().catch(undefined),
  } satisfies Record<EpisodeAsset, z.ZodType<Step | undefined>>)
  .catch({})

/** What each file's content is, once home sends it. */
export type AssetContent = {
  /** The PNG's bytes, as base64. */
  readonly thumbnail: { readonly base64: string }
  /** YouTube's chapter lines, ending in a newline. */
  readonly description: { readonly text: string }
}

/** What asking home for a file came to. */
export type AssetRead<A extends ShownAsset> =
  | { readonly kind: "there"; readonly content: AssetContent[A] }
  /** Home holds none: never made, or a home from before this file. */
  | { readonly kind: "none" }
  | { readonly kind: "unreadable" }

const READ: {
  readonly [A in ShownAsset]: (body: string) => AssetContent[A] | null
} = {
  thumbnail: (body) => (body === "" ? null : { base64: body }),
  description: (body) => {
    const text = body.trim()
    return text === "" ? null : { text: `${text}\n` }
  },
}

/** Home's answer to a read of `asset`, as the page shows it. */
export function readAsset<A extends ShownAsset>(
  asset: A,
  answer: HomeAnswer
): AssetRead<A> {
  if (answer.status === 404) return { kind: "none" }
  if (answer.status !== 200) return { kind: "unreadable" }
  const content = READ[asset](answer.body)
  return content === null ? { kind: "none" } : { kind: "there", content }
}

/**
 * What the page shows for a file: its content; that it isn't made, with
 * Generate where home can make it on its own (`isAloneAsset`); where it
 * stands on the line, once asked for or stopped; or nothing, while it is
 * read, or where home can't say.
 */
export type AssetView<A extends ShownAsset> =
  | { readonly kind: "there"; readonly content: AssetContent[A] }
  /** `generate`: the file to ask home for, where it can make it alone. */
  | { readonly kind: "missing"; readonly generate: AloneAsset | null }
  | { readonly kind: "line"; readonly step: Step }
  | { readonly kind: "hidden" }

/**
 * The newer word on a file: the step home answered Generate with (`asked`),
 * until the list is read again after it, then the list's (the page passes
 * `asked` only while the list is the one it tapped Generate over). A stamp
 * only the answer carries is kept, since home keeps a step's earlier times
 * only while it is under way.
 */
export function latestStep(
  listed: Step | undefined,
  asked: Step | null
): Step | undefined {
  if (asked === null) return listed
  if (listed === undefined || listed.state === "missing") return asked
  return {
    ...listed,
    ...(listed.askedAt === undefined && asked.askedAt !== undefined
      ? { askedAt: asked.askedAt }
      : {}),
    ...(listed.startedAt === undefined && asked.startedAt !== undefined
      ? { startedAt: asked.startedAt }
      : {}),
  }
}

/**
 * The view of `asset` from its read and its step. A file read there is
 * shown, whatever the step says; one home holds none of is shown by its
 * step, made included (made since the file was read, which the page reads
 * again as the step moves), and hidden when there is none (an older home,
 * whose page showed no such file).
 */
export function assetView<A extends ShownAsset>(
  asset: A,
  read: AssetRead<A> | undefined,
  step: Step | undefined
): AssetView<A> {
  if (read === undefined || read.kind === "unreadable")
    return { kind: "hidden" }
  if (read.kind === "there") return read
  if (step === undefined) return { kind: "hidden" }
  switch (step.state) {
    case "missing": {
      return { kind: "missing", generate: isAloneAsset(asset) ? asset : null }
    }
    case "asked":
    case "waiting":
    case "rendering":
    case "done":
    case "failed":
    case "blocked": {
      return { kind: "line", step }
    }
    default: {
      return assertNever(step.state)
    }
  }
}

/** What asking home to make a file came to. */
export type Produced =
  /** Home took the ask, or has the file or was making it: where it stands. */
  | { readonly kind: "step"; readonly step: Step }
  /** Home holds no such episode, or is from before this ask. */
  | { readonly kind: "older" }
  | { readonly kind: "unreadable" }

/**
 * Home's answer to `POST …/produce` of `asset`: a step on 202 (taken, or
 * already under way), 200 (made) and 409 (stopped, with why), so long as it
 * is the step of the file asked for; 404 for an episode home doesn't hold,
 * and 422 for a file home won't make on its own (chapters, which come with
 * the video and the page never asks for), each said as home can't.
 */
export function readProduced(
  asset: EpisodeAsset,
  answer: HomeAnswer
): Produced {
  if (answer.status === 404 || answer.status === 405 || answer.status === 422)
    return { kind: "older" }
  if (answer.status !== 200 && answer.status !== 202 && answer.status !== 409)
    return { kind: "unreadable" }
  const step = readAs(StepSchema, answer.body)
  return step?.asset === asset ? { kind: "step", step } : { kind: "unreadable" }
}
