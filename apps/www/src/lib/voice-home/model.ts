/**
 * Voice notes on their way to the paired home (LA13,
 * docs/learner-data-authority.md): which this phone has copied for home,
 * which home holds, and which it refused for good. Pure; `./runtime` keeps
 * the copies' audio and this record, `./home` sends them.
 *
 * A note's audio is copied here when its person keeps voice notes on home,
 * so letting it go from the screen it was recorded on never loses it before
 * home has it. The copy goes once home holds the note; `held` and `refused`
 * only grow, so a note is never copied twice.
 */
import { assertNever } from "@some-ui/core-utils"

import { isRecord } from "@/lib/device-backend/common"

/** What a note is said for, as home's `PUT /voice-notes/:id` takes `of`. */
type VoiceOf = "reflection" | "jobs" | "scene"

/** One note as home is told it: what it belongs to, and when it was recorded. */
export type VoiceOut = {
  readonly id: string
  readonly of: VoiceOf
  /** The reflection's session, the Jobs pick or scout, the drama prompt's stamp. */
  readonly ref: string
  /** When it was recorded (a scene note: when its prompt was shared), ISO 8601. */
  readonly at: string
  readonly contentType: string
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
   * Notes this phone had no room to copy yet, tried again when offered again:
   * a spoken reflection or Jobs note at each change, a scene note never (it
   * is offered only at its share).
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

const isString = (value: unknown): value is string => typeof value === "string"

const OFS: ReadonlySet<unknown> = new Set(["reflection", "jobs", "scene"])

function isOut(value: unknown): value is VoiceOut {
  return (
    isRecord(value) &&
    isString(value.id) &&
    OFS.has(value.of) &&
    isString(value.ref) &&
    isString(value.at) &&
    isString(value.contentType)
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
