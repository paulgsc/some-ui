/**
 * Runs Takes on home (`./model`) against home, through the port the build
 * hands in (www's `lib/take-library`), and the phone's player. It owns the
 * playback under way and turns each effect into a call and each answer into
 * an event; which answer still counts is `stepLibrary`'s, by the read's and
 * the play's numbers. Once the screen is left, no answer reaches it.
 */
import { assertNever } from "@some-ui/core-utils"
import type { Playback, Player } from "@some-ui/voice-capture"

import type {
  LibraryEffect,
  LibraryEvent,
  LibraryIntent,
  LibraryRead,
  LibraryState,
} from "./model"
import { INITIAL_LIBRARY, stepLibrary } from "./model"

/** Home, as Takes on home reads it. Every call resolves. */
export type TakesHome = {
  /**
   * The newest takes when `q` is null, else those whose words hold every
   * word of `q`. `wanted` says whether the answer is still wanted: once it
   * says no, a link busy with another run is not asked again.
   */
  readonly takes: (
    q: string | null,
    wanted: () => boolean
  ) => Promise<LibraryRead>
  /** Take `id`'s audio from home; null when home can't give it back now. */
  readonly audio: (id: string) => Promise<Blob | null>
}

export type LibraryPorts = {
  readonly home: TakesHome
  readonly player: Player
}

export type LibraryRuntime = {
  readonly getSnapshot: () => LibraryState
  readonly subscribe: (listener: () => void) => () => void
  readonly dispatch: (intent: LibraryIntent) => void
  /** The screen is showing: reads. Returns the detach, which stops playing. */
  readonly attach: () => () => void
}

export function createTakeLibrary(ports: LibraryPorts): LibraryRuntime {
  let state = INITIAL_LIBRARY
  let attached = false
  let playback: Playback | null = null
  const listeners = new Set<() => void>()

  const send = (event: LibraryEvent): void => {
    const next = stepLibrary(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  /** An answer, once it lands, while the screen still shows. */
  const later = <T>(
    answer: Promise<T>,
    event: (value: T) => LibraryEvent
  ): void => {
    void answer.then((value) => {
      if (attached) send(event(value))
    })
  }

  function run(effect: LibraryEffect): void {
    switch (effect.type) {
      case "readTakes": {
        const { seq } = effect
        const wanted = (): boolean => attached && state.seq === seq
        later(ports.home.takes(effect.q, wanted), (read) => ({
          type: "takesRead",
          seq,
          read,
        }))
        return
      }
      case "readAudio": {
        const { play } = effect
        later(ports.home.audio(effect.id), (audio) => ({
          type: "audioRead",
          play,
          audio,
        }))
        return
      }
      case "startPlayback": {
        const { play } = effect
        const started = ports.player.play(effect.audio)
        playback = started
        later(started.ended, () => {
          if (playback === started) playback = null
          return { type: "playEnded", play }
        })
        return
      }
      case "stopPlayback": {
        playback?.stop()
        playback = null
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
    dispatch: (intent) => send(intent),
    attach(): () => void {
      attached = true
      send({ type: "entered" })
      return (): void => {
        send({ type: "left" })
        attached = false
      }
    },
  }
}
