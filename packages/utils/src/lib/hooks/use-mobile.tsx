import { useSyncExternalStore } from "react"

/**
 * The workspace's one definition of a handheld window: either axis compact,
 * narrower than `md` or shorter than Material's compact height (480dp). Width
 * alone fails a phone on its side (~844x390), so rotating flipped the answer
 * and hosts that build a different tree per answer remounted the activity.
 *
 * The `handheld:` variant in `packages/some-styles/tailwind.css` must say
 * what `HANDHELD_QUERY` says.
 */
export const HANDHELD_MAX_WIDTH = 768
export const HANDHELD_MAX_HEIGHT = 480
export const HANDHELD_QUERY = `(max-width: ${HANDHELD_MAX_WIDTH - 1}px), (max-height: ${HANDHELD_MAX_HEIGHT - 1}px)`

/** Whether a box of this size is handheld, by the same rule as the query. */
export function isHandheldBox({
  width,
  height,
}: {
  width: number
  height: number
}): boolean {
  return width < HANDHELD_MAX_WIDTH || height < HANDHELD_MAX_HEIGHT
}

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(HANDHELD_QUERY)
  mql.addEventListener("change", onChange)
  return (): void => mql.removeEventListener("change", onChange)
}

function snapshot(): boolean {
  return window.matchMedia(HANDHELD_QUERY).matches
}

/**
 * Whether the window is handheld (`HANDHELD_QUERY`, above).
 *
 * Read with `useSyncExternalStore`, so the first render is already right.
 * The server snapshot is `false` (desktop degrades more gracefully).
 *
 * The answer can change mid-task (a resize across `md`), so a caller must not
 * let its branch move stateful children in the tree: a moved child remounts
 * and loses its state. Switch only what surrounds it
 * (`{isMobile && <Chrome />}`), or hold its state above the branch.

 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
