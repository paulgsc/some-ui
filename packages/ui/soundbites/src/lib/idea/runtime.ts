/**
 * Runs the idea machine (`machine.ts`) against the outside world: the
 * listener (home hearing a take, `./hearing`, or the phone's recognizer)
 * and the idea store. It turns each effect into a call on
 * a port and each answer into an event, and stamps each tap with when it
 * happened. It decides nothing; which answer still counts is `step`'s.
 *
 * - IH1: on a phone paired with home, an answer said is a take home hears,
 *   so "say an idea" works on every phone that records (`./hearing`).
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

/** A listening's take, for a listener that records one (`./hearing`). */
export type ListenTake = {
  /** What the take answers (`takeAnswers`). */
  readonly answers: string
  /** The take is kept, and its words are on their way (IH1). */
  readonly onHearing: () => void
}

/**
 * Where an answer's words come from: home hearing a take (`./hearing`), or
 * the phone's speech recognizer (www's `lib/device-listen`), which ignores
 * `take`.
 */
export type IdeaListener = {
  /** Whether it can listen at all; never rejects. */
  available: () => Promise<boolean>
  /**
   * Starts listening; `onWords` gets the words so far as they change, and
   * `onReady` is called once the recognizer says it is listening (LS1), or
   * the take is recording.
   */
  listen: (
    onWords: (words: string) => void,
    onReady: () => void,
    take?: ListenTake
  ) => Listening
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

/** `focus`: the idea whose waiting questions from Claude are answered (ST19), by id. */
export function createIdeaCapture(
  ports: IdeaPorts,
  focus: string
): IdeaRuntime {
  let state = initialIdeaState(focus)
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
        const { seq, answers } = effect
        const mine = ports.listener.listen(
          (words) => send({ type: "partial", seq, words }),
          () => send({ type: "ready", seq }),
          {
            answers,
            onHearing: () => send({ type: "hearing", seq }),
          }
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
        const { op } = effect
        send({
          type: "kept",
          ideas: ports.store.keep((ideas) => apply(ideas, op)),
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
    dispatch: (intent) => send({ ...intent, at: at() }),
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
