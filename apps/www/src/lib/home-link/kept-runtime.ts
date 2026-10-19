/**
 * The runtime behind `./kept-model`: one exchange with home at a time for a
 * record kept there (aph's `exchangeWithHome`, LA9; the Jobs record's
 * `exchangeJobs`, LA10; Practice's `sendStanding`, LA11), through the link's `keep`
 * (docs/learner-data-authority.md), and how each ended; and a lane's
 * exchange as a run makes it (`laneExchange`). The record's screens read
 * its snapshot; they hold no request of their own.
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import { ForeignCallError } from "@/lib/intent/foreign"

import type { Scope } from "./consent-model"
import type { KeptEvent, KeptRun, KeptState } from "./kept-model"
import { INITIAL_KEPT, stepKept } from "./kept-model"
import type { Lane } from "./lanes"
import type { HomeLink } from "./runtime"
import { noticingBusy, unanswered } from "./runtime"
import { HomeUnansweredError } from "./shelf"

/** A run's end that was this phone's fault, as `failed`'s `why`. */
const FAULT = "fault"

export type KeptPorts = {
  /** One exchange through `send`; throws what `send` throws. */
  exchange: (send: HomeCall) => Promise<HomeExchanged>
  keep: HomeLink["keep"]
  /** Whether the phone is paired, read when the link turns a run away. */
  paired: () => boolean
  now: () => number
}

export type Kept = {
  getSnapshot: () => KeptState
  subscribe: (listener: () => void) => () => void
  /** Asks for a run: now, or once the one under way ends. */
  want: () => void
}

export function createKept(ports: KeptPorts): Kept {
  let state = INITIAL_KEPT
  const listeners = new Set<() => void>()
  const dispatch = (event: KeptEvent): void => {
    const next = stepKept(state, event)
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }

  const once = async (): Promise<KeptRun> => {
    try {
      const outcome = await ports.keep(ports.exchange)
      if (outcome === null) {
        return { kind: ports.paired() ? "busy" : "unpaired" }
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

  return {
    getSnapshot: () => state,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    want(): void {
      const idle = !state.running
      dispatch({ type: "wanted" })
      if (idle && state.running) void loop()
    },
  }
}

const BUSY: HomeExchanged = { kind: "failed", why: "busy" }

type Exchange = (send: HomeCall) => Promise<HomeExchanged>

/**
 * `exchange` ending as busy once home answered any of its requests `429`,
 * whatever else it found, unless home forgot the phone or it was stopped.
 */
export function sayingBusy(exchange: Exchange): Exchange {
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

type Tell = (send: HomeCall, pairing: string) => Promise<HomeExchanged>

/**
 * `then`, once home is told the choices under `pairing` it has not heard
 * (`tell`, `./told`). Any other end of telling is told again next run, so
 * `then` goes on; home having forgotten the phone ends it there.
 */
export function toldFirst(
  tell: Tell,
  pairing: string,
  then: Exchange
): Exchange {
  return async (send) => {
    const told = await tell(send, pairing)
    return told.kind === "forgotten" ? told : then(send)
  }
}

/**
 * `lane`'s exchange as a run makes it: home first told the pairing's
 * choices it has not heard (`tell`, `./told`), then each of the record's
 * requests first finds a scope in `shared` still kept, and home being busy
 * is said (`sayingBusy`).
 */
export function laneExchange(
  lane: Lane,
  pairing: () => string | null,
  shared: () => ReadonlySet<Scope>,
  tell: Tell = () => Promise.resolve({ kind: "synced" })
): Exchange {
  return (link) => {
    const under = pairing()
    if (under === null || shared().size === 0) {
      return Promise.resolve({ kind: "synced" })
    }
    return sayingBusy(
      toldFirst(tell, under, (send) => {
        const gated: HomeCall = (method, path, body) =>
          shared().size > 0
            ? send(method, path, body)
            : Promise.reject(new SyncStoppedError())
        return lane.exchange(gated, { pairing: under, shared })
      })
    )(link)
  }
}
