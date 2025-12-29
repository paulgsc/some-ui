/**
 * Consumer-side constraint and focus system
 *
 * The consumer receives a tree from the editor but manages its own
 * runtime geometry through:
 * - Focus constraints (expand/collapse panels)
 * - Dynamic weight adjustments
 * - Animation states
 */

import { useCallback, useMemo, useState } from "react"
import type {
  Constraint,
  LayoutNode,
  Rect,
} from "@wireframes/lib/layout-weighted"
import { focusConstraints, solveLayout } from "@wireframes/lib/layout-weighted"

// ============================================================================
// Consumer Constraint Hook
// ============================================================================

export type FocusState<T extends string> = {
  regionId?: T
  intensity?: number
}

export type ConsumerConstraintOptions<T extends string> = {
  tree: LayoutNode<T>
  viewport: Rect
  baseConstraints: Map<T | string, Constraint>
  focusState: FocusState<T>
}

/**
 * Hook that manages consumer-side constraints
 * Separate from editor because:
 * - Editor defines structure
 * - Consumer controls runtime geometry
 */
export function useConsumerConstraints<T extends string>({
  tree,
  viewport,
  baseConstraints,
  focusState,
}: ConsumerConstraintOptions<T>) {
  // Apply focus modifications to base constraints
  const effectiveConstraints = useMemo(() => {
    if (!focusState.regionId || !focusState.intensity) {
      return baseConstraints
    }

    return focusConstraints(
      tree,
      baseConstraints,
      focusState.regionId,
      focusState.intensity
    )
  }, [tree, baseConstraints, focusState])

  // Solve layout with consumer constraints
  const solvedLayout = useMemo(() => {
    return solveLayout(tree, effectiveConstraints, viewport)
  }, [tree, effectiveConstraints, viewport])

  return {
    constraints: effectiveConstraints,
    layout: solvedLayout,
  }
}

// ============================================================================
// Consumer Focus Management Hook
// ============================================================================

export type FocusControls<T extends string> = {
  focusState: FocusState<T>
  setFocus: (regionId: T, intensity: number) => void
  clearFocus: () => void
  isFocused: (regionId: T) => boolean
}

export function useFocusControls<T extends string>(): FocusControls<T> {
  const [focusState, setFocusState] = useState<FocusState<T>>({})

  const setFocus = useCallback((regionId: T, intensity: number) => {
    setFocusState({ regionId, intensity })
  }, [])

  const clearFocus = useCallback(() => {
    setFocusState({})
  }, [])

  const isFocused = useCallback(
    (regionId: T) => focusState.regionId === regionId,
    [focusState.regionId]
  )

  return {
    focusState,
    setFocus,
    clearFocus,
    isFocused,
  }
}

// ============================================================================
// Weight Extraction Utility
// ============================================================================

/**
 * Extract current weights from a tree
 * Useful for:
 * - Persisting user adjustments
 * - Analyzing current state
 * - Debugging
 */
export function extractWeights<T extends string>(
  tree: LayoutNode<T>
): Map<T | string, number> {
  const weights = new Map<T | string, number>()

  function traverse(node: LayoutNode<T>): void {
    if (node.type === "leaf") {
      // Leaves don't have weights, skip
      return
    }

    // Record split weights
    for (const { node: child, weight } of node.children) {
      const key = child.type === "leaf" ? child.id : child.splitId
      weights.set(key, weight)
      traverse(child)
    }
  }

  traverse(tree)
  return weights
}

// ============================================================================
// Weight Merging Utility
// ============================================================================

/**
 * Merge user-adjusted weights back into base constraints
 *
 * Use case: User resizes panels in consumer, you want to persist those
 * adjustments as new "base" constraints for next session
 */
export function mergeWeightsIntoConstraints<T extends string>(
  baseConstraints: Map<T | string, Constraint>,
  weights: Map<T | string, number>
): Map<T | string, Constraint> {
  const merged = new Map(baseConstraints)

  for (const [key, weight] of weights) {
    const existing = merged.get(key)
    if (existing) {
      merged.set(key, {
        ...existing,
        ideal: weight, // Update ideal based on user adjustment
      })
    }
  }

  return merged
}
