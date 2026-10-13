import { useCallback, useSyncExternalStore } from "react"

/**
 * Whether the media query matches, following it as the window changes.
 *
 * Read with `useSyncExternalStore`, so the first render is already right.
 * The server snapshot is `false`.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void): (() => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return (): void => mql.removeEventListener("change", onChange)
    },
    [query]
  )
  const snapshot = useCallback(
    (): boolean => window.matchMedia(query).matches,
    [query]
  )
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
