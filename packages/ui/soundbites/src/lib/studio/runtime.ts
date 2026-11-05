/**
 * Runs the Studio machine (`machine.ts`) against the outside world: holds
 * the recording, the clock and the playback, turns each effect into a call on
 * a port and each result into an event, and stamps each tap with when it
 * happened. It decides nothing; which result still counts and what the
 * screen shows are `step`'s.
 */
import { assertNever } from "@some-ui/core-utils"
import type {
  Listening,
  Playback,
  Player,
  StartRecording,
  TakeDeadlines,
  TurnListener,
} from "@some-ui/voice-capture"
// eslint-disable-next-line one-owner/no-local-microphone -- Studio runs its own take until its machine embeds the take kit (#2442)
import { NO_LISTENER, takeRunner } from "@some-ui/voice-capture"
import { isPaired } from "@soundbites/lib/idea/bundle"
import type { IdeaHome } from "@soundbites/lib/idea/bundle-runtime"
import { NO_HOME } from "@soundbites/lib/idea/bundle-runtime"
import { TAKE_TICK_MS } from "@soundbites/lib/policy"
import type { ProjectStore } from "@soundbites/lib/project/store"
import { ProjectFullError } from "@soundbites/lib/project/store"

import type { LetGoStore } from "./let-go-store"
import type {
  StudioEffect,
  StudioEvent,
  StudioIntent,
  StudioState,
} from "./machine"
import { initialStudioState, pullable, step } from "./machine"
import { logBetween } from "./time-log"
import type { TimeLogStore } from "./time-store"
import { STUDIO_WORDS } from "./words"

export type StudioPorts = {
  store: ProjectStore
  startRecording: StartRecording
  player: Player
  /** Milliseconds since the epoch. */
  now: () => number
  /**
   * A new take's id: unique across every runtime on the phone, so two
   * screens' takes never claim one id. Letters, digits and dashes.
   */
  newId: () => string
  /** A picked file's text. */
  readText: (file: Blob) => Promise<string>
  /** As `SoundbitesPorts.onVisibility`: now, then on each change. */
  onVisibility: (listener: (hidden: boolean) => void) => () => void
  /** Where the time log is kept (ST9); nothing is logged without one. */
  timeLog?: TimeLogStore
  /**
   * Where the owner's choice of when a take home holds leaves the phone is
   * kept (HF11); without one no choice is kept, and no take leaves.
   */
  letGo?: LetGoStore
  /** How long the microphone may take to answer; `takeRunner`'s unless a test says. */
  takeDeadlines?: TakeDeadlines
  /** The phone's recognizer, for a note said in Watch (ST5); none means typed notes. */
  listener?: TurnListener
  /**
   * The shell's refresh port (PULL1), where the app has one: while Start or
   * a show is on view (`pullable`), a pull reads the phone's videos again
   * through `checkAgain` (SHOW SH6).
   */
  refresh?: StudioRefresh
  /**
   * Home, as far as this phone can tell (ST34): whether it is paired, so a
   * take not on home yet says it is going home only once the phone is known
   * to be paired, and kept on this phone while it can't yet tell. Without
   * one, the phone counts as never paired.
   */
  home?: IdeaHome
}

/**
 * Adds a refresher to every pull until the returned drop, as the shell's
 * refresh port does (`apps/www/src/lib/pull-refresh/refreshers.ts`).
 */
type StudioRefresh = (refresher: {
  readonly what: string
  readonly checkAgain: () => Promise<void>
}) => () => void

export type StudioRuntime = {
  getSnapshot: () => StudioState
  subscribe: (listener: () => void) => () => void
  dispatch: (intent: StudioIntent) => void
  /** The screen is showing. Returns the detach, which keeps a take in progress. */
  attach: () => () => void
  /**
   * Reads again what the phone keeps (a pull, SHOW SH6): resolves once that
   * read lands, rejects if it could not be read. `step` decides which read
   * answers; a pull's refresher (`StudioRefresh`) calls it.
   */
  checkAgain: () => Promise<void>
}

