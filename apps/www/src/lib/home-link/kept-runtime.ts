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
import { reportFailure, toIntentError } from "@some-ui/intent-kit"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import { ForeignCallError } from "@/lib/intent/foreign"

import type { KeptEvent, KeptRun, KeptState } from "./kept-model"
import { answersPull, INITIAL_KEPT, stepKept } from "./kept-model"
import type { Lane } from "./lanes"
import type { HomeLink } from "./runtime"
import { noticingBusy, unanswered } from "./runtime"
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
  /** Whether the phone is paired, read when the link turns a run away. */
  paired: () => boolean
  /** Whether home is busy (AD3): a run the link turns away then was home's. */
  homeBusy: () => boolean
  now: () => number
}

export type Kept = {
  getSnapshot: () => KeptState
  subscribe: (listener: () => void) => () => void
  /** Asks for a run: now, or once the one under way ends. */
  want: () => void
  /**
   * Asks for a run as `want` does, and resolves to how the run that answers
   * it ended (`answersPull`).
   */
  pull: () => Promise<KeptRun>
}

/** A pull waiting for its run: `midRun` while a run it did not start is under way. */
type Waiting = { midRun: boolean; readonly answer: (run: KeptRun) => void }

export function createKept(ports: KeptPorts): Kept {
  let state = INITIAL_KEPT
  const listeners = new Set<() => void>()
  const pulls = new Set<Waiting>()
  const dispatch = (event: KeptEvent): void => {
    const next = stepKept(state, event)
    if (next === state) return
    state = next
    if (event.type === "ran") {
      for (const waiting of pulls) {
        if (answersPull(waiting.midRun, next)) {
          pulls.delete(waiting)
          waiting.answer(event.run)
        } else {
          waiting.midRun = false
        }
      }
    }
    for (const listener of listeners) listener()
  }

  const once = async (): Promise<KeptRun> => {
    try {
      const outcome = await ports.keep(ports.exchange)
      if (outcome === null) {
        if (!ports.paired()) return { kind: "unpaired" }
        return ports.homeBusy() ? BUSY : { kind: "busy" }
      }
      if (outcome.kind === "stopped") return { kind: "stopped" }
      const { value } = outcome
      return value.kind === "synced"
        ? { kind: "synced", at: ports.now() }
        : value
    } catch (error) {
      if (error instanceof SyncStoppedError) return { kind: "stopped" }
      if (unanswered(error) || error instanceof HomeUnansweredError) {
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
      dispatch({ type: "ran", run: await once() })
    }
  }

  const want = (): void => {
    const idle = !state.running
    dispatch({ type: "wanted" })
    if (idle && state.running) void loop()
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
    pull: (): Promise<KeptRun> =>
      new Promise((answer) => {
        pulls.add({ midRun: state.running, answer })
        want()
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
export function laneExchange(
  lane: Lane,
  pairing: () => string | null
): Exchange {
  return (link) => {
    const under = pairing()
    if (under === null) return Promise.resolve({ kind: "synced" })
    return sayingBusy((send) => lane.exchange(send, { pairing: under }))(link)
  }
}
