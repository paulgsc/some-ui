import type { LayoutNode } from "../layout-weighted"

/**
 * Counts occurrences of every leaf id in the tree. Unlike `extractLeafIds`
 * (a Set), this surfaces duplicate leaves instead of silently collapsing them -
 * duplication is exactly the class of bug a Set-based assertion would hide.
 */
export function countLeafOccurrences<R>(
  tree: LayoutNode<R> | null
): Map<R, number> {
  const counts = new Map<R, number>()
  if (tree === null) return counts

  const stack: Array<LayoutNode<R>> = [tree]
  while (stack.length) {
    const node = stack.pop()!
    if (node.type === "leaf") {
      counts.set(node.id, (counts.get(node.id) ?? 0) + 1)
    } else {
      for (const { node: child } of node.children) stack.push(child)
    }
  }
  return counts
}

/** Every split must have at least 2 children; a 0/1-child split is a broken tree. */
export function isStructurallyValid<R>(tree: LayoutNode<R> | null): boolean {
  if (tree === null) return true
  if (tree.type === "leaf") return true
  if (tree.children.length < 2) return false
  return tree.children.every(({ node }) => isStructurallyValid(node))
}

/** A zero/negative/NaN weight silently corrupts every downstream rect. */
export function allWeightsPositiveFinite<R>(
  tree: LayoutNode<R> | null
): boolean {
  if (tree === null) return true
  if (tree.type === "leaf") return true
  return tree.children.every(
    ({ node, weight }) =>
      Number.isFinite(weight) && weight > 0 && allWeightsPositiveFinite(node)
  )
}
