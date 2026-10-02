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
import type {
  SoundbitesEffect,
  SoundbitesEvent,
  SoundbitesIntent,
  SoundbiteSituation,
  SoundbitesState,
} from "./machine"
import { initialState, step } from "./machine"
import type { Recording, StartRecording } from "./recorder"
import { RecordingError } from "./recorder"
import type { SoundbiteStore } from "./store"
import type { SoundbiteSource } from "./types"

/** One playback of a recording's audio. */
export type Playback = {
  /** Settles when the playback ends, fails or is stopped. */
  ended: Promise<void>
  /** Stops it and releases what it holds. Safe to call twice. */
  stop: () => void
}

export type Player = { play: (audio: Blob) => Playback }

export type SoundbitesPorts = {
  store: SoundbiteStore
  startRecording: StartRecording
  player: Player
  /** Milliseconds since the epoch. */
  now: () => number
  newId: () => string
  /** Calls `listener` whenever the page is hidden; returns an unsubscribe. */
  onHidden: (listener: () => void) => () => void
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
   * for the page being hidden. Returns the matching detach, which keeps a
   * take in progress. Attaching again after detaching resumes.
   */
  attach: () => () => void
}

const TICK_MS = 100

export function createSoundbites(
  ports: SoundbitesPorts,
  options: SoundbitesOptions
): SoundbitesRuntime {
  let state = initialState(options.source)
  let situation: (() => SoundbiteSituation) | null = null
  let recording: Recording | null = null
  let playback: Playback | null = null
  let clock: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<() => void>()

  const dispatch = (event: SoundbitesEvent): void => {
    const next = step(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  const stopClock = (): void => {
    if (clock !== null) clearInterval(clock)
    clock = null
  }

  const stopPlayback = (): void => {
    playback?.stop()
    playback = null
  }

  function run(effect: SoundbitesEffect): void {
    switch (effect.type) {
      case "openMic": {
        ports.startRecording().then(
          (opened) => {
            recording = opened
            dispatch({ type: "micOpened", at: ports.now() })
          },
          (error: unknown) =>
            dispatch({
              type: "micFailed",
              reason: error instanceof RecordingError ? error.reason : "failed",
            })
        )
        return
      }
      case "finishTake": {
        const finishing = recording
        recording = null
        if (finishing === null) {
          dispatch({ type: "takeFailed" })
          return
        }
        finishing.finish().then(
          (take) =>
            dispatch({
              type: "taken",
              take,
              id: ports.newId(),
              at: new Date(ports.now()).toISOString(),
              situation: readSituation(),
            }),
          () => dispatch({ type: "takeFailed" })
        )
        return
      }
      case "discardTake": {
        recording?.discard()
        recording = null
        return
      }
      case "startClock": {
        stopClock()
        clock = setInterval(
          () =>
            dispatch({
              type: "ticked",
              now: ports.now(),
              level: recording?.level() ?? 0,
            }),
          TICK_MS
        )
        return
      }
      case "stopClock": {
        stopClock()
        return
      }
      case "save": {
        const { bite } = effect
        ports.store.save(bite, effect.audio, effect.replace).then(
          () => dispatch({ type: "saved", bite }),
          () => dispatch({ type: "saveFailed" })
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
        ports.store.remove(id).then(
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
      dispatch({ type: "arrived", autoStart: options.autoStart })
      const unsubscribe = ports.onHidden(() => dispatch({ type: "hidden" }))
      return () => {
        unsubscribe()
        dispatch({ type: "left" })
      }
    },
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled soundbites effect: ${JSON.stringify(value)}`)
}
