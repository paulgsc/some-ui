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

function insertRelativeTo<R>(
  tree: LayoutNode<R>,
  region: R,
  relativeTo: R,
  edge: "left" | "right" | "top" | "bottom"
): LayoutNode<R> {
  const targetAxis = edge === "left" || edge === "right" ? "row" : "col"
  const insertBefore = edge === "left" || edge === "top"

  const targetLeaf = findLeaf(tree, relativeTo)
  if (!targetLeaf) return tree

  const parentInfo = findParentSplitInternal(tree, relativeTo)

  if (!parentInfo) {
    return {
      type: "split",
      axis: targetAxis,
      splitId: generateSplitId(),
      children: insertBefore
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

  const { parent, childIndex } = parentInfo

  if (parent.axis === targetAxis) {
    const newLeaf: LayoutNode<R> = { type: "leaf", id: region }
    const insertIndex = insertBefore ? childIndex : childIndex + 1
    parent.children.splice(insertIndex, 0, { node: newLeaf, weight: 1 })
    return tree
  }

  const targetChild = parent.children[childIndex]
  const newSplit: LayoutNode<R> = {
    type: "split",
    axis: targetAxis,
    splitId: generateSplitId(),
    children: insertBefore
      ? [
          { node: { type: "leaf", id: region }, weight: 1 },
          { node: cloneTree(targetChild.node), weight: 1 },
        ]
      : [
          { node: cloneTree(targetChild.node), weight: 1 },
          { node: { type: "leaf", id: region }, weight: 1 },
        ],
  }
  parent.children[childIndex] = { node: newSplit, weight: targetChild.weight }

  return tree
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

  if (siblingIndex < 0 || siblingIndex >= split.children.length) return tree

  const currentChild = split.children[leafIndex]
  const siblingChild = split.children[siblingIndex]

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

  split.children[leafIndex].weight = newCurrentWeight
  split.children[siblingIndex].weight = newSiblingWeight

  return cloned
}

function resizeLeafAtBoundary<R>(
  tree: LayoutNode<R>,
  region: R,
  edge: string,
  deltaPx: number
): LayoutNode<R> {
  // Find the leaf and adjust its weight
  function adjustWeight(node: LayoutNode<R>): LayoutNode<R> {
    if (node.type === "leaf" && node.id === region) {
      return node // Leaves don't have weight
    }

    if (node.type === "split") {
      const children = node.children.map((child) => {
        if (containsRegion(child.node, region)) {
          return {
            ...child,
            weight: Math.max(50, child.weight + deltaPx),
          }
        }
        return child
      })

      return { ...node, children }
    }

    return node
  }

  return adjustWeight(tree)
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
      for (let i = 0; i < node.children.length; i++) {
        if (buildPath(node.children[i].node, i)) {
          pathToTarget.push({ node, parentChildIndex: childIndexInParent })
          return true
        }
      }
    }

    return false
  }

  buildPath(tree, -1)

  for (let i = 0; i < pathToTarget.length; i++) {
    const { node } = pathToTarget[i]

    if (node.type === "split" && node.axis === axis) {
      let targetChildIndex = -1

      for (let j = 0; j < node.children.length; j++) {
        if (containsRegion(node.children[j].node, targetId)) {
          targetChildIndex = j
          break
        }
      }

      if (targetChildIndex !== -1) {
        return {
          split: node as LayoutNode<R> & { type: "split" },
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

// Find a leaf by ID
function findLeaf<R>(tree: LayoutNode<R>, leafId: R): LayoutNode<R> | null {
  if (tree.type === "leaf") {
    return tree.id === leafId ? tree : null
  }

  for (const child of tree.children) {
    const found = findLeaf(child.node, leafId)
    if (found) return found
  }

  return null
}

// Find parent split of a leaf
function findParentSplitInternal<R>(
  tree: LayoutNode<R>,
  targetId: R
): { parent: LayoutNode<R> & { type: "split" }; childIndex: number } | null {
  if (tree.type === "leaf") return null

  for (let i = 0; i < tree.children.length; i++) {
    const { node: child } = tree.children[i]
    if (child.type === "leaf" && child.id === targetId) {
      return {
        parent: tree as LayoutNode<R> & { type: "split" },
        childIndex: i,
      }
    }

    if (child.type === "split") {
      const found = findParentSplitInternal(child, targetId)
      if (found) return found
    }
  }

  return null
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
    return normalizedChildren[0].node
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

function resizeAgainstRoot<R>(
  tree: LayoutNode<R>,
  region: R,
  edge: "left" | "right" | "top" | "bottom",
  deltaPx: number,
  containerSizePx: number,
  resizeAxis: "row" | "col"
): LayoutNode<R> | null {
  // When resizing at container edge, we can only expand in one direction
  // This treats the container as a virtual sibling with infinite capacity

  // For now, we wrap the tree in a new split if needed
  // This models the container as a participant

  const isGrowingOut = edge === "left" || edge === "top"

  if (!isGrowingOut) {
    // Growing right/bottom - already at max, no-op
    return tree
  }

  // Growing left/top means we want to push the entire layout
  // This is a special case that could insert a spacer
  // For simplicity, we'll just allow the weight adjustment on the root

  if (tree.type === "split" && tree.axis === resizeAxis) {
    // Find the child containing the region and adjust its weight
    const childIndex = findChildContainingRegion(tree, region)
    if (childIndex !== -1 && childIndex === 0) {
      // Leftmost/topmost child - can expand into container
      const totalWeight = tree.children.reduce(
        (sum, child) => sum + child.weight,
        0
      )
      const deltaWeight = (deltaPx / containerSizePx) * totalWeight

      tree.children[0].weight = Math.max(
        0.1,
        tree.children[0].weight + deltaWeight
      )
    }
  }

  return tree
}

function findChildContainingRegion<R>(
  split: LayoutNode<R> & { type: "split" },
  region: R
): number {
  for (let i = 0; i < split.children.length; i++) {
    if (containsRegion(split.children[i].node, region)) {
      return i
    }
  }
  return -1
}
