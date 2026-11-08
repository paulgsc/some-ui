/**
 * An error pasted from the owner's own code in a week (RR13, #2688; #2685
 * moved it from the cards to the week): rustc's output as printed, and a
 * spoken note on it if the owner likes. The routine builds next week's
 * ticket from it (RR18).
 *
 * `stepPaste` is the pure step; `pasteRuntime` runs it over the week's desk
 * of takes and the stores. Rules that hold by structure:
 *
 * - **Nothing leaves before Keep.** The note is a take on the week's desk
 *   (`send: "on-confirm"`), named `<week>:PASTE:<at>` (paulgsc/server#727),
 *   `at` when the paste was begun; it waits on the phone until Keep, which
 *   keeps the paste first and only then lets the note go home.
 * - **A paste begun is kept as it is typed** (`./store`'s `pasteDraft`), so
 *   leaving and coming back finds it; Keep adds it, whole and dated, to the
 *   pastes kept, which only grow.
 * - **One note a paste.** Saying it again replaces it; the one replaced,
 *   which never left the phone, is deleted at Keep.
 * - **A note a kept paste names goes home.** Each opening lets go home any
 *   such note still waiting (a Keep whose release the phone couldn't
 *   store), and the screen says when a change to the paste couldn't be kept.
 */
import { assertNever } from "@some-ui/core-utils"
import type {
  BundleTakes,
  PatternTake,
  TakePatternSnapshot,
} from "@some-ui/voice-capture"

import type { KeptPaste, PasteDraft, PasteStores } from "./store"

/** The longest paste: rustc's output for a few errors, with room to spare. */
export const PASTE_MAX = 20_000

/** What a note on a paste answers: its voice note's `ref` too. */
export const pasteLine = (week: string, at: string): string =>
  `${week}:PASTE:${at}`

type PasteState = {
  /** The paste's screen is showing, over the brief. */
  readonly showing: boolean
  /** The paste being written, or null while none is. */
  readonly draft: PasteDraft | null
  /** What the screen says once: the paste kept, or not, or a change not kept. */
  readonly notice: "kept" | "notKept" | "draftNotKept" | null
}

type PasteEvent =
  | { readonly type: "open"; readonly week: string; readonly at: string }
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "close" }
  | { readonly type: "keep" }
  | { readonly type: "kept"; readonly kept: boolean }
  /** A change to the paste being written: false when the phone couldn't keep it. */
  | { readonly type: "draftKept"; readonly kept: boolean }
  | { readonly type: "noticeDismissed" }

type PasteEffect =
  | { readonly type: "keepDraft"; readonly draft: PasteDraft | null }
  /** Keeps `paste`, then lets `release` go home and deletes `discard`. */
  | {
      readonly type: "keep"
      readonly paste: KeptPaste
      readonly release: ReadonlyArray<string>
      readonly discard: ReadonlyArray<string>
    }

type PasteStep = {
  readonly state: PasteState
  readonly effects: ReadonlyArray<PasteEffect>
}

/** The note on `draft` now, and every take of it, from the desk's list. */
function noteOf(
  draft: PasteDraft,
  takes: ReadonlyArray<PatternTake>
): { current: PatternTake | null; all: ReadonlyArray<PatternTake> } {
  const line = pasteLine(draft.week, draft.at)
  const all = takes.filter((take) => take.answers === line)
  const current =
    all
      .filter((take) => take.standing === "current")
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0] ?? null
  return { current, all }
}

const same = (state: PasteState): PasteStep => ({ state, effects: [] })

