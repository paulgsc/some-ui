import type { Rect, SolvedNode } from "@wireframes/lib/layout-types"

/**
 * Recursively extract all rects from a solved layout tree
 * Includes both leaf IDs and split IDs
 */
export function extractRegionRects<T extends string>(
  node: SolvedNode<T>,
  out: Map<string, Rect> = new Map()
): Map<string, Rect> {
  if (node.type === "leaf") {
    out.set(node.id, node.rect)
  } else {
    // Store split rect
    out.set(node.splitId, node.rect)
    // Recurse into children
    for (const child of node.children) {
      extractRegionRects(child, out)
    }
  }
  return out
}
