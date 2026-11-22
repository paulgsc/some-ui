/**
 * Runs the takes needing attention (`./model`) against home, through the
 * ports the build hands in (www's `lib/take-reconcile`), and the phone's
 * player. It owns the playback under way and turns each effect into a call
 * and each answer into an event; which answer still counts is
 * `stepReconcile`'s, by the read's, the play's and the act's numbers. Once
 * the screen is left, no answer reaches it.
 *
 * Delete is not run here: the build's own delete path (My data's, LA19)
 * deletes, and tells this runtime what went (`ports.deletes`), so a take
 * home deleted leaves the list.
 */
import { assertNever } from "@some-ui/core-utils"
import type { Playback, Player } from "@some-ui/voice-capture"
import type { HearAgainAnswer } from "@soundbites/lib/hear-again/model"
import type { Refresh } from "@soundbites/lib/refresh"
import { checkAgainOf } from "@soundbites/lib/refresh"

import type {
  ActAnswer,
  AttentionRead,
  ReconcileAct,
  ReconcileEffect,
  ReconcileEvent,
  ReconcileIntent,
  ReconcileState,
} from "./model"
import { INITIAL_RECONCILE, stepReconcile } from "./model"
import { RECONCILE_WORDS } from "./words"

/** Home, as the takes needing attention reach it. Every call resolves. */
export type ReconcileHome = {
  /**
   * Every take home couldn't hear well that no act answers yet. `wanted`
   * says whether the answer is still wanted.
   */
  readonly takes: (wanted: () => boolean) => Promise<AttentionRead>
  /** Take `id`'s audio from home; null when home can't give it back now. */
  readonly audio: (id: string) => Promise<Blob | null>
  /** Tells home the owner's act on take `id`, kept for good there. */
  readonly act: (id: string, act: ReconcileAct) => Promise<ActAnswer>
  /** Asks home to hear take `id` again (#3339). */
  readonly hearAgain: (id: string) => Promise<HearAgainAnswer>
}

export type ReconcilePorts = {
  readonly home: ReconcileHome
  readonly player: Player
  /**
   * Hears each delete the build's delete path made, with the ids it has a
   * receipt for; returns the unsubscribe. Absent, nothing is deleted here.
   */
  readonly deletes?:
    | ((listener: (ids: ReadonlyArray<string>) => void) => () => void)
    | undefined
  /** The shell's refresh port: a pull reads the takes again (HERD2); absent, none. */
  readonly refresh?: Refresh | undefined
}

export type ReconcileRuntime = {
  readonly getSnapshot: () => ReconcileState
  readonly subscribe: (listener: () => void) => () => void
  readonly dispatch: (intent: ReconcileIntent) => void
  /** The screen is showing: reads. Returns the detach, which stops playing. */
  readonly attach: () => () => void
}

export function createReconcile(ports: ReconcilePorts): ReconcileRuntime {
  let state = INITIAL_RECONCILE
  let attached = false
  let playback: Playback | null = null
  const listeners = new Set<() => void>()

  const send = (event: ReconcileEvent): void => {
    const next = stepReconcile(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  /** An answer, once it lands, while the screen still shows. */
  const later = <T>(
    answer: Promise<T>,
    event: (value: T) => ReconcileEvent
  ): void => {
    void answer.then((value) => {
      if (attached) send(event(value))
    })
  }

  function run(effect: ReconcileEffect): void {
    switch (effect.type) {
      case "readTakes": {
        const { seq } = effect
        const wanted = (): boolean => attached && state.seq === seq
        later(ports.home.takes(wanted), (read) => ({
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
      case "sendHearAgain": {
        const { seq } = effect
        later(ports.home.hearAgain(effect.id), (answer) => ({
          type: "hearAgainAnswered",
          seq,
          answer,
        }))
        return
      }
      case "sendAct": {
        const { seq } = effect
        later(ports.home.act(effect.id, effect.act), (answer) => ({
          type: "actAnswered",
          seq,
          answer,
        }))
        return
      }
      default: {
        assertNever(effect)
      }
    }
  }

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return (): void => {
      listeners.delete(listener)
    }
  }

  return {
    getSnapshot: () => state,
    subscribe,
    dispatch: (intent) => send(intent),
    attach(): () => void {
      attached = true
      const unhear = ports.deletes?.((ids) => {
        if (attached) send({ type: "deleted", ids })
      })
      const unpull = ports.refresh?.({
        what: RECONCILE_WORDS.pullWhat,
        checkAgain: checkAgainOf({
          getSnapshot: () => state,
          subscribe,
          readAgain: () => send({ type: "readAgain" }),
        }),
      })
      send({ type: "entered" })
      return (): void => {
        unpull?.()
        unhear?.()
        send({ type: "left" })
        attached = false
      }
    },
  }
}
