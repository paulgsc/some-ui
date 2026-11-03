/**
 * Runs the idea machine (`machine.ts`) against the outside world: the
 * listener (home hearing a take, `./hearing`, or the phone's recognizer),
 * through the turn's `turnListening`, and the idea store. It turns each
 * effect into a call on a port and each answer into an event, and stamps
 * each tap with when it happened. It decides nothing; which answer still
 * counts is `step`'s.
 *
 * - IH1: on a phone paired with home, an answer said is a take home hears,
 *   so "say an idea" works on every phone that records (`./hearing`).
 */
import { assertNever } from "@some-ui/core-utils"
import type { TurnListener } from "@some-ui/voice-capture"
import { turnListening } from "@some-ui/voice-capture"

import type { IdeaEffect, IdeaEvent, IdeaIntent, IdeaState } from "./machine"
import { apply, initialIdeaState, step } from "./machine"
import type { IdeaStore } from "./store"

export type IdeaPorts = {
  store: IdeaStore
  listener: TurnListener
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

  const listen = turnListening(ports.listener, (event) => send(event))

  function run(effect: IdeaEffect): void {
    switch (effect.type) {
      case "read": {
        send({ type: "listed", ideas: ports.store.list() })
        return
      }
      case "checkVoice":
      case "listen":
      case "stopListening":
      case "cancelListening": {
        listen(effect)
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
