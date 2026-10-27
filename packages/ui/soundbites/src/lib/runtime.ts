/**
 * Runs the soundbites machine (`machine.ts`) against the outside world. It
 * holds the handles (the recording, the playback, the clock), turns each
 * effect into a call on a port, and turns each result into an event. It
 * decides nothing: whether a result still matters, what to do next and what
 * the page shows are all `step`'s. It is plain TypeScript, so deleting React
 * deletes none of this.
 *
 * The ports are the browser's machines, which we do not control
 * (`getUserMedia`/`MediaRecorder`, `Audio`, IndexedDB, the page's visibility).
 * Each is reached through a narrow function whose results come back as our
 * own events, and nothing here records the state of one of them.
 */
import { assertNever } from "@some-ui/core-utils"
import type { Playback, Player, StartRecording } from "@some-ui/voice-capture"
import { takeRunner } from "@some-ui/voice-capture"

import type {
  SoundbitesEffect,
  SoundbitesEvent,
  SoundbitesIntent,
  SoundbiteSituation,
  SoundbitesState,
} from "./machine"
import { initialState, step } from "./machine"
import { TAKE_TICK_MS } from "./policy"
import type { SoundbiteStore } from "./store"
import { SoundbitesFullError } from "./store"
import type { SoundbiteSource } from "./types"

export type SoundbitesPorts = {
  store: SoundbiteStore
  startRecording: StartRecording
  player: Player
  /** Milliseconds since the epoch. */
  now: () => number
  newId: () => string
  /**
   * Calls `listener` at once with whether the page is hidden now, then on
   * each change: hidden (`true`) or shown again (`false`). Returns an
   * unsubscribe.
   */
  onVisibility: (listener: (hidden: boolean) => void) => () => void
}

export type SoundbitesOptions = {
  /** How the person got here, kept with each soundbite until one is stored. */
  source: SoundbiteSource
  /** Start listening on arrival: the person already asked to. */
  autoStart: boolean
  /** Called as an auto-start begins, so the caller can forget the request. */
  onAutoStart?: () => void
}

export type SoundbitesRuntime = {
  getSnapshot: () => SoundbitesState
  subscribe: (listener: () => void) => () => void
  dispatch: (intent: SoundbitesIntent) => void
  /** Where the app stands, read once as each take is kept. */
  setSituation: (situation: () => SoundbiteSituation) => void
  /**
   * The page is showing: reads the list, auto-starts if asked, and listens
   * for the page being hidden or shown and for the store changing. Returns the matching detach, which keeps a
   * take in progress. Attaching again after detaching resumes.
   */
  attach: () => () => void
}

export function createSoundbites(
  ports: SoundbitesPorts,
  options: SoundbitesOptions
): SoundbitesRuntime {
  let state = initialState(options.source)
  let situation: (() => SoundbiteSituation) | null = null
  let playback: Playback | null = null
  const listeners = new Set<() => void>()

  const dispatch = (event: SoundbitesEvent): void => {
    const next = step(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  // The take's own results become this page's events; a kept take is
  // stamped here with what the app knew as it was handed over.
  const take = takeRunner(
    {
      startRecording: ports.startRecording,
      now: ports.now,
      tickMs: TAKE_TICK_MS,
    },
    (signal) =>
      dispatch(
        signal.type === "taken"
          ? {
              ...signal,
              id: ports.newId(),
              at: new Date(ports.now()).toISOString(),
              situation: readSituation(),
            }
          : signal
      )
  )

  const stopPlayback = (): void => {
    playback?.stop()
    playback = null
  }

  function run(effect: SoundbitesEffect): void {
    switch (effect.type) {
      case "openMic":
      case "startClock":
      case "stopClock":
      case "finishTake":
      case "discardTake": {
        take.run(effect)
        return
      }
      case "save": {
        const { bite } = effect
        ports.store.save(bite, effect.audio, effect.replace).then(
          () => dispatch({ type: "saved", bite }),
          (error: unknown) =>
            dispatch({
              type: "saveFailed",
              full: error instanceof SoundbitesFullError,
            })
        )
        return
      }
      case "read": {
        const { seq } = effect
        ports.store.list().then(
          (kept) => dispatch({ type: "listed", seq, kept }),
          () => dispatch({ type: "listFailed", seq })
        )
        return
      }
      case "loadAudio": {
        const { seq } = effect
        ports.store.audio(effect.id).then(
          (audio) =>
            dispatch(
              audio === null
                ? { type: "audioMissing", seq }
                : { type: "audioLoaded", seq, audio }
            ),
          () => dispatch({ type: "audioUnreadable", seq })
        )
        return
      }
      case "startPlayback": {
        stopPlayback()
        const { seq } = effect
        playback = ports.player.play(effect.audio)
        const report = (): void => dispatch({ type: "playbackEnded", seq })
        playback.ended.then(report, report)
        return
      }
      case "stopPlayback": {
        stopPlayback()
        return
      }
      case "remove": {
        const { id } = effect
        ports.store.remove([id]).then(
          () => dispatch({ type: "removed", id }),
          () => dispatch({ type: "removeFailed" })
        )
        return
      }
      case "announceAutoStart": {
        options.onAutoStart?.()
        return
      }
      default: {
        assertNever(effect)
      }
    }
  }

  function readSituation(): SoundbiteSituation {
    if (situation !== null) return situation()
    return {
      lastSessionAt: null,
      openSessions: 0,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
    setSituation(next): void {
      situation = next
    },
    attach(): () => void {
      // Visibility first: an auto-start must know whether the page is on
      // screen before it opens the microphone.
      const unwatchPage = ports.onVisibility((hidden) =>
        dispatch({ type: hidden ? "hidden" : "shown" })
      )
      dispatch({ type: "arrived", autoStart: options.autoStart })
      const unwatchStore = ports.store.subscribe(() =>
        dispatch({ type: "storeChanged" })
      )
      return () => {
        unwatchPage()
        unwatchStore()
        dispatch({ type: "left" })
      }
    },
  }
}
