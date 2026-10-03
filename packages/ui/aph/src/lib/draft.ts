/**
 * The logger's form, as a value and a pure step. It is the only thing the
 * keypad, the chips and the side switch change, so what a sequence of taps
 * leaves behind is testable without rendering anything.
 *
 * Two sides, one form: "mine" is my figure for a checkpoint today, "theirs"
 * is a reported figure for an entry that is waiting on one.
 */
import type { AphSettings, Entry, Review } from "./model"
import {
  awaitingTheirs,
  checkpointById,
  dayOf,
  dueCheckpoint,
  minutesOf,
} from "./model"

export type Side = "mine" | "theirs"

export type Draft = {
  side: Side
  /** What has been typed, digits only. */
  digits: string
  /** Mine only: written with a "~". */
  approx: boolean
  /**
   * Mine only: the checkpoint, or null for another time of day. Until
   * `pinned`, a default that `atTime` replaces with the clock's.
   */
  checkpoint: string | null
  /**
   * Whether I chose the checkpoint. Until I do, it follows the clock: a form
   * left open from the morning into the noon window, or past midnight,
   * saves at the checkpoint of the moment of the tap.
   */
  pinned: boolean
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
  return {
    side,
    digits: "",
    approx: true,
    checkpoint,
    pinned: false,
    target,
    labels: [],
  }
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
      return { ...draft, checkpoint: event.checkpoint, pinned: true }
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

/** The checkpoint a new figure of mine goes to by default at a moment. */
function defaultCheckpoint(
  settings: AphSettings,
  entries: ReadonlyArray<Entry>,
  at: Date
): string | null {
  const due = dueCheckpoint(settings, entries, dayOf(at), minutesOf(at))
  return due?.id ?? settings.checkpoints[0]?.id ?? null
}

/**
 * The draft as it stands at a moment. A checkpoint I picked stays put; one I
 * did not is the clock's default for `at`. A target I named stays put; with
 * none, it is the newest entry still awaiting their figure. Both defaults
 * are derived where they are used (rendering, saving) and never stored, so
 * neither can go stale while the form sits open.
 */
export function atTime(
  draft: Draft,
  settings: AphSettings,
  entries: ReadonlyArray<Entry>,
  at: Date
): Draft {
  return {
    ...draft,
    checkpoint: draft.pinned
      ? draft.checkpoint
      : defaultCheckpoint(settings, entries, at),
    target: draft.target ?? awaitingTheirs(settings, entries)[0]?.id ?? null,
  }
}

export function draftValue(draft: Draft): number | null {
  return draft.digits === "" ? null : Number(draft.digits)
}

/** The entries after a save, and the id of the entry the figure landed on. */
export type Saved = { entries: Array<Entry>; id: string }

export type Commit = {
  /** Local day for a new entry of mine. */
  day: string
  /** Clock time for an entry of mine off the checkpoints ("16:05"). */
  time: string
  /** Id for a new entry. */
  id: string
}

/**
 * The entries after saving `draft`, with the id of the entry the figure
 * landed on (an existing one when it filled in or corrected), or null when
 * there is nothing to save
 * (no figure, or theirs with no entry chosen).
 *
 * Mine at a checkpoint where today already holds a reported figure but none
 * of mine fills that entry in, so the two meet; an unlabelled figure where
 * one is already logged corrects it (`correcting`); otherwise it is a new
 * entry.
 * Theirs lands on its target and clears any earlier call on it: a new
 * figure deserves a fresh look.
 */
export function commitDraft(
  settings: AphSettings,
  entries: ReadonlyArray<Entry>,
  draft: Draft,
  commit: Commit
): Saved | null {
  const value = draftValue(draft)
  if (value === null) return null

  if (draft.side === "theirs") {
    // Only onto an entry still awaiting it. The draft's target is a
    // reference from wherever the form was opened (a link, Back), and the
    // entry may have been filled since: writing over it would replace their
    // figure and clear my call without either being on screen.
    const target = draft.target
    if (
      target === null ||
      !awaitingTheirs(settings, entries).some((e) => e.id === target)
    ) {
      return null
    }
    return {
      id: target,
      entries: entries.map((e) =>
        e.id === target ? { ...e, theirs: { value }, review: null } : e
      ),
    }
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
    return {
      id: reportedOnly.id,
      entries: entries.map((e) =>
        e === reportedOnly ? { ...e, mine, labels: draft.labels } : e
      ),
    }
  }
  // An unlabelled figure where one is already logged corrects it: the day
  // has one plain figure per checkpoint, the one `primary` reads. A changed
  // figure deserves a fresh look, so any earlier call on it is cleared.
  const corrected = correcting(entries, draft, commit.day)
  if (corrected !== undefined) {
    return {
      id: corrected.id,
      entries: entries.map((e) =>
        e === corrected ? { ...e, mine, review: null } : e
      ),
    }
  }
  const checkpoint = checkpointById(settings, draft.checkpoint)
  return {
    id: commit.id,
    entries: [
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
    ],
  }
}

/**
 * The entry saving `draft` on `day` would correct rather than add to: mine
 * at a checkpoint, unlabelled, where an unlabelled figure of mine is already
 * logged. A labelled figure there is a comparison and is added beside it.
 */
export function correcting(
  entries: ReadonlyArray<Entry>,
  draft: Draft,
  day: string
): Entry | undefined {
  if (draft.side !== "mine" || draft.checkpoint === null) return undefined
  if (draft.labels.length > 0) return undefined
  return entries.find(
    (e) =>
      e.day === day &&
      e.checkpoint === draft.checkpoint &&
      e.mine !== null &&
      e.labels.length === 0
  )
}

/**
 * Whether giving entry `id` these `labels` keeps at most one plain
 * (unlabelled) entry at its checkpoint that day: the one `primary` reads.
 * Clearing a comparison's last label beside a plain figure would make two,
 * and the second would count in History but nowhere else.
 */
export function keepsOnePlain(
  entries: ReadonlyArray<Entry>,
  id: string,
  labels: ReadonlyArray<string>
): boolean {
  if (labels.length > 0) return true
  const entry = entries.find((e) => e.id === id)
  if (entry === undefined) return true
  if (entry.checkpoint === null) return true
  return !entries.some(
    (e) =>
      e.id !== id &&
      e.day === entry.day &&
      e.checkpoint === entry.checkpoint &&
      e.labels.length === 0
  )
}

/** Record my call on an entry, or take it back with null. */
export function reviewEntry(
  entries: ReadonlyArray<Entry>,
  id: string,
  review: Review | null
): Array<Entry> {
  return entries.map((e) => (e.id === id ? { ...e, review } : e))
}
