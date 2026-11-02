/**
 * Runs the session's machine (`./machine`) against the outside world. It
 * holds the handles (the microphone's notes, the page's visibility), turns
 * each effect into a call on a port and each result into an event, and
 * decides nothing: whether a result still matters is `step`'s. Plain
 * TypeScript, so deleting React deletes none of this.
 *
 * Its ports (#2235): what is held and the log (`store`, through the one
 * kept-record reader), the microphone (`notes`: the phone's take pattern
 * and the notes it keeps; none in the viewer's sample on Pages, #2241), the
 * clipboard, the clock and the page. None of them is the network: every card
 * plays from what is on the phone.
 *
 * Only an attached runtime acts: it hears the microphone from `attach` to its
 * detach and no longer. What it leaves unsettled (a take under way, a card
 * waiting on its note) is kept with the place, and the next opening settles
 * it from what the phone holds. Each route mount makes a runtime, and all of
 * them share one microphone, so a detached one that went on hearing it would
 * act on records a newer one now owns. Voice notes wait on the phone in the microphone's own list;
 * sending them and the log home is RR6 (#2237) and RR7 (#2238).
 */
import { assertNever } from "@some-ui/core-utils"
import type {
  PatternTake,
  TakePattern,
  TakePatternSnapshot,
} from "@some-ui/voice-capture"
import {
  initialTakePattern,
  ONE_TAKE,
  takePatternSnapshot,
} from "@some-ui/voice-capture"

import type { PlayEffect, PlayEvent, PlayIntent, PlayState } from "./machine"
import { initialState, step } from "./machine"
import type { RoundsStore } from "./store"

/**
 * The microphone's voice notes: the phone's take pattern, one take at a
 * time, each answering a card's line (`lineOf`), and the notes it keeps.
 */
export type NotesPort = {
  /** One current note per card (`per: "one"`), Redo and Let go. */
  readonly pattern: TakePattern
  /** The notes kept, as the pattern lists them; the same array while nothing changed. */
  readonly takes: {
    readonly getSnapshot: () => ReadonlyArray<PatternTake>
    readonly subscribe: (listener: () => void) => () => void
  }
  /**
   * The note kept on `line` at or after `since` (ms since the epoch), the
   * earliest such; null when the phone holds none.
   */
  readonly keptOn: (line: string, since: number) => string | null
}

export type RustRoundsPorts = {
  readonly store: RoundsStore
  /**
   * The microphone; null in a build that has none (the viewer's sample on
   * Pages, #2241). There the speak step says what it would do in place of
   * the take button, so no take ever starts.
   */
  readonly notes: NotesPort | null
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
   * The screen is showing; returns the detach, after which the runtime hears
   * the microphone no more. What the detach leaves unsettled is kept with the
   * place, and the next opening settles it.
   */
  readonly attach: () => () => void
}

const iso = (ms: number): string => new Date(ms).toISOString()

/**
 * The take pattern at rest, as the kit itself makes it: what the session
 * sees of a microphone where the build has none (`RustRoundsPorts.notes`).
 */
const AT_REST: TakePatternSnapshot = takePatternSnapshot(
  initialTakePattern,
  ONE_TAKE
)

export function createRustRounds(ports: RustRoundsPorts): RustRoundsRuntime {
  const pattern = ports.notes?.pattern ?? null
  const notesNow = (): TakePatternSnapshot => pattern?.getSnapshot() ?? AT_REST
  let state = initialState(
    ports.store.open(),
    { id: ports.newId(), startedAt: iso(ports.now()) },
    notesNow()
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
          ok: ports.store.place({
            place: effect.place,
            taking: effect.taking,
            pending: effect.pending,
          }),
        })
        return
      }
      // With no microphone the screen offers none of these, and a hidden
      // page or a detach has no take to end.
      case "tapNote": {
        pattern?.tap(effect.line, effect.supersedes)
        return
      }
      case "stopNote": {
        pattern?.leave()
        return
      }
      case "playNote": {
        pattern?.play(effect.id)
        return
      }
      case "setAsideNote": {
        pattern?.letGo(effect.id, effect.place)
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
      const stopNotes =
        pattern?.subscribe(() =>
          send({ type: "notes", view: pattern.getSnapshot() })
        ) ?? ((): void => undefined)
      // What changed between making the runtime and attaching it.
      send({ type: "notes", view: notesNow() })
      // Additions an earlier opening's log refused: written before any new one.
      if (state.notKept.log) {
        send({ type: "stored", record: "log", ok: ports.store.flush() })
      }
      // The take and the cards an earlier opening left unsettled: the phone
      // may hold their notes.
      const unsettled = new Map<string, number>()
      if (state.taking !== null) {
        unsettled.set(state.taking.line, state.taking.since)
      }
      for (const { line, since } of state.pending) unsettled.set(line, since)
      if (unsettled.size > 0) {
        send({
          type: "reopened",
          found: [...unsettled].map(([line, since]) => ({
            line,
            note: ports.notes?.keptOn(line, since) ?? null,
          })),
          busy: notesNow().take.kind !== "idle",
        })
      }
      const stopVisibility = ports.onVisibility((hidden) => {
        if (hidden) send({ type: "hidden" })
      })
      return (): void => {
        stopVisibility()
        // Ends a take under way; its end is the next opening's to hear.
        send({ type: "left" })
        stopNotes()
      }
    },
  }
}
