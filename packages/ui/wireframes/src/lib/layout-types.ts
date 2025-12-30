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

// --- Utilities ---

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function normalize(values: Array<number>): Array<number> {
  const sum = values.reduce((a, b) => a + b, 0)
  if (sum === 0) return values.map(() => 0)
  return values.map((v) => v / sum)
}

export function solveWeights(constraints: Array<Constraint>): Array<number> {
  const clamped = constraints.map((c) => clamp(c.ideal, c.min, c.max))
  return normalize(clamped)
}

// --- Common Solved Node Type ---

export type SolvedNode<T> =
  | { type: "leaf"; id: T; rect: Rect }
  | {
      type: "split"
      axis: "row" | "col"
      splitId: string
      rect: Rect
      children: Array<SolvedNode<T>>
    }

// --- Focus Path Calculation ---

export type TreeNode<T> =
  | { type: "leaf"; id: T }
  | {
      type: "split"
      axis: "row" | "col"
      splitId: string
      children: Array<TreeNode<T>>
    }

export function getFocusPath<T>(
  tree: TreeNode<T>,
  focusId: T,
  getChildren: (node: TreeNode<T>) => Array<TreeNode<T>>
): Set<ConstraintKey<T>> {
  const pathSet = new Set<ConstraintKey<T>>()
  const parents = new Map<TreeNode<T>, TreeNode<T>>()
  const stack: Array<TreeNode<T>> = [tree]
  let targetNode: TreeNode<T> | null = null

  // Search for the leaf
  while (stack.length) {
    const curr = stack.pop()!
    if (curr.type === "leaf" && curr.id === focusId) {
      targetNode = curr
      break
    }
    if (curr.type === "split") {
      const children = getChildren(curr)
      for (const child of children) {
        parents.set(child, curr)
        stack.push(child)
      }
    }
  }

  // Backtrack to root
  let curr: TreeNode<T> | null = targetNode
  while (curr) {
    const key = curr.type === "leaf" ? curr.id : curr.splitId
    pathSet.add(key)
    curr = parents.get(curr) ?? null
  }

  return pathSet
}

// --- Extract Leaf Slots ---

export function extractLeafSlots<T>(
  tree: TreeNode<T>,
  getChildren: (node: TreeNode<T>) => Array<TreeNode<T>>
): Array<T> {
  const slots: Array<T> = []
  const stack: Array<TreeNode<T>> = [tree]

  while (stack.length) {
    const node = stack.pop()!
    if (node.type === "leaf") {
      slots.push(node.id)
    } else {
      const children = getChildren(node)
      stack.push(...children.slice().reverse())
    }
  }

  return slots
}
