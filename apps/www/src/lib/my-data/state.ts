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
 */
import { assertNever } from "@some-ui/core-utils"

import type { HomeReading, Of, PhoneNote } from "./model"

export type MyDataState = {
  readonly seq: number
  /** The kind whose list is shown, or null on the overview. */
  readonly of: Of | null
  readonly home: HomeReading
  /** This phone's recordings, or null until read. */
  readonly phone: ReadonlyArray<PhoneNote> | null
  /** The recording playing now, by id. */
  readonly playing: string | null
}

export const INITIAL_MY_DATA: MyDataState = {
  seq: 0,
  of: null,
  home: { kind: "reading" },
  phone: null,
  playing: null,
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
      readonly phone: ReadonlyArray<PhoneNote>
    }
  | { readonly type: "played"; readonly id: string }
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
      return { ...state, playing: event.id }
    }
    case "stopped": {
      return state.playing === event.id ? { ...state, playing: null } : state
    }
    default: {
      return assertNever(event)
    }
  }
}
