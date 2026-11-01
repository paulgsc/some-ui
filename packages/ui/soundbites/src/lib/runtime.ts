/**
 * Runs the soundbites page (`machine.ts`) and its take pattern against the
 * outside world. The take (the microphone, the clock, a playback) is the
 * take pattern's runtime (`@some-ui/voice-capture`'s `takePattern`, with
 * the page's options, `SOUNDBITE_TAKES`), over the page's store: `keep`
 * saves a take as a soundbite (`keptBite`), `setAside` marks one let go
 * (D3), `audio` reads one back. This holds the pattern and the store's
 * subscription, turns each page effect into a call, and each result into an
 * event. It decides nothing: whether a result still matters and what the
 * page shows are `step`'s and the pattern's. It is plain TypeScript, so
 * deleting React deletes none of this.
 */
import { assertNever } from "@some-ui/core-utils"
import type {
  MicOwner,
  Player,
  StartRecording,
  TakeDeadlines,
  TakePattern,
} from "@some-ui/voice-capture"
import { takePattern } from "@some-ui/voice-capture"

import type {
  SoundbitesEffect,
  SoundbitesEvent,
  SoundbitesIntent,
  SoundbiteSituation,
  SoundbitesState,
} from "./machine"
import { initialState, keptBite, step } from "./machine"
import { SOUNDBITE_ITEM, SOUNDBITE_TAKES, TAKE_TICK_MS } from "./policy"
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
  /** The phone's one microphone unless a test gives its own. */
  owner?: MicOwner | undefined
  /** The microphone's deadlines unless a test gives its own. */
  deadlines?: TakeDeadlines | undefined
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
  /** The page's take pattern: its button, rows and what plays. */
  pattern: TakePattern
  /** Where the app stands, read once as each take is kept. */
  setSituation: (situation: () => SoundbiteSituation) => void
  /**
   * The page is showing: reads the list, auto-starts if asked, and listens
   * for the page being hidden or shown and for the store changing. Returns
   * the matching detach, which keeps a take in progress. Attaching again
   * after detaching resumes.
   */
  attach: () => () => void
}

export function createSoundbites(
  ports: SoundbitesPorts,
  options: SoundbitesOptions
): SoundbitesRuntime {
  let state = initialState(options.source)
  let situation: (() => SoundbiteSituation) | null = null
  /** Counts attaches, so a detach followed at once by one is no leaving. */
  let attachments = 0
  const listeners = new Set<() => void>()

  const dispatch = (event: SoundbitesEvent): void => {
    const next = step(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  const pattern = takePattern(
    {
      startRecording: ports.startRecording,
      now: ports.now,
      owner: ports.owner,
      deadlines: ports.deadlines,
      player: ports.player,
      tickMs: TAKE_TICK_MS,
      // A kept take is stamped here with what the app knew as it was
      // handed over.
      keep: (take, _answers, supersedes, done) => {
        const { bite, replace } = keptBite(state, take, {
          id: ports.newId(),
          at: new Date(ports.now()).toISOString(),
          situation: readSituation(),
        })
        ports.store.save(bite, take.blob, replace, supersedes).then(
          () => {
            dispatch({ type: "saved" })
            done({ outcome: "kept", id: bite.id })
          },
          (error: unknown) =>
            done({
              outcome: error instanceof SoundbitesFullError ? "full" : "failed",
            })
        )
      },
      setAside: (id, done) => {
        ports.store.setAside(id, new Date(ports.now()).toISOString()).then(
          () => done(true),
          () => {
            done(false)
            dispatch({ type: "setAsideFailed" })
          }
        )
      },
      audio: (id) => ports.store.audio(id),
    },
    SOUNDBITE_TAKES
  )

  function run(effect: SoundbitesEffect): void {
    switch (effect.type) {
      case "read": {
        const { seq } = effect
        ports.store.list().then(
          (kept) => dispatch({ type: "listed", seq, kept }),
          () => dispatch({ type: "listFailed", seq })
        )
        return
      }
      case "startTake": {
        pattern.tap(SOUNDBITE_ITEM)
        return
      }
      case "leaveTake": {
        pattern.leave()
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
    pattern,
    setSituation(next): void {
      situation = next
    },
    attach(): () => void {
      attachments += 1
      const attachment = attachments
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
        // Left, unless attached again at once: StrictMode's remount
        // detaches and attaches in one go, and a take still opening must
        // not be let go for it.
        queueMicrotask(() => {
          if (attachments === attachment) dispatch({ type: "left" })
        })
      }
    },
  }
}
