/**
 * Takes on home (STUDIO ST32, #2590; the owner's decision 8 on #2248): every
 * take home keeps of this phone's owner (paulgsc/server
 * `GET /voice-notes/takes`), newest first, each with the words home heard
 * in it, a search over those words (`?q=`), and Play for each, its audio
 * fetched from home. One state machine: `stepLibrary(state, event)` returns
 * the next state and the effects to run and does nothing else;
 * `./runtime` runs them against home and the phone's player, and the
 * component renders a state and turns taps into events.
 *
 * Rules that hold by structure:
 *
 * - **A read answers only the read asked last.** Reads are numbered, and an
 *   answer to an earlier one (a slow search overtaken by a newer one)
 *   changes nothing.
 * - **One take plays at a time.** Plays are numbered too: a press on another
 *   take stops the one playing, so does a new list (a take's Stop is on its
 *   row), and audio that lands for a play since overtaken is never played.
 * - **The screen says which search ran.** Home answers `by`; the words of a
 *   search by words never claim meaning (`./words`).
 * - **A search home would refuse is never asked.** Blank words show the
 *   newest; more than `SEARCH_MAX` characters say so and send nothing.
 * - **A take recorded here shows on home once home has it.** The phone's
 *   own takes with no scene (`LibraryPhone`) are listed apart while home
 *   doesn't hold them (`notYetHome`); once one reaches home (`reachedHome`),
 *   the newest are read again, as soon as nothing plays, so it shows in
 *   home's list. A search shown is left as it is.
 * - **One sound at a time.** When the phone starts recording or playing one
 *   of its own takes (`phone`), what plays from home stops. Home's Play
 *   waits only while the phone records; while it plays, Play stops it
 *   (`readAudio`) and plays home's.
 */
import { assertNever } from "@some-ui/core-utils"
import type { PatternTake } from "@some-ui/voice-capture"

import type { PlayEffect, PlaySlice } from "./play"
import { audioRead, played, playEnded, QUIET, stopped } from "./play"

/** What home heard in a take: empty `text` when it heard no words. */
type LibraryHeard = {
  readonly text: string
  readonly language: string | null
  readonly model: string
  readonly heardAt: string
}

/** One take as home keeps it. */
export type LibraryTake = {
  readonly id: string
  /** What the take is for, as the phone named it when it went home. */
  readonly ref: string
  readonly recordedAt: string
  readonly storedAt: string
  readonly size: number
  /** When the owner set it aside; null while nothing has. */
  readonly setAsideAt: string | null
  /** Null until home has heard it. */
  readonly heard: LibraryHeard | null
  /**
   * Where it is on Studio's conveyor (CONVEYOR1), as home names the station:
   * null for a take on no conveyor (an idea's answer), absent from a home
   * before it. What it means is the build's (`LibraryStations`).
   */
  readonly station?: string | null | undefined
  /** When it was moved there; null for a take never moved. */
  readonly stationAt?: string | null | undefined
  /** Its newest move number on the conveyor: 0 for none, null on none. */
  readonly stationSeq?: number | null | undefined
}

/** How home picked the takes it lists. */
export type LibraryBy = "newest" | "words" | "meaning"

/** One answer of home's: the takes it lists, and how many it holds. */
export type LibraryPage = {
  readonly takes: ReadonlyArray<LibraryTake>
  /** How many takes home keeps of this phone's owner. */
  readonly total: number
  /** With a search, how many matched (can be more than listed); else null. */
  readonly matched: number | null
  readonly by: LibraryBy
}

/** How a read of home went. */
export type LibraryRead =
  | { readonly kind: "read"; readonly page: LibraryPage }
  /** This phone isn't paired with home: nothing was asked. */
  | { readonly kind: "unpaired" }
  /** Home didn't answer. */
  | { readonly kind: "away" }
  /** This phone stayed busy with home, so nothing was asked. */
  | { readonly kind: "busy" }
  /** Home answered, but keeps no library of takes yet. */
  | { readonly kind: "older" }
  /** Home answered with something this phone can't read. */
  | { readonly kind: "unreadable" }

/** The most characters a search may hold, as home takes one. */
export const SEARCH_MAX = 200

/** The phone's own takes with no scene, and whether it has room for another. */
export type LibraryPhoneSnapshot = {
  readonly takes: ReadonlyArray<PatternTake>
  /** No new take can be kept until home holds some of those kept. */
  readonly full: boolean
}

const onHome = (take: PatternTake): boolean => take.kept?.place === "home"

/**
 * The phone's takes listed apart from home's: those home doesn't hold yet,
 * and the one `playing` until it stops, so its Stop stays on screen. Each
 * is listed as answering `line`, whatever it was said for (a note on an
 * episode's spoken part, SFEED6), so every take the desk keeps shows here.
 */
export function notYetHome(
  takes: ReadonlyArray<PatternTake>,
  playing: string | null,
  line: string
): ReadonlyArray<PatternTake> {
  return takes
    .filter((take) => !onHome(take) || take.id === playing)
    .map((take) => (take.answers === line ? take : { ...take, answers: line }))
}

/**
 * The ids of the phone's takes home holds now, and whether any of them
 * wasn't among `before`: a take that reached home since.
 */
