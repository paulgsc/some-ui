import type { TabState } from "@filter/types/tab"
import initWasm, {
  FilterStateMachine as WasmFilterStateMachine,
} from "@some-ui/some-filter-fsm"

export const DEFAULT_TAB_STATE: TabState = "auto"

export type FilterStateMachine = {
  readonly state: TabState
  transitionTo(state: TabState): TabState
  cycle(): TabState
}

let initPromise: Promise<unknown> | null = null

/** Load the Rust FSM and expose only its typed state-domain surface. */
export async function createTabStateMachine(
  initialState: TabState = DEFAULT_TAB_STATE
): Promise<FilterStateMachine> {
  initPromise ??= initWasm()
  await initPromise

  const machine = new WasmFilterStateMachine(initialState)
  return {
    get state(): TabState {
      return machine.state as TabState
    },
    transitionTo(state: TabState): TabState {
      return machine.transitionTo(state) as TabState
    },
    cycle(): TabState {
      return machine.cycle() as TabState
    },
  }
}
