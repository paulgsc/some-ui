/**
 * Runs the recorder's machine (`machine.ts`) against the outside world. It
 * holds the handles (the take, the page clock, home's feed), turns each
 * effect into a call on a port and each result into an event, and decides
 * nothing: whether a result still matters is `step`'s. Plain TypeScript, so
 * deleting React deletes none of this.
 *
 * What it starts it also ends: the page clock and the feed run while the
 * page is attached. A take under way when the page is left is finished and
 * kept, and its keep still runs after the detach: the bite outlives the page.
 */
import { assertNever } from "@some-ui/core-utils"
import type { StartRecording } from "@some-ui/voice-capture"
import { takeRunner } from "@some-ui/voice-capture"

import type { FeedPort } from "./feed"
import type {
  GameWeekEffect,
  GameWeekEvent,
  GameWeekIntent,
  GameWeekState,
} from "./machine"
import { initialState, step } from "./machine"
import type { BiteStore, PrefsPort } from "./ports"

/** How often a bite's clock and level are read while it records. */
const TAKE_TICK_MS = 100

/** How often the page's clock moves: "how long ago", Undo's window. */
const PAGE_TICK_MS = 500

export type GameWeekPorts = {
  startRecording: StartRecording
  store: BiteStore
  feed: FeedPort
  prefs: PrefsPort
  /** Milliseconds since the epoch. */
  now: () => number
  newId: () => string
  /**
   * Calls `listener` at once with whether the page is hidden now, then on
   * each change. Returns an unsubscribe.
   */
  onVisibility: (listener: (hidden: boolean) => void) => () => void
}

export type GameWeekRuntime = {
  getSnapshot: () => GameWeekState
  subscribe: (listener: () => void) => () => void
  dispatch: (intent: GameWeekIntent) => void
  /** The page is showing; returns the detach, which keeps a bite under way. */
  attach: () => () => void
}

export function createGameWeek(ports: GameWeekPorts): GameWeekRuntime {
  let state = initialState(ports.prefs.read(), ports.now())
  const listeners = new Set<() => void>()

  const dispatch = (event: GameWeekEvent): void => {
    const next = step(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  const take = takeRunner(
    {
      startRecording: ports.startRecording,
      now: ports.now,
      tickMs: TAKE_TICK_MS,
    },
    (signal) =>
      dispatch(
        signal.type === "taken"
          ? { ...signal, id: ports.newId(), at: ports.now() }
          : signal
      )
  )

  function run(effect: GameWeekEffect): void {
    switch (effect.type) {
      case "openMic":
      case "startClock":
      case "stopClock":
      case "finishTake":
      case "discardTake": {
        take.run(effect)
        return
      }
      case "keep": {
        const { bite, audio } = effect
        ports.store.keep(bite, audio).then(
          () => dispatch({ type: "kept", id: bite.id }),
          () => dispatch({ type: "keepFailed", bite, audio })
        )
        return
      }
      case "amend": {
        ports.store
          .amend(effect.id, effect.fields, effect.holdUntil)
          .catch(() => dispatch({ type: "amendFailed" }))
        return
      }
      case "release": {
        // Ignored: a bite whose release fails is still offered home once
        // its hold runs out (`holdUntil`), so nothing waits on this.
        ports.store.release(effect.id).catch(() => undefined)
        return
      }
      case "undo": {
        ports.store
          .undo(effect.id)
          .catch(() => dispatch({ type: "undoFailed" }))
        return
      }
      case "savePrefs": {
        ports.prefs.save(effect.prefs)
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
    dispatch,
    attach(): () => void {
      const unwatchPage = ports.onVisibility((hidden) =>
        dispatch({ type: hidden ? "hidden" : "shown" })
      )
      dispatch({ type: "arrived" })
      const unwatchFeed = ports.feed.watch((feed) =>
        dispatch({ type: "fed", feed })
      )
      const clock = setInterval(
        () => dispatch({ type: "clock", now: ports.now() }),
        PAGE_TICK_MS
      )
      return () => {
        clearInterval(clock)
        unwatchFeed()
        unwatchPage()
        dispatch({ type: "left" })
      }
    },
  }
}
