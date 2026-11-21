/**
 * The runtime behind `./model`, one per setting: it owns the calls to home (`./client`),
 * feeds each ending to `stepSwitches`, and says a failed set over the screen
 * through `notify`. The page reads `getSnapshot` and calls `read` and `set`;
 * it holds no request of its own.
 *
 * Stale answers: `stepSwitches` drops a read's answer once a set is under
 * way, and only one set runs at a time (`canSet`), so the last answer to
 * land is always the newest thing home said. A set that fails may still
 * have landed, so it is followed by a read of what home now follows.
 */
import type { SwitchesClient } from "./client"
import { refusalOf } from "./client"
import type {
  Refusal,
  SettingKey,
  SettingValue,
  SwitchesEvent,
  SwitchesState,
} from "./model"
import { canSet, INITIAL_SWITCHES, stepSwitches } from "./model"

export type SwitchesPorts<K extends SettingKey = SettingKey> = {
  readonly client: SwitchesClient<K>
  /** Says a set that did not land, over the screen. */
  readonly notify: (why: Refusal, value: SettingValue[K]) => void
}

export type HomeSwitches<K extends SettingKey = SettingKey> = {
  getSnapshot: () => SwitchesState<K>
  subscribe: (listener: () => void) => () => void
  /** Reads its setting from home, again if asked again. */
  read: () => void
  /** Sets it to `value`; ignored while a set is under way. */
  set: (value: SettingValue[K]) => void
}

export function createHomeSwitches<K extends SettingKey>(
  ports: SwitchesPorts<K>
): HomeSwitches<K> {
  let state: SwitchesState<K> = INITIAL_SWITCHES
  const listeners = new Set<() => void>()
  const dispatch = (event: SwitchesEvent<K>): void => {
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

  const set = async (value: SettingValue[K]): Promise<void> => {
    try {
      dispatch({ type: "set", standing: await ports.client.set(value) })
    } catch (error) {
      const why = refusalOf(error)
      dispatch({ type: "set-failed", why })
      ports.notify(why, value)
      // What home follows is unknown now; ask it (the state is `reading`).
      await read()
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
    set: (value): void => {
      if (!canSet(state)) return
      dispatch({ type: "set-asked", value })
      void set(value)
    },
  }
}
