import { useSyncExternalStore } from "react"

import type { AphState, AphStore } from "./store"
import { aphStore } from "./store"

/** The store's current state, re-read whenever it changes. */
export function useAph(store: AphStore = aphStore): AphState {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
