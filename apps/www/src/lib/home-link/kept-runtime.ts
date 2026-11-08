/**
 * The runtime behind `./kept-model`: one exchange with home at a time for a
 * record this phone drains there (aph's `exchangeWithHome`, the Jobs
 * record's `exchangeJobs`, Practice's `drainHome`, voice notes'
 * `sendVoice`; LA15, docs/learner-data-authority.md), through the link's
 * `keep`, and how each ended; and a lane's exchange as a run makes it
 * (`laneExchange`). The record's screens read its snapshot; they hold no
 * request of their own.
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import { ForeignCallError } from "@/lib/intent/foreign"

import type { KeptEvent, KeptRun, KeptState, LaneExchanged } from "./kept-model"
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
  exchange: (send: HomeCall) => Promise<LaneExchanged>
  keep: HomeLink["keep"]
  /** Whether the phone is paired, read when the link turns a run away. */
  paired: () => boolean
  /**
   * Whether home is still waiting out a busy (AD3), read when the link
   * turns a run away: then the run was home's to turn away too.
   */
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
      if (value.kind === "synced") return { kind: "synced", at: ports.now() }
      if (value.kind === "capped") return { ...value, at: ports.now() }
      return value
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

/**
 * A run asked for more requests than its lane's share (`spending`): the
 * lane stops there as it does on a stop, keeping what it heard.
 */
class RunSpentError extends SyncStoppedError {
  constructor() {
    super()
    this.name = "RunSpentError"
  }
}

/**
 * `send` refusing, as a stop does, every request past the first `share`;
 * `spent` says whether it refused one, and `sent` how many went.
 */
function spending(
  send: HomeCall,
  share: number
): { send: HomeCall; spent: { over: boolean; sent: number } } {
  const spent = { over: false, sent: 0 }
  return {
    spent,
    send: (...call): ReturnType<HomeCall> => {
      if (spent.sent >= share) {
        spent.over = true
        return Promise.reject(new RunSpentError())
      }
      spent.sent += 1
      return send(...call)
    },
  }
}

/**
 * `lane`'s exchange as a run makes it: under the pairing this phone holds
 * when the run starts (nothing, unpaired), sending at most `share` requests
 * (each lane's is `REQUESTS_PER_RUN`, `./lanes`). It ends as busy once home
 * answered any request `429`, whatever else it found, unless home forgot the
 * phone or it was stopped; and as `capped` when it asked for more than its
 * share, the rest waiting for a later run, unless it ended worse first.
 */
export function laneExchange(
  lane: Lane,
  pairing: () => string | null,
  share: number
): (link: HomeCall) => Promise<LaneExchanged> {
  return async (link) => {
    const under = pairing()
    if (under === null) return { kind: "synced" }
    const busy = noticingBusy(link)
    const { send, spent } = spending(busy.send, share)
    let ended: HomeExchanged
    try {
      ended = await lane.exchange(send, { pairing: under })
    } catch (error) {
      // A stop of the lane's own (it never sent past its share) stays one.
      const stop = error instanceof SyncStoppedError && !spent.over
      if (busy.seen.busy && !stop) return BUSY
      if (spent.over && error instanceof SyncStoppedError) {
        return { kind: "capped", sent: spent.sent }
      }
      throw error
    }
    if (busy.seen.busy && ended.kind !== "forgotten") return BUSY
    // A lane that caught the refusal and resolved with what it did.
    if (spent.over && ended.kind === "synced") {
      return { kind: "capped", sent: spent.sent }
    }
    return ended
  }
}
