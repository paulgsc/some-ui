/**
 * Runs the note composer (`../composer`) against the outside world: the
 * note store, the recognizer, the clock and the page's visibility. It holds
 * the one handle with an async lifetime (the utterance being listened to),
 * turns each effect into a call on a port and each result into an event.
 * It decides nothing: whether a result still matters is `step`'s, by its
 * sequence number. Plain TypeScript, so `RoundSession` only subscribes and
 * dispatches (docs/monorepo-boundaries.md, invariant R1).
 */

import type {
  ComposerEffect,
  ComposerEvent,
  ComposerIntent,
  ComposerState,
} from "@leetype/lib/leetype/notes/composer"
import { initialComposerState, step } from "@leetype/lib/leetype/notes/composer"
import type { Dictation, Listening } from "@leetype/lib/leetype/notes/dictation"
import { dictationFailureOf } from "@leetype/lib/leetype/notes/dictation"
import type { NoteStore } from "@leetype/lib/leetype/notes/store"
import { assertNever } from "some-ui-utils"

export type ComposerPorts = {
  store: NoteStore
  /** The recognizer, or null where there is none: typing only. */
  dictation: Dictation | null
  /** Milliseconds since the epoch. */
  now: () => number
  newId: () => string
  /**
   * Calls `listener` at once with whether the page is hidden now, then on
   * each change. Returns an unsubscribe.
   */
  onVisibility: (listener: (hidden: boolean) => void) => () => void
}

export type ComposerRuntime = {
  getSnapshot: () => ComposerState
  subscribe: (listener: () => void) => () => void
  dispatch: (intent: ComposerIntent) => void
  /**
   * Starts following the page's visibility. Returns the matching detach,
   * which abandons an utterance in progress (the note itself is already
   * saved). Attaching again after detaching resumes.
   */
  attach: () => () => void
}

export function createNoteComposer(ports: ComposerPorts): ComposerRuntime {
  let state = initialComposerState(ports.dictation !== null)
  let listening: Listening | null = null
  const listeners = new Set<() => void>()

  const send = (event: ComposerEvent): void => {
    const next = step(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  const cancel = (): void => {
    listening?.cancel()
    listening = null
  }

  function run(effect: ComposerEffect): void {
    switch (effect.type) {
      case "save": {
        ports.store.put(effect.note, ports.now())
        return
      }
      case "remove": {
        ports.store.remove(effect.id, ports.now())
        return
      }
      case "listen": {
        cancel()
        const { seq } = effect
        if (ports.dictation === null) {
          send({ type: "listenFailed", seq, reason: "failed" })
          return
        }
        const utterance = ports.dictation.listen((heard) =>
          send({ type: "heard", seq, heard })
        )
        listening = utterance
        utterance.done.then(
          (text) => {
            if (listening === utterance) listening = null
            send({ type: "transcribed", seq, text })
          },
          (error: unknown) => {
            if (listening === utterance) listening = null
            send({
              type: "listenFailed",
              seq,
              reason: dictationFailureOf(error),
            })
          }
        )
        return
      }
      case "finishListening": {
        listening?.stop()
        return
      }
      case "cancelListening": {
        cancel()
        return
      }
      default: {
        assertNever(effect)
      }
    }
  }

  return {
    getSnapshot: (): ComposerState => state,
    subscribe: (listener): (() => void) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    dispatch: (intent): void => {
      if (intent.type === "kindPicked") {
        send({
          type: "noteStarted",
          kind: intent.kind,
          id: ports.newId(),
          at: new Date(ports.now()).toISOString(),
        })
        return
      }
      send(intent)
    },
    attach: (): (() => void) => {
      const unsubscribe = ports.onVisibility((hidden) =>
        send({ type: hidden ? "hidden" : "shown" })
      )
      return (): void => {
        unsubscribe()
        cancel()
      }
    },
  }
}

/** The ports as a page provides them: `localStorage`, the clock, `document`. */
export function browserComposerPorts(
  store: NoteStore,
  dictation: Dictation | null
): ComposerPorts {
  return {
    store,
    dictation,
    now: (): number => Date.now(),
    // Not `crypto.randomUUID`: it exists only in a secure context, and the
    // home build is served over plain http on the LAN.
    newId: (): string => {
      const [high, low] = crypto.getRandomValues(new Uint32Array(2))
      return `n-${Date.now().toString(36)}-${(high ?? 0).toString(36)}${(low ?? 0).toString(36)}`
    },
    onVisibility: (listener): (() => void) => {
      if (typeof document === "undefined") return () => undefined
      const onChange = (): void =>
        listener(document.visibilityState === "hidden")
      onChange()
      document.addEventListener("visibilitychange", onChange)
      return (): void =>
        document.removeEventListener("visibilitychange", onChange)
    },
  }
}
