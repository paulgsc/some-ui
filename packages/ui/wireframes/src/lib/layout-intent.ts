import type { LayoutNode } from "./layout-weighted"

// User intent types - spatial actions, not tree operations
export type LayoutIntent<R> =
  | {
      kind: "place"
      region: R
      relativeTo?: R
      edge: "left" | "right" | "top" | "bottom"
    }
  | {
      kind: "move"
      region: R
      relativeTo: R
      edge: "left" | "right" | "top" | "bottom"
    }
  | {
      kind: "remove"
      region: R
    }
  | {
      kind: "reorder"
      region: R
      relativeTo: R
      edge: "before" | "after"
    }
  | {
      kind: "resize"
      region: R
      edge: "left" | "right" | "top" | "bottom"
      deltaPx: number
      containerSizePx: number
    }

// Intent → Tree compiler
export function applyIntent<R>(
  tree: LayoutNode<R> | null,
  intent: LayoutIntent<R>
): LayoutNode<R> | null {
  switch (intent.kind) {
    case "place":
      return placeRegion(tree, intent.region, intent.relativeTo, intent.edge)

    case "move":
      // Remove first, then place
      const withoutRegion = removeRegion(tree, intent.region)
      return placeRegion(
        withoutRegion,
        intent.region,
        intent.relativeTo,
        intent.edge
      )

    case "remove":
      return removeRegion(tree, intent.region)

    case "reorder":
      return reorderRegion(tree, intent.region, intent.relativeTo, intent.edge)

    case "resize":
      return resizeRegion(
        tree,
        intent.region,
        intent.edge,
        intent.deltaPx,
        intent.containerSizePx
      )

    default:
      return tree
  }
}

// Helper to generate unique split IDs
let splitCounter = 0
function generateSplitId(): string {
  return `split-${splitCounter++}`
}

// Place a region relative to another region or in empty space
function placeRegion<R>(
  tree: LayoutNode<R> | null,
  region: R,
  relativeTo: R | "root" | undefined,
  edge: "left" | "right" | "top" | "bottom"
): LayoutNode<R> {
  if (tree === null) {
    return { type: "leaf", id: region }
  }

  if (relativeTo === "root") {
    return placeRelativeToRoot(tree, region, edge)
  }

  if (tree.type === "leaf" && !relativeTo) {
    const newAxis = edge === "left" || edge === "right" ? "row" : "col"
    const before = edge === "left" || edge === "top"

    // KEY: Use weight = 1 for equal proportional distribution
    return {
      type: "split",
      axis: newAxis,
      splitId: generateSplitId(),
      children: before
        ? [
            { node: { type: "leaf", id: region }, weight: 1 },
            { node: tree, weight: 1 },
          ]
        : [
            { node: tree, weight: 1 },
            { node: { type: "leaf", id: region }, weight: 1 },
          ],
    }
  }

  if (relativeTo !== undefined) {
    const cloned = cloneTree(tree)
    const inserted = insertRelativeTo(cloned, region, relativeTo, edge)
    return normalizeTree(inserted)
  }

  return tree
}

function placeRelativeToRoot<R>(
  tree: LayoutNode<R>,
  region: R,
  edge: "left" | "right" | "top" | "bottom"
): LayoutNode<R> {
  const newAxis = edge === "left" || edge === "right" ? "row" : "col"
  const before = edge === "left" || edge === "top"

  return {
    type: "split",
    axis: newAxis,
    splitId: generateSplitId(),
    children: before
      ? [
          { node: { type: "leaf", id: region }, weight: 1 },
          { node: tree, weight: 1 },
        ]
      : [
          { node: tree, weight: 1 },
          { node: { type: "leaf", id: region }, weight: 1 },
        ],
  }
}

function insertAt<T>(arr: ReadonlyArray<T>, index: number, value: T): Array<T> {
  return [...arr.slice(0, index), value, ...arr.slice(index)]
}

