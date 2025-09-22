import { useSyncExternalStore } from "react"

import type { Selector, Store } from "./ochestrated-store"

export function useStore<T, S>(store: Store<T>, selector: Selector<T, S>): S {
  return useSyncExternalStore(
    (cb) => store.subscribe(selector, cb),
    () => selector(store.get())
  )
}
