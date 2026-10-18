import { assertNever } from "@some-ui/core-utils"

import type { Decisions } from "./decisions"
import type { Digest } from "./digest"
import type { Track } from "./policy"
import { MAX_OPEN_PICKS, TRACKS } from "./policy"

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

/**
 * Whether a pick's standing decision leaves it open: none yet, untouched, or
 * taken with no debrief. Passed, archived, or debriefed (`submitted`,
 * `gave-up`, `closed`) is done.
 */
function isOpen(stands: Stands | undefined): boolean {
  if (stands === undefined) return true
  switch (stands.decision) {
    case "untouched": {
      return true
    }
    case "taken": {
      return stands.debrief === null
    }
    case "passed":
    case "archived": {
      return false
    }
    default: {
      return assertNever(stands.decision)
    }
  }
}

/**
 * Every pick of `digests` still open on what `decisions` say, oldest digest
 * first. The newest file's entry for a pick is the decision that stands, the
 * same rule the run reads them by (ROUTINE.md §2). Only shared files count:
 * a pick decided on the phone and not shared yet is still open here.
 */
export function openPicks(
  digests: ReadonlyArray<Digest>,
  decisions: ReadonlyArray<Decisions>
): ReadonlyArray<OpenPick> {
  const stands = new Map<string, Stands>()
  const byShare = [...decisions].sort((a, b) =>
    a.sharedAt.localeCompare(b.sharedAt)
  )
  for (const file of byShare) {
    for (const pick of file.picks)
      stands.set(`${pick.day}/${pick.pickId}`, pick)
  }
  return [...digests]
    .sort((a, b) => a.day.localeCompare(b.day))
    .flatMap((digest) =>
      digest.picks
        .filter((pick) => isOpen(stands.get(`${digest.day}/${pick.id}`)))
        .map((pick) => ({
          day: digest.day,
          pickId: pick.id,
          fingerprint: pick.fingerprint,
          track: pick.track,
          title: pick.posting.title,
          company: pick.posting.company,
        }))
    )
}

/**
 * How many new picks each track has room for while `open` holds its slots;
 * a pick in `closed` (by `day/pickId`) holds none.
 */
export function freeSlots(
  open: ReadonlyArray<{ day: string; pickId: string; track: Track }>,
  closed: ReadonlySet<string> = new Set()
): Record<Track, number> {
  const free = { ...MAX_OPEN_PICKS }
  for (const pick of open) {
    if (!closed.has(`${pick.day}/${pick.pickId}`)) free[pick.track] -= 1
  }
  for (const track of TRACKS) free[track] = Math.max(0, free[track])
  return free
}
