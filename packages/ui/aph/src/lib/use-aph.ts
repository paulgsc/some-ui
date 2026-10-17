import { useSyncExternalStore } from "react"

import type { AphState, AphStore, AphWhere } from "./store"
import { aphStore } from "./store"

/** The store's current state, re-read whenever it changes. */
export function useAph(store: AphStore = aphStore): AphState {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

/** Where the record is kept, re-read whenever that changes. */
export function useAphWhere(store: AphStore = aphStore): AphWhere {
  return useSyncExternalStore(store.subscribe, store.where, store.where)
}
