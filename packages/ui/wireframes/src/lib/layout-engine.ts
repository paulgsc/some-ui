// Spatial layout solver - tree size is independent of viewport

export type Constraint = {
  ideal: number // In pixels, not ratios
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
      children: Array<{
        node: LayoutNode<T>
        weight: number // Now represents absolute size preference
      }>
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

// --- Core difference: compute INTRINSIC size first, then place ---

function computeIntrinsicSize<T>(
  node: LayoutNode<T>,
  constraints: Map<T | string, Constraint>
): { width: number; height: number } {
  if (node.type === "leaf") {
    const c = constraints.get(node.id) ?? { ideal: 200, min: 100, max: 400 }
    return { width: c.ideal, height: c.ideal }
  }

  const isRow = node.axis === "row"
  let totalWidth = 0
  let totalHeight = 0

  for (const { node: child, weight } of node.children) {
    const childSize = computeIntrinsicSize(child, constraints)

    if (isRow) {
      totalWidth += childSize.width * weight
      totalHeight = Math.max(totalHeight, childSize.height)
    } else {
      totalWidth = Math.max(totalWidth, childSize.width)
      totalHeight += childSize.height * weight
    }
  }

  return { width: totalWidth, height: totalHeight }
}

export function solveLayout<T>(
  tree: LayoutNode<T>,
  constraints: Map<T | string, Constraint>,
  viewport: Rect
): SolvedNode<T> {
  // Compute intrinsic size with maximum bounds
  const intrinsicSize = computeIntrinsicSizeBounded(tree, constraints, viewport)

  const rootRect: Rect = {
    x: viewport.x,
    y: viewport.y,
    width: Math.min(intrinsicSize.width, viewport.width),
    height: Math.min(intrinsicSize.height, viewport.height),
  }

  return solveNode(tree, rootRect, constraints)
}

function computeIntrinsicSizeBounded<T>(
  node: LayoutNode<T>,
  constraints: Map<T | string, Constraint>,
  viewport: Rect
): { width: number; height: number } {
  if (node.type === "leaf") {
    const c = constraints.get(node.id) ?? { ideal: 200, min: 100, max: 400 }
    return {
      width: Math.min(c.ideal, viewport.width),
      height: Math.min(c.ideal, viewport.height),
    }
  }

  const isRow = node.axis === "row"
  let totalWidth = 0
  let totalHeight = 0

  for (const { node: child, weight } of node.children) {
    const childSize = computeIntrinsicSizeBounded(child, constraints, viewport)

    // Weight represents target pixel size
    const effectiveWeight = Math.min(
      weight,
      isRow ? viewport.width : viewport.height
    )

    if (isRow) {
      totalWidth += effectiveWeight
      totalHeight = Math.max(totalHeight, childSize.height)
    } else {
      totalWidth = Math.max(totalWidth, childSize.width)
      totalHeight += effectiveWeight
    }
  }

  return {
    width: Math.min(totalWidth, viewport.width),
    height: Math.min(totalHeight, viewport.height),
  }
}

function solveNode<T>(
  node: LayoutNode<T>,
  rect: Rect,
  constraints: Map<T | string, Constraint>
): SolvedNode<T> {
  if (node.type === "leaf") {
    return {
      type: "leaf",
      id: node.id,
      rect,
    }
  }

  const isRow = node.axis === "row"
  const totalWeight = node.children.reduce((sum, c) => sum + c.weight, 0)
  const availableSize = isRow ? rect.width : rect.height

  let offset = 0
  const solvedChildren: Array<SolvedNode<T>> = []

  for (const { node: child, weight } of node.children) {
    const size = (weight / totalWeight) * availableSize

    const childRect: Rect = isRow
      ? {
          x: rect.x + offset,
          y: rect.y,
          width: size,
          height: rect.height,
        }
      : {
          x: rect.x,
          y: rect.y + offset,
          width: rect.width,
          height: size,
        }

    solvedChildren.push(solveNode(child, childRect, constraints))
    offset += size
  }

  return {
    type: "split",
    axis: node.axis,
    splitId: node.splitId,
    rect,
    children: solvedChildren,
  }
}

// Utility to get the total bounds of a solved tree
export function getTreeBounds<T>(node: SolvedNode<T>): Rect {
  if (node.type === "leaf") {
    return node.rect
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const child of node.children) {
    const bounds = getTreeBounds(child)
    minX = Math.min(minX, bounds.x)
    minY = Math.min(minY, bounds.y)
    maxX = Math.max(maxX, bounds.x + bounds.width)
    maxY = Math.max(maxY, bounds.y + bounds.height)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}
