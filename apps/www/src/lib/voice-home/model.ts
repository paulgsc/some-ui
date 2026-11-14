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
 * its set-aside mark (`aside`, MIC2 #2372): owed at Let go, before the
 * standing is written (`lib/voice-marks`), with when, and kept even after
 * the note leaves this phone, until home takes the mark or never can. Home
 * takes it only for a note it holds (`marksDue`).
 *
 * **HP1: home's word that it holds a note counts only under the pairing
 * that said it.**
 *
 * - _Claim:_ in this record, a note reads as held (`held`, `heldAt`,
 *   `settled`, `keptIn`, `marksDue`, and through them every store that lets
 *   audio go on what home holds, LG1) only if home said it holds that note
 *   under the pairing this phone holds now; while the phone is unpaired none
 *   reads as held, and what an earlier pairing's home said is kept, never
 *   deleted, and read again only if that pairing comes back. A pairing id
 *   is made at each pairing, so it comes back only when the phone could not
 *   read its pairing for a while; Unpair and pair again, even with the same
 *   home, is a new pairing, which reads nothing held and is sent again what
 *   is still on the phone.
 * - _Family:_ every sequence of pairing changes (paired with one home, then
 *   unpaired, paired with another home or with a reset one, or the first
 *   pairing's id back) × where each note was when it changed (waiting,
 *   held, refused, not copied) × an answer from home heard after the
 *   pairing changed under its run × a record written before this was
 *   noted, first seen paired or unpaired.
 * - _Proof:_ `__tests__/model.test.ts` ("HP1": every pairing change from
 *   every holding, a late answer, and an earlier build's record) and
 *   `__tests__/runtime.test.ts` ("HP1": the store follows the pairing it is
 *   handed, steps nothing while it is read, and keeps each home's word
 *   across a relaunch; a word heard late keeps the copy's audio). The desks
 *   read where a take is through `keptIn`
 *   (`lib/takes-desk/__tests__/runtime.test.ts`'s "MIC3" test), so none
 *   another pairing's home holds makes room at a cap.
 * - _Tolerance:_ a record written before HP1 noted no pairing: what it says
 *   home holds is taken as the word of the first pairing this phone is seen
 *   under after it, or, when it is first seen unpaired, kept as no
 *   pairing's word (C288); while the link is still read it reads as held. A phone re-paired
 *   with another home before that build reads the old home's word as the
 *   new one's. Until the voice lane hands the record the
 *   home link's pairing (`follow`: at the app shell's mount, or a run), it
 *   reads under the pairing it last followed, as stored. Home's refusals
 *   (`refused`) and a game bite's own "on home" stamp are not this
 *   record's held word and stay across a change of pairing (#2955). A build
 *   before HP1, installed over this one, reads no `others` and its first
 *   write drops them.
 */
import type { HomeExchanged } from "@some-ui/core-utils"
import { assertNever, isRecord } from "@some-ui/core-utils"
import type { TakeKept } from "@some-ui/voice-capture"

/**
 * What a note is said for, as home's `PUT /voice-notes/:id` takes `of`, in
 * home's order (`voice_repo::Of`).
 */
export const VOICE_OFS = [
  "reflection",
  "jobs",
  "scene",
  "game",
  "studio",
  "soundbite",
  "lens",
  "leetype",
  "rust-round",
  "interview",
] as const

type VoiceOf = (typeof VOICE_OFS)[number]

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
   * line read aloud, LeetType's session file and screen (`<file>:<screen>`),
   * the Rust Rounds card (`@some-ui/rust-rounds`' `homeRef`), the interview
   * week's question (`<week>:<question>`) or teleprompter read
   * (`<week>:read:<card>`).
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

/**
 * A set-aside mark home is owed: the note, when it was let go (ISO 8601),
 * and the store it is kept in (`lib/voice-marks`' `MarkFrom`; none on a
 * mark an earlier build owed), which says whether the voice lane has read
 * where the note would be listed.
 */
export type AsideMark = {
  readonly id: string
  readonly at: string
  readonly from?: string
}

/**
 * How many answered marks this phone remembers, newest kept. A take still
 * set aside on this phone past them is owed its mark again, and home's
 * answer to a repeat is the same `204`, the first mark's time standing: so
 * forgetting one costs one request, never a mark.
 */
export const ASIDE_ANSWERED_MAX = 1000

/**
 * How many owed marks the voice lane keeps once their notes have left the
 * phone (`lib/home-link/voice-copy`'s `settleMarks`): past it the oldest of
 * those is dropped. A home without the set-aside route answers every mark
 * `404`, so until it runs one that takes them, marks of notes home holds
 * and the phone let go would otherwise grow for good. A mark whose note is
 * still on the phone is never dropped; those are bounded by the stores'
 * own caps.
 */
export const ASIDE_OWED_MAX = 500

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

/** What one pairing's home holds, as this phone heard it (HP1). */
type Holding = {
  readonly held: ReadonlyArray<string>
  readonly heldAt: Readonly<Record<string, string>>
}

export type VoiceHomeState = {
  /** Copied for home and not held there yet, oldest first. */
  readonly waiting: ReadonlyArray<VoiceOut>
  /**
   * The pairing whose home's word `held` and `heldAt` are (HP1): the one this
   * phone holds now, or null while it holds none.
   */
  readonly pairing: string | null
  /** What the home of `pairing` holds, in the order it said so. */
  readonly held: ReadonlyArray<string>
  /**
   * When this phone heard home say it holds each note, ISO 8601 (MIC3): what
   * a take's row says "since". A note held before the phone noted when has
   * none, and nothing here guesses one.
   */
  readonly heldAt: Readonly<Record<string, string>>
  /** What each other pairing's home holds, by pairing id (HP1). */
  readonly others: Readonly<Record<string, Holding>>
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
  pairing: null,
  held: [],
  heldAt: {},
  others: {},
  refused: [],
  roomless: [],
  aside: NO_ASIDE,
}

/** What home said of a note: it holds it, under `pairing` (HP1), or it never will. */
export type NoteAnswered =
  | { readonly kind: "held"; readonly id: string; readonly pairing: string }
  | { readonly kind: "refused"; readonly id: string; readonly why: string }

export type VoiceHomeEvent =
  | { readonly kind: "copied"; readonly note: VoiceOut }
  | { readonly kind: "roomless"; readonly id: string }
  /**
   * Home holds it, as this phone heard at `at` (ISO 8601), under `pairing`
   * (HP1).
   */
  | {
      readonly kind: "held"
      readonly id: string
      readonly at: string
      readonly pairing: string
    }
  /** The phone holds this pairing now, or none (HP1). */
  | { readonly kind: "paired"; readonly pairing: string | null }
  | { readonly kind: "refused"; readonly id: string; readonly why: string }
  /** The owner set this note aside at `at`, kept in `from`. */
  | {
      readonly kind: "aside"
      readonly id: string
      readonly at: string
      readonly from?: string
    }
  /** Home took the note's set-aside mark. */
  | { readonly kind: "marked"; readonly id: string }
  /** Home will never take the note's mark (a time it can't read). */
  | { readonly kind: "unmarkable"; readonly id: string }
  /**
   * The set-aside write the mark was owed for did not happen, or the note
   * reads as current where it is kept.
   */
  | { readonly kind: "unowed"; readonly id: string }
  /**
   * These notes are listed nowhere they could be, and their copy neither
   * waits nor is held: they left the phone before home had them, so no mark
   * of theirs can ever be taken.
   */
  | { readonly kind: "gone"; readonly ids: ReadonlyArray<string> }
  /** These marks are dropped past `ASIDE_OWED_MAX`, held or not. */
  | { readonly kind: "overflow"; readonly ids: ReadonlyArray<string> }

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

/** `a` with what `b` holds after it, each note once, its first time kept. */
function merged(a: Holding, b: Holding): Holding {
  const seen = new Set(a.held)
  return {
    held: [...a.held, ...b.held.filter((id) => !seen.has(id))],
    heldAt: { ...b.heldAt, ...a.heldAt },
  }
}

/**
 * Where an earlier build's word goes when the first pairing this phone is
 * seen under is none (C288): a key no pairing id takes (they are UUIDs), so
 * it is kept and never read as held.
 */
export const UNKNOWN_PAIRING = ""

/**
 * The record under `pairing` (HP1): what the pairing it was under holds goes
 * to `others`, and what `pairing`'s home was heard to hold comes back (an
 * earlier build's word: `UNKNOWN_PAIRING`).
 */
function repaired(
  state: VoiceHomeState,
  pairing: string | null
): VoiceHomeState {
  if (pairing === null && state.pairing === null) {
    if (state.held.length === 0) return state
    return {
      ...state,
      held: [],
      heldAt: {},
      others: {
        ...state.others,
        [UNKNOWN_PAIRING]: merged(
          state.others[UNKNOWN_PAIRING] ?? { held: [], heldAt: {} },
          { held: state.held, heldAt: state.heldAt }
        ),
      },
    }
  }
  if (pairing === state.pairing) return state
  const current: Holding = { held: state.held, heldAt: state.heldAt }
  const others: Record<string, Holding> = { ...state.others }
  let next: Holding = { held: [], heldAt: {} }
  if (state.pairing === null) {
    next = current
  } else if (current.held.length > 0) {
    others[state.pairing] = Object.hasOwn(others, state.pairing)
      ? merged(others[state.pairing], current)
      : current
  }
  if (pairing !== null && Object.hasOwn(others, pairing)) {
    next = merged(others[pairing], next)
    delete others[pairing]
  }
  return { ...state, pairing, held: next.held, heldAt: next.heldAt, others }
}

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
    case "paired": {
      return repaired(state, event.pairing)
    }
    case "held":
    case "refused": {
      if (!state.waiting.some((note) => note.id === event.id)) return state
      // A word heard after the pairing changed is another home's: the copy
      // waits, and goes to this one (HP1).
      if (event.kind === "held" && event.pairing !== state.pairing) {
        return state
      }
      const waiting = state.waiting.filter((note) => note.id !== event.id)
      return event.kind === "held"
        ? {
            ...state,
            waiting,
            ...merged(
              { held: state.held, heldAt: state.heldAt },
              { held: [event.id], heldAt: { [event.id]: event.at } }
            ),
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
        aside: {
          owed: [
            ...owed,
            event.from === undefined
              ? { id: event.id, at: event.at }
              : { id: event.id, at: event.at, from: event.from },
          ],
          answered,
        },
      }
    }
    case "gone": {
      const gone = new Set(event.ids)
      // A mark is owed to whichever home holds its note, this pairing's or not.
      const held = new Set([
        ...state.held,
        ...Object.values(state.others).flatMap((holding) => holding.held),
      ])
      const waiting = new Set(state.waiting.map((note) => note.id))
      const owed = state.aside.owed.filter(
        (mark) =>
          !gone.has(mark.id) || held.has(mark.id) || waiting.has(mark.id)
      )
      if (owed.length === state.aside.owed.length) return state
      return { ...state, aside: { ...state.aside, owed } }
    }
    case "overflow": {
      const dropped = new Set(event.ids)
      const owed = state.aside.owed.filter((mark) => !dropped.has(mark.id))
      if (owed.length === state.aside.owed.length) return state
      return { ...state, aside: { ...state.aside, owed } }
    }
    case "unowed": {
      if (!state.aside.owed.some((mark) => mark.id === event.id)) return state
      return {
        ...state,
        aside: { ...state.aside, owed: unowed(state.aside, event.id) },
      }
    }
    case "marked":
    case "unmarkable": {
      if (!state.aside.owed.some((mark) => mark.id === event.id)) return state
      return {
        ...state,
        aside: {
          owed: unowed(state.aside, event.id),
          answered: [...state.aside.answered, event.id].slice(
            -ASIDE_ANSWERED_MAX
          ),
        },
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

const OFS: ReadonlySet<unknown> = new Set(VOICE_OFS)

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

/** One pairing's word as stored, or null for one this build cannot read. */
function holdingOf(value: unknown): Holding | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.held) ||
    !value.held.every(isString)
  ) {
    return null
  }
  const heldAt = heldAtOf(value.heldAt)
  return heldAt === null ? null : { held: value.held, heldAt }
}

/** The record's `others`, or none for one written before HP1. */
function othersOf(value: unknown): Record<string, Holding> | null {
  if (value === undefined) return {}
  if (!isRecord(value)) return null
  const others: Record<string, Holding> = {}
  for (const [pairing, stored] of Object.entries(value)) {
    const holding = holdingOf(stored)
    if (holding === null) return null
    others[pairing] = holding
  }
  return others
}

function isRefusal(value: unknown): value is VoiceRefusal {
  return isRecord(value) && isString(value.id) && isString(value.why)
}

const isMark = (value: unknown): value is AsideMark =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.at) &&
  (value.from === undefined || isString(value.from))

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
  // A record an earlier build wrote may carry more (a count of runs home
  // found no note, marks given up): only the mark and its time are read.
  return {
    owed: value.owed.map(({ id, at, from }) =>
      from === undefined ? { id, at } : { id, at, from }
    ),
    answered: value.answered,
  }
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
    !Array.isArray(value.refused) ||
    !value.refused.every(isRefusal) ||
    !Array.isArray(value.roomless) ||
    !value.roomless.every(isString)
  ) {
    return null
  }
  const holding = holdingOf(value)
  const others = othersOf(value.others)
  const aside = asideOf(value.aside)
  if (holding === null || others === null || aside === null) return null
  const pairing = value.pairing ?? null
  if (pairing !== null && !isString(pairing)) return null
  return {
    waiting: value.waiting,
    pairing,
    held: holding.held,
    heldAt: holding.heldAt,
    others,
    refused: value.refused,
    roomless: value.roomless,
    aside,
  }
}
