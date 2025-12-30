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

  const getChildren = (node: any): Array<any> =>
    node.type === "split" ? node.children.map((c: any) => c.node) : []

  const focusPath = getFocusPath(tree, focusId, getChildren)
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

      const totalWeight = node.children.reduce(
        (sum, { weight }) => sum + weight,
        0
      )

      let offset = 0

      node.children.forEach(({ node: child, weight }) => {
        const size = (weight / totalWeight) * totalAvailable
        const childRect: Rect = isRow
          ? { x: rect.x + offset, y: rect.y, width: size, height: rect.height }
          : { x: rect.x, y: rect.y + offset, width: rect.width, height: size }

        queue.push({ node: child, rect: childRect })
        offset += size
      })
    }
  }

  // Pass 2: Bottom-up assembly
  for (let i = traversalOrder.length - 1; i >= 0; i--) {
    const { node, rect } = traversalOrder[i]

    if (node.type === "leaf") {
      results.set(node, { type: "leaf", id: node.id, rect })
    } else {
      const children = node.children.map(({ node: c }) => results.get(c)!)
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

/**
 * Solve layout WITH focus support.
 * Converts weights → constraints, applies focus, then solves.
 */
export function solveLayoutWithFocus<T>(
  tree: LayoutNode<T>,
  viewport: Rect,
  focusId: T | null = null,
  focusIntensity: number = 0
): SolvedNode<T> {
  // If no focus, use the fast weight-based solver
  if (!focusId || focusIntensity <= 0) {
    return solveLayout(tree, viewport)
  }

  // Otherwise, use constraint-based solving
  const baseConstraints = weightsToConstraints(tree)
  const focusedConstraints = focusConstraints(
    tree,
    baseConstraints,
    focusId,
    focusIntensity
  )
  return solveLayoutWithConstraints(tree, focusedConstraints, viewport)
}

/**
 * Extract base constraints from a weight-based tree.
 */
function weightsToConstraints<T>(
  tree: LayoutNode<T>
): Map<T | string, Constraint> {
  const constraints = new Map<T | string, Constraint>()
  const stack: Array<LayoutNode<T>> = [tree]

  while (stack.length > 0) {
    const node = stack.pop()!

    if (node.type === "leaf") {
      // Leaf gets a default constraint (will be overridden by parent split logic)
      constraints.set(node.id, {
        ideal: 1,
        min: 0.05,
        max: 10,
      })
    } else {
      // Split's children inherit their weights as ideal values
      const totalWeight = node.children.reduce((sum, c) => sum + c.weight, 0)

      for (const { node: child, weight } of node.children) {
        const key = child.type === "leaf" ? child.id : child.splitId
        const normalizedWeight = weight / totalWeight

        constraints.set(key, {
          ideal: normalizedWeight,
          min: 0.05, // Can shrink to 5% of parent
          max: 0.95, // Can grow to 95% of parent
        })

        stack.push(child)
      }
    }
  }

  return constraints
}

/**
 * Solve layout using constraints (for focus mode).
 * Similar to old constraint-based solver but works with weighted tree.
 */
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

  // Pass 1: Top-down geometry calculation using constraints
  while (queue.length > 0) {
    const current = queue.shift()!
    traversalOrder.push(current)

    if (current.node.type === "split") {
      const { node, rect } = current
      const isRow = node.axis === "row"
      const totalAvailable = isRow ? rect.width : rect.height

      // Get constraints for each child
      const childConstraints = node.children.map(({ node: child }) => {
        const key = child.type === "leaf" ? child.id : child.splitId
        return constraints.get(key) ?? { ideal: 1, min: 0, max: Infinity }
      })

      // Solve weights from constraints (using old algorithm)
      const weights = solveWeightsFromConstraints(childConstraints)
      let offset = 0

      node.children.forEach(({ node: child }, i) => {
        const size = weights[i] * totalAvailable
        const childRect: Rect = isRow
          ? { x: rect.x + offset, y: rect.y, width: size, height: rect.height }
          : { x: rect.x, y: rect.y + offset, width: rect.width, height: size }

        queue.push({ node: child, rect: childRect })
        offset += size
      })
    }
  }

  // Pass 2: Bottom-up assembly (same as before)
  for (let i = traversalOrder.length - 1; i >= 0; i--) {
    const { node, rect } = traversalOrder[i]

    if (node.type === "leaf") {
      results.set(node, { type: "leaf", id: node.id, rect })
    } else {
      const children = node.children.map(({ node: c }) => results.get(c)!)
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

/**
 * Solve weights from constraints (from old layout-types.ts).
 */
function solveWeightsFromConstraints(
  constraints: Array<Constraint>
): Array<number> {
  // Clamp each ideal to its min/max
  const clamped = constraints.map((c) => clamp(c.ideal, c.min, c.max))

  // Normalize to sum to 1
  const sum = clamped.reduce((a, b) => a + b, 0)
  if (sum === 0) return clamped.map(() => 0)
  return clamped.map((v) => v / sum)
}
