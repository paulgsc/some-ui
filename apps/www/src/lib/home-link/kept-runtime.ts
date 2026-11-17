/**
 * The runtime behind `./kept-model`: one exchange with home at a time for a
 * record this phone drains there (aph's `exchangeWithHome`, the Jobs
 * record's `exchangeJobs`, Practice's `drainHome`, voice notes'
 * `sendVoice`; LA15, docs/learner-data-authority.md), through the link's
 * `drain`, and how each ended; and a lane's exchange as a run makes it
 * (`laneExchange`). The record's screens read its snapshot; they hold no
 * request of their own.
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import { ForeignCallError } from "@/lib/intent/foreign"

import type { KeptEvent, KeptRun, KeptState } from "./kept-model"
import { INITIAL_KEPT, stepKept } from "./kept-model"
import type { Lane } from "./lanes"
import type { Pairing } from "./model"
import type { HomeLink } from "./runtime"
import { noticingBusy } from "./runtime"
import { blockedOf, unanswered } from "./settle"
import { HomeUnansweredError } from "./shelf"

/** A run's end that was this phone's fault, as `failed`'s `why`. */
const FAULT = "fault"

/** A run's end when home was busy (`429`). */
const BUSY: Extract<HomeExchanged, { kind: "failed" }> = {
  kind: "failed",
  why: "busy",
}

export type KeptPorts = {
  /** One exchange through `send`; throws what `send` throws. */
  exchange: (send: HomeCall) => Promise<HomeExchanged>
  keep: HomeLink["drain"]
  /**
   * Whether the phone is paired (#3152), read when the link turns a run
   * away: unpaired, the run says so; while the record is read, the link was
   * not ready, said as busy so it is asked again.
   */
  pairing: () => Pairing
  /** Whether home is busy (AD3): a run the link turns away then was home's. */
  homeBusy: () => boolean
  /**
   * Whether the link is stopping its drain run (the background, or a send,
   * a pairing or an Unpair taking the link); without it, a moment always
   * joins the run under way.
   */
  stopping?: () => boolean
  /** Whether the app is in front; without it, it is taken to be. */
  inFront?: () => boolean
  now: () => number
}

export type Kept = {
  getSnapshot: () => KeptState
  subscribe: (listener: () => void) => () => void
  /**
   * Asks for a run: now, or once the one under way ends. For a change on
   * this phone, which the run under way may have missed.
   */
  want: () => void
  /**
   * Asks for a run unless one is under way, which answers it (HERD1): the
   * app back in front, the network back, a watch mounted.
   */
  nudge: () => void
  /**
   * Resolves to how the next run to end ended: the one under way, which the
   * pull joins (HERD1: a pull never asks a second run of a lane already
   * running), or, with none, the one it asks for as `want` does.
   */
  pull: () => Promise<KeptRun>
}

export function createKept(ports: KeptPorts): Kept {
  let state = INITIAL_KEPT
  const listeners = new Set<() => void>()
  /** The pulls waiting on the run under way, answered as it ends. */
  const pulls = new Set<(run: KeptRun) => void>()
  const dispatch = (event: KeptEvent): void => {
    const next = stepKept(state, event)
    if (next === state) return
    state = next
    // A pull waits on through a stopped run that goes on (HERD4): the run
    // that resumes is the one it joined.
    if (
      event.type === "ran" &&
      !(event.run.kind === "stopped" && state.running)
    ) {
      for (const answer of pulls) answer(event.run)
      pulls.clear()
    }
    for (const listener of listeners) listener()
  }

  const once = async (): Promise<KeptRun> => {
    try {
      const outcome = await ports.keep(ports.exchange)
      if (outcome.kind === "refused") {
        // The link says why it turned the run away; one asked while the
        // pairing record is read waited for it (#3152).
        switch (outcome.why) {
          case "unpaired":
          case "gone": {
            return { kind: "unpaired" }
          }
          case "busy":
          case "pairing":
          case "preempted": {
            return ports.homeBusy() ? BUSY : { kind: "busy" }
          }
          default: {
            return assertNever(outcome.why)
          }
        }
      }
      if (outcome.kind === "stopped") return { kind: "stopped" }
      const { value } = outcome
      return value.kind === "synced"
        ? { kind: "synced", at: ports.now() }
        : value
    } catch (error) {
      if (error instanceof SyncStoppedError) return { kind: "stopped" }
      // Home not reached: silent, or stopped by a name or a certificate the
      // phone can name (NA1), which the link holds as a silence and the
      // lane says from the link's `blocked` (`./words`).
      if (
        unanswered(error) ||
        blockedOf(error) !== null ||
        error instanceof HomeUnansweredError
      ) {
        return { kind: "unreachable", at: ports.now() }
      }
      // A fault on this phone, not home's silence: it goes to the native
      // log (once: a foreign call's own port has already reported its
      // failure), and the mark says something went wrong.
      if (!(error instanceof ForeignCallError)) {
        reportFailure({
          port: "home server (kept)",
          error: {
            ...toIntentError(error),
            summary: "Something on this phone went wrong.",
          },
        })
      }
      return { kind: "failed", why: FAULT }
    }
  }

  const loop = async (): Promise<void> => {
    while (state.running) {
      const run = await once()
      dispatch({ type: "ran", run, inFront: ports.inFront?.() ?? true })
    }
  }

  const want = (): void => {
    const idle = !state.running
    dispatch({ type: "wanted" })
    if (idle && state.running) void loop()
  }

  const nudge = (): void => {
    if (!state.running) want()
    // Joining a run the link is stopping would leave the lane undone once it
    // ends (HERD4, #3134): it goes on instead.
    else if (ports.stopping?.() === true) dispatch({ type: "resumed" })
  }

  return {
    getSnapshot: () => state,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    want,
    nudge,
    pull: (): Promise<KeptRun> =>
      new Promise((answer) => {
        pulls.add(answer)
        nudge()
      }),
  }
}

type Exchange = (send: HomeCall) => Promise<HomeExchanged>

/**
 * `exchange` ending as busy once home answered any of its requests `429`,
 * whatever else it found, unless home forgot the phone or it was stopped.
 */
function sayingBusy(exchange: Exchange): Exchange {
  return async (link) => {
    const { send, seen } = noticingBusy(link)
    try {
      const ended = await exchange(send)
      return seen.busy && ended.kind !== "forgotten" ? BUSY : ended
    } catch (error) {
      if (seen.busy && !(error instanceof SyncStoppedError)) return BUSY
      throw error
    }
  }
}

/**
 * `lane`'s exchange as a run makes it: under the pairing this phone holds
 * when the run starts (nothing, unpaired), and home being busy said as such
 * (`sayingBusy`).
 */
export function laneExchange(lane: Lane, pairing: () => Pairing): Exchange {
  return (link) => {
    const under = pairing()
    // The link runs a lane only once paired; nothing to send otherwise.
    if (under.kind !== "paired") return Promise.resolve({ kind: "synced" })
    return sayingBusy((send) => lane.exchange(send, { pairing: under.id }))(
      link
    )
  }
}
