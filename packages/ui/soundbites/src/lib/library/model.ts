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
 *   take stops the one playing, and audio that lands for a play since
 *   overtaken is never played.
 * - **The screen says which search ran.** Home answers `by`; the words of a
 *   search by words never claim meaning (`./words`).
 * - **A search home would refuse is never asked.** Blank words show the
 *   newest; more than `SEARCH_MAX` characters say so and send nothing.
 */
import { assertNever } from "@some-ui/core-utils"

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
  /** Home answered, but keeps no library of takes yet. */
  | { readonly kind: "older" }
  /** Home answered with something this phone can't read. */
  | { readonly kind: "unreadable" }

/** The most characters a search may hold, as home takes one. */
export const SEARCH_MAX = 200

/** What a take is for, by the ref the phone sent it home with. */
export type TakeFor = "scene" | "idea" | "library" | "other"

export function takeFor(ref: string): TakeFor {
  if (ref.startsWith("idea:")) return "idea"
  if (ref.startsWith("library:")) return "library"
  // A video's scene: `<project>:<shot>:<take>`.
  return ref.split(":").length === 3 ? "scene" : "other"
}

/** What plays: nothing, a take whose audio is on its way, or a take playing. */
type LibraryPlayback =
  | { readonly kind: "quiet" }
  | { readonly kind: "loading"; readonly id: string }
  | { readonly kind: "playing"; readonly id: string }

export type LibraryState = {
  /** The words in the search box, as typed. */
  readonly draft: string
  /** The search the list shows; null for the newest. */
  readonly asked: string | null
  readonly read: { readonly kind: "reading" } | LibraryRead
  /** The latest read asked for; an answer to an earlier one is stale. */
  readonly seq: number
  readonly playback: LibraryPlayback
  /** The latest play asked for; audio for an earlier one is stale. */
  readonly plays: number
  /** The take whose audio home couldn't give back, the last time it was asked. */
  readonly unplayable: string | null
  /** The search typed was longer than home takes, so nothing was asked. */
  readonly tooLong: boolean
}

export type LibraryIntent =
  | { readonly type: "typed"; readonly text: string }
  | { readonly type: "search" }
  | { readonly type: "newest" }
  | { readonly type: "readAgain" }
  | { readonly type: "play"; readonly id: string }

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

export type LibraryEffect =
  /** Ask home for the takes: the newest when `q` is null. */
  | {
      readonly type: "readTakes"
      readonly seq: number
      readonly q: string | null
    }
  /** Ask home for take `id`'s audio. */
  | { readonly type: "readAudio"; readonly play: number; readonly id: string }
  /** Play the audio home gave back. */
  | {
      readonly type: "startPlayback"
      readonly play: number
      readonly audio: Blob
    }
  /** Stop what plays, if anything does. */
  | { readonly type: "stopPlayback" }

export type LibraryStep = {
  readonly state: LibraryState
  readonly effects: ReadonlyArray<LibraryEffect>
}

export const INITIAL_LIBRARY: LibraryState = {
  draft: "",
  asked: null,
  read: { kind: "reading" },
  seq: 0,
  playback: { kind: "quiet" },
  plays: 0,
  unplayable: null,
  tooLong: false,
}

const same = (state: LibraryState): LibraryStep => ({ state, effects: [] })

/** Reads the takes for `asked` under a new number. */
function readFor(state: LibraryState, asked: string | null): LibraryStep {
  const seq = state.seq + 1
  return {
    state: { ...state, asked, seq, read: { kind: "reading" }, tooLong: false },
    effects: [{ type: "readTakes", seq, q: asked }],
  }
}

/** Stops what plays, under a new number, so its late answers are for nobody. */
function stopped(state: LibraryState): LibraryStep {
  if (state.playback.kind === "quiet") return same(state)
  return {
    state: { ...state, playback: { kind: "quiet" }, plays: state.plays + 1 },
    effects: [{ type: "stopPlayback" }],
  }
}

/** The take `playback` names, if any. */
const playbackId = (playback: LibraryPlayback): string | null =>
  playback.kind === "quiet" ? null : playback.id

export function stepLibrary(
  state: LibraryState,
  event: LibraryEvent
): LibraryStep {
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
      const again = playbackId(state.playback) === event.id
      const stop = stopped(state)
      if (again) return stop
      const play = stop.state.plays + 1
      return {
        state: {
          ...stop.state,
          plays: play,
          playback: { kind: "loading", id: event.id },
          unplayable: null,
        },
        effects: [...stop.effects, { type: "readAudio", play, id: event.id }],
      }
    }
    case "audioRead": {
      const { playback } = state
      if (event.play !== state.plays || playback.kind !== "loading") {
        return same(state)
      }
      if (event.audio === null) {
        return same({
          ...state,
          playback: { kind: "quiet" },
          unplayable: playback.id,
        })
      }
      return {
        state: { ...state, playback: { kind: "playing", id: playback.id } },
        effects: [
          { type: "startPlayback", play: event.play, audio: event.audio },
        ],
      }
    }
    case "playEnded": {
      if (event.play !== state.plays) return same(state)
      return same({ ...state, playback: { kind: "quiet" } })
    }
    default: {
      return assertNever(event)
    }
  }
}
