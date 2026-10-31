/**
 * Runs the session's machine (`./machine`) against the outside world. It
 * holds the handles (the microphone's notes, the page's visibility), turns
 * each effect into a call on a port and each result into an event, and
 * decides nothing: whether a result still matters is `step`'s. Plain
 * TypeScript, so deleting React deletes none of this.
 *
 * Its ports (#2235): what is held and the log (`store`, through the one
 * kept-record reader), the microphone (`notes`), the clipboard, the clock
 * and the page. None of them is the network: every card plays from what is
 * on the phone. Voice notes wait on the phone in the microphone's own list;
 * sending them and the log home is RR6 (#2237) and RR7 (#2238).
 */
import { assertNever } from "@some-ui/core-utils"

import type {
  NoteView,
  PlayEffect,
  PlayEvent,
  PlayIntent,
  PlayState,
} from "./machine"
import { initialState, step, unsettled } from "./machine"
import type { RoundsStore } from "./store"

/** The microphone's voice notes: a list on the phone, one take at a time. */
export type NotesPort = {
  readonly getSnapshot: () => NoteView
  readonly subscribe: (listener: () => void) => () => void
  /** Starts a take said on `line` (`lineOf`); nothing while one is under way. */
  readonly start: (line: string) => void
  /** Ends a take under way and keeps it. */
  readonly stop: () => void
  /**
   * The note kept on `line` at or after `since` (ms since the epoch), the
   * earliest such; null when the phone holds none.
   */
  readonly keptOn: (line: string, since: number) => string | null
}

export type RustRoundsPorts = {
  readonly store: RoundsStore
  readonly notes: NotesPort
  /** Puts `text` on the clipboard; rejects when it could not. */
  readonly copy: (text: string) => Promise<void>
  /** Milliseconds since the epoch. */
  readonly now: () => number
  readonly newId: () => string
  /**
   * Calls `listener` at once with whether the page is hidden now, then on
   * each change. Returns an unsubscribe.
   */
  readonly onVisibility: (listener: (hidden: boolean) => void) => () => void
}

export type RustRoundsRuntime = {
  readonly getSnapshot: () => PlayState
  readonly subscribe: (listener: () => void) => () => void
  readonly dispatch: (intent: PlayIntent) => void
  /**
   * The screen is showing; returns the detach. A take under way, or a card
   * waiting on its note, keeps the microphone heard past the detach until it
   * settles; the next opening settles what an ended app left waiting.
   */
  readonly attach: () => () => void
}

const iso = (ms: number): string => new Date(ms).toISOString()

export function createRustRounds(ports: RustRoundsPorts): RustRoundsRuntime {
  let state = initialState(
    ports.store.open(),
    { id: ports.newId(), startedAt: iso(ports.now()) },
    ports.notes.getSnapshot()
  )
  const listeners = new Set<() => void>()

  /** The microphone heard, while attached and after, until all settles. */
  let stopNotes: (() => void) | null = null
  let attached = false

  const send = (event: PlayEvent): void => {
    const next = step(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
    if (!attached && stopNotes !== null && !unsettled(state)) {
      stopNotes()
      stopNotes = null
    }
  }

  function run(effect: PlayEffect): void {
    switch (effect.type) {
      case "append": {
        send({
          type: "stored",
          record: "log",
          ok: ports.store.append(effect.head, effect.add),
        })
        return
      }
      case "hold": {
        send({
          type: "stored",
          record: "held",
          ok: ports.store.hold(effect.held),
        })
        return
      }
      case "savePlace": {
        send({
          type: "stored",
          record: "place",
          ok: ports.store.place(effect.place, effect.pending),
        })
        return
      }
      case "startNote": {
        ports.notes.start(effect.line)
        return
      }
      case "stopNote": {
        ports.notes.stop()
        return
      }
      case "copy": {
        const { seq, text } = effect
        ports.copy(text).then(
          () => send({ type: "copied", seq }),
          () => send({ type: "copyFailed", seq, text })
        )
        return
      }
      default: {
        assertNever(effect)
      }
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    dispatch: (intent): void => send({ ...intent, at: iso(ports.now()) }),
    attach(): () => void {
      attached = true
      stopNotes ??= ports.notes.subscribe(() =>
        send({ type: "notes", view: ports.notes.getSnapshot() })
      )
      // What changed between making the runtime and attaching it.
      send({ type: "notes", view: ports.notes.getSnapshot() })
      // Cards an ended app left waiting on a note: the phone may hold it.
      if (state.pending.length > 0) {
        send({
          type: "reopened",
          found: state.pending.map(({ line, since }) => ({
            line,
            note: ports.notes.keptOn(line, since),
          })),
          busy: ports.notes.getSnapshot().take.kind !== "idle",
        })
      }
      const stopVisibility = ports.onVisibility((hidden) => {
        if (hidden) send({ type: "hidden" })
      })
      return (): void => {
        attached = false
        stopVisibility()
        send({ type: "left" })
      }
    },
  }
}
