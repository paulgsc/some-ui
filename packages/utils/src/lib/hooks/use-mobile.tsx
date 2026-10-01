import { useSyncExternalStore } from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return (): void => mql.removeEventListener("change", onChange)
}

function snapshot(): boolean {
  return window.matchMedia(QUERY).matches
}

/**
 * Whether the viewport is narrower than the mobile breakpoint.
 *
 * `useSyncExternalStore` rather than an effect that calls `setState`: a media
 * query *is* an external store, and reading it this way means the first
 * render already has the right answer instead of rendering `false`, painting,
 * and correcting itself a frame later. It also removes the tri-state
 * (`undefined` until the effect ran) that callers had to coerce away.
 *
 * The server snapshot is `false` - there is no viewport to measure, and
 * desktop is the layout that degrades more gracefully when it turns out to be
 * wrong.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
