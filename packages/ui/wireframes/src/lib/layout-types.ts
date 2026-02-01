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

export function getFocusPath<N, T>(
  tree: N,
  focusId: T,
  getChildren: (node: N) => Array<N>,
  getKey: (node: N) => ConstraintKey<T> | null
): Set<ConstraintKey<T>> {
  const pathSet = new Set<ConstraintKey<T>>()
  const parents = new Map<N, N>()
  const stack: Array<N> = [tree]
  let target: N | null = null

  while (stack.length) {
    const curr = stack.pop()!
    const key = getKey(curr)

    if (key === focusId) {
      target = curr
      break
    }

    for (const child of getChildren(curr)) {
      parents.set(child, curr)
      stack.push(child)
    }
  }

  let curr = target
  while (curr) {
    const key = getKey(curr)
    if (key != null) pathSet.add(key)
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
