import { useCallback, useEffect } from "react"
import {
  selectResolvedFocus,
  useFocusStore,
} from "@wireframes/hooks/focus-system"
import type { ResolvedFocus } from "@wireframes/hooks/focus-system"
import type { SceneConfig } from "some-types-utils"

/* -----------------------------------------------------------
 * Scene registry
 * --------------------------------------------------------- */

export type SceneRegistry = Record<string, SceneConfig>

/* -----------------------------------------------------------
 * Focus pruning / resolution
 * --------------------------------------------------------- */

export function useFocusPruning(intervalMs = 100): void {
  const prune = useFocusStore((s) => s.prune)

  useEffect(() => {
    const id = setInterval(() => prune(Date.now()), intervalMs)
    return (): void => clearInterval(id)
  }, [prune, intervalMs])
}

export function useCurrentResolvedFocus(): ResolvedFocus {
  return useFocusStore(
    useCallback((s) => selectResolvedFocus(Date.now())(s), [])
  )
}
