/**
 * Voice notes on their way to the paired home (LA13,
 * docs/learner-data-authority.md): which this phone has copied for home,
 * which home holds, and which it refused for good. Pure; `./runtime` keeps
 * the copies' audio and this record, `./home` sends them.
 *
 * A note's audio is copied here while the phone is paired with home,
 * so letting it go from the screen it was recorded on never loses it before
 * home has it. The copy goes once home holds the note; `held` and `refused`
 * only grow, so a note is never copied twice. A copy pass says what it
 * could not copy (`CopyPass`), and the run after it says why (`runEnd`,
 * LA14).
 */
import type { HomeExchanged } from "@some-ui/core-utils"
import { assertNever, isRecord } from "@some-ui/core-utils"

/** What a note is said for, as home's `PUT /voice-notes/:id` takes `of`. */
type VoiceOf = "reflection" | "jobs" | "scene" | "game" | "studio"

/** One note as home is told it: what it belongs to, and when it was recorded. */
export type VoiceOut = {
  readonly id: string
  readonly of: VoiceOf
  /**
   * The reflection's session, the Jobs pick or scout, `next-scene` for the
   * drama's next scene said aloud (before HF2, the prompt's stamp), the
   * game's ESPN id, the Studio take (`<project>:<shot>:<take>`).
   */
  readonly ref: string
  /** When it was recorded, ISO 8601. */
  readonly at: string
  readonly contentType: string
  /**
   * A game bite's own fields, by the names home reads them
   * (`@some-ui/game-week`'s `biteFields`): sent beside `of`, `ref` and `at`.
   */
  readonly fields?: Readonly<Record<string, string>>
}

type VoiceRefusal = { readonly id: string; readonly why: string }

export type VoiceHomeState = {
  /** Copied for home and not held there yet, oldest first. */
  readonly waiting: ReadonlyArray<VoiceOut>
  /** What home holds, in the order it said so. */
  readonly held: ReadonlyArray<string>
  /** What home will never hold, with why. */
  readonly refused: ReadonlyArray<VoiceRefusal>
  /**
   * Notes this phone had no room to copy yet, tried again when offered
   * again, at each change to the store that holds it.
   */
  readonly roomless: ReadonlyArray<string>
}

export const INITIAL_VOICE_HOME: VoiceHomeState = {
  waiting: [],
  held: [],
  refused: [],
  roomless: [],
}

export type VoiceHomeEvent =
  | { readonly kind: "copied"; readonly note: VoiceOut }
  | { readonly kind: "roomless"; readonly id: string }
  | { readonly kind: "held"; readonly id: string }
  | { readonly kind: "refused"; readonly id: string; readonly why: string }

/** `id` is copied, held or refused: nothing more to do for it here. */
export function settled(state: VoiceHomeState, id: string): boolean {
  return (
    state.waiting.some((note) => note.id === id) ||
    state.held.includes(id) ||
    state.refused.some((refusal) => refusal.id === id)
  )
}

const without = (
  ids: ReadonlyArray<string>,
  id: string
): ReadonlyArray<string> => ids.filter((other) => other !== id)

export function stepVoiceHome(
  state: VoiceHomeState,
  event: VoiceHomeEvent
): VoiceHomeState {
  switch (event.kind) {
    case "copied": {
      if (settled(state, event.note.id)) return state
      return {
        ...state,
        waiting: [...state.waiting, event.note],
        roomless: without(state.roomless, event.note.id),
      }
    }
    case "roomless": {
      if (settled(state, event.id) || state.roomless.includes(event.id)) {
        return state
      }
      return { ...state, roomless: [...state.roomless, event.id] }
    }
    case "held":
    case "refused": {
      if (!state.waiting.some((note) => note.id === event.id)) return state
      const waiting = state.waiting.filter((note) => note.id !== event.id)
      return event.kind === "held"
        ? { ...state, waiting, held: [...state.held, event.id] }
        : {
            ...state,
            waiting,
            refused: [...state.refused, { id: event.id, why: event.why }],
          }
    }
    default: {
      return assertNever(event)
    }
  }
}

/**
 * How copying one note for home ended (`./runtime`'s `copy`): copied (or
 * already), no room on the copies' shelf, or storage that would not keep
 * the record naming it.
 */
export type CopyEnd = "copied" | "roomless" | "unkept"

/** What one copy pass (`lib/home-link/voice-copy`) could not copy, and why. */
export type CopyPass = {
  /** Notes whose audio is gone from this phone: they can never go home. */
  readonly gone: ReadonlySet<string>
  /** Notes the copies' shelf had no room for. */
  readonly roomless: number
  /** Notes this phone failed to copy: storage that would not keep, or an error. */
  readonly faults: number
}

/** What this phone holds and can't send home, by why (LA14). */
export type Unsendable = {
  /** Notes the last copy pass found no audio for. */
  readonly gone: number
}

export const NO_PASS: CopyPass = { gone: new Set(), roomless: 0, faults: 0 }

/** `pass` with one note's end counted. */
export function passWith(pass: CopyPass, end: CopyEnd | "fault"): CopyPass {
  switch (end) {
    case "copied": {
      return pass
    }
    case "roomless": {
      return { ...pass, roomless: pass.roomless + 1 }
    }
    case "unkept":
    case "fault": {
      return { ...pass, faults: pass.faults + 1 }
    }
    default: {
      return assertNever(end)
    }
  }
}

/** Why a run fails when the phone had no room to copy a note (`lib/home-link/words`). */
export const NO_ROOM = "room"

/**
 * How the voice lane's run ends: as its exchange did, unless that sent all
 * it had and the pass before it left notes it could still copy uncopied.
 * Then the run fails, saying why: this phone's fault before its lack of
 * room. A note whose audio is gone fails nothing, since no run could send
 * it; Settings names it instead.
 */
export function runEnd(
  pass: CopyPass,
  exchanged: HomeExchanged
): HomeExchanged {
  if (exchanged.kind !== "synced") return exchanged
  if (pass.faults > 0) return { kind: "failed", why: "fault" }
  if (pass.roomless > 0) return { kind: "failed", why: NO_ROOM }
  return exchanged
}

const isString = (value: unknown): value is string => typeof value === "string"

const OFS: ReadonlySet<unknown> = new Set([
  "reflection",
  "jobs",
  "scene",
  "game",
  "studio",
])

/** Extra fields a note's own query carries, never one of `of`, `ref` or `at`. */
function isFields(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([key, field]) => !["of", "ref", "at"].includes(key) && isString(field)
    )
  )
}

function isOut(value: unknown): value is VoiceOut {
  return (
    isRecord(value) &&
    isString(value.id) &&
    OFS.has(value.of) &&
    isString(value.ref) &&
    isString(value.at) &&
    isString(value.contentType) &&
    (value.fields === undefined || isFields(value.fields))
  )
}

function isRefusal(value: unknown): value is VoiceRefusal {
  return isRecord(value) && isString(value.id) && isString(value.why)
}

/** The stored record, or null for one this build cannot read. */
export function parseVoiceHome(raw: string): VoiceHomeState | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (
    !isRecord(value) ||
    !Array.isArray(value.waiting) ||
    !value.waiting.every(isOut) ||
    !Array.isArray(value.held) ||
    !value.held.every(isString) ||
    !Array.isArray(value.refused) ||
    !value.refused.every(isRefusal) ||
    !Array.isArray(value.roomless) ||
    !value.roomless.every(isString)
  ) {
    return null
  }
  return {
    waiting: value.waiting,
    held: value.held,
    refused: value.refused,
    roomless: value.roomless,
  }
}
