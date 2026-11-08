/**
 * The runtime behind `./model`: it owns the calls to home (`./client`),
 * feeds each ending to `stepSwitches`, and says a failed set over the screen
 * through `notify`. The page reads `getSnapshot` and calls `read` and `turn`;
 * it holds no request of its own.
 *
 * Stale answers: `stepSwitches` drops a read's answer once a set is under
 * way, and only one set runs at a time (`canSet`), so the last answer to
 * land is always the newest thing home said.
 */
import type { SwitchesClient } from "./client"
import { refusalOf } from "./client"
import type { Refusal, SwitchesEvent, SwitchesState } from "./model"
import { canSet, INITIAL_SWITCHES, stepSwitches } from "./model"

export type SwitchesPorts = {
  readonly client: SwitchesClient
  /** Says a set that did not land, over the screen. */
  readonly notify: (why: Refusal, recording: boolean) => void
}

export type HomeSwitches = {
  getSnapshot: () => SwitchesState
  subscribe: (listener: () => void) => () => void
  /** Reads the switch from home, again if asked again. */
  read: () => void
  /** Sets recording on or paused; ignored while a set is under way. */
  turn: (recording: boolean) => void
}

export function createHomeSwitches(ports: SwitchesPorts): HomeSwitches {
  let state = INITIAL_SWITCHES
  const listeners = new Set<() => void>()
  const dispatch = (event: SwitchesEvent): void => {
    const next = stepSwitches(state, event)
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }

  const read = async (): Promise<void> => {
    try {
      dispatch({ type: "read", standing: await ports.client.read() })
    } catch (error) {
      dispatch({ type: "read-failed", why: refusalOf(error) })
    }
  }

  const turn = async (recording: boolean): Promise<void> => {
    try {
      dispatch({ type: "set", standing: await ports.client.set(recording) })
    } catch (error) {
      const why = refusalOf(error)
      dispatch({ type: "set-failed", why })
      ports.notify(why, recording)
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
    read: (): void => {
      dispatch({ type: "read-asked" })
      // Not while a set is under way: its answer is the newer one.
      if (state.kind === "reading") void read()
    },
    turn: (recording): void => {
      if (!canSet(state)) return
      dispatch({ type: "set-asked", recording })
      void turn(recording)
    },
  }
}
