import { addDays, assertNever } from "@some-ui/core-utils"

import type { Decisions } from "./decisions"
import type { Digest } from "./digest"
import type { Track } from "./policy"
import { LAPSE_DAYS, MAX_OPEN_PICKS, TRACKS } from "./policy"

/** A pick still waiting on me, as the digest that picked it names it. */
export type OpenPick = {
  day: string
  pickId: string
  fingerprint: string
  track: Track
  title: string
  company: string
}

type Stands = Decisions["picks"][number]

/** The day a pick of `digestDay`'s digest lapses on, if nothing answers it. */
export function lapsesOn(digestDay: string): string {
  return addDays(digestDay, LAPSE_DAYS)
}

/**
 * Whether a pick of `digestDay`'s digest that no decision answers has lapsed
 * by `today`: it waited `LAPSE_DAYS` days untouched. The phone holds its own
 * record to the same rule (`openOf` in `apps/www/src/lib/jobs/model.ts`).
 */
export function hasLapsed(digestDay: string, today: string): boolean {
  return lapsesOn(digestDay) <= today
}

/**
 * Where a pick's standing decision leaves it: open (none yet, untouched, or
 * taken with no debrief), lapsed (none yet or untouched, for `LAPSE_DAYS`
 * days), or done.
 */
function standing(
  stands: Stands | undefined,
  digestDay: string,
  today: string
): "open" | "lapsed" | "done" {
  const untouched = (): "open" | "lapsed" =>
    hasLapsed(digestDay, today) ? "lapsed" : "open"
  if (stands === undefined) return untouched()
  switch (stands.decision) {
    case "untouched": {
      return untouched()
    }
    case "taken": {
      return stands.debrief === null ? "open" : "done"
    }
    case "passed":
    case "archived": {
      return "done"
    }
    default: {
      return assertNever(stands.decision)
    }
  }
}

/** The queue a run finds on `today`, before it picks (ROUTINE.md §2). */
export type Queue = {
  /** Every pick still open, oldest digest first. */
  open: ReadonlyArray<OpenPick>
  /** The picks that lapsed and no earlier digest's `queue.lapsed` names. */
  lapsed: ReadonlyArray<OpenPick>
}

/**
 * The picks of `digests` still open on what `decisions` say, and those that
 * lapse on `today`, oldest digest first. The newest file's entry for a pick
 * is the decision that stands, the same rule the run reads them by
 * (ROUTINE.md §2). Only shared files count: a pick decided on the phone and
 * not shared yet is still open here, or lapses. A pick a later share takes
 * after it lapsed is open again.
 */
export function queueOf(
  digests: ReadonlyArray<Digest>,
  decisions: ReadonlyArray<Decisions>,
  today: string
): Queue {
  const stands = new Map<string, Stands>()
  const byShare = [...decisions].sort((a, b) =>
    a.sharedAt.localeCompare(b.sharedAt)
  )
  for (const file of byShare) {
    for (const pick of file.picks)
      stands.set(`${pick.day}/${pick.pickId}`, pick)
  }
  const recorded = new Set(
    digests.flatMap((d) =>
      (d.queue?.lapsed ?? []).map((l) => `${l.day}/${l.pickId}`)
    )
  )
  const open: Array<OpenPick> = []
  const lapsed: Array<OpenPick> = []
  for (const digest of [...digests].sort((a, b) =>
    a.day.localeCompare(b.day)
  )) {
    for (const pick of digest.picks) {
      const key = `${digest.day}/${pick.id}`
      const now = standing(stands.get(key), digest.day, today)
      if (now === "done" || (now === "lapsed" && recorded.has(key))) continue
      const entry = {
        day: digest.day,
        pickId: pick.id,
        fingerprint: pick.fingerprint,
        track: pick.track,
        title: pick.posting.title,
        company: pick.posting.company,
      }
      if (now === "open") open.push(entry)
      else lapsed.push(entry)
    }
  }
  return { open, lapsed }
}

/**
 * How many new picks each track has room for while `open` holds its slots;
 * a pick whose posting `closed` holds none.
 */
export function freeSlots(
  open: ReadonlyArray<{ track: Track; closed?: boolean }>
): Record<Track, number> {
  const free = { ...MAX_OPEN_PICKS }
  for (const pick of open) if (pick.closed !== true) free[pick.track] -= 1
  for (const track of TRACKS) free[track] = Math.max(0, free[track])
  return free
}
