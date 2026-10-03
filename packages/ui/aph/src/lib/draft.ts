/**
 * The logger's form, as a value and a pure step. It is the only thing the
 * keypad, the chips and the side switch change, so what a sequence of taps
 * leaves behind is testable without rendering anything.
 *
 * Two sides, one form: "mine" is my figure for a checkpoint today, "theirs"
 * is a reported figure for an entry that is waiting on one.
 */
import type { AphSettings, Entry, Review } from "./model"
import { checkpointById } from "./model"

export type Side = "mine" | "theirs"

export type Draft = {
  side: Side
  /** What has been typed, digits only. */
  digits: string
  /** Mine only: written with a "~". */
  approx: boolean
  /** Mine only: the checkpoint, or null for another time of day. */
  checkpoint: string | null
  /** Theirs only: the entry whose figure this is. */
  target: string | null
  /** Mine only. */
  labels: ReadonlyArray<string>
}

export type DraftEvent =
  | { type: "digit"; digit: string }
  | { type: "backspace" }
  /** -/+ step, from what is typed, else from `base` (the goal, or mine). */
  | { type: "nudge"; by: number; base: number }
  | { type: "toggleApprox" }
  | { type: "side"; side: Side }
  | { type: "pickCheckpoint"; checkpoint: string | null }
  | { type: "pickTarget"; target: string }
  | { type: "toggleLabel"; label: string }

/** Five digits is past any figure seen so far by an order of magnitude. */
const MAX_DIGITS = 5

export function newDraft(
  side: Side,
  checkpoint: string | null,
  target: string | null
): Draft {
  return { side, digits: "", approx: true, checkpoint, target, labels: [] }
}

export function stepDraft(draft: Draft, event: DraftEvent): Draft {
  switch (event.type) {
    case "digit": {
      const digits = (draft.digits === "0" ? "" : draft.digits) + event.digit
      return digits.length > MAX_DIGITS ? draft : { ...draft, digits }
    }
    case "backspace": {
      return { ...draft, digits: draft.digits.slice(0, -1) }
    }
    case "nudge": {
      const from = draft.digits === "" ? event.base : Number(draft.digits)
      return { ...draft, digits: String(Math.max(0, from + event.by)) }
    }
    case "toggleApprox": {
      return { ...draft, approx: !draft.approx }
    }
    case "side": {
      return event.side === draft.side
        ? draft
        : { ...draft, side: event.side, digits: "" }
    }
    case "pickCheckpoint": {
      return { ...draft, checkpoint: event.checkpoint }
    }
    case "pickTarget": {
      return { ...draft, target: event.target, digits: "" }
    }
    case "toggleLabel": {
      return {
        ...draft,
        labels: draft.labels.includes(event.label)
          ? draft.labels.filter((l) => l !== event.label)
          : [...draft.labels, event.label],
      }
    }
    default: {
      return assertNever(event)
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled draft event: ${JSON.stringify(value)}`)
}

export function draftValue(draft: Draft): number | null {
  return draft.digits === "" ? null : Number(draft.digits)
}

export type Commit = {
  /** Local day for a new entry of mine. */
  day: string
  /** Clock time for an entry of mine off the checkpoints ("16:05"). */
  time: string
  /** Id for a new entry. */
  id: string
}

/**
 * The entries after saving `draft`, or null when there is nothing to save
 * (no figure, or theirs with no entry chosen).
 *
 * Mine at a checkpoint where today already holds a reported figure but none
 * of mine fills that entry in, so the two meet; otherwise it is a new entry.
 * Theirs lands on its target and clears any earlier call on it: a new
 * figure deserves a fresh look.
 */
export function commitDraft(
  settings: AphSettings,
  entries: ReadonlyArray<Entry>,
  draft: Draft,
  commit: Commit
): Array<Entry> | null {
  const value = draftValue(draft)
  if (value === null) return null

  if (draft.side === "theirs") {
    if (!entries.some((e) => e.id === draft.target)) return null
    return entries.map((e) =>
      e.id === draft.target ? { ...e, theirs: { value }, review: null } : e
    )
  }

  const mine = { value, approx: draft.approx }
  const reportedOnly = entries.find(
    (e) =>
      draft.checkpoint !== null &&
      e.day === commit.day &&
      e.checkpoint === draft.checkpoint &&
      e.mine === null
  )
  if (reportedOnly !== undefined) {
    return entries.map((e) =>
      e === reportedOnly ? { ...e, mine, labels: draft.labels } : e
    )
  }
  const checkpoint = checkpointById(settings, draft.checkpoint)
  return [
    ...entries,
    {
      id: commit.id,
      day: commit.day,
      checkpoint: checkpoint?.id ?? null,
      time: checkpoint === null ? commit.time : null,
      mine,
      theirs: null,
      goal: checkpoint?.goal ?? null,
      labels: draft.labels,
      note: null,
      review: null,
    },
  ]
}

/** Record my call on an entry, or take it back with null. */
export function reviewEntry(
  entries: ReadonlyArray<Entry>,
  id: string,
  review: Review | null
): Array<Entry> {
  return entries.map((e) => (e.id === id ? { ...e, review } : e))
}
