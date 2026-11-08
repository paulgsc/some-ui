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
 * - **A paste begun is kept as it is typed**, one a week (`./store`'s
 *   `pasteStores`), so leaving and coming back finds it, and a paste begun in
 *   one week is never carried into the next; Keep adds it, whole and dated,
 *   to the pastes kept, which only grow.
 * - **One note a paste.** Saying it again replaces it; the one replaced,
 *   which never left the phone, is deleted at Keep.
 * - **What Keep owes is owed from the record.** Keep's writes after the
 *   paste is kept (letting its note go, deleting the notes it replaced,
 *   clearing the draft) are each redone at every opening from the pastes
 *   kept (`settleKept`), so one the phone couldn't store is done the next
 *   time, never lost: a kept paste's line can't take a new note, so every
 *   other take on it still waiting is one it replaced. Keep never counts
 *   another paste begun at the same instant as kept, and the screen says
 *   when a change to the paste couldn't be kept.
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

/**
 * Redoes what each Keep owes once its paste is kept: its note goes home,
 * every other take still waiting on its line (each one it replaced) is
 * deleted, and week `week`'s draft is cleared if it is that paste. Returns
 * the week's draft as it stands after.
 */
function settleKept(
  takes: BundleTakes,
  stores: PasteStores,
  week: string
): PasteDraft | null {
  const kept = stores.pastes.list()
  const lines = new Map(
    kept.map((each) => [pasteLine(each.week, each.at), each])
  )
  const release: Array<string> = []
  const discard: Array<string> = []
  for (const take of takes.takes.getSnapshot()) {
    const paste = lines.get(take.answers)
    if (paste === undefined || take.waits !== true) continue
    if (take.id === paste.note) release.push(take.id)
    else discard.push(take.id)
  }
  if (release.length > 0) takes.release(release)
  if (discard.length > 0) takes.discard(discard)
  const draft = stores.draft.read(week)
  if (draft === null || !lines.has(pasteLine(draft.week, draft.at))) {
    return draft
  }
  stores.draft.write(week, null)
  return null
}

export type PasteRuntime = {
  readonly getSnapshot: () => PasteState
  readonly subscribe: (listener: () => void) => () => void
  readonly dispatch: (
    event: Exclude<PasteEvent, { type: "open" | "kept" | "draftKept" }>
  ) => void
  /** Opens the week's paste, begun now if none is. */
  readonly open: () => void
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
  week: string,
  now: () => number
): PasteRuntime {
  const restored = settleKept(takes, stores, week)
  let state: PasteState = { showing: false, draft: restored, notice: null }
  const listeners = new Set<() => void>()

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
      send({
        type: "draftKept",
        kept: stores.draft.write(week, effect.draft),
      })
      return
    }
    const kept = stores.pastes.add(effect.paste)
    if (kept) {
      takes.release(effect.release)
      takes.discard(effect.discard)
      stores.draft.write(week, null)
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
    open: () => send({ type: "open", week, at: new Date(now()).toISOString() }),
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