export function reachedHome(
  before: ReadonlySet<string>,
  takes: ReadonlyArray<PatternTake>
): { readonly held: ReadonlySet<string>; readonly arrived: boolean } {
  const held = new Set(takes.filter(onHome).map(({ id }) => id))
  return { held, arrived: [...held].some((id) => !before.has(id)) }
}

type PhoneSound = "quiet" | "playing" | "recording"

export type LibraryState = PlaySlice & {
  /** The words in the search box, as typed. */
  readonly draft: string
  /** The search the list shows; null for the newest. */
  readonly asked: string | null
  readonly read: { readonly kind: "reading" } | LibraryRead
  /** The latest read asked for; an answer to an earlier one is stale. */
  readonly seq: number
  /** The search typed was longer than home takes, so nothing was asked. */
  readonly tooLong: boolean
  /** A take recorded here reached home since the newest were read. */
  readonly behind: boolean
  /** What the phone's own takes do: nothing, play one, or record one. */
  readonly phone: PhoneSound
}

export type LibraryIntent =
  | { readonly type: "typed"; readonly text: string }
  | { readonly type: "search" }
  | { readonly type: "newest" }
  | { readonly type: "readAgain" }
  | { readonly type: "play"; readonly id: string }
  /** What plays stops: its row is about to leave the screen (a chip, TAKES3). */
  | { readonly type: "stop" }
  /** The person closed "home can't give that take back". */
  | { readonly type: "noticeDismissed" }

export type LibraryEvent =
  | LibraryIntent
  | { readonly type: "entered" }
  | { readonly type: "left" }
  | {
      readonly type: "takesRead"
      readonly seq: number
      readonly read: LibraryRead
    }
  | {
      readonly type: "audioRead"
      readonly play: number
      /** The take's audio, or null when home couldn't give it back. */
      readonly audio: Blob | null
    }
  | { readonly type: "playEnded"; readonly play: number }
  /** A take recorded on this phone reached home. */
  | { readonly type: "arrived" }
  /** The phone started or stopped recording or playing one of its own. */
  | { readonly type: "phone"; readonly sound: PhoneSound }

export type LibraryEffect =
  /** Ask home for the takes: the newest when `q` is null. */
  | {
      readonly type: "readTakes"
      readonly seq: number
      readonly q: string | null
    }
  | PlayEffect

export type LibraryStep = {
  readonly state: LibraryState
  readonly effects: ReadonlyArray<LibraryEffect>
}

export const INITIAL_LIBRARY: LibraryState = {
  draft: "",
  asked: null,
  read: { kind: "reading" },
  seq: 0,
  ...QUIET,
  tooLong: false,
  behind: false,
  phone: "quiet",
}

const same = (state: LibraryState): LibraryStep => ({ state, effects: [] })

/**
 * Reads the takes for `asked` under a new number. What plays stops first:
 * its Stop is on its row, which the new list replaces.
 */
function readFor(state: LibraryState, asked: string | null): LibraryStep {
  const stop = stopped(state)
  const seq = stop.state.seq + 1
  return {
    state: {
      ...stop.state,
      asked,
      seq,
      read: { kind: "reading" },
      tooLong: false,
      behind: false,
    },
    effects: [...stop.effects, { type: "readTakes", seq, q: asked }],
  }
}

/**
 * The next state and effects for `event`; then, once nothing plays and the
 * newest show, a take that reached home meanwhile is read in.
 */
export function stepLibrary(
  state: LibraryState,
  event: LibraryEvent
): LibraryStep {
  const next = step(state, event)
  const { state: after } = next
  const due =
    after.behind &&
    after.asked === null &&
    after.playback.kind === "quiet" &&
    event.type !== "left"
  if (!due) return next
  const read = readFor(after, null)
  return { state: read.state, effects: [...next.effects, ...read.effects] }
}

function step(state: LibraryState, event: LibraryEvent): LibraryStep {
  switch (event.type) {
    case "entered": {
      return readFor(state, state.asked)
    }
    case "left": {
      return stopped(state)
    }
    case "readAgain": {
      return readFor(state, state.asked)
    }
    case "typed": {
      return same({ ...state, draft: event.text, tooLong: false })
    }
    case "search": {
      const q = state.draft.trim()
      if (q === "") return readFor({ ...state, draft: "" }, null)
      if ([...q].length > SEARCH_MAX) return same({ ...state, tooLong: true })
      return readFor(state, q)
    }
    case "newest": {
      return readFor({ ...state, draft: "" }, null)
    }
    case "takesRead": {
      if (event.seq !== state.seq) return same(state)
      return same({ ...state, read: event.read })
    }
    case "play": {
      if (state.phone === "recording") return stopped(state)
      return played(state, event.id)
    }
    case "audioRead": {
      return audioRead(state, event.play, event.audio)
    }
    case "stop": {
      return stopped(state)
    }
    case "noticeDismissed": {
      return same({ ...state, unplayable: null })
    }
    case "playEnded": {
      return playEnded(state, event.play)
    }
    case "arrived": {
      // A search shown stays; going back to the newest reads them anyway.
      if (state.asked !== null || state.behind) return same(state)
      return same({ ...state, behind: true })
    }
    case "phone": {
      if (event.sound === state.phone) return same(state)
      const stop = state.phone === "quiet" ? stopped(state) : same(state)
      const next = event.sound === "quiet" ? same(state) : stop
      return { ...next, state: { ...next.state, phone: event.sound } }
    }
    default: {
      return assertNever(event)
    }
  }
}
