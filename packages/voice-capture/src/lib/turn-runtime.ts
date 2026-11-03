/**
 * Runs a turn's listening (`./turn`) against a listener: home hearing a
 * take (Studio's `homeHearing`), or the phone's recognizer (www's
 * `lib/device-listen`). It owns the one listening under way, turns each
 * listening effect into a call on the listener and each answer into an
 * event, and decides nothing: which answer still counts is `stepTurn`'s, by
 * the listening's number.
 */
import { assertNever } from "@some-ui/core-utils"

import type { Listened, TurnEffect, TurnEvent } from "./turn"

/** One listening under way. */
export type Listening = {
  /** Settles once, never rejects: how the listening ended. */
  readonly done: Promise<Listened>
  /** Stop listening and settle with what was heard. */
  stop: () => void
  /** Let go: nothing more is reported for it. */
  cancel: () => void
}

/** A listening's take, for a listener that records one. */
export type ListenTake = {
  /** What the take answers, as it is kept and told home. */
  readonly answers: string
  /** The take is kept, and its words are on their way. */
  readonly onHearing: () => void
}

/**
 * Where a turn's words come from: home hearing a take, or the phone's
 * speech recognizer, which ignores `take`.
 */
export type TurnListener = {
  /** Whether it can listen at all; never rejects. */
  available: () => Promise<boolean>
  /**
   * Starts listening; `onWords` gets the words so far as they change, and
   * `onReady` is called once the recognizer says it is listening, or the
   * take is recording.
   */
  listen: (
    onWords: (words: string) => void,
    onReady: () => void,
    take?: ListenTake
  ) => Listening
}

/** No recognizer: every turn takes typed words. */
export const NO_LISTENER: TurnListener = {
  available: () => Promise.resolve(false),
  listen: () => ({
    done: Promise.resolve({ kind: "unavailable" }),
    stop: () => undefined,
    cancel: () => undefined,
  }),
}

/**
 * The listening effects, which `turnListening` runs: a turn's, with what a
 * take for it answers, which the screen knows (its question, its card).
 */
export type ListeningEffect =
  | Exclude<TurnEffect, { type: "keep" | "listen" }>
  | {
      readonly type: "listen"
      readonly seq: number
      readonly answers: string
    }

type ListeningEvent = Extract<
  TurnEvent,
  { type: "voiceChecked" | "ready" | "hearing" | "partial" | "listened" }
>

/** `send` takes the listener's answers as turn events. */
export function turnListening(
  listener: TurnListener,
  send: (event: ListeningEvent) => void
): (effect: ListeningEffect) => void {
  let listening: Listening | null = null
  return (effect) => {
    switch (effect.type) {
      case "checkVoice": {
        void listener
          .available()
          .then((available) => send({ type: "voiceChecked", available }))
        return
      }
      case "listen": {
        listening?.cancel()
        const { seq, answers } = effect
        const mine = listener.listen(
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
      default: {
        assertNever(effect)
      }
    }
  }
}
