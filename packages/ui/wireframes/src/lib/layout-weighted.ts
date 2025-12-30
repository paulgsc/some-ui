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
