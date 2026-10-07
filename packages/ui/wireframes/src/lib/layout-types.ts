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
