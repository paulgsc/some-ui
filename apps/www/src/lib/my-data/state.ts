/**
 * My data's reads and its one playback, as a state union and a pure `step`
 * (CLAUDE.md, "React is not the coordinator"): `./runtime` dispatches what
 * its ports answered, and this decides which answer is stale.
 *
 * - Each read is numbered (`seq`). An answer to an older read (the page
 *   opened another kind, or was pulled again since) changes nothing.
 * - Reading again keeps what was shown until the new answer lands, so a
 *   pull doesn't blank the page. Opening another kind keeps home's counts
 *   but not its list, which was of the other kind.
 * - At most one recording plays; one that ends or fails clears only itself.
 *   Until its audio is in hand (home's copy comes over the link, MD8) it is
 *   `fetching`; one whose audio didn't come is `missed`, which the page says
 *   over the screen, numbered so a second miss is said again.
 */
import { assertNever } from "@some-ui/core-utils"

import type { HomeReading, Of, PhoneRead } from "./model"

export type MyDataState = {
  readonly seq: number
  /** The kind whose list is shown, or null on the overview. */
  readonly of: Of | null
  readonly home: HomeReading
  /** This phone's recordings, or null until read. */
  readonly phone: PhoneRead | null
  /** The recording playing now, or asked to play, by id. */
  readonly playing: string | null
  /** `playing`'s audio isn't in hand yet. */
  readonly fetching: boolean
  /** The last recording whose audio didn't come, and how many have missed. */
  readonly missed: { readonly id: string; readonly count: number } | null
}

export const INITIAL_MY_DATA: MyDataState = {
  seq: 0,
  of: null,
  home: { kind: "reading" },
  phone: null,
  playing: null,
  fetching: false,
  missed: null,
}

export type MyDataEvent =
  | { readonly type: "asked"; readonly of: Of | null }
  | {
      readonly type: "homeAnswered"
      readonly seq: number
      readonly home: HomeReading
    }
  | {
      readonly type: "phoneRead"
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
      return event.of === state.of
        ? { ...state, seq: state.seq + 1 }
        : {
            ...state,
            seq: state.seq + 1,
            of: event.of,
            // A miss is said on the page it happened on, not on the next.
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
    case "phoneRead": {
      return event.seq === state.seq ? { ...state, phone: event.phone } : state
    }
    case "played": {
      return { ...state, playing: event.id, fetching: true }
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
            missed: { id: event.id, count: (state.missed?.count ?? 0) + 1 },
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