function insertRelativeTo<R>(
  tree: LayoutNode<R>,
  region: R,
  relativeTo: R,
  edge: "left" | "right" | "top" | "bottom"
): LayoutNode<R> {
  const targetAxis = edge === "left" || edge === "right" ? "row" : "col"
  const insertBefore = edge === "left" || edge === "top"

  function walk(node: LayoutNode<R>): LayoutNode<R> {
    if (node.type === "leaf") {
      if (node.id !== relativeTo) return node

      // Base case: target leaf found, wrap it
      return {
        type: "split",
        axis: targetAxis,
        splitId: generateSplitId(),
        children: insertBefore
          ? [
              { node: { type: "leaf", id: region }, weight: 1 },
              { node, weight: 1 },
            ]
          : [
              { node, weight: 1 },
              { node: { type: "leaf", id: region }, weight: 1 },
            ],
      }
    }

    // split node
    let didRewrite = false

    const newChildren = node.children.map((child) => {
      const rewritten = walk(child.node)
      if (rewritten !== child.node) {
        didRewrite = true
        return { ...child, node: rewritten }
      }
      return child
    })

    if (!didRewrite) {
      return node
    }

    // If the rewritten child is now a split we may need to merge axes
    const childIndex = newChildren.findIndex(
      (c) => c.node.type === "split" && c.node.axis === targetAxis
    )

    if (childIndex === -1) {
      return { ...node, children: newChildren }
    }

    const targetChild = newChildren[childIndex]
    if (!targetChild || targetChild.node.type !== "split") {
      return { ...node, children: newChildren }
    }

    // Axis matches → flatten
    if (node.axis === targetAxis) {
      return {
        ...node,
        children: insertAt(
          [
            ...newChildren.slice(0, childIndex),
            ...targetChild.node.children,
            ...newChildren.slice(childIndex + 1),
          ],
          insertBefore
            ? childIndex
            : childIndex + targetChild.node.children.length,
          { node: { type: "leaf", id: region }, weight: 1 }
        ),
      }
    }

    return { ...node, children: newChildren }
  }

  return walk(tree)
}

// Remove a region from the tree
function removeRegion<R>(
  tree: LayoutNode<R> | null,
  region: R
): LayoutNode<R> | null {
  if (tree === null) return null

  // If tree is just this leaf, return null (empty canvas)
  if (tree.type === "leaf" && tree.id === region) {
    return null
  }

  const cloned = cloneTree(tree)
  const removed = removeLeafFromTree(cloned, region)

  if (removed === null) return null

  return normalizeTree(removed)
}

// Reorder a region relative to another
function reorderRegion<R>(
  tree: LayoutNode<R> | null,
  region: R,
  relativeTo: R,
  edge: "before" | "after"
): LayoutNode<R> | null {
  if (tree === null) return null

  // Remove the region
  const withoutRegion = removeRegion(tree, region)
  if (withoutRegion === null) return tree

  // Re-insert it relative to the target
  const edgeMap = edge === "before" ? "left" : "right"
  return placeRegion(withoutRegion, region, relativeTo, edgeMap)
}

// Deep clone a tree
function cloneTree<R>(node: LayoutNode<R>): LayoutNode<R> {
  if (node.type === "leaf") {
    return { type: "leaf", id: node.id }
  }
  return {
    type: "split",
    axis: node.axis,
    splitId: node.splitId,
    children: node.children.map(({ node: child, weight }) => ({
      node: cloneTree(child),
      weight,
    })),
  }
}

function resizeRegion<R>(
  tree: LayoutNode<R> | null,
  region: R,
  edge: "left" | "right" | "top" | "bottom",
  deltaPx: number,
  containerSizePx: number
): LayoutNode<R> | null {
  if (!tree || Math.abs(deltaPx) < 0.5) return tree

  const cloned = cloneTree(tree)
  const resizeAxis = edge === "left" || edge === "right" ? "row" : "col"
  const ancestorInfo = findAncestorSplitByAxis(cloned, region, resizeAxis)

  if (!ancestorInfo) return tree

  const { split, leafIndex } = ancestorInfo
  const isTrailingEdge = edge === "right" || edge === "bottom"
  const siblingIndex = isTrailingEdge ? leafIndex + 1 : leafIndex - 1

  const currentChild = split.children[leafIndex]
  const siblingChild = split.children[siblingIndex]

  if (!currentChild || !siblingChild) return tree

  // Calculate weight per pixel in THIS SPECIFIC SPLIT
  const totalWeightInSplit = split.children.reduce((s, c) => s + c.weight, 0)
  const weightPerPx = totalWeightInSplit / containerSizePx

  // Convert pixel delta to weight delta
  const weightDelta = deltaPx * weightPerPx

  // Direction:
  // - Trailing edge (right/bottom): positive delta = grow
  // - Leading edge (left/top): positive delta = shrink (move edge right = smaller panel)
  const growthDelta = isTrailingEdge ? weightDelta : -weightDelta

  const MIN_WEIGHT = 0.05

  let newCurrentWeight = Math.max(MIN_WEIGHT, currentChild.weight + growthDelta)
  let newSiblingWeight = Math.max(MIN_WEIGHT, siblingChild.weight - growthDelta)

  // Ensure we don't violate conservation of weight
  const totalBefore = currentChild.weight + siblingChild.weight
  const totalAfter = newCurrentWeight + newSiblingWeight

  if (Math.abs(totalAfter - totalBefore) > 0.001) {
    // Renormalize if needed
    const scale = totalBefore / totalAfter
    newCurrentWeight *= scale
    newSiblingWeight *= scale
  }

  currentChild.weight = newCurrentWeight
  siblingChild.weight = newSiblingWeight

  return cloned
}

