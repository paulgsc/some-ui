export type ConstraintKey<T> = T | string

export type Constraint = {
  ideal: number
  min: number
  max: number
}

export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export type LayoutNode<T> =
  | { type: "leaf"; id: T }
  | {
      type: "split"
      axis: "row" | "col"
      splitId: string
      children: Array<LayoutNode<T>>
    }

export type SolvedNode<T> =
  | { type: "leaf"; id: T; rect: Rect }
  | {
      type: "split"
      axis: "row" | "col"
      splitId: string
      rect: Rect
      children: Array<SolvedNode<T>>
    }

// --- Utilities ---

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function normalize(values: Array<number>): Array<number> {
  const sum = values.reduce((a, b) => a + b, 0)
  if (sum === 0) return values.map(() => 0)
  return values.map((v) => v / sum)
}

function solveWeights(constraints: Array<Constraint>): Array<number> {
  const clamped = constraints.map((c) => clamp(c.ideal, c.min, c.max))
  return normalize(clamped)
}

// --- Focus Logic (Iterative) ---

/**
 * Calculates which nodes are on the path to the focusId.
 * Returns a Set of IDs (leaf IDs or splitIds).
 */
function getFocusPath<T>(
  tree: LayoutNode<T>,
  focusId: T
): Set<ConstraintKey<T>> {
  const pathSet = new Set<ConstraintKey<T>>()
  const parents = new Map<LayoutNode<T>, LayoutNode<T>>()
  const stack: Array<LayoutNode<T>> = [tree]
  let targetNode: LayoutNode<T> | null = null

  // Search for the leaf
  while (stack.length) {
    const curr = stack.pop()!
    if (curr.type === "leaf" && curr.id === focusId) {
      targetNode = curr
      break
    }
    if (curr.type === "split") {
      for (const child of curr.children) {
        parents.set(child, curr)
        stack.push(child)
      }
    }
  }

  // Backtrack to root
  let curr: LayoutNode<T> | null = targetNode
  while (curr) {
    const key = curr.type === "leaf" ? curr.id : curr.splitId
    pathSet.add(key)
    curr = parents.get(curr) ?? null
  }

  return pathSet
}

export function focusConstraints<T>(
  tree: LayoutNode<T>,
  base: Map<T | string, Constraint>,
  focusId: T | null,
  t: number
): Map<T | string, Constraint> {
  if (!focusId || t <= 0) return base

  const next = new Map(base)
  const clampedT = clamp(t, 0, 1)
  const focusPath = getFocusPath(tree, focusId)

  const stack: Array<LayoutNode<T>> = [tree]

  while (stack.length) {
    const node = stack.pop()!

    // Process Split children
    if (node.type === "split") {
      for (const child of node.children) {
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
      // Process individual leaf if it's the specific focus target
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

// --- Geometry Solver (Iterative Two-Pass) ---

export function solveLayout<T>(
  tree: LayoutNode<T>,
  constraints: Map<T | string, Constraint>,
  viewport: Rect
): SolvedNode<T> {
  const results = new Map<LayoutNode<T>, SolvedNode<T>>()
  const traversalOrder: Array<{ node: LayoutNode<T>; rect: Rect }> = []
  const queue: Array<{ node: LayoutNode<T>; rect: Rect }> = [
    { node: tree, rect: viewport },
  ]

  // Pass 1: Top-down geometry calculation (BFS)
  while (queue.length > 0) {
    const current = queue.shift()!
    traversalOrder.push(current)

    if (current.node.type === "split") {
      const { node, rect } = current
      const isRow = node.axis === "row"
      const totalAvailable = isRow ? rect.width : rect.height

      const childConstraints = node.children.map((child) => {
        const key = child.type === "leaf" ? child.id : child.splitId
        return constraints.get(key) ?? { ideal: 1, min: 0, max: Infinity }
      })

      const weights = solveWeights(childConstraints)
      let offset = 0

      node.children.forEach((child, i) => {
        const size = weights[i] * totalAvailable
        const childRect: Rect = isRow
          ? { x: rect.x + offset, y: rect.y, width: size, height: rect.height }
          : { x: rect.x, y: rect.y + offset, width: rect.width, height: size }

        queue.push({ node: child, rect: childRect })
        offset += size
      })
    }
  }

  // Pass 2: Bottom-up assembly (Reverse Traversal)
  for (let i = traversalOrder.length - 1; i >= 0; i--) {
    const { node, rect } = traversalOrder[i]

    if (node.type === "leaf") {
      results.set(node, { type: "leaf", id: node.id, rect })
    } else {
      const children = node.children.map((c) => results.get(c)!)
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
