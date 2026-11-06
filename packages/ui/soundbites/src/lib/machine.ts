/**
 * The soundbites page, apart from its takes, as one state machine:
 * `step(state, event)` returns the next state and the effects to run, and
 * does nothing else. A take (record, hear it, Redo, Let go) is the take
 * pattern's (`@some-ui/voice-capture`'s `takePattern`, with the options in
 * `./policy`), so this keeps no copy of one: the page tells the pattern when
 * to start (an auto-start) and when it has gone (`leaveTake`), and keeps
 * what is the page's own. `runtime.ts` runs the effects and feeds their
 * results back in as events, and the component only renders a state and
 * turns taps into events (docs/monorepo-boundaries.md, "Inside a React
 * package: the component is not the coordinator").
 *
 * Rules that hold by structure, not by each async path remembering them:
 *
 * - **The list shown is a read that succeeded, or unknown.** `Library` is
 *   `reading`, `unreadable` or `read`; there is no stale list and no zero
 *   that was not read. A read whose number is not the latest is dropped.
 * - **Nothing records while the page is off screen.** Hidden, or left, the
 *   pattern is told the page went (`leaveTake`): a take recording is kept,
 *   one still opening is let go. An auto-start that arrives while the page
 *   is hidden waits until it is shown. The runtime reports the page's
 *   visibility before it reports arrival.
 * - **A store change from elsewhere is read.** Another instance of this page
 *   (the one left mid-take, still saving) can commit after this one read
 *   the list; the store reports each commit, and the list is re-read.
 * - **The way in is kept until a take is stored.** `source` says how the
 *   person got here and becomes "direct" only on `saved`, so a retry after a
 *   failed save still records the way in.
 * - **The seventh makes room as the person picked.** `choice` is the kept
 *   one picked to be replaced next, carried to the save (`keptBite`), and
 *   cleared once a save used it or the list no longer has it.
 */
import { assertNever } from "@some-ui/core-utils"
import type { Take } from "@some-ui/voice-capture"

import { byNewest, SOUNDBITE_MAX_MS } from "./policy"
import type { Soundbite, SoundbiteContext, SoundbiteSource } from "./types"

/** What the app knows when a take is kept, apart from the way in. */
export type SoundbiteSituation = Omit<SoundbiteContext, "source">

type Library =
  | { readonly kind: "reading" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "read"; readonly kept: ReadonlyArray<Soundbite> }

export type SoundbitesState = {
  /** Whether the page is mounted. A take cut short by leaving is kept. */
  readonly page: "new" | "here" | "left"
  /** Whether the page is on screen. Nothing records while it is not. */
  readonly visible: boolean
  /** An auto-start asked for while the page was hidden, for when it shows. */
  readonly autoStartPending: boolean
  readonly library: Library
  /** The kept one the person picked to be replaced next, if any. */
  readonly choice: string | null
  readonly notice: string
  readonly source: SoundbiteSource
  /** The latest list read asked for; a result for any other is stale. */
  readonly readSeq: number
}

/** What the person does, apart from the take pattern's own taps. */
export type SoundbitesIntent =
  | { readonly type: "replacePicked"; readonly id: string }
  | { readonly type: "retryRead" }

/** What the page and the ports report. */
type SoundbitesSignal =
  | { readonly type: "arrived"; readonly autoStart: boolean }
  | { readonly type: "left" }
  | { readonly type: "hidden" }
  | { readonly type: "shown" }
  /** The store committed a change, possibly from another page instance. */
  | { readonly type: "storeChanged" }
  /** A take was stored. */
  | { readonly type: "saved" }
  | { readonly type: "setAsideFailed" }
  | {
      readonly type: "listed"
      readonly seq: number
      readonly kept: ReadonlyArray<Soundbite>
    }
  | { readonly type: "listFailed"; readonly seq: number }

export type SoundbitesEvent = SoundbitesIntent | SoundbitesSignal

export type SoundbitesEffect =
  | { readonly type: "read"; readonly seq: number }
  /**
   * The take pattern's tap, starting a take: nothing is under way while the
   * page arrives or is hidden, so it starts one.
   */
  | { readonly type: "startTake" }
  /** The page went, or went off screen: the pattern's `leave`. */
  | { readonly type: "leaveTake" }
  | { readonly type: "announceAutoStart" }