function findAncestorSplitByAxis<R>(
  tree: LayoutNode<R>,
  targetId: R,
  axis: "row" | "col"
): { split: LayoutNode<R> & { type: "split" }; leafIndex: number } | null {
  const pathToTarget: Array<{
    node: LayoutNode<R>
    parentChildIndex: number
  }> = []

  function buildPath(node: LayoutNode<R>, childIndexInParent: number): boolean {
    if (node.type === "leaf" && node.id === targetId) {
      return true
    }

    if (node.type === "split") {
      for (const [i, child] of node.children.entries()) {
        if (buildPath(child.node, i)) {
          pathToTarget.push({ node, parentChildIndex: childIndexInParent })
          return true
        }
      }
    }

    return false
  }

  buildPath(tree, -1)

  for (const { node } of pathToTarget) {
    if (node.type === "split" && node.axis === axis) {
      const targetChildIndex = node.children.findIndex((child) =>
        containsRegion(child.node, targetId)
      )

      if (targetChildIndex !== -1) {
        return {
          split: node,
          leafIndex: targetChildIndex,
        }
      }
    }
  }

  return null
}

function containsRegion<R>(node: LayoutNode<R>, region: R): boolean {
  if (node.type === "leaf") {
    return node.id === region
  }
  return node.children.some((child) => containsRegion(child.node, region))
}

// Remove a leaf from the tree
function removeLeafFromTree<R>(
  tree: LayoutNode<R>,
  leafId: R
): LayoutNode<R> | null {
  if (tree.type === "leaf") {
    return tree.id === leafId ? null : tree
  }

  const newChildren = tree.children
    .map(({ node, weight }) => {
      const result = removeLeafFromTree(node, leafId)
      return result ? { node: result, weight } : null
    })
    .filter(
      (child): child is { node: LayoutNode<R>; weight: number } =>
        child !== null
    )

  if (newChildren.length === 0) return null

  return {
    ...tree,
    children: newChildren,
  }
}

// Normalize tree by collapsing single-child splits
function normalizeTree<R>(tree: LayoutNode<R>): LayoutNode<R> {
  if (tree.type === "leaf") {
    return tree
  }

  // Recursively normalize children
  const normalizedChildren = tree.children
    .map(({ node, weight }) => ({
      node: normalizeTree(node),
      weight,
    }))
    .filter(({ node }) => {
      if (node.type === "split" && node.children.length === 0) {
        return false
      }
      return true
    })

  if (normalizedChildren.length === 0) {
    return tree
  }

  // Collapse single-child splits
  if (normalizedChildren.length === 1) {
    return normalizedChildren[0]!.node
  }

  return {
    ...tree,
    children: normalizedChildren,
  }
}

export function extractLeafIds<R>(tree: LayoutNode<R> | null): Set<R> {
  const ids = new Set<R>()
  if (tree === null) return ids

  const stack: Array<{ node: LayoutNode<R>; weight: number }> = [
    { node: tree, weight: 1 },
  ]

  while (stack.length) {
    const { node } = stack.pop()!
    if (node.type === "leaf") {
      ids.add(node.id)
    } else {
      stack.push(...node.children)
    }
  }

  return ids
}

export function getAllSplitIds<R>(tree: LayoutNode<R> | null): Array<string> {
  const splitIds: Array<string> = []
  if (tree === null) return splitIds

  const stack: Array<{ node: LayoutNode<R>; weight: number }> = [
    { node: tree, weight: 1 },
  ]

  while (stack.length) {
    const { node } = stack.pop()!
    if (node.type === "split") {
      splitIds.push(node.splitId)
      stack.push(...node.children)
    }
  }

  return splitIds
}