function stepPaste(
  state: PasteState,
  event: PasteEvent,
  takes: ReadonlyArray<PatternTake>
): PasteStep {
  switch (event.type) {
    case "open": {
      if (state.draft !== null) {
        return same({ ...state, showing: true, notice: null })
      }
      const draft = { week: event.week, at: event.at, text: "" }
      return {
        state: { showing: true, draft, notice: null },
        effects: [{ type: "keepDraft", draft }],
      }
    }
    case "text": {
      if (state.draft === null) return same(state)
      const text = event.text.slice(0, PASTE_MAX)
      if (text === state.draft.text) return same(state)
      const draft = { ...state.draft, text }
      return {
        state: { ...state, draft },
        effects: [{ type: "keepDraft", draft }],
      }
    }
    case "close": {
      return same({ ...state, showing: false, notice: null })
    }
    case "keep": {
      const { draft } = state
      if (draft === null || draft.text.trim() === "") return same(state)
      const { current, all } = noteOf(draft, takes)
      return {
        state,
        effects: [
          {
            type: "keep",
            paste: { ...draft, note: current?.id ?? null },
            release: current === null ? [] : [current.id],
            discard: all
              .filter((take) => take.id !== current?.id && take.waits === true)
              .map((take) => take.id),
          },
        ],
      }
    }
    case "kept": {
      return event.kept
        ? same({ showing: false, draft: null, notice: "kept" })
        : same({ ...state, notice: "notKept" })
    }
    case "draftKept": {
      return event.kept
        ? same(state)
        : same({ ...state, notice: "draftNotKept" })
    }
    case "noticeDismissed": {
      return same({ ...state, notice: null })
    }
    default: {
      return assertNever(event)
    }
  }
}

export type PasteRuntime = {
  readonly getSnapshot: () => PasteState
  readonly subscribe: (listener: () => void) => () => void
  readonly dispatch: (
    event: Exclude<PasteEvent, { type: "open" | "kept" | "draftKept" }>
  ) => void
  /** Opens the paste for `week`, begun now if none is. */
  readonly open: (week: string) => void
  /** D1's tap on the note's button: a take, or its stop. */
  readonly tap: (snapshot: TakePatternSnapshot) => void
  /**
   * Deletes the note's takes, which never left the phone, for good: the
   * screen asks first.
   */
  readonly deleteNote: () => void
}

export function pasteRuntime(
  takes: BundleTakes,
  stores: PasteStores,
  now: () => number
): PasteRuntime {
  let state: PasteState = {
    showing: false,
    draft: stores.draft.read(),
    notice: null,
  }
  const listeners = new Set<() => void>()

  // A note a kept paste names that still waits: its Keep couldn't let it go.
  const named = new Set(
    stores.pastes.list().flatMap(({ note }) => (note === null ? [] : [note]))
  )
  const stranded = takes.takes
    .getSnapshot()
    .filter((take) => take.waits === true && named.has(take.id))
    .map((take) => take.id)
  if (stranded.length > 0) takes.release(stranded)

  function send(event: PasteEvent): void {
    const next = stepPaste(state, event, takes.takes.getSnapshot())
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  function run(effect: PasteEffect): void {
    if (effect.type === "keepDraft") {
      send({ type: "draftKept", kept: stores.draft.write(effect.draft) })
      return
    }
    const kept = stores.pastes.add(effect.paste)
    if (kept) {
      takes.release(effect.release)
      takes.discard(effect.discard)
      stores.draft.write(null)
    }
    send({ type: "kept", kept })
  }

  return {
    getSnapshot: () => state,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    dispatch: send,
    open: (week) =>
      send({ type: "open", week, at: new Date(now()).toISOString() }),
    tap(snapshot): void {
      const { draft } = state
      if (draft === null) return
      const line = pasteLine(draft.week, draft.at)
      const busy = snapshot.take.kind !== "idle"
      const current = noteOf(draft, takes.takes.getSnapshot()).current
      takes.pattern.tap(line, busy ? null : (current?.id ?? null))
    },
    deleteNote(): void {
      const { draft } = state
      if (draft === null) return
      const { all } = noteOf(draft, takes.takes.getSnapshot())
      takes.discard(
        all.filter((take) => take.waits === true).map((take) => take.id)
      )
    },
  }
}
