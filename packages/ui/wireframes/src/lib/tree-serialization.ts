import type { LayoutNode } from "./layout-weighted"

export function serializeLayout<T>(tree: LayoutNode<T> | null): string {
  if (tree === null) {
    return JSON.stringify({ empty: true }, null, 2)
  }
  return JSON.stringify(tree, null, 2)
}

// Parse JSON back to a layout tree
export function deserializeLayout<T>(json: string): LayoutNode<T> | null {
  const parsed = JSON.parse(json)
  if (parsed.empty === true) {
    return null
  }
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return parsed as LayoutNode<T>
}

// Get a deterministic hash of the tree structure (for deduplication)
export function getTreeHash<T>(tree: LayoutNode<T> | null): string {
  if (tree === null) {
    return "empty"
  }

  const normalized = JSON.stringify(tree)
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}
