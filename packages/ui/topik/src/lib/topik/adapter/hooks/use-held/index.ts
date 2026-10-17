/**
 * The hold read-aloud's two sessions share (adaptive-learning canon
 * Rem. 4.10): a hidden page, else a paused host session, holds the runtime;
 * shown with neither, it plays.
 */

import type { RefObject } from "react"
import { useEffect, useEffectEvent } from "react"

/** A runtime a hidden page or a paused session can hold. */
type Holdable = { hide: () => void; hold: () => void; show: () => void }

export function holdOrShow(
  target: Holdable,
  paused: boolean | undefined
): void {
  if (document.visibilityState === "hidden") target.hide()
  else if (paused === true) target.hold()
  else target.show()
}

/**
 * Holds or shows `target` on every change of the page's visibility or of
 * `paused`, and on every mount. Called after the effect that makes the
 * runtime, so a remount (React's development double mount) finds it.
 */
export function useHeld(
  target: RefObject<Holdable | null>,
  paused: boolean | undefined
): void {
  const apply = useEffectEvent((): void => {
    if (target.current) holdOrShow(target.current, paused)
  })
  useEffect(() => {
    const onVisibility = (): void => apply()
    document.addEventListener("visibilitychange", onVisibility)
    return (): void => {
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])
  useEffect(() => {
    apply()
  }, [paused])
}
