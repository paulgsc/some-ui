/**
 * The runtime behind `./kept-model`: one exchange with home at a time for a
 * record kept there (aph's `exchangeWithHome`, LA9; the Jobs record's
 * `exchangeJobs`, LA10; Practice's `sendStanding`, LA11), through the link's `keep`
 * (docs/learner-data-authority.md), and how each ended; and a lane's
 * exchange as a run makes it (`laneExchange`). The record's screens read
 * its snapshot; they hold no request of their own.
 */
import type { HomeExchanged } from "@some-ui/core-utils"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"

import type { Scope } from "./consent-model"
import type { KeptEvent, KeptRun, KeptState } from "./kept-model"
import { INITIAL_KEPT, stepKept } from "./kept-model"
import type { Lane } from "./lanes"
import type { HomeLink, HomeSend } from "./runtime"
import { noticingBusy } from "./runtime"

export type KeptPorts = {
  /** One exchange through `send`; throws what `send` throws. */
  exchange: (send: HomeSend) => Promise<HomeExchanged>
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
      return { kind: "unreachable", at: ports.now() }
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

type Exchange = (send: HomeSend) => Promise<HomeExchanged>

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

/**
 * `lane`'s exchange as a run makes it: each request first finds a scope in
 * `shared` still kept, and home being busy is said (`sayingBusy`).
 */
export function laneExchange(
  lane: Lane,
  pairing: () => string | null,
  shared: () => ReadonlySet<Scope>
): Exchange {
  return (link) => {
    const under = pairing()
    if (under === null || shared().size === 0) {
      return Promise.resolve({ kind: "synced" })
    }
    const gated: HomeSend = (method, path, body) =>
      shared().size > 0
        ? link(method, path, body)
        : Promise.reject(new SyncStoppedError())
    return sayingBusy((send) =>
      lane.exchange(send, { pairing: under, shared })
    )(gated)
  }
}
