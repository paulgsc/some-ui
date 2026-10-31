/**
 * Runs the recorder's machine (`machine.ts`) against the outside world. It
 * holds the handles (the take, the page clock, home's feed), turns each
 * effect into a call on a port and each result into an event, and decides
 * nothing: whether a result still matters is `step`'s. Plain TypeScript, so
 * deleting React deletes none of this.
 *
 * What it starts it also ends: the page clock, the feed and the store's
 * word on bites it held run while the page is attached. While attached it
 * tells the feed what the recorder is on (`homeChoice`) each time that
 * changes, so home offers for the game on screen in the mode picked. A take under way
 * when the page is left is finished and kept, and its keep still runs after
 * the detach: the bite outlives the page.
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
import { homeChoice, initialState, step } from "./machine"
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
  // What home was last told the recorder is on, as its JSON; null while
  // the page is not attached.
  let told: string | null = null

  /** Tells home what the recorder is on, once per change, while attached. */
  function tellHome(): void {
    if (told === null) return
    const choice = homeChoice(state)
    const said = JSON.stringify(choice)
    if (said === told) return
    told = said
    ports.feed.choose(choice)
  }

  const dispatch = (event: GameWeekEvent): void => {
    const next = step(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
    tellHome()
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

  /** Tells `step` of each bite the store held and has since kept. */
  function reconcile(): void {
    const kept = state.keeping
      .filter(({ id, held }) => held && ports.store.isKept(id))
      .map(({ id }) => id)
    for (const id of kept) dispatch({ type: "kept", id })
  }

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
          () => dispatch({ type: "keepFailed", id: bite.id })
        )
        return
      }
      case "amend": {
        ports.store.amend(effect.id, effect.fields, effect.holdUntil).then(
          (outcome) => {
            if (outcome === "on-its-way")
              dispatch({ type: "amendFailed", onItsWay: true })
          },
          () => dispatch({ type: "amendFailed", onItsWay: false })
        )
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
      const unwatchPage = ports.onVisibility((hidden) => {
        dispatch({ type: hidden ? "hidden" : "shown" })
        // Back from the background: what ran out meanwhile closes now.
        if (!hidden) dispatch({ type: "clock", now: ports.now() })
      })
      dispatch({ type: "arrived" })
      told = ""
      const unwatchFeed = ports.feed.watch((feed) =>
        dispatch({ type: "fed", feed })
      )
      tellHome()
      const unwatchStore = ports.store.subscribe(reconcile)
      reconcile()
      const clock = setInterval(
        () => dispatch({ type: "clock", now: ports.now() }),
        PAGE_TICK_MS
      )
      return () => {
        clearInterval(clock)
        unwatchStore()
        told = null
        unwatchFeed()
        unwatchPage()
        dispatch({ type: "left" })
      }
    },
  }
}