/** `open`: the video to open on, by id, rather than the latest touched. */
export function createStudio(
  ports: StudioPorts,
  open: string | null = null
): StudioRuntime {
  let state = initialStudioState(open, ports.letGo?.read() ?? null)
  let playback: Playback | null = null
  let listening: Listening | null = null
  const listener = ports.listener ?? NO_LISTENER
  const listeners = new Set<() => void>()
  /** The pulls waiting on `checked`. */
  let checks: Array<{ resolve: () => void; reject: (error: Error) => void }> =
    []
  const at = (): string => new Date(ports.now()).toISOString()
  /** The refresher registered while the screen is `pullable`, to drop. */
  let pulling: (() => void) | null = null

  const checkAgain = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      checks.push({ resolve, reject })
      send({ type: "checkAgain" })
    })

  /** Registers a pull's refresher while the screen takes one, and drops it after. */
  const followPull = (): void => {
    const { refresh } = ports
    const wanted = refresh !== undefined && pullable(state)
    if (wanted && pulling === null) {
      pulling = refresh({ what: STUDIO_WORDS.pullWhat, checkAgain })
    } else if (!wanted && pulling !== null) {
      pulling()
      pulling = null
    }
  }

  const send = (event: StudioEvent): void => {
    const next = step(state, event)
    if (next.state !== state) {
      // Ignored when refused: the log is kept best effort, and a screen
      // is never held up for it.
      ports.timeLog?.append(logBetween(state, next.state, at(), ports.newId))
      state = next.state
      followPull()
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  const take = takeRunner(
    {
      startRecording: ports.startRecording,
      now: ports.now,
      tickMs: TAKE_TICK_MS,
      deadlines: ports.takeDeadlines,
    },
    (signal) =>
      send(
        signal.type === "taken"
          ? { ...signal, at: at(), id: ports.newId() }
          : signal
      )
  )

  const stopPlayback = (): void => {
    playback?.stop()
    playback = null
  }

  function run(effect: StudioEffect): void {
    switch (effect.type) {
      case "openMic":
      case "startClock":
      case "stopClock":
      case "finishTake":
      case "discardTake": {
        take.run(effect)
        return
      }
      case "carry": {
        ports.store.carryJournal(effect.at).then(
          (carried) => send({ type: "carried", carried }),
          () => send({ type: "carryFailed" })
        )
        return
      }
      case "keepLetGo": {
        send(
          ports.letGo?.choose(effect.letGo, effect.at) === true
            ? { type: "letGoKept", letGo: effect.letGo }
            : { type: "letGoNotKept" }
        )
        return
      }
      case "readTimeLog": {
        send({ type: "timeLogRead", log: ports.timeLog?.read() ?? [] })
        return
      }
      case "read": {
        const { seq } = effect
        Promise.all([
          ports.store.list(),
          ports.store.notices(),
          ports.store.room(),
        ]).then(
          ([projects, notices, roomBytes]) =>
            send({
              type: "listed",
              seq,
              projects,
              notices,
              roomBytes,
            }),
          () => send({ type: "listFailed", seq })
        )
        return
      }
      case "readFile": {
        const { seq } = effect
        ports.readText(effect.file).then(
          (text) =>
            send(
              effect.as === "primer"
                ? { type: "primerRead", seq, text, at: at() }
                : { type: "reviewRead", seq, text }
            ),
          () =>
            send({
              type:
                effect.as === "primer"
                  ? "primerUnreadable"
                  : "reviewUnreadable",
              seq,
            })
        )
        return
      }
      case "write": {
        ports.store.update(effect.project, effect.change, effect.audio).then(
          (written) => send({ type: "written", written }),
          (error: unknown) =>
            send({
              type: "writeFailed",
              reason: error instanceof ProjectFullError ? "full" : "failed",
            })
        )
        return
      }
      case "remember": {
        // Ignored: no screen is left to say it failed; the notice is all it loses.
        ports.store.remember(effect.notice).catch(() => undefined)
        return
      }
      case "forget": {
        // Ignored: a notice not let go is only said again by the next Start.
        ports.store.forget(effect.keys).catch(() => undefined)
        return
      }
      case "report": {
        ports.store.report(effect.friction).then(
          () => send({ type: "reported" }),
          () => send({ type: "reportFailed" })
        )
        return
      }
      case "loadAudio": {
        const { seq } = effect
        ports.store.audio(effect.project, effect.take).then(
          (audio) =>
            send(
              audio === null
                ? { type: "audioMissing", seq }
                : { type: "audioLoaded", seq, audio }
            ),
          () => send({ type: "audioUnreadable", seq })
        )
        return
      }
      case "startPlayback": {
        stopPlayback()
        const { seq } = effect
        playback = ports.player.play(effect.audio)
        const report = (): void => send({ type: "playbackEnded", seq })
        playback.ended.then(report, report)
        return
      }
      case "stopPlayback": {
        stopPlayback()
        return
      }
      case "checkVoice": {
        void listener
          .available()
          .then((available) => send({ type: "voiceChecked", available }))
        return
      }
      case "listen": {
        listening?.cancel()
        const { seq } = effect
        const mine = listener.listen(
          (words) => send({ type: "noteWords", seq, words }),
          () => send({ type: "noteReady", seq })
        )
        listening = mine
        void mine.done.then((result) => {
          if (listening === mine) listening = null
          send({ type: "noteListened", seq, result })
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
      case "checked": {
        const answered = checks
        checks = []
        for (const check of answered) {
          if (effect.ok) check.resolve()
          else check.reject(new Error("unread"))
        }
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
    dispatch: (intent) => send({ ...intent, at: at() }),
    checkAgain,
    attach(): () => void {
      const unwatchPage = ports.onVisibility((hidden) =>
        send({ type: hidden ? "hidden" : "shown" })
      )
      send({ type: "entered", at: at() })
      const unwatchStore = ports.store.subscribe(() =>
        send({ type: "storeChanged" })
      )
      const home = ports.home ?? NO_HOME
      const tellPaired = (): void =>
        send({ type: "paired", paired: isPaired(home.reach()) })
      const unwatchHome = home.subscribe(tellPaired)
      tellPaired()
      // Detached, the runtime still finishes a take under way and keeps it:
      // its writes land after the screen is gone.
      return () => {
        unwatchPage()
        unwatchStore()
        unwatchHome()
        send({ type: "left" })
      }
    },
  }
}
