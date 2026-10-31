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
import { initialState, step } from "./machine"
import type { RoundsStore } from "./store"

/** The microphone's voice notes: a list on the phone, one take at a time. */
export type NotesPort = {
  readonly getSnapshot: () => NoteView
  readonly subscribe: (listener: () => void) => () => void
  /** Starts a take said on `line` (`lineOf`); nothing while one is under way. */
  readonly start: (line: string) => void
  /** Ends a take under way and keeps it. */
  readonly stop: () => void
  /** A new card: how the last take ended stops being said. */
  readonly reset: () => void
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
  /** The screen is showing; returns the detach. */
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

  const send = (event: PlayEvent): void => {
    const next = step(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  function run(effect: PlayEffect): void {
    switch (effect.type) {
      case "append": {
        send({
          type: "stored",
          ok: ports.store.append(effect.head, effect.add),
        })
        return
      }
      case "hold": {
        send({ type: "stored", ok: ports.store.hold(effect.held) })
        return
      }
      case "savePlace": {
        send({ type: "stored", ok: ports.store.place(effect.place) })
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
      case "resetNote": {
        ports.notes.reset()
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
      const stopNotes = ports.notes.subscribe(() =>
        send({ type: "notes", view: ports.notes.getSnapshot() })
      )
      // What changed between making the runtime and attaching it.
      send({ type: "notes", view: ports.notes.getSnapshot() })
      const stopVisibility = ports.onVisibility((hidden) => {
        if (hidden) send({ type: "hidden" })
      })
      return (): void => {
        stopNotes()
        stopVisibility()
        send({ type: "left" })
      }
    },
  }
}
