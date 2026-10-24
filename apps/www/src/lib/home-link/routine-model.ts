/**
 * Korean's look at what the reflections routine left on the paired home
 * (LA12, docs/learner-data-authority.md): the person's choice to show it,
 * and the one read at a time. Pure; `./routine` runs it.
 *
 * The choice is a log that only grows, as the consent log is
 * (`./consent-model`), and for the pairing it was made under alone: a new
 * pairing, even to the same address, starts with nothing shown. It is not a
 * scope of that log: home keeps no choice for a read, which sends nothing
 * of the person's.
 *
 * What home answered is held in memory only, for the choice it was read
 * under (`Under`): a stop, an unpairing or a new pairing leaves nothing of
 * it to show.
 */
import { assertNever } from "@some-ui/core-utils"

import { isRecord } from "@/lib/device-backend/common"

/** One choice, as made: shown or hidden, under which pairing, with the words pressed. */
export type ReadChoice = {
  readonly kind: "shown" | "hidden"
  readonly pairing: string
  /** This phone's clock. */
  readonly at: number
  /** The words the person pressed yes to, exactly as they were shown. */
  readonly said: string
}

export type ReadLog = ReadonlyArray<ReadChoice>

/** Since when the routine's files are shown under `pairing`, or null. */
export function shownNow(log: ReadLog, pairing: string | null): number | null {
  if (pairing === null) return null
  let since: number | null = null
  for (const choice of log) {
    if (choice.pairing !== pairing) continue
    if (choice.kind === "hidden") since = null
    else since ??= choice.at
  }
  return since
}

/**
 * `log` with `choice` at its end, or `log` itself when it changes nothing
 * (showing what is shown, hiding what is not). Never edits a choice.
 */
export function appendedRead(log: ReadLog, choice: ReadChoice): ReadLog {
  const shown = shownNow(log, choice.pairing) !== null
  if (shown === (choice.kind === "shown")) return log
  return [...log, choice]
}

function choiceOf(value: unknown): ReadChoice | null {
  if (!isRecord(value)) return null
  const { kind, pairing, at, said } = value
  if (kind !== "shown" && kind !== "hidden") return null
  if (typeof pairing !== "string" || typeof at !== "number") return null
  if (typeof said !== "string") return null
  return { kind, pairing, at, said }
}

/** The log stored as `text`, or `null` when it cannot be read as one. */
export function parseReadLog(text: string): ReadLog | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const log: Array<ReadChoice> = []
  for (const value of parsed) {
    const choice = choiceOf(value)
    if (choice === null) return null
    log.push(choice)
  }
  return log
}

/** The choice a read is made under: its pairing, and since when it was shown there. */
export type Under = { readonly pairing: string; readonly since: number }

export const sameUnder = (a: Under | null, b: Under | null): boolean =>
  a !== null && b !== null && a.pairing === b.pairing && a.since === b.since

/** Under which choice a read may be made now, or null when none is shown. */
export function underNow(log: ReadLog, pairing: string | null): Under | null {
  const since = shownNow(log, pairing)
  return pairing === null || since === null ? null : { pairing, since }
}

/** How the last read ended, and when. */
export type LastRead = {
  readonly kind: "read" | "busy" | "unreachable" | "forgotten" | "failed"
  readonly at: number
}

export type ReadState = {
  /** Home's last answer, as it came, for the choice it was read under. */
  readonly answer: { readonly under: Under; readonly files: unknown } | null
  /** A read is on its way. */
  readonly reading: boolean
  readonly last: LastRead | null
}

export const INITIAL_READ: ReadState = {
  answer: null,
  reading: false,
  last: null,
}

export type ReadEvent =
  | { readonly type: "started" }
  /** Home answered, under `under`, which is still shown. */
  | {
      readonly type: "answered"
      readonly under: Under
      readonly files: unknown
      readonly at: number
    }
  | {
      readonly type: "ended"
      readonly kind: Exclude<LastRead["kind"], "read">
      readonly at: number
    }
  /** The read ended with nothing to keep: stopped, or no longer shown. */
  | { readonly type: "dropped" }
  /** What was read is no longer shown: stopped, unpaired or paired anew. */
  | { readonly type: "cleared" }

/**
 * Whether a read may start now: shown under the pairing the phone holds,
 * with the app in front, and none on its way.
 */
export function mayRead(
  state: ReadState,
  facts: { readonly under: Under | null; readonly visible: boolean }
): boolean {
  return facts.under !== null && facts.visible && !state.reading
}

/** What may be shown under `under`: the last answer read under it, or none. */
export function heldFor(state: ReadState, under: Under | null): unknown {
  return state.answer !== null && sameUnder(state.answer.under, under)
    ? state.answer.files
    : null
}

export function stepRead(state: ReadState, event: ReadEvent): ReadState {
  switch (event.type) {
    case "started": {
      return state.reading ? state : { ...state, reading: true }
    }
    case "answered": {
      if (!state.reading) return state
      return {
        answer: { under: event.under, files: event.files },
        reading: false,
        last: { kind: "read", at: event.at },
      }
    }
    case "ended": {
      if (!state.reading) return state
      return {
        ...state,
        reading: false,
        last: { kind: event.kind, at: event.at },
      }
    }
    case "dropped": {
      return state.reading ? { ...state, reading: false } : state
    }
    case "cleared": {
      if (state.answer === null && state.last === null) return state
      return { ...state, answer: null, last: null }
    }
    default: {
      return assertNever(event)
    }
  }
}
