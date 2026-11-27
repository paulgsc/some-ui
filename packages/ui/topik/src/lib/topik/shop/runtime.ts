/**
 * Runs the shop machine (`shop`) over its port to home. A screen reads
 * `snapshot`, sends a typed hunch with `type`, a spoken one with `record`
 * (where the port offers takes), and its taps with `tap`.
 *
 * A request that fails, for any reason, is reported (`reportFailure`), and
 * the screen offers to send it again; a look-up that fails is kept for home
 * (`keep`), even once the screen is gone. Each request names its hunch to
 * home: a typed one by this runtime's id and the hunch's number, a spoken
 * one by the name its take was recorded under, which its voice note carries
 * as its ref, so home finds the take from the hunch.
 */

import { assertNever } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { PatternTake, TakePattern } from "@some-ui/voice-capture"
import { serialDispatch } from "@topik/lib/topik/read-aloud/serial-dispatch"
import type {
  Lookup,
  ShopEffect,
  ShopEvent,
  ShopState,
} from "@topik/lib/topik/shop"
import { initialShop, step } from "@topik/lib/topik/shop"

/**
 * The phone's takes of spoken hunches, on the take pattern, as the grammar
 * lens's (`LensTakes`): each take's item is the hunch's name.
 */
export type ShopTakes = Readonly<{
  pattern: TakePattern
  getSnapshot: () => Readonly<{
    takes: ReadonlyArray<PatternTake>
    full: boolean
  }>
  subscribe: (listener: () => void) => () => void
}>

/** What home said of a spoken take's words. */
export type Heard = Readonly<
  | { kind: "heard"; words: string }
  /** Home holds the take and hasn't heard it yet. */
  | { kind: "held" }
  /** The take is still on its way to home. */
  | { kind: "going" }
>

/** Home, as the shop asks it (paulgsc/server#1265). */
export type ShopPort = Readonly<{
  /**
   * The phone's takes of spoken hunches, each kept here until home has it;
   * absent, no hunch is spoken.
   */
  takes?: ShopTakes | undefined
  /**
   * Home's Whisper: the words of the spoken take `note`, hunch `hunch`'s,
   * once home has heard it; or that it hasn't in time, home holding it or
   * the take still on its way there. `gone` aborts once the screen is gone.
   */
  hear: (note: string, hunch: string, gone: AbortSignal) => Promise<Heard>
  /**
   * Home's meaning index: the phrases a hunch's words find, or kept. `hunch`
   * names the hunch, the same each time it is sent: home keeps a miss once.
   */
  lookUp: (words: string, hunch: string) => Promise<Lookup>
  /**
   * Keeps a look-up home didn't answer, to send when home is next reached;
   * false when this phone couldn't keep it.
   */
  keep: (words: string, hunch: string) => boolean
}>

/** What the owner taps, once a hunch is sent. */
type Tap = Extract<ShopEvent, { kind: "retry" | "pick" | "put-back" | "again" }>

export type ShopRuntime = Readonly<{
  snapshot: () => ShopState
  type: (text: string) => void
  /**
   * Starts a spoken hunch's take, or stops the one under way, where the
   * port offers takes; the take, once kept, is the hunch.
   */
  record: () => void
  tap: (event: Tap) => void
  /** The screen is gone: late answers change nothing, and a take under way is kept. */
  dispose: () => void
  /** The screen is shown again (a second mount): answers count again. */
  resume: () => void
}>

