import fc from "fast-check"
import type { YouTubeRegion } from "some-types-utils"
import { describe, expect, it } from "vitest"

import {
  layoutIntentSequenceArbitrary,
  regionArbitrary,
} from "./__tests__/layout-intent-arbitrary"
import { applyIntent } from "./layout-intent"
import type { Rect, SolvedNode } from "./layout-types"
import type { LayoutNode } from "./layout-weighted"
import { solveLayout, solveLayoutWithFocus } from "./layout-weighted"

const EPSILON = 1e-6

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON
}

/**
 * Verifies a solved tree actually tiles `expectedRect`: every split's children
 * are contiguous along its axis (no gaps, no overlaps), match the parent's
 * cross-axis extent, and together cover the parent exactly. A test that only
 * checks one leaf's rect ("is the bolt tight") would miss a solver bug that
 * leaves a sliver of the viewport unrendered or double-renders a region.
 */
function isValidTiling<T>(node: SolvedNode<T>, expectedRect: Rect): boolean {
  if (
    !approxEqual(node.rect.x, expectedRect.x) ||
    !approxEqual(node.rect.y, expectedRect.y) ||
    !approxEqual(node.rect.width, expectedRect.width) ||
    !approxEqual(node.rect.height, expectedRect.height)
  ) {
    return false
  }
  if (node.rect.width < 0 || node.rect.height < 0) return false
  if (node.type === "leaf") return true

  const isRow = node.axis === "row"
  let offset = isRow ? node.rect.x : node.rect.y

  for (const child of node.children) {
    if (isRow) {
      if (
        !approxEqual(child.rect.y, node.rect.y) ||
        !approxEqual(child.rect.height, node.rect.height) ||
        !approxEqual(child.rect.x, offset)
      ) {
        return false
      }
      offset += child.rect.width
    } else {
      if (
        !approxEqual(child.rect.x, node.rect.x) ||
        !approxEqual(child.rect.width, node.rect.width) ||
        !approxEqual(child.rect.y, offset)
      ) {
        return false
      }
      offset += child.rect.height
    }
    if (!isValidTiling(child, child.rect)) return false
  }

  const totalExtent = isRow
    ? node.rect.x + node.rect.width
    : node.rect.y + node.rect.height

  return approxEqual(offset, totalExtent)
}

function collectLeafIds<T>(node: SolvedNode<T>): Set<T> {
  const ids = new Set<T>()
  const stack: Array<SolvedNode<T>> = [node]
  while (stack.length) {
    const current = stack.pop()!
    if (current.type === "leaf") {
      ids.add(current.id)
    } else {
      stack.push(...current.children)
    }
  }
  return ids
}

const viewportArbitrary = fc.record({
  x: fc.constant(0),
  y: fc.constant(0),
  width: fc.integer({ min: 100, max: 2000 }),
  height: fc.integer({ min: 100, max: 2000 }),
})

describe("solveLayout - geometry invariants", () => {
  it("tiles the viewport exactly for any tree reachable via applyIntent - no gaps, overlaps, or overflow", () => {
    fc.assert(
      fc.property(
        layoutIntentSequenceArbitrary,
        viewportArbitrary,
        (intents, viewport) => {
          let tree: LayoutNode<YouTubeRegion> | null = null
          for (const intent of intents) tree = applyIntent(tree, intent)
          if (tree === null) return

          const solved = solveLayout(tree, viewport)
          expect(isValidTiling(solved, viewport)).toBe(true)
        }
      )
    )
  })

  it("focus-aware solving still tiles the viewport and never adds or drops a region", () => {
    fc.assert(
      fc.property(
        layoutIntentSequenceArbitrary,
        viewportArbitrary,
        regionArbitrary,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (intents, viewport, focusId, intensity) => {
          let tree: LayoutNode<YouTubeRegion> | null = null
          for (const intent of intents) tree = applyIntent(tree, intent)
          if (tree === null) return

          const base = solveLayout(tree, viewport)
          const focused = solveLayoutWithFocus(
            tree,
            viewport,
            focusId,
            intensity
          )

          expect(isValidTiling(focused, viewport)).toBe(true)
          expect(collectLeafIds(focused)).toEqual(collectLeafIds(base))
        }
      )
    )
  })
})
