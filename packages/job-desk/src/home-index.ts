import { z } from "zod"

import { decisionsFileDay } from "./decisions"
import { scoutsFileDay } from "./scouts"

/**
 * Home's Jobs index, as far as the run reads it to decide whether it stands
 * (ROUTINE.md §0.5). Home writes the whole of it (paulgsc/server
 * `mailbox::index`); the run holds it to these fields and nothing deeper.
 */
const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const HomeIndexSchema = z.object({
  schema: z.literal("some-ui.routine-index/1"),
  routine: z.literal("jobs"),
  /** The day home computed it, in America/Los_Angeles. */
  day: DaySchema,
  /**
   * The last day its queue holds with nothing new arriving (the day before
   * an open pick would lapse), or `null` when no open pick can lapse.
   */
  validThrough: DaySchema.nullable(),
  from: z.object({
    digests: z.array(z.string()),
    decisions: z.array(z.string()),
    scout: z.array(z.string()),
  }),
})

/**
 * The first day the phone files every Jobs file home: a file named for an
 * earlier day may be one only Drive holds, which the mailbox takes as the
 * backfill (paulgsc/some-ui#2393). The Worker holds the same day
 * (`DRIVE_ONLY_ENDED` in `apps/mailbox/src/core.ts`), which cannot import
 * this package.
 */
const DRIVE_ONLY_ENDED = "2026-11-04"

/**
 * What Drive's `some-ui jobs/` folders hold, by file name. Only the Jobs
 * files in each are compared (a digest, a decisions file, a scouts file), so
 * the voice notes beside them in `Decisions/` and `Scout/` are not.
 */
export type DriveListing = {
  readonly brief: ReadonlyArray<string>
  readonly decisions: ReadonlyArray<string>
  readonly scout: ReadonlyArray<string>
}

/** Whether home's index stands for today's run, and what to put back for home. */
export type IndexStanding = {
  readonly stands: boolean
  /** Why it doesn't stand, in plain words; empty when it does. */
  readonly why: ReadonlyArray<string>
  /** Digests Drive holds that the index lacks: put each in `brief`. */
  readonly digests: ReadonlyArray<string>
  /**
   * Decisions and scouts files only Drive holds, named for a day before
   * `DRIVE_ONLY_ENDED`, that the index lacks: the one-time backfill, each put
   * in `brief` under its Drive name.
   */
  readonly backfill: ReadonlyArray<string>
  /**
   * Files named for `DRIVE_ONLY_ENDED` or later that only Drive holds: the
   * mailbox refuses them, and none is expected, since the phone files them
   * home.
   */
  readonly later: ReadonlyArray<string>
}

const isDecisions = (name: string): boolean => decisionsFileDay(name) !== null
const isScouts = (name: string): boolean => scoutsFileDay(name) !== null

/**
 * ROUTINE.md §0.5: home's index stands for a run on `today` when it reads
 * as one, it was computed no later than today, today is no later than its
 * `validThrough` (or nothing can lapse), and it names every file `drive`
 * holds. It says too what to put back so the next index counts it.
 */
export function indexStands(
  index: unknown,
  today: string,
  drive: DriveListing
): IndexStanding {
  const parsed = HomeIndexSchema.safeParse(index)
  const missing = (
    held: ReadonlyArray<string>,
    names: ReadonlyArray<string>
  ): Array<string> => names.filter((name) => !held.includes(name))
  if (!parsed.success) {
    // Nothing to compare with: put nothing back, and count it all from Drive.
    return {
      stands: false,
      why: ["Home's index doesn't read as a Jobs index."],
      digests: [],
      backfill: [],
      later: [],
    }
  }
  const { from, day, validThrough } = parsed.data
  const digests = missing(
    from.digests,
    drive.brief.filter((name) => /^digest-.*\.json$/.test(name))
  )
  const files = [
    ...missing(from.decisions, drive.decisions.filter(isDecisions)),
    ...missing(from.scout, drive.scout.filter(isScouts)),
  ]
  const before = (name: string): boolean => {
    const day = decisionsFileDay(name) ?? scoutsFileDay(name)
    return day !== null && day < DRIVE_ONLY_ENDED
  }
  const backfill = files.filter(before)
  const later = files.filter((name) => !before(name))
  const why: Array<string> = []
  if (day > today) why.push(`Home's index is for ${day}, after today.`)
  if (validThrough !== null && today > validThrough) {
    why.push(
      `Home's index holds through ${validThrough}; a pick has lapsed since.`
    )
  }
  if (digests.length + files.length > 0) {
    why.push(
      `Home hasn't counted ${String(digests.length + files.length)} file(s) Drive holds.`
    )
  }
  return { stands: why.length === 0, why, digests, backfill, later }
}