export const createShopRuntime = (
  port: ShopPort,
  onChange: (state: ShopState) => void,
  /** This runtime's id, which names its hunches to home. A test seam. */
  id: string = crypto.randomUUID()
): ShopRuntime => {
  let state = initialShop
  let disposed = false
  let gone = new AbortController()
  let said = 0
  /** The name the next take is recorded under. */
  let recording = `${id}-said-1`

  const named = (hunch: number, name: string | null): string =>
    name ?? `${id}-${hunch}`

  /** Every failure, a throw before the promise included, as `failed`. */
  const ask = <T>(
    what: "hear" | "look-up",
    failed: ShopEvent,
    call: () => Promise<T>,
    answer: (value: T) => ShopEvent
  ): void => {
    // A hear the screen's going aborted: nothing to say, as `resume` asks again.
    const asked = gone.signal
    Promise.resolve()
      .then(call)
      .then(
        (value) => dispatch(answer(value)),
        (error: unknown) => {
          // A look-up that fails is kept however late; a hear is asked again.
          if (what === "hear" && asked.aborted) return
          reportFailure({
            port: `topik shop (${what})`,
            error: toIntentError(error),
          })
          dispatch(failed)
        }
      )
  }

  const run = (effect: ShopEffect): void => {
    switch (effect.kind) {
      case "hear": {
        const { seq, hunch, note, name } = effect
        ask(
          "hear",
          { kind: "unreached", seq },
          () => port.hear(note, name, gone.signal),
          (heard): ShopEvent =>
            heard.kind === "heard"
              ? { kind: "heard", seq, hunch, name, words: heard.words }
              : { kind: "unheard", seq, going: heard.kind === "going" }
        )
        return
      }
      case "look-up": {
        const { seq, hunch, words, name } = effect
        ask(
          "look-up",
          { kind: "unanswered", seq, hunch, words, name },
          () => port.lookUp(words, named(hunch, name)),
          (lookup) => ({ kind: "answered", seq, lookup })
        )
        return
      }
      case "keep": {
        if (!port.keep(effect.words, named(effect.hunch, effect.name)))
          dispatch({ kind: "unkept", hunch: effect.hunch })
        return
      }
      default: {
        assertNever(effect)
      }
    }
  }

  // An effect may dispatch (a keep this phone couldn't make); that event
  // waits for the current one's effects, as in read-aloud's runtimes.
  const dispatch = serialDispatch<ShopEvent>(
    (event) => {
      if (disposed) {
        // The screen is gone, but what the owner typed is still kept.
        if (event.kind === "unanswered")
          port.keep(event.words, named(event.hunch, event.name))
        return
      }
      const next = step(state, event)
      if (next.state !== state) {
        state = next.state
        onChange(state)
      }
      for (const effect of next.effects) run(effect)
    },
    () => undefined
  )

  // A take kept under the name it was started on is that hunch, spoken:
  // followed from the first record until the screen is gone.
  const takes = port.takes
  let ended = 0
  let following: (() => void) | null = null
  const follow = (): (() => void) => {
    if (takes === undefined) return (): void => undefined
    ended = takes.pattern.getSnapshot().ended?.seq ?? 0
    return takes.pattern.subscribe(() => {
      const last = takes.pattern.getSnapshot().ended
      if (last === null || last.seq === ended) return
      ended = last.seq
      if (last.ending !== "kept" || last.id === null) return
      if (last.answers !== recording) return
      const name = recording
      said += 1
      recording = `${id}-said-${String(said + 1)}`
      dispatch({
        kind: "hunch",
        hunch: { kind: "spoken", note: last.id, name },
      })
    })
  }

  return {
    snapshot: () => state,
    type: (text): void => {
      dispatch({ kind: "hunch", hunch: { kind: "typed", text } })
    },
    record: (): void => {
      if (disposed || takes === undefined) return
      following ??= follow()
      takes.pattern.tap(recording)
    },
    tap: dispatch,
    dispose: (): void => {
      if (disposed) return
      disposed = true
      gone.abort()
      // A take under way is kept by `leave`, under this name, and goes home
      // as a voice note: the next take is another hunch, so another name.
      if (takes?.pattern.getSnapshot().take.kind === "recording") {
        said += 1
        recording = `${id}-said-${String(said + 1)}`
      }
      following?.()
      following = null
      takes?.pattern.leave()
    },
    resume: (): void => {
      if (!disposed) return
      disposed = false
      gone = new AbortController()
      // A hear the screen's going stopped is asked again.
      const { at } = state
      if (at.kind === "hearing") {
        const { number, note, name } = at
        run({ kind: "hear", seq: state.seq, hunch: number, note, name })
      }
    },
  }
}
