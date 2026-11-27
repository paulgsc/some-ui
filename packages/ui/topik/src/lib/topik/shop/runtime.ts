/**
 * Runs the shop machine (`shop`) over its port to home. A screen reads
 * `snapshot`, sends a hunch with `type` or `speak`, and its taps with `tap`.
 * The spoken take is held here, so a hunch home couldn't be reached for can
 * be heard again, until the next take replaces it or `dispose` lets it go.
 *
 * A request that fails, for any reason, is `unreached`, and reported
 * (`reportFailure`): the hunch may not be kept, and the screen says so and
 * offers to send it again. Each request names its hunch to home by this
 * runtime's id and the hunch's number.
 */

import { assertNever } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import { serialDispatch } from "@topik/lib/topik/read-aloud/serial-dispatch"
import type {
  Lookup,
  ShopEffect,
  ShopEvent,
  ShopState,
} from "@topik/lib/topik/shop"
import { initialShop, step } from "@topik/lib/topik/shop"

/** Home, as the shop asks it: typed ahead of its route (#2853). */
export type ShopPort = Readonly<{
  /** Home's Whisper: the words of a spoken take, in English. */
  hear: (take: Blob) => Promise<string>
  /**
   * Home's meaning index: the phrases a hunch's words find, or kept. `hunch`
   * names the hunch, the same each time it is sent: home keeps a miss once.
   */
  lookUp: (words: string, hunch: string) => Promise<Lookup>
}>

/** What the owner taps, once a hunch is sent. */
type Tap = Extract<ShopEvent, { kind: "retry" | "pick" | "put-back" | "again" }>

export type ShopRuntime = Readonly<{
  snapshot: () => ShopState
  type: (text: string) => void
  /** A spoken hunch: the take is held until the next one replaces it. */
  speak: (take: Blob) => void
  tap: (event: Tap) => void
  /** The screen is gone: late answers change nothing, and the take is let go. */
  dispose: () => void
}>

export const createShopRuntime = (
  port: ShopPort,
  onChange: (state: ShopState) => void,
  /** This runtime's id, which names its hunches to home. A test seam. */
  id: string = crypto.randomUUID()
): ShopRuntime => {
  let state = initialShop
  let take: Blob | null = null
  let disposed = false

  /** Every failure, a throw before the promise included, as `unreached`. */
  const ask = <T>(
    what: "hear" | "look-up",
    seq: number,
    call: () => Promise<T>,
    answer: (value: T) => ShopEvent
  ): void => {
    Promise.resolve()
      .then(call)
      .then(
        (value) => dispatch(answer(value)),
        (error: unknown) => {
          reportFailure({
            port: `topik shop (${what})`,
            error: toIntentError(error),
          })
          dispatch({ kind: "unreached", seq })
        }
      )
  }

  const run = (effect: ShopEffect): void => {
    switch (effect.kind) {
      case "hear": {
        if (take === null) {
          dispatch({ kind: "unreached", seq: effect.seq })
          return
        }
        const held = take
        ask(
          "hear",
          effect.seq,
          () => port.hear(held),
          (words) => ({
            kind: "heard",
            seq: effect.seq,
            hunch: effect.hunch,
            words,
          })
        )
        return
      }
      case "look-up": {
        ask(
          "look-up",
          effect.seq,
          () => port.lookUp(effect.words, `${id}-${effect.hunch}`),
          (lookup) => ({ kind: "answered", seq: effect.seq, lookup })
        )
        return
      }
      default: {
        assertNever(effect)
      }
    }
  }

  // An effect may dispatch (a hear with no take is unreached at once); that
  // event waits for the current one's effects, as in read-aloud's runtimes.
  const dispatch = serialDispatch<ShopEvent>(
    (event) => {
      if (disposed) return
      const next = step(state, event)
      if (next.state !== state) {
        state = next.state
        onChange(state)
      }
      for (const effect of next.effects) run(effect)
    },
    () => undefined
  )

  return {
    snapshot: () => state,
    type: (text): void => {
      dispatch({ kind: "hunch", hunch: { kind: "typed", text } })
    },
    speak: (spoken): void => {
      if (disposed) return
      take = spoken
      dispatch({ kind: "hunch", hunch: { kind: "spoken" } })
    },
    tap: dispatch,
    dispose: (): void => {
      disposed = true
      take = null
    },
  }
}
