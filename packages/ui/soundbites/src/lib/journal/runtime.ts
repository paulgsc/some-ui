/**
 * Runs the journal machine (`machine.ts`) against the outside world: holds
 * the recording, the clock and the playback, turns each effect into a call on
 * a port and each result into an event. It decides nothing; which result
 * still counts and what the page shows are `step`'s.
 */
import { assertNever } from "@some-ui/core-utils"
import type { Playback, Player, StartRecording } from "@some-ui/voice-capture"
import { takeRunner } from "@some-ui/voice-capture"
import { TAKE_TICK_MS } from "@soundbites/lib/policy"

import type {
  JournalEffect,
  JournalEvent,
  JournalIntent,
  JournalState,
} from "./machine"
import { initialJournalState, step } from "./machine"
import type { JournalStore } from "./store"
import { JournalFullError, JournalStaleError } from "./store"

export type JournalPorts = {
  store: JournalStore
  startRecording: StartRecording
  player: Player
  /** Milliseconds since the epoch. */
  now: () => number
  /** A picked file's text. */
  readText: (file: Blob) => Promise<string>
  /** As `SoundbitesPorts.onVisibility`: now, then on each change. */
  onVisibility: (listener: (hidden: boolean) => void) => () => void
}

export type JournalRuntime = {
  getSnapshot: () => JournalState
  subscribe: (listener: () => void) => () => void
  dispatch: (intent: JournalIntent) => void
  /** The tab is showing. Returns the detach, which keeps a take in progress. */
  attach: () => () => void
}

function reasonOf(error: unknown): "full" | "stale" | "failed" {
  if (error instanceof JournalFullError) return "full"
  if (error instanceof JournalStaleError) return "stale"
  return "failed"
}

export function createJournal(ports: JournalPorts): JournalRuntime {
  let state = initialJournalState()
  let playback: Playback | null = null
  const listeners = new Set<() => void>()

  const dispatch = (event: JournalEvent): void => {
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
          ? { ...signal, at: new Date(ports.now()).toISOString() }
          : signal
      )
  )

  const stopPlayback = (): void => {
    playback?.stop()
    playback = null
  }

  const settleWrite = (
    kind: "open" | "targets" | "clear",
    written: Promise<void>
  ): void => {
    written.then(
      () => dispatch({ type: "written", kind }),
      (error: unknown) =>
        dispatch({ type: "writeFailed", kind, reason: reasonOf(error) })
    )
  }

  function run(effect: JournalEffect): void {
    switch (effect.type) {
      case "openMic":
      case "startClock":
      case "stopClock":
      case "finishTake":
      case "discardTake": {
        take.run(effect)
        return
      }
      case "read": {
        const { seq } = effect
        ports.store.read().then(
          (shelf) => dispatch({ type: "listed", seq, shelf }),
          () => dispatch({ type: "listFailed", seq })
        )
        return
      }
      case "readFile": {
        const { seq } = effect
        ports.readText(effect.file).then(
          (text) =>
            dispatch({
              type: "primerRead",
              seq,
              text,
              at: new Date(ports.now()).toISOString(),
            }),
          () => dispatch({ type: "primerUnreadable", seq })
        )
        return
      }
      case "openPlan": {
        settleWrite("open", ports.store.open(effect.plan))
        return
      }
      case "setTargets": {
        settleWrite(
          "targets",
          ports.store.setTargets(effect.targets, effect.episode)
        )
        return
      }
      case "clear": {
        settleWrite("clear", ports.store.clear(effect.episode))
        return
      }
      case "saveTake": {
        const { take: kept } = effect
        ports.store.saveTake(kept, effect.audio, effect.episode).then(
          () => dispatch({ type: "takeSaved", take: kept }),
          (error: unknown) =>
            dispatch({
              type: "writeFailed",
              kind: "take",
              reason: reasonOf(error),
            })
        )
        return
      }
      case "loadAudio": {
        const { seq } = effect
        ports.store.audio(effect.cutId).then(
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