export type Step = {
  readonly state: SoundbitesState
  readonly effects: ReadonlyArray<SoundbitesEffect>
}

export const NOTICES = {
  notSetAside: "That one couldn't be set aside. Try again?",
} as const

export function initialState(source: SoundbiteSource): SoundbitesState {
  return {
    page: "new",
    visible: true,
    autoStartPending: false,
    library: { kind: "reading" },
    choice: null,
    notice: "",
    source,
    readSeq: 0,
  }
}

const stay = (state: SoundbitesState): Step => ({ state, effects: [] })

function read(state: SoundbitesState): Step {
  const seq = state.readSeq + 1
  return { state: { ...state, readSeq: seq }, effects: [{ type: "read", seq }] }
}

function autoStarted(state: SoundbitesState): Step {
  return {
    state: { ...state, autoStartPending: false, notice: "" },
    effects: [{ type: "announceAutoStart" }, { type: "startTake" }],
  }
}

/**
 * The soundbite a kept take becomes: what the app knew as it was handed
 * over, the way in, and the one it replaces at the cap (`choice`).
 */
export function keptBite(
  state: SoundbitesState,
  take: Take,
  kept: {
    readonly id: string
    readonly at: string
    readonly situation: SoundbiteSituation
  }
): { readonly bite: Soundbite; readonly replace: string | null } {
  return {
    bite: {
      id: kept.id,
      recordedAt: kept.at,
      durationMs: Math.min(take.durationMs, SOUNDBITE_MAX_MS),
      mimeType: take.mimeType,
      bytes: take.blob.size,
      context: { ...kept.situation, source: state.source },
    },
    replace: state.choice,
  }
}

export function step(state: SoundbitesState, event: SoundbitesEvent): Step {
  switch (event.type) {
    case "arrived": {
      // Arriving again after leaving is StrictMode's remount, or a return
      // to the page: what was in flight carries on, nothing restarts.
      if (state.page !== "new") return stay({ ...state, page: "here" })
      const here = read({ ...state, page: "here" })
      if (!event.autoStart) return here
      // Arrived off screen (launched in the background, say): listen once
      // the page is shown, not before.
      if (!state.visible)
        return {
          state: { ...here.state, autoStartPending: true },
          effects: here.effects,
        }
      const started = autoStarted(here.state)
      return {
        state: started.state,
        effects: [...here.effects, ...started.effects],
      }
    }

    case "left": {
      return {
        state: { ...state, page: "left" },
        effects: [{ type: "leaveTake" }],
      }
    }

    case "hidden": {
      return {
        state: { ...state, visible: false },
        effects: [{ type: "leaveTake" }],
      }
    }

    case "shown": {
      const shown = { ...state, visible: true }
      if (!state.autoStartPending || state.page === "left") return stay(shown)
      return autoStarted(shown)
    }

    case "storeChanged": {
      // A save or a mark committed, maybe by the page instance that was
      // left mid-take: re-read, so a remount does not keep a pre-save list.
      // A write landed, so an earlier one that failed is old news.
      const settled = { ...state, notice: "" }
      return state.page === "here" ? read(settled) : stay(settled)
    }

    case "saved": {
      return stay({ ...state, source: "direct", choice: null, notice: "" })
    }

    case "setAsideFailed": {
      return stay({ ...state, notice: NOTICES.notSetAside })
    }

    case "listed": {
      if (event.seq !== state.readSeq) return stay(state)
      const kept = byNewest(event.kept)
      return stay({
        ...state,
        library: { kind: "read", kept },
        // A pick let go elsewhere (a share's hand-off, say) is no pick.
        choice: kept.some((b) => b.id === state.choice) ? state.choice : null,
      })
    }

    case "listFailed": {
      if (event.seq !== state.readSeq) return stay(state)
      return stay({ ...state, library: { kind: "unreadable" } })
    }

    case "retryRead": {
      return read({ ...state, library: { kind: "reading" } })
    }

    case "replacePicked": {
      return stay({ ...state, choice: event.id })
    }

    default: {
      return assertNever(event)
    }
  }
}
