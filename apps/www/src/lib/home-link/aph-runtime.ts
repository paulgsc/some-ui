/**
 * The runtime behind `./aph-model`: one exchange with home at a time
 * (`@some-ui/aph`'s `exchangeWithHome`, which sends aph's outbox and reads
 * home's record back into its store), through the link's `keep` (LA9,
 * docs/learner-data-authority.md), and how each ended. The aph screens read
 * its snapshot; they hold no request of their own.
 */
import type { Exchanged } from "@some-ui/aph"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"

import type { AphHomeEvent, AphHomeState, AphRun } from "./aph-model"
import { INITIAL_APH, stepAph } from "./aph-model"
import type { HomeLink, HomeSend } from "./runtime"

export type AphHomePorts = {
  /** One exchange through `send`; throws what `send` throws. */
  exchange: (send: HomeSend) => Promise<Exchanged>
  keep: HomeLink["keep"]
  /** Whether the phone is paired, read when the link turns a run away. */
  paired: () => boolean
  now: () => number
}

export type AphHome = {
  getSnapshot: () => AphHomeState
  subscribe: (listener: () => void) => () => void
  /** Asks for a run: now, or once the one under way ends. */
  want: () => void
}

export function createAphHome(ports: AphHomePorts): AphHome {
  let state = INITIAL_APH
  const listeners = new Set<() => void>()
  const dispatch = (event: AphHomeEvent): void => {
    const next = stepAph(state, event)
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }

  const once = async (): Promise<AphRun> => {
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
