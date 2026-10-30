/**
 * Runs the Studio machine (`machine.ts`) against the outside world: holds
 * the recording, the clock and the playback, turns each effect into a call on
 * a port and each result into an event, and stamps each tap with when it
 * happened. It decides nothing; which result still counts and what the
 * screen shows are `step`'s.
 */
import { assertNever } from "@some-ui/core-utils"
import type { Playback, Player, StartRecording } from "@some-ui/voice-capture"
import { takeRunner } from "@some-ui/voice-capture"
import { TAKE_TICK_MS } from "@soundbites/lib/policy"
import { latest } from "@soundbites/lib/project/model"
import type { ProjectStore } from "@soundbites/lib/project/store"
import { ProjectFullError } from "@soundbites/lib/project/store"

import type {
  StudioEffect,
  StudioEvent,
  StudioIntent,
  StudioState,
} from "./machine"
import { initialStudioState, step } from "./machine"

export type StudioPorts = {
  store: ProjectStore
  startRecording: StartRecording
  player: Player
  /** Milliseconds since the epoch. */
  now: () => number
  /** A picked file's text. */
  readText: (file: Blob) => Promise<string>
  /** As `SoundbitesPorts.onVisibility`: now, then on each change. */
  onVisibility: (listener: (hidden: boolean) => void) => () => void
}

export type StudioRuntime = {
  getSnapshot: () => StudioState
  subscribe: (listener: () => void) => () => void
  dispatch: (intent: StudioIntent) => void
  /** The screen is showing. Returns the detach, which keeps a take in progress. */
  attach: () => () => void
}

export function createStudio(ports: StudioPorts): StudioRuntime {
  let state = initialStudioState()
  let playback: Playback | null = null
  const listeners = new Set<() => void>()
  const at = (): string => new Date(ports.now()).toISOString()

  const send = (event: StudioEvent): void => {
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
    (signal) => send(signal.type === "taken" ? { ...signal, at: at() } : signal)
  )

  const stopPlayback = (): void => {
    playback?.stop()
    playback = null
  }

  const written = (write: Promise<void>): void => {
    write.then(
      () => send({ type: "written" }),
      (error: unknown) =>
        send({
          type: "writeFailed",
          reason: error instanceof ProjectFullError ? "full" : "failed",
        })
    )
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
          (carried) =>
            send({
              type: "carried",
              title: carried === null ? null : latest(carried).cutList.title,
            }),
          () => send({ type: "carryFailed" })
        )
        return
      }
      case "read": {
        const { seq } = effect
        ports.store.list().then(
          (projects) => send({ type: "listed", seq, projects }),
          () => send({ type: "listFailed", seq })
        )
        return
      }
      case "readFile": {
        const { seq } = effect
        ports.readText(effect.file).then(
          (text) => send({ type: "primerRead", seq, text, at: at() }),
          () => send({ type: "primerUnreadable", seq })
        )
        return
      }
      case "save": {
        written(ports.store.save(effect.project))
        return
      }
      case "keepTake": {
        written(ports.store.keepTake(effect.project, effect.take, effect.audio))
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
    attach(): () => void {
      const unwatchPage = ports.onVisibility((hidden) =>
        send({ type: hidden ? "hidden" : "shown" })
      )
      send({ type: "entered", at: at() })
      return () => {
        unwatchPage()
        send({ type: "left" })
      }
    },
  }
}
