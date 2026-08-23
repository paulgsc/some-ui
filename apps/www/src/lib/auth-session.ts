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
 * Reactive counterpart to `hasDecorativeSession`. `beforeLoad` guards
 * re-run on every navigation, so the plain getter is enough there - but a
 * component that skips a fetch, or an expensive mount (a speech session's
 * audio context, a service worker registration), based on this needs to
 * find out the moment a session appears, not just the next time the router
 * happens to re-evaluate a route. Without the subscription, anything
 * mounted once above the router - `AppProviders`, `TTSProvider` - would
 * read `authenticated` on its first render and never look again.
 *
 * Read the name literally: this answers "is there a session," which is a
 * statement about whether client-side work has anything to do yet, not
 * about whether it would be *allowed*. That question belongs to the
 * server, which this stub does not stand in for.
 */
export function useHasDecorativeSession(): boolean {
  return useSyncExternalStore(
    subscribe,
    hasDecorativeSession,
    hasDecorativeSession
  )
}
