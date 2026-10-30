/**
 * What Today opens on, read from the record: the one pick to go on with,
 * and what I have done today. Today counts up, never what is left, and says
 * nothing of it until something is done: a line about what wasn't done
 * primes the visit with it (`routes/_dashboard/_apk/foyer.tsx`).
 */
import type { Pick } from "@some-ui/job-desk"

import type { JobEvent, JobsState } from "./model"
import { openOf, progressOf } from "./model"

/**
 * The pick Today opens on, Pacific day `today`: one I took and haven't
 * ended, the oldest first, else the first untouched pick of the digest on
 * show, then of the newest other digest; null once none is open or all the
 * untouched ones lapsed.
 */
export function nextPick(
  state: JobsState,
  today: string
): { day: string; pick: Pick } | null {
  const open = openOf(state, today)
  const started = open.find(({ day, pick }) => {
    const progress = progressOf(state, day, pick.id)
    return progress.kind === "open" && progress.step > 0
  })
  if (started) return started
  // `openOf` is oldest digest first, each in its own order; sorting is stable.
  const fresh = [...open].sort(
    (a, b) =>
      Number(b.day === state.current) - Number(a.day === state.current) ||
      b.day.localeCompare(a.day)
  )
  return fresh[0] ?? null
}

/**
 * What counts as something done: a step on a pick, a posting read, a scout,
 * a reply logged.
 */
const DONE: ReadonlySet<JobEvent["type"]> = new Set([
  "read",
  "taken",
  "passed",
  "resume-ready",
  "apply-opened",
  "fit-note",
  "debrief",
  "outcome",
  "outcome-withdrawn",
  "disagree",
  "scout",
])

/**
 * How many things I did on local `day`. Opening a pick's posting again
 * counts once.
 */
export function doneOn(
  state: JobsState,
  day: string,
  dayOf: (at: Date) => string
): number {
  const opened = new Set<string>()
  return state.log.filter((e) => {
    if (!DONE.has(e.type) || dayOf(new Date(e.at)) !== day) return false
    if (e.type !== "apply-opened") return true
    const key = `${e.day}/${e.pickId}`
    if (opened.has(key)) return false
    opened.add(key)
    return true
  }).length
}
