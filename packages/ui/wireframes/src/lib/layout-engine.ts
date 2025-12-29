// Solver that fills viewport opportunistically but allows smaller layouts

export type Constraint = {
  ideal: number // Preferred size in pixels
  min: number   // Minimum size
  max: number   // Maximum size (can be Infinity for "fill available")
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
        weight: number // Flex weight (like CSS flex-grow)
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

// Key insight: compute MINIMUM required size, then GROW to fill viewport
export function solveLayout<T>(
  tree: LayoutNode<T>,
  constraints: Map<T | string, Constraint>,
  viewport: Rect
): SolvedNode<T> {
  // Step 1: Compute minimum required size
  const minSize = computeMinimumSize(tree, constraints)
  
  // Step 2: Determine actual size (grow to fill viewport if possible)
  const actualWidth = Math.max(minSize.width, viewport.width)
  const actualHeight = Math.max(minSize.height, viewport.height)
  
  const rootRect: Rect = {
    x: viewport.x,
    y: viewport.y,
    width: actualWidth,
    height: actualHeight
  }

  // Step 3: Solve layout with flexible filling
  return solveNode(tree, rootRect, constraints)
}

function computeMinimumSize<T>(
  node: LayoutNode<T>,
  constraints: Map<T | string, Constraint>
): { width: number; height: number } {
  if (node.type === "leaf") {
    const c = constraints.get(node.id) ?? { ideal: 200, min: 100, max: Infinity }
    return { width: c.min, height: c.min }
  }

  const isRow = node.axis === "row"
  let totalWidth = 0
  let totalHeight = 0

  for (const { node: child } of node.children) {
    const childSize = computeMinimumSize(child, constraints)
    
    if (isRow) {
      totalWidth += childSize.width
      totalHeight = Math.max(totalHeight, childSize.height)
    } else {
      totalWidth = Math.max(totalWidth, childSize.width)
      totalHeight += childSize.height
    }
  }

  return { width: totalWidth, height: totalHeight }
}

function solveNode<T>(
  node: LayoutNode<T>,
  rect: Rect,
  constraints: Map<T | string, Constraint>
): SolvedNode<T> {
  if (node.type === "leaf") {
    // Leaf fills its allocated rect
    return {
      type: "leaf",
      id: node.id,
      rect
    }
  }

  const isRow = node.axis === "row"
  const availableSize = isRow ? rect.width : rect.height
  
  // Distribute available space according to weights
  const totalWeight = node.children.reduce((sum, c) => sum + c.weight, 0)
  
  let offset = 0
  const solvedChildren: SolvedNode<T>[] = []

  for (const { node: child, weight } of node.children) {
    const size = (weight / totalWeight) * availableSize
    
    const childRect: Rect = isRow
      ? { 
          x: rect.x + offset, 
          y: rect.y, 
          width: size, 
          height: rect.height 
        }
      : { 
          x: rect.x, 
          y: rect.y + offset, 
          width: rect.width, 
          height: size 
        }

    solvedChildren.push(solveNode(child, childRect, constraints))
    offset += size
  }

  return {
    type: "split",
    axis: node.axis,
    splitId: node.splitId,
    rect,
    children: solvedChildren
  }
}

// Helper to get actual bounds (for clipping if needed)
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
    height: maxY - minY
  }
}

