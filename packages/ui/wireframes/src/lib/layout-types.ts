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
