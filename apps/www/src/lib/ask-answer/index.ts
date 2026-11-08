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
  /** The screen is showing. Returns the detach; a take under way is kept. */
  attach: () => () => void
}

/** `answers`: the ref the take is kept under on home. */
export type AskAnswerPorts = {
  readonly listener: TurnListener
  /** Settles once the phone's pairing has been read; never rejects. */
  readonly loaded: () => Promise<void>
  readonly paired: () => boolean
  /** As `onPageVisibility`: now, then on each change. */
  readonly onVisibility: (listener: (hidden: boolean) => void) => () => void
}

export function createAskAnswer(
  ports: AskAnswerPorts,
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
    for (const effect of next.effects) {
      if (effect.type === "checkVoice") checkVoice()
      else run(effect.type === "listen" ? { ...effect, answers } : effect)
    }
  }
  const run = turnListening(ports.listener, send)
  // Only home hears an answer, so the phone's pairing is read first.
  const checkVoice = (): void => {
    void ports.loaded().then(() => {
      if (ports.paired()) run({ type: "checkVoice" })
      else send({ type: "unpaired" })
    })
  }
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
      const stop = ports.onVisibility((hidden) => {
        if (hidden) send({ type: "hidden" })
      })
      return (): void => {
        stop()
        send({ type: "left" })
      }
    },
  }
}
