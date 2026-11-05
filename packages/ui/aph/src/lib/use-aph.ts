import { useMemo, useSyncExternalStore } from "react"

import { live } from "./model"
import type { AphState, AphStore } from "./store"
import { aphStore } from "./store"

/**
 * The store's state as the screens show it, re-read whenever it changes:
 * the entries that stand in the log, without the ones I removed.
 */
export function useAph(store: AphStore = aphStore): AphState {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get)
  return useMemo(
    () => ({ settings: state.settings, entries: live(state.entries) }),
    [state]
  )
}
