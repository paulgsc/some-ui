/**
 * My data's reads and its one playback, as a state union and a pure `step`
 * (CLAUDE.md, "React is not the coordinator"): `./runtime` dispatches what
 * its ports answered, and this decides which answer is stale.
 *
 * - Each read is numbered (`seq`). An answer to an older read (the page
 *   opened another kind, or was pulled again since) changes nothing.
 * - This phone's side is numbered too (`phoneSeq`): a read of both asks
 *   it again, and so does the pairing becoming known (#3152), which asks
 *   nothing of home, since only where this phone's own recordings are kept
 *   was not known.
 * - Reading again keeps what was shown until the new answer lands, so a
 *   pull doesn't blank the page. Opening another kind keeps home's counts
 *   but not its list, which was of the other kind.
 * - At most one recording plays; one that ends or fails clears only itself.
 *   Until its audio is in hand (home's copy comes over the link, MD8) it is
 *   `fetching`; one whose audio didn't come is `missed`, which the page says
 *   over the screen until the next Play.
 */
import { assertNever } from "@some-ui/core-utils"

import type { HomeReading, Of, PhoneRead } from "./model"

export type MyDataState = {
  readonly seq: number
  /** The latest read of this phone's side, by itself or with home's. */
  readonly phoneSeq: number
  /** The kind whose list is shown, or null on the overview. */
  readonly of: Of | null
  readonly home: HomeReading
  /** This phone's recordings, or null until read. */
  readonly phone: PhoneRead | null
  /** The recording playing now, or asked to play, by id. */
  readonly playing: string | null
  /** `playing`'s audio isn't in hand yet. */
  readonly fetching: boolean
  /** The recording whose audio didn't come, until the next Play. */
  readonly missed: string | null
}

export const INITIAL_MY_DATA: MyDataState = {
  seq: 0,
  phoneSeq: 0,
  of: null,
  home: { kind: "reading" },
  phone: null,
  playing: null,
  fetching: false,
  missed: null,
}

export type MyDataEvent =
  | { readonly type: "asked"; readonly of: Of | null }
  /** This phone's side alone is read again: its places became known. */
  | { readonly type: "phoneAsked" }
  | {
      readonly type: "homeAnswered"
      readonly seq: number
      readonly home: HomeReading
    }
  | {
      readonly type: "phoneRead"
      /** The `phoneSeq` it answers. */
      readonly seq: number
      readonly phone: PhoneRead
    }
  | { readonly type: "played"; readonly id: string }
  | { readonly type: "started"; readonly id: string }
  | { readonly type: "missed"; readonly id: string }
  | { readonly type: "stopped"; readonly id: string }

export function stepMyData(
  state: MyDataState,
  event: MyDataEvent
): MyDataState {
  switch (event.type) {
    case "asked": {
      const seqs = { seq: state.seq + 1, phoneSeq: state.phoneSeq + 1 }
      return event.of === state.of
        ? { ...state, ...seqs }
        : {
            ...state,
            ...seqs,
            of: event.of,
            // A miss is said only on the kind it happened on.
            missed: null,
            home:
              state.home.kind === "read"
                ? { ...state.home, kept: { ...state.home.kept, notes: null } }
                : state.home,
          }
    }
    case "homeAnswered": {
      return event.seq === state.seq ? { ...state, home: event.home } : state
    }
    case "phoneAsked": {
      return { ...state, phoneSeq: state.phoneSeq + 1 }
    }
    case "phoneRead": {
      return event.seq === state.phoneSeq
        ? { ...state, phone: event.phone }
        : state
    }
    case "played": {
      return { ...state, playing: event.id, fetching: true, missed: null }
    }
    case "started": {
      return state.playing === event.id ? { ...state, fetching: false } : state
    }
    case "missed": {
      return state.playing === event.id
        ? {
            ...state,
            playing: null,
            fetching: false,
            missed: event.id,
          }
        : state
    }
    case "stopped": {
      return state.playing === event.id
        ? { ...state, playing: null, fetching: false }
        : state
    }
    default: {
      return assertNever(event)
    }
  }
}
