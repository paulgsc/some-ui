/**
 * The logger's form, as a value and a pure step. It is the only thing the
 * keypad, the chips and the side switch change, so what a sequence of taps
 * leaves behind is testable without rendering anything.
 *
 * Two sides, one form: "mine" is my figure for a checkpoint, today or a day
 * I missed (`loggableDays`), "theirs" is a reported figure for an entry that
 * is waiting on one.
 */
import { assertNever, dayOf } from "@some-ui/core-utils"

import type { AphSettings, Entry, Review } from "./model"
import {
  awaitingTheirs,
  checkpointById,
  draftWaiting,
  dueCheckpoint,
  hasMine,
  live,
  loggableDays,
  minutesOf,
  primary,
} from "./model"

export type Side = "mine" | "theirs"

export type Draft = {
  side: Side
  /** What has been typed, digits only. */
  digits: string
  /** Mine only: written with a "~". */
  approx: boolean
  /** Mine only: the day it is for, or null for today, whatever day it is at the tap. */
  day: string | null
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
  | { type: "pickDay"; day: string | null }
  | { type: "pickTarget"; target: string }
  | { type: "toggleLabel"; label: string }

/** Five digits is past any figure seen so far by an order of magnitude. */
export const MAX_DIGITS = 5

export function newDraft(
  side: Side,
  checkpoint: string | null,
  target: string | null,
  day: string | null = null
): Draft {
  return {
    side,
    digits: "",
    approx: true,
    day,
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
    case "pickDay": {
      return { ...draft, day: event.day }
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

export function draftDay(draft: Draft, today: string): string {
  return draft.day ?? today
}

/**
 * The checkpoint a new figure of mine goes to by default at a moment: today,
 * the one the clock says is due; on a day I went back to, whose windows have
 * all closed, the first one that day is still missing.
 */
function defaultCheckpoint(
  settings: AphSettings,
  entries: ReadonlyArray<Entry>,
  day: string,
  at: Date
): string | null {
  const today = dayOf(at)
  const due =
    day === today
      ? dueCheckpoint(settings, entries, today, minutesOf(at))
      : settings.checkpoints.find((c) => !hasMine(entries, day, c.id))
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
      : defaultCheckpoint(settings, entries, draftDay(draft, dayOf(at)), at),
    target: draft.target ?? awaitingTheirs(settings, entries)[0]?.id ?? null,
  }
}

export function draftValue(draft: Draft): number | null {
  return draft.digits === "" ? null : Number(draft.digits)
}

/** The entries after a save, and the id of the entry the figure landed on. */
export type Saved = { entries: Array<Entry>; id: string }

export type Commit = {
  /** Local day at the tap: a figure of mine is for it unless the draft names a day. */
  today: string
  /** Clock time at the tap, for an entry of mine today off the checkpoints ("16:05"). */
  time: string
  /** Id for a new entry. */
  id: string
}

/**
 * The entries after saving `draft`, with the id of the entry the figure
 * landed on (an existing one when it rewrote one), or null when there is
 * nothing to save (no figure, theirs with no entry chosen, or mine for a day
 * further back than `loggableDays` reaches).
 *
 * A new entry is a draft, on this phone alone until I submit it, and none is
 * logged while another day holds drafts (`draftWaiting`): those are
 * submitted or deleted first.
 *
 * A checkpoint holds one entry a day, so mine at a checkpoint where the day
 * already has one (`rewriting`) rewrites it: my figure becomes the draft's,
 * and its labels too when I picked any (none picked keeps the ones it has),
 * and any call I made on it is cleared, since a changed figure deserves a
 * fresh look. Their figure, if reported, stays. Off the
 * checkpoints, every figure is a new entry at its own clock time.
 * Theirs lands on its target and clears any earlier call on it likewise.
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

  // The draft's day is checked here, at the tap, not when it was picked: a
  // form left open past midnight can have carried it out of reach.
  const day = draftDay(draft, commit.today)
  if (!loggableDays(settings, commit.today).includes(day)) return null

  const mine = { value, approx: draft.approx }
  const there = rewriting(entries, draft, day)
  if (there !== undefined) {
    return {
      id: there.id,
      entries: entries.map((e) =>
        e === there
          ? {
              ...e,
              mine,
              labels: draft.labels.length > 0 ? draft.labels : e.labels,
              review: null,
            }
          : e
      ),
    }
  }
  // A new entry waits while another day holds drafts (`draftWaiting`).
  if (draftWaiting(entries, day) !== null) return null
  const checkpoint = checkpointById(settings, draft.checkpoint)
  return {
    id: commit.id,
    entries: [
      ...entries,
      {
        id: commit.id,
        day,
        checkpoint: checkpoint?.id ?? null,
        // The clock's time is only true of today.
        time: checkpoint === null && day === commit.today ? commit.time : null,
        mine,
        theirs: null,
        goal: checkpoint?.goal ?? null,
        labels: draft.labels,
        note: null,
        review: null,
        draft: true,
      },
    ],
  }
}

/**
 * The entry saving `draft` on `day` would rewrite rather than add beside:
 * mine at a checkpoint where the day already has an entry standing. Where
 * two stand from before one entry a time was the rule, the one `primary`
 * reads.
 */
export function rewriting(
  entries: ReadonlyArray<Entry>,
  draft: Draft,
  day: string
): Entry | undefined {
  if (draft.side !== "mine" || draft.checkpoint === null) return undefined
  return primary(live(entries), day, draft.checkpoint)
}

/**
 * Entry `id` with my figure rewritten, from the entry itself: the fix for a
 * figure I mistyped, wherever it was logged. Clears my call on it, as a save
 * from the logger does.
 */
export function rewriteMine(
  entries: ReadonlyArray<Entry>,
  id: string,
  mine: { value: number; approx: boolean }
): Array<Entry> {
  return entries.map((e) => (e.id === id ? { ...e, mine, review: null } : e))
}

/**
 * The drafts among `ids` submitted: each goes home from now on, and is never
 * a draft again. Their key goes, rather than turning false, so a submitted
 * entry has the shape home reads.
 */
export function submitEntries(
  entries: ReadonlyArray<Entry>,
  ids: ReadonlyArray<string>
): Array<Entry> {
  return entries.map((e) => {
    if (!ids.includes(e.id) || e.draft !== true) return e
    const { draft: _draft, ...submitted } = e
    return submitted
  })
}

/**
 * Draft `id` deleted outright: it was never submitted, so nothing else holds
 * it. Unchanged for an entry that is not a draft, which is removed instead
 * (`removeEntry`).
 */
export function deleteDraft(
  entries: ReadonlyArray<Entry>,
  id: string
): Array<Entry> {
  return entries.filter((e) => e.id !== id || e.draft !== true)
}

/**
 * Entry `id` removed from the log: a figure at the wrong time, or a second
 * one at a time already logged. It stops counting, and the record keeps it
 * as it was (`removed` in model.ts). A draft is deleted instead
 * (`deleteDraft`), so this leaves one as it is.
 */
export function removeEntry(
  entries: ReadonlyArray<Entry>,
  id: string
): Array<Entry> {
  return entries.map((e) =>
    e.id === id && e.draft !== true ? { ...e, removed: true } : e
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
