/**
 * Runs the recorder's machine (`machine.ts`) against the outside world. It
 * holds the handles (the take through `takeRunner`, the playback through the
 * pattern's own `takePlayback`, the page clock, home's feed), turns each
 * effect into a call on a port and each result into an event, and decides
 * nothing: whether a result still matters is `step`'s. Plain TypeScript, so
 * deleting React deletes none of this.
 *
 * What it starts it also ends: the page clock, the feed and the store's
 * word on bites it held run while the page is attached. A take under way
 * when the page is left is finished and kept, and its keep still runs after
 * the detach: the bite outlives the page.
 */
import { assertNever } from "@some-ui/core-utils"
import type {
  MicOwner,
  Player,
  StartRecording,
  TakeDeadlines,
} from "@some-ui/voice-capture"
import { takePlayback, takeRunner } from "@some-ui/voice-capture"

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
  /** Plays a kept bite back; the kit's `audioPlayer` unless a test gives its own. */
  player?: Player | undefined
  /** The phone's one microphone unless a test gives its own. */
  owner?: MicOwner | undefined
  /** The microphone's deadlines unless a test gives its own. */
  deadlines?: TakeDeadlines | undefined
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
      owner: ports.owner,
      deadlines: ports.deadlines,
    },
    (signal) =>
      dispatch(
        signal.type === "taken"
          ? { ...signal, id: ports.newId(), at: ports.now() }
          : signal
      )
  )

  const playback = takePlayback(
    { audio: (id) => ports.store.audio(id), player: ports.player },
    dispatch
  )

  /**
   * Tells `step` of each bite the store held and has since kept, and since
   * when home holds the bite on its row.
   */
  function reconcile(): void {
    const kept = state.keeping
      .filter(({ id, held }) => held && ports.store.isKept(id))
      .map(({ id }) => id)
    for (const id of kept) dispatch({ type: "kept", id })
    const row = state.lastBite
    if (row === null || row.take.kept.place === "home") return
    const since = ports.store.homeSince(row.take.id)
    if (since !== null) dispatch({ type: "homeHolds", id: row.take.id, since })
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
      case "loadAudio":
      case "playAudio":
      case "stopAudio": {
        playback.run(effect)
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
      const unwatchFeed = ports.feed.watch((feed) =>
        dispatch({ type: "fed", feed })
      )
      const unwatchStore = ports.store.subscribe(reconcile)
      reconcile()
      const clock = setInterval(
        () => dispatch({ type: "clock", now: ports.now() }),
        PAGE_TICK_MS
      )
      return () => {
        clearInterval(clock)
        unwatchStore()
        unwatchFeed()
        unwatchPage()
        dispatch({ type: "left" })
      }
    },
  }
}
