/**
 * What the interview week keeps on this phone (IW5), each in one
 * `localStorage` record read and written only through core-utils' `openKept`
 * and `writeKept` (KR1), so a value that can't be read whole is moved aside,
 * never written over:
 *
 * - **The weeks held** (`heldWeeks`), as `./home` reads them from home, each
 *   the copy first read under its id, so the questions a draft answers never
 *   change under it.
 * - **A draft per week** (`interviewDrafts`), written over freely: nothing in
 *   it has left the phone.
 * - **The weeks sent** (`interviewSent`), which only grow.
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

import type { InterviewSent } from "./spec"

const WEEKS_KEY = "some-ui:interview-week.weeks"
const DRAFTS_KEY = "some-ui:interview-week.drafts"
const SENT_KEY = "some-ui:interview-week.sent"

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
  answers: z.array(z.object({ question: z.string(), ...Taken })),
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
