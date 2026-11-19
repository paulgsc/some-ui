/**
 * What the interview week keeps on this phone (IW5): the weeks held, each the
 * copy first read under its id, through core-utils' `openKept`/`writeKept`
 * (KR1); a draft per week and the weeks sent, through voice-capture's
 * `keptDrafts` and `keptRecords`; and each week's ladder (`./ladder`, IW8):
 * the rung each take was said on and each question's first take.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { openKept, readJson, writeKept } from "@some-ui/core-utils"
import type { InterviewWeek } from "@some-ui/interview-week"
import { InterviewWeekSchema } from "@some-ui/interview-week"
import type {
  BundleDraft,
  BundleDrafts,
  BundleRecords,
} from "@some-ui/voice-capture"
import { keptDrafts, keptRecords } from "@some-ui/voice-capture"
import { z } from "zod"

import type { Ladder } from "./ladder"
import { NO_LADDER, RUNGS } from "./ladder"
import { DEFAULT_PACE_WPM } from "./prompter"
import type { InterviewSent } from "./spec"

const WEEKS_KEY = "some-ui:interview-week.weeks"
const DRAFTS_KEY = "some-ui:interview-week.drafts"
const SENT_KEY = "some-ui:interview-week.sent"
const LADDER_KEY = "some-ui:interview-week.ladder"
const PACE_KEY = "some-ui:interview-week.band-pace"

/** The desk of the week's takes (`./index`). */
export const TAKES_KEY = "some-ui:interview-week.takes"

/** A week home holds, as this phone keeps it. */
export type HeldInterview = {
  readonly week: InterviewWeek
  /** The SHA-256 home lists it by: the copy this phone keeps. */
  readonly sha256: string
}

export type InterviewsHeld = {
  /** In the order they came. */
  readonly weeks: ReadonlyArray<HeldInterview>
  /** Weeks home served that this phone can't read, as `<id>@<sha256>`. */
  readonly unread: ReadonlyArray<string>
}

const NO_WEEKS: InterviewsHeld = { weeks: [], unread: [] }

const HeldSchema = z.object({
  weeks: z.array(z.object({ week: InterviewWeekSchema, sha256: z.string() })),
  unread: z.array(z.string()),
})

const readHeld = readJson((value) => {
  const parsed = HeldSchema.safeParse(value)
  return parsed.success ? parsed.data : null
})

export type InterviewsStore = {
  readonly held: () => InterviewsHeld
  /** Keeps `held` in place of what is stored; false when not kept. */
  readonly hold: (held: InterviewsHeld) => boolean
}

/** The weeks kept in `storage`; with none, nothing is kept. */
export function heldWeeks(storage: KeyedStorage | null): InterviewsStore {
  return {
    held: () => openKept(storage, WEEKS_KEY, readHeld, NO_WEEKS).value,
    hold: (held) => writeKept(storage, WEEKS_KEY, held, readHeld),
  }
}

/** The draft of week `week`, among every week's in `storage`. */
export const interviewDrafts = (
  storage: KeyedStorage | null,
  week: string
): BundleDrafts<BundleDraft> => keptDrafts(storage, DRAFTS_KEY, week)

const Taken = { take: z.string(), recordedAt: z.string() }

const SentSchema: z.ZodType<InterviewSent> = z.object({
  week: z.string(),
  at: z.string(),
  answers: z.array(
    z.object({
      question: z.string(),
      ...Taken,
      rung: z.enum(RUNGS).optional(),
    })
  ),
  reads: z.array(z.object({ card: z.string(), ...Taken })),
  passed: z.array(z.string()),
  passedReads: z.array(z.string()),
})

/** The weeks sent from this phone, in `storage`, which only grow. */
export const interviewSent = (
  storage: KeyedStorage | null
): BundleRecords<InterviewSent> =>
  keptRecords(storage, SENT_KEY, (value) => {
    const parsed = z.array(SentSchema).safeParse(value)
    return parsed.success ? parsed.data : null
  })

const LadderSchema = z.object({
  first: z.record(z.string(), z.string()),
  rungs: z.record(z.string(), z.enum(RUNGS)),
  asked: z
    .object({
      item: z.string(),
      rung: z.enum(RUNGS),
      before: z.array(z.string()),
    })
    .optional(),
})

const readLadders = readJson((value) => {
  const parsed = z.record(z.string(), LadderSchema).safeParse(value)
  return parsed.success ? parsed.data : null
})

export type LadderStore = {
  /** The week's ladder as kept; none kept reads as an empty one. */
  readonly read: () => Ladder
  /** Keeps `ladder` as the week's, beside every other week's; false when not kept. */
  readonly write: (ladder: Ladder) => boolean
}

/** The pace the reader set the teleprompter band to (C734), in words a minute. */
export type PaceStore = {
  /** The pace kept, or the default when none is. */
  readonly read: () => number
  /** Keeps `pace`; false when not kept. */
  readonly write: (pace: number) => boolean
}

const readPace = readJson((value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null
)

/** The band's pace, kept on this phone across weeks. */
export function bandPace(storage: KeyedStorage | null): PaceStore {
  return {
    read: () => openKept(storage, PACE_KEY, readPace, DEFAULT_PACE_WPM).value,
    write: (pace) => writeKept(storage, PACE_KEY, pace, readPace),
  }
}

/** Week `week`'s ladder, among every week's in `storage`, which are never let go. */
export function interviewLadder(
  storage: KeyedStorage | null,
  week: string
): LadderStore {
  const all = (): Readonly<Record<string, Ladder>> =>
    openKept(storage, LADDER_KEY, readLadders, {}).value
  return {
    read: () => all()[week] ?? NO_LADDER,
    write: (ladder) =>
      writeKept(storage, LADDER_KEY, { ...all(), [week]: ladder }, readLadders),
  }
}
