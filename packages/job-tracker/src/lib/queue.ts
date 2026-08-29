import type { JobEntry, JobStatus, NewJobInput } from "./types"

/**
 * A small, fixed cap rather than a growing archive. The point of this
 * package is a queue of leads actively being worked, not a permanent log of
 * every application ever made — an unbounded list only ever grows stale, so
 * once it's full the only way to add another lead is to finish or discard
 * one already in it (see `enqueue`'s `"full"` result).
 */
export const MAX_QUEUE_SIZE = 15

export type EnqueueResult =
  | { ok: true; queue: ReadonlyArray<JobEntry>; entry: JobEntry }
  | { ok: false; reason: "full"; capacity: number }
  | { ok: false; reason: "invalid"; message: string }

// "offer" and "rejected" are terminal — the lead is resolved, not still
// being worked. Counting them against the cap would mean the only way to
// record an outcome is to immediately delete it, which defeats having a
// status at all. Capacity is about how many leads are *active*.
const ACTIVE_STATUSES: ReadonlySet<JobStatus> = new Set([
  "saved",
  "applied",
  "interviewing",
])

function isActive(entry: JobEntry): boolean {
  return ACTIVE_STATUSES.has(entry.status)
}

export function isFull(queue: ReadonlyArray<JobEntry>): boolean {
  return queue.filter(isActive).length >= MAX_QUEUE_SIZE
}

function normalize(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * `id` and `addedAt` are supplied by the caller rather than generated here
 * (`crypto.randomUUID()`, `Date.now()`) so this stays a pure function of its
 * arguments — the same reason `packages/activity-catalog`'s pure functions
 * take their inputs explicitly. The impure edge (id/clock) belongs in the
 * repository that calls this, not in the domain logic itself.
 */
export function enqueue(
  queue: ReadonlyArray<JobEntry>,
  input: NewJobInput,
  id: string,
  addedAt: string
): EnqueueResult {
  const company = normalize(input.company)
  const role = normalize(input.role)
  if (company === null || role === null) {
    return {
      ok: false,
      reason: "invalid",
      message: "Company and role are both required.",
    }
  }
  if (isFull(queue)) {
    return { ok: false, reason: "full", capacity: MAX_QUEUE_SIZE }
  }

  const entry: JobEntry = {
    id,
    company,
    role,
    url: normalize(input.url),
    status: input.status ?? "saved",
    notes: normalize(input.notes),
    addedAt,
  }
  return { ok: true, queue: [...queue, entry], entry }
}

export function removeEntry(
  queue: ReadonlyArray<JobEntry>,
  id: string
): ReadonlyArray<JobEntry> {
  return queue.filter((entry) => entry.id !== id)
}

export function updateEntryStatus(
  queue: ReadonlyArray<JobEntry>,
  id: string,
  status: JobStatus
): ReadonlyArray<JobEntry> {
  return queue.map((entry) => (entry.id === id ? { ...entry, status } : entry))
}

/**
 * The entry a "make room" affordance should offer to remove when the queue
 * is full — scoped to active entries, same as `isFull`, since a resolved
 * ("offer"/"rejected") entry isn't what's holding the queue at capacity and
 * removing one wouldn't free a slot. Age is the natural order within that
 * set: the queue is a FIFO by intent among the leads actually being worked.
 */
export function oldestEntry(queue: ReadonlyArray<JobEntry>): JobEntry | null {
  const active = queue.filter(isActive)
  if (active.length === 0) return null
  return active.reduce((oldest, entry) =>
    entry.addedAt < oldest.addedAt ? entry : oldest
  )
}
