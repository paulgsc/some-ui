// layout-weighted.ts - Layout with explicit weights in tree structure
import type { Constraint, Rect, SolvedNode } from "./layout-types"
import { clamp, getFocusPath, lerp } from "./layout-types"

export type LayoutNode<T> =
  | { type: "leaf"; id: T }
  | {
      type: "split"
      axis: "row" | "col"
      splitId: string
      children: Array<{
        node: LayoutNode<T>
        weight: number
      }>
    }

// --- Focus Logic ---

export function focusConstraints<T>(
  tree: LayoutNode<T>,
  base: Map<T | string, Constraint>,
  focusId: T | null,
  t: number
): Map<T | string, Constraint> {
  if (!focusId || t <= 0) return base

  const next = new Map(base)
  const clampedT = clamp(t, 0, 1)

  /**
   * Adapter for getFocusPath:
   * strips weights and exposes a pure tree shape
   */
  const focusPath = getFocusPath(
    tree,
    focusId,
    (node: LayoutNode<T>) =>
      node.type === "split" ? node.children.map((c) => c.node) : [],
    (node: LayoutNode<T>) => (node.type === "leaf" ? node.id : node.splitId)
  )

  const stack: Array<LayoutNode<T>> = [tree]

  while (stack.length) {
    const node = stack.pop()!

    if (node.type === "split") {
      for (const { node: child } of node.children) {
        const key = child.type === "leaf" ? child.id : child.splitId
        const c = next.get(key)

        if (c) {
          const onPath = focusPath.has(key)
          next.set(key, {
            ...c,
            ideal: onPath
              ? lerp(c.ideal, c.max, clampedT)
              : lerp(c.ideal, c.min, clampedT),
          })
        }

        stack.push(child)
      }
    } else {
      const c = next.get(node.id)
      if (c && node.id === focusId) {
        next.set(node.id, {
          ...c,
          ideal: lerp(c.ideal, c.max, clampedT),
        })
      }
    }
  }

  return next
}

// --- Geometry Solver (Uses explicit weights) ---

export function solveLayout<T>(
  tree: LayoutNode<T>,
  viewport: Rect
): SolvedNode<T> {
  const results = new Map<LayoutNode<T>, SolvedNode<T>>()
  const traversalOrder: Array<{ node: LayoutNode<T>; rect: Rect }> = []

  const queue: Array<{ node: LayoutNode<T>; rect: Rect }> = [
    { node: tree, rect: viewport },
  ]

  // Pass 1: Top-down geometry calculation
  while (queue.length > 0) {
    const current = queue.shift()!
    traversalOrder.push(current)

    if (current.node.type === "split") {
      const { node, rect } = current
      const isRow = node.axis === "row"
      const totalAvailable = isRow ? rect.width : rect.height

      const totalWeight = node.children.reduce((sum, c) => sum + c.weight, 0)

      let offset = 0

      for (const { node: child, weight } of node.children) {
        const size = (weight / totalWeight) * totalAvailable
        const childRect: Rect = isRow
          ? { x: rect.x + offset, y: rect.y, width: size, height: rect.height }
          : { x: rect.x, y: rect.y + offset, width: rect.width, height: size }

        queue.push({ node: child, rect: childRect })
        offset += size
      }
    }
  }

  // Pass 2: Bottom-up assembly
  for (let i = traversalOrder.length - 1; i >= 0; i--) {
    const entry = traversalOrder[i]
    if (!entry) continue

    const { node, rect } = entry

    if (node.type === "leaf") {
      results.set(node, { type: "leaf", id: node.id, rect })
    } else {
      const children = node.children.map(({ node: c }) => {
        const solved = results.get(c)
        if (!solved) {
          throw new Error("Invariant violation: missing solved child")
        }
        return solved
      })

      results.set(node, {
        type: "split",
        axis: node.axis,
        splitId: node.splitId,
        rect,
        children,
      })
    }
  }

  return results.get(tree)!
}

// --- Focus-aware solver ---

export function solveLayoutWithFocus<T>(
  tree: LayoutNode<T>,
  viewport: Rect,
  focusId: T | null = null,
  focusIntensity = 0
): SolvedNode<T> {
  if (!focusId || focusIntensity <= 0) {
    return solveLayout(tree, viewport)
  }

  const baseConstraints = weightsToConstraints(tree)
  const focusedConstraints = focusConstraints(
    tree,
    baseConstraints,
    focusId,
    focusIntensity
  )

  return solveLayoutWithConstraints(tree, focusedConstraints, viewport)
}

// --- Binding-aware solver ---

/**
 * Solves geometry the same way `solveLayoutWithFocus` does, except a leaf
 * with nothing bound to it (not in `boundLeafIds`) gets zero effective
 * weight, so its siblings redistribute proportionally into the space it
 * would have taken. A split whose entire subtree is unbound also
 * zero-collapses, transitively, so bound leaves always exactly tile
 * `viewport` rather than leaving a dead gap where an all-unbound branch
 * would otherwise still claim its authored share.
 *
 * This never mutates a node's persisted `weight` - zeroing happens purely
 * in the derived constraint used for this one solve, so re-binding a
 * leaf later restores its prior proportional share rather than a fresh
 * default.
 */
export function solveLayoutWithBindings<T>(
  tree: LayoutNode<T>,
  boundLeafIds: ReadonlySet<T>,
  viewport: Rect,
  focusId: T | null = null,
  focusIntensity = 0
): SolvedNode<T> {
  const baseConstraints = weightsToConstraintsWithBindings(tree, boundLeafIds)

  const constraints =
    focusId && focusIntensity > 0
      ? focusConstraints(tree, baseConstraints, focusId, focusIntensity)
      : baseConstraints

  return solveLayoutWithConstraints(tree, constraints, viewport)
}

