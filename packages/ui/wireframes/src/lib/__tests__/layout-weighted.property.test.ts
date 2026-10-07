import type { YouTubeRegion } from "@some-ui/types"
import { applyIntent, extractLeafIds } from "@wireframes/lib/layout-intent"
import type { Rect, SolvedNode } from "@wireframes/lib/layout-types"
import type { LayoutNode } from "@wireframes/lib/layout-weighted"
import {
  solveLayout,
  solveLayoutWithBindings,
} from "@wireframes/lib/layout-weighted"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { layoutIntentSequenceArbitrary } from "./layout-intent-arbitrary"

const EPSILON = 1e-6

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON
}

/**
 * Whether a solved tree tiles `expectedRect`: every split's children are
 * contiguous along its axis (no gaps or overlaps), match the parent's
 * cross-axis extent, and together cover it exactly.
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
  // A zero-area container can't observably contain a gap or overlap - its
  // children's own internal offsets along the cross axis (inherited, not
  // weight-derived) are unobservable at zero width/height either way.
  if (node.rect.width === 0 || node.rect.height === 0) return true

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
})

function collectSolvedLeaves<T>(
  node: SolvedNode<T>
): Array<{ id: T; rect: Rect }> {
  const leaves: Array<{ id: T; rect: Rect }> = []
  const stack: Array<SolvedNode<T>> = [node]
  while (stack.length) {
    const current = stack.pop()!
    if (current.type === "leaf") {
      leaves.push({ id: current.id, rect: current.rect })
    } else {
      stack.push(...current.children)
    }
  }
  return leaves
}

function area(rect: Rect): number {
  return rect.width * rect.height
}

describe("solveLayoutWithBindings - zero-collapse invariants (story 5)", () => {
  it("unbound leaves solve to zero area, bound leaves get positive area, and the tree still tiles the viewport", () => {
    fc.assert(
      fc.property(
        layoutIntentSequenceArbitrary,
        viewportArbitrary,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 7 }),
        (intents, viewport, boundness) => {
          let tree: LayoutNode<YouTubeRegion> | null = null
          for (const intent of intents) tree = applyIntent(tree, intent)
          if (tree === null) return

          const leafIds = Array.from(extractLeafIds(tree))
          // A lone root leaf has no sibling to give its space to.
          if (leafIds.length < 2) return

          const boundLeafIds = new Set(
            leafIds.filter((_, i) => boundness[i % boundness.length])
          )

          const solved = solveLayoutWithBindings(tree, boundLeafIds, viewport)

          // With a bound leaf the tree still tiles the viewport. With none,
          // "bound leaves tile V" is vacuous (the root keeps its claim), so
          // only the per-leaf zero-area check below applies.
          if (boundLeafIds.size > 0) {
            expect(isValidTiling(solved, viewport)).toBe(true)
          }

          for (const leaf of collectSolvedLeaves(solved)) {
            if (boundLeafIds.has(leaf.id)) {
              expect(area(leaf.rect)).toBeGreaterThan(0)
            } else {
              expect(area(leaf.rect)).toBe(0)
            }
          }
        }
      )
    )
  })

  it("a split whose entire subtree is unbound cascades to zero, instead of leaving a claimed-but-empty gap", () => {
    const viewport: Rect = { x: 0, y: 0, width: 900, height: 300 }
    const tree: LayoutNode<YouTubeRegion> = {
      type: "split",
      axis: "row",
      splitId: "root",
      children: [
        { node: { type: "leaf", id: "mainContent" }, weight: 1 },
        {
          node: {
            type: "split",
            axis: "col",
            splitId: "dead-branch",
            children: [
              { node: { type: "leaf", id: "sidebarTop" }, weight: 1 },
              { node: { type: "leaf", id: "sidebarBottom" }, weight: 1 },
            ],
          },
          weight: 1,
        },
      ],
    }

    const solved = solveLayoutWithBindings(
      tree,
      new Set(["mainContent"]),
      viewport
    )

    expect(isValidTiling(solved, viewport)).toBe(true)
    for (const leaf of collectSolvedLeaves(solved)) {
      expect(area(leaf.rect)).toBe(leaf.id === "mainContent" ? 900 * 300 : 0)
    }
  })

  it("re-binding a previously-unbound leaf restores its prior proportional share, not an equal-weight default", () => {
    const viewport: Rect = { x: 0, y: 0, width: 600, height: 300 }
    const tree: LayoutNode<YouTubeRegion> = {
      type: "split",
      axis: "row",
      splitId: "root",
      children: [
        { node: { type: "leaf", id: "video" }, weight: 1 },
        { node: { type: "leaf", id: "title" }, weight: 2 },
        { node: { type: "leaf", id: "mainContent" }, weight: 3 },
      ],
    }

    const allBound = new Set<YouTubeRegion>(["video", "title", "mainContent"])
    const beforeUnbind = solveLayoutWithBindings(tree, allBound, viewport)

    const titleUnbound = new Set<YouTubeRegion>(["video", "mainContent"])
    const collapsed = solveLayoutWithBindings(tree, titleUnbound, viewport)
    const collapsedTitle = collectSolvedLeaves(collapsed).find(
      (l) => l.id === "title"
    )!
    expect(area(collapsedTitle.rect)).toBe(0)

    // video:mainContent redistribute proportionally to their own weights
    // (1:3), not equally, while title is collapsed out of the split.
    const collapsedVideo = collectSolvedLeaves(collapsed).find(
      (l) => l.id === "video"
    )!
    expect(collapsedVideo.rect.width).toBeCloseTo(600 * (1 / 4), 5)

    const rebound = solveLayoutWithBindings(tree, allBound, viewport)
    const beforeSolvedTitle = collectSolvedLeaves(beforeUnbind).find(
      (l) => l.id === "title"
    )!
    const reboundTitle = collectSolvedLeaves(rebound).find(
      (l) => l.id === "title"
    )!
    expect(reboundTitle.rect).toEqual(beforeSolvedTitle.rect)
  })
})
