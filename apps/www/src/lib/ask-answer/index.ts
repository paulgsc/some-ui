/**
 * Runs an ask's answer (`./model`, SFEED5) against the listener: home hearing
 * a take on the phone's desk of Studio's answers (`lib/idea-hearing`'s
 * `phoneHomeListener`), named by the ask's ref (`answerRef`), so it goes home
 * as a Studio take under it. It decides nothing; which result still counts is
 * `step`'s. Phone-only (`build.paths.ts`).
 */
import type { TurnListener } from "@some-ui/voice-capture"
import { turnListening } from "@some-ui/voice-capture"

import type { AnswerEvent, AnswerState } from "./model"
import { initialAnswer, step } from "./model"

export type { AnswerNotice, AnswerPhase } from "./model"

export type AskAnswer = {
  getSnapshot: () => AnswerState
  subscribe: (listener: () => void) => () => void
  dispatch: (
    event: Extract<AnswerEvent, { type: "talk" | "stopTalking" }>
  ) => void
  /** The screen is showing. Returns the detach, which lets a take go. */
  attach: () => () => void
}

/** `answers`: the ref the take is kept under on home. */
export function createAskAnswer(
  listener: TurnListener,
  answers: string
): AskAnswer {
  let state = initialAnswer
  const listeners = new Set<() => void>()
  const send = (event: AnswerEvent): void => {
    const next = step(state, event)
    if (next.state !== state) {
      state = next.state
      for (const each of listeners) each()
    }
    for (const effect of next.effects)
      run(effect.type === "listen" ? { ...effect, answers } : effect)
  }
  const run = turnListening(listener, send)
  return {
    getSnapshot: () => state,
    subscribe: (each) => {
      listeners.add(each)
      return (): void => {
        listeners.delete(each)
      }
    },
    dispatch: send,
    attach: () => {
      send({ type: "opened" })
      return (): void => {
        send({ type: "left" })
      }
    },
  }
}
