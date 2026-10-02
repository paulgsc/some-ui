import { useSyncExternalStore } from "react"

import type { AuthoritySnapshot } from "./runtime"
import { authority } from "./singleton"
import type { Authority } from "./state"

/**
 * The authority as a React value. A component that skips a fetch or an
 * expensive mount on it learns the moment it changes. It reads; it never
 * decides: the decisions are `state.ts`'s `step`.
 */
export function useAuthoritySnapshot(): AuthoritySnapshot {
  return useSyncExternalStore(
    authority.subscribe,
    authority.getSnapshot,
    authority.getSnapshot
  )
}

export function useAuthority(): Authority {
  return useAuthoritySnapshot().authority
}
