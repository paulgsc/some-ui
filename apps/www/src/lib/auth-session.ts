/**
 * A deliberately in-memory auth stub. It exists only to demonstrate the
 * route workflow until the backend can provide a real session.
 */
import { useSyncExternalStore } from "react"

let authenticated = false
const listeners = new Set<() => void>()

export function hasDecorativeSession(): boolean {
  return authenticated
}

export function createDecorativeSession(): void {
  authenticated = true
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Reactive counterpart to `hasDecorativeSession`, for the providers mounted
 * above the router (TTS, the study nudge watcher) that read session-gated
 * queries. `beforeLoad` guards re-run on every navigation, so the plain
 * getter is enough there - these providers render once, above any route,
 * and never re-render on sign-in without a subscription telling them to.
 */
export function useHasDecorativeSession(): boolean {
  return useSyncExternalStore(
    subscribe,
    hasDecorativeSession,
    hasDecorativeSession
  )
}