// --- Constraints extraction ---

function weightsToConstraints<T>(
  tree: LayoutNode<T>
): Map<T | string, Constraint> {
  const constraints = new Map<T | string, Constraint>()
  const stack: Array<LayoutNode<T>> = [tree]

  while (stack.length > 0) {
    const node = stack.pop()!

    if (node.type === "leaf") {
      constraints.set(node.id, { ideal: 1, min: 0, max: 1 })
    } else {
      const totalWeight = node.children.reduce((sum, c) => sum + c.weight, 0)

      for (const { node: child, weight } of node.children) {
        const key = child.type === "leaf" ? child.id : child.splitId

        constraints.set(key, {
          ideal: weight / totalWeight,
          min: 0,
          max: 1,
        })

        stack.push(child)
      }
    }
  }

  return constraints
}

const ZERO_CONSTRAINT: Constraint = { ideal: 0, min: 0, max: 0 }

/**
 * A leaf zero-collapses iff it's unbound; a split zero-collapses iff every
 * one of its children does (recursively) - so a branch that's entirely
 * unbound collapses as a whole, rather than leaving a claimed-but-empty
 * gap at the split level.
 */
function isZeroCollapsed<T>(
  node: LayoutNode<T>,
  boundLeafIds: ReadonlySet<T>,
  cache: Map<LayoutNode<T>, boolean>
): boolean {
  const cached = cache.get(node)
  if (cached !== undefined) return cached

  const result =
    node.type === "leaf"
      ? !boundLeafIds.has(node.id)
      : node.children.every(({ node: child }) =>
          isZeroCollapsed(child, boundLeafIds, cache)
        )

  cache.set(node, result)
  return result
}

/**
 * Only descends into "split" nodes - a leaf's constraint is fully decided
 * by its parent (weight share, zeroed or not) and never needs revisiting,
 * so leaves are never re-pushed for further expansion here.
 */
function weightsToConstraintsWithBindings<T>(
  tree: LayoutNode<T>,
  boundLeafIds: ReadonlySet<T>
): Map<T | string, Constraint> {
  const constraints = new Map<T | string, Constraint>()
  const zeroCache = new Map<LayoutNode<T>, boolean>()
  const stack: Array<LayoutNode<T>> = [tree]

  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.type !== "split") continue

    const totalWeight = node.children.reduce((sum, c) => sum + c.weight, 0)

    for (const { node: child, weight } of node.children) {
      const key = child.type === "leaf" ? child.id : child.splitId

      constraints.set(
        key,
        isZeroCollapsed(child, boundLeafIds, zeroCache)
          ? ZERO_CONSTRAINT
          : { ideal: weight / totalWeight, min: 0, max: 1 }
      )

      stack.push(child)
    }
  }

  return constraints
}

// --- Constraint-based solver ---

function solveLayoutWithConstraints<T>(
  tree: LayoutNode<T>,
  constraints: Map<T | string, Constraint>,
  viewport: Rect
): SolvedNode<T> {
  const results = new Map<LayoutNode<T>, SolvedNode<T>>()
  const traversalOrder: Array<{ node: LayoutNode<T>; rect: Rect }> = []

  const queue: Array<{ node: LayoutNode<T>; rect: Rect }> = [
    { node: tree, rect: viewport },
  ]

  // Pass 1
  while (queue.length > 0) {
    const current = queue.shift()!
    traversalOrder.push(current)

    if (current.node.type === "split") {
      const { node, rect } = current
      const isRow = node.axis === "row"
      const totalAvailable = isRow ? rect.width : rect.height

      const childConstraints = node.children.map(({ node: child }) => {
        const key = child.type === "leaf" ? child.id : child.splitId
        return constraints.get(key) ?? { ideal: 1, min: 0, max: Infinity }
      })

      const weights = solveWeightsFromConstraints(childConstraints)
      let offset = 0

      node.children.forEach(({ node: child }, i) => {
        const size = weights[i]! * totalAvailable

        const childRect: Rect = isRow
          ? { x: rect.x + offset, y: rect.y, width: size, height: rect.height }
          : { x: rect.x, y: rect.y + offset, width: rect.width, height: size }

        queue.push({ node: child, rect: childRect })
        offset += size
      })
    }
  }

  // Pass 2
  for (let i = traversalOrder.length - 1; i >= 0; i--) {
    const entry = traversalOrder[i]
    if (!entry) continue

    const { node, rect } = entry

    if (node.type === "leaf") {
      results.set(node, { type: "leaf", id: node.id, rect })
    } else {
      const children = node.children.map(({ node: c }) => {
        const solved = results.get(c)
        if (!solved) {
          throw new Error("Invariant violation: missing solved child")
        }
        return solved
      })

      results.set(node, {
        type: "split",
        axis: node.axis,
        splitId: node.splitId,
        rect,
        children,
      })
    }
  }

  return results.get(tree)!
}

// --- Weight solver ---

function solveWeightsFromConstraints(
  constraints: Array<Constraint>
): Array<number> {
  const clamped = constraints.map((c) => clamp(c.ideal, c.min, c.max))
  const sum = clamped.reduce((a, b) => a + b, 0)

  if (sum === 0) return clamped.map(() => 0)
  return clamped.map((v) => v / sum)
}
