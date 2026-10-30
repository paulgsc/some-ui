/**
 * Runs the idea machine (`machine.ts`) against the outside world: the
 * phone's recognizer and the idea store. It turns each effect into a call on
 * a port and each answer into an event, and stamps each tap with when it
 * happened. It decides nothing; which answer still counts is `step`'s.
 */
import { assertNever } from "@some-ui/core-utils"

import type {
  IdeaEffect,
  IdeaEvent,
  IdeaIntent,
  IdeaState,
  Listened,
} from "./machine"
import { apply, initialIdeaState, step } from "./machine"
import type { IdeaStore } from "./store"

/** One listening under way. */
export type Listening = {
  /** Settles once, never rejects: how the listening ended. */
  readonly done: Promise<Listened>
  /** Stop listening and settle with what was heard. */
  stop: () => void
  /** Let go: nothing more is reported for it. */
  cancel: () => void
}

/** The phone's speech recognizer. */
export type IdeaListener = {
  /** Whether it can listen at all; never rejects. */
  available: () => Promise<boolean>
  /** Starts listening; `onWords` gets the words so far as they change. */
  listen: (onWords: (words: string) => void) => Listening
}

/** No recognizer: every question takes typed words. */
export const NO_LISTENER: IdeaListener = {
  available: () => Promise.resolve(false),
  listen: () => ({
    done: Promise.resolve({ kind: "unavailable" }),
    stop: () => undefined,
    cancel: () => undefined,
  }),
}

export type IdeaPorts = {
  store: IdeaStore
  listener: IdeaListener
  /** Milliseconds since the epoch. */
  now: () => number
  /** A new idea's id: letters, digits and dashes. */
  newId: () => string
  /** As `SoundbitesPorts.onVisibility`: now, then on each change. */
  onVisibility: (listener: (hidden: boolean) => void) => () => void
}

export type IdeaRuntime = {
  getSnapshot: () => IdeaState
  subscribe: (listener: () => void) => () => void
  dispatch: (intent: IdeaIntent) => void
  /** The screen is showing. Returns the detach. */
  attach: () => () => void
}

export function createIdeaCapture(ports: IdeaPorts): IdeaRuntime {
  let state = initialIdeaState(ports.newId())
  let listening: Listening | null = null
  const listeners = new Set<() => void>()
  const at = (): string => new Date(ports.now()).toISOString()

  const send = (event: IdeaEvent): void => {
    const next = step(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  function run(effect: IdeaEffect): void {
    switch (effect.type) {
      case "read": {
        send({ type: "listed", ideas: ports.store.list() })
        return
      }
      case "checkVoice": {
        void ports.listener
          .available()
          .then((available) => send({ type: "voiceChecked", available }))
        return
      }
      case "listen": {
        listening?.cancel()
        const { seq } = effect
        const mine = ports.listener.listen((words) =>
          send({ type: "partial", seq, words })
        )
        listening = mine
        void mine.done.then((result) => {
          if (listening === mine) listening = null
          send({ type: "listened", seq, result })
        })
        return
      }
      case "stopListening": {
        listening?.stop()
        return
      }
      case "cancelListening": {
        listening?.cancel()
        listening = null
        return
      }
      case "keep": {
        const { op, at } = effect
        send({
          type: "kept",
          ideas: ports.store.keep((ideas) => apply(ideas, op, at)),
        })
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
    dispatch: (intent) =>
      send(
        intent.type === "another"
          ? { ...intent, at: at(), id: ports.newId() }
          : { ...intent, at: at() }
      ),
    attach(): () => void {
      send({ type: "entered", at: at() })
      const unwatchPage = ports.onVisibility((hidden) => {
        if (hidden) send({ type: "hidden" })
      })
      return () => {
        unwatchPage()
        send({ type: "left" })
      }
    },
  }
}
