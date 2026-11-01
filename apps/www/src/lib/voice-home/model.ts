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
 *
 * A note the owner let go where it was recorded (D3, epic #2368) owes home
 * its set-aside mark (`aside`, MIC2 #2372): noted once, with when, from the
 * first time this phone sees it set aside, and kept even after the note
 * leaves this phone, until home takes the mark or never can. Home takes it
 * only for a note it holds (`marksDue`).
 */
import type { HomeExchanged } from "@some-ui/core-utils"
import { assertNever, isRecord } from "@some-ui/core-utils"
import type { TakeKept } from "@some-ui/voice-capture"

/** What a note is said for, as home's `PUT /voice-notes/:id` takes `of`. */
type VoiceOf =
  | "reflection"
  | "jobs"
  | "scene"
  | "game"
  | "studio"
  | "soundbite"
  | "lens"
  | "leetype"

/** One note as home is told it: what it belongs to, and when it was recorded. */
export type VoiceOut = {
  readonly id: string
  readonly of: VoiceOf
  /**
   * The reflection's session, the Jobs pick or scout, `next-scene` for the
   * drama's next scene said aloud (before HF2, the prompt's stamp), the
   * game's ESPN id, the Studio take (`<project>:<shot>:<take>`, or an idea
   * answer's `idea:<idea>:<question>`), how a
   * soundbite came to be recorded (its `context.source`), the grammar-lens
   * line read aloud, LeetType's session file and screen (`<file>:<screen>`).
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

/** A set-aside mark home is owed: the note, and when it was let go (ISO 8601). */
export type AsideMark = { readonly id: string; readonly at: string }

/**
 * How many answered marks this phone remembers, newest kept. A take still
 * set aside on this phone past them is owed its mark again, and home's
 * answer to a repeat is the same `204`, the first mark's time standing: so
 * forgetting one costs one request, never a mark.
 */
export const ASIDE_ANSWERED_MAX = 1000

/** Set-aside marks on their way home, and those home answered for good. */
export type AsideState = {
  /** Owed, oldest first: each sent once home holds its note. */
  readonly owed: ReadonlyArray<AsideMark>
  /**
   * The notes whose mark home answered for good, oldest first, at most
   * `ASIDE_ANSWERED_MAX`: it took the mark, or never will (a time it can't
   * read), so neither is owed again.
   */
  readonly answered: ReadonlyArray<string>
}

export const NO_ASIDE: AsideState = { owed: [], answered: [] }

export type VoiceHomeState = {
  /** Copied for home and not held there yet, oldest first. */
  readonly waiting: ReadonlyArray<VoiceOut>
  /** What home holds, in the order it said so. */
  readonly held: ReadonlyArray<string>
  /**
   * When this phone heard home say it holds each note, ISO 8601 (MIC3): what
   * a take's row says "since". A note held before the phone noted when has
   * none, and nothing here guesses one.
   */
  readonly heldAt: Readonly<Record<string, string>>
  /** What home will never hold, with why. */
  readonly refused: ReadonlyArray<VoiceRefusal>
  /**
   * Notes this phone had no room to copy yet, tried again when offered
   * again, at each change to the store that holds it.
   */
  readonly roomless: ReadonlyArray<string>
  /** Set-aside marks owed to home, and those it took (MIC2). */
  readonly aside: AsideState
}

export const INITIAL_VOICE_HOME: VoiceHomeState = {
  waiting: [],
  held: [],
  heldAt: {},
  refused: [],
  roomless: [],
  aside: NO_ASIDE,
}

/** What home said of a note: it holds it, or it never will. */
export type NoteAnswered =
  | { readonly kind: "held"; readonly id: string }
  | { readonly kind: "refused"; readonly id: string; readonly why: string }

export type VoiceHomeEvent =
  | { readonly kind: "copied"; readonly note: VoiceOut }
  | { readonly kind: "roomless"; readonly id: string }
  /** Home holds it, as this phone heard at `at` (ISO 8601). */
  | { readonly kind: "held"; readonly id: string; readonly at: string }
  | { readonly kind: "refused"; readonly id: string; readonly why: string }
  /** The owner set this note aside at `at`, as this phone first saw it. */
  | { readonly kind: "aside"; readonly id: string; readonly at: string }
  /** Home took the note's set-aside mark. */
  | { readonly kind: "marked"; readonly id: string }
  /** Home will never take the note's mark (a time it can't read). */
  | { readonly kind: "unmarkable"; readonly id: string }

/**
 * What home's set-aside marks are read and answered through
 * (`lib/home-link/set-aside`): the marks due, and home's answer for good.
 */
export type AsidePort = {
  readonly due: () => ReadonlyArray<AsideMark>
  readonly answered: (kind: "marked" | "unmarkable", id: string) => void
}

/** `id` is copied, held or refused: nothing more to do for it here. */
export function settled(state: VoiceHomeState, id: string): boolean {
  return (
    state.waiting.some((note) => note.id === id) ||
    state.held.includes(id) ||
    state.refused.some((refusal) => refusal.id === id)
  )
}

/**
 * Where each note is kept, by what home has told this phone (MIC3): on home
 * once home said it holds it, since when this phone heard so; going home
 * while its copy waits; on this phone alone otherwise, which is also where
 * a note home refused stays. Made once per record, for a screen's rows.
 */
export function keptIn(state: VoiceHomeState): (id: string) => TakeKept {
  const held = new Set(state.held)
  const waiting = new Set(state.waiting.map((note) => note.id))
  return (id): TakeKept => {
    if (held.has(id)) return { place: "home", since: state.heldAt[id] ?? null }
    return waiting.has(id) ? { place: "going" } : { place: "phone" }
  }
}

/**
 * The marks home can take now: those owed for a note it holds, oldest
 * first. A mark for a note home does not hold yet waits for it.
 */
export function marksDue(state: VoiceHomeState): ReadonlyArray<AsideMark> {
  const held = new Set(state.held)
  return state.aside.owed.filter((mark) => held.has(mark.id))
}

/** `aside` with the mark for `id` no longer owed. */
const unowed = (aside: AsideState, id: string): ReadonlyArray<AsideMark> =>
  aside.owed.filter((mark) => mark.id !== id)

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
        ? {
            ...state,
            waiting,
            held: [...state.held, event.id],
            heldAt: { ...state.heldAt, [event.id]: event.at },
          }
        : {
            ...state,
            waiting,
            refused: [...state.refused, { id: event.id, why: event.why }],
            // A note home will never hold can never take its mark.
            aside: { ...state.aside, owed: unowed(state.aside, event.id) },
          }
    }
    case "aside": {
      const { owed, answered } = state.aside
      if (
        owed.some((mark) => mark.id === event.id) ||
        answered.includes(event.id) ||
        state.refused.some((refusal) => refusal.id === event.id)
      ) {
        return state
      }
      return {
        ...state,
        aside: { owed: [...owed, { id: event.id, at: event.at }], answered },
      }
    }
    case "marked":
    case "unmarkable": {
      if (!state.aside.owed.some((mark) => mark.id === event.id)) return state
      const answered = [...state.aside.answered, event.id].slice(
        -ASIDE_ANSWERED_MAX
      )
      return {
        ...state,
        aside: { owed: unowed(state.aside, event.id), answered },
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
  "soundbite",
  "lens",
  "leetype",
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

/** The record's `heldAt`, or `{}` for one written before it was noted. */
function heldAtOf(value: unknown): Record<string, string> | null {
  if (value === undefined) return {}
  if (!isRecord(value)) return null
  const heldAt: Record<string, string> = {}
  for (const [id, at] of Object.entries(value)) {
    if (!isString(at)) return null
    heldAt[id] = at
  }
  return heldAt
}

function isRefusal(value: unknown): value is VoiceRefusal {
  return isRecord(value) && isString(value.id) && isString(value.why)
}

const isMark = (value: unknown): value is AsideMark =>
  isRecord(value) && isString(value.id) && isString(value.at)

/** The record's `aside`, or none owed for one written before MIC2. */
function asideOf(value: unknown): AsideState | null {
  if (value === undefined) return NO_ASIDE
  if (
    !isRecord(value) ||
    !Array.isArray(value.owed) ||
    !value.owed.every(isMark) ||
    !Array.isArray(value.answered) ||
    !value.answered.every(isString)
  ) {
    return null
  }
  return { owed: value.owed, answered: value.answered }
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
  const heldAt = heldAtOf(value.heldAt)
  const aside = asideOf(value.aside)
  if (heldAt === null || aside === null) return null
  return {
    waiting: value.waiting,
    held: value.held,
    heldAt,
    refused: value.refused,
    roomless: value.roomless,
    aside,
  }
}
