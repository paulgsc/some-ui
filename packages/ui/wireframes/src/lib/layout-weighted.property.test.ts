import type { YouTubeRegion } from "@some-ui/types"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  layoutIntentSequenceArbitrary,
  regionArbitrary,
} from "./__tests__/layout-intent-arbitrary"
import { applyIntent, extractLeafIds } from "./layout-intent"
import type { Rect, SolvedNode } from "./layout-types"
import type { LayoutNode } from "./layout-weighted"
import {
  solveLayout,
  solveLayoutWithBindings,
  solveLayoutWithFocus,
} from "./layout-weighted"

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

  // Seed 1554378956 is the CI run that first caught this; it is pinned so the
  // regression has a deterministic reproduction rather than one that depends
  // on fast-check drawing the same shape again.
  it("focus-aware solving tiles the viewport for the seed that first caught the absent-focus collapse", () => {
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

          const focused = solveLayoutWithFocus(
            tree,
            viewport,
            focusId,
            intensity
          )
          expect(isValidTiling(focused, viewport)).toBe(true)
        }
      ),
      { seed: 1554378956, path: "76:5:5:4:4:5:5:4:0:3:3:3", endOnFailure: true }
    )
  })

  // The shrunk counterexample from that run, as a plain example: a two-leaf
  // tree focused at full intensity on a region it does not contain. Every
  // node is off the focus path, so before the guard in `focusConstraints`
  // both children solved to zero width while the root still claimed all
  // 100x100 - a gap the size of the viewport.
  it("focusing a region absent from the tree is a no-op, not a collapse", () => {
    const viewport: Rect = { x: 0, y: 0, width: 100, height: 100 }
    const tree: LayoutNode<YouTubeRegion> = {
      type: "split",
      axis: "row",
      splitId: "split-0",
      children: [
        { node: { type: "leaf", id: "video" }, weight: 1 },
        { node: { type: "leaf", id: "footerRight" }, weight: 1 },
      ],
    }

    const base = solveLayout(tree, viewport)
    const focused = solveLayoutWithFocus(tree, viewport, "sidebarTop", 1)

    expect(isValidTiling(focused, viewport)).toBe(true)
    // Absent target means no emphasis to apply, so geometry is untouched.
    expect(focused).toEqual(base)
  })

  // The complement: a target that *is* present must still be emphasised at
  // full intensity, so the guard above cannot be satisfied by disabling focus
  // altogether.
  it("focusing a region present in the tree still gives it the full extent at intensity 1", () => {
    const viewport: Rect = { x: 0, y: 0, width: 100, height: 100 }
    const tree: LayoutNode<YouTubeRegion> = {
      type: "split",
      axis: "row",
      splitId: "split-0",
      children: [
        { node: { type: "leaf", id: "video" }, weight: 1 },
        { node: { type: "leaf", id: "footerRight" }, weight: 1 },
      ],
    }

    const focused = solveLayoutWithFocus(tree, viewport, "video", 1)

    expect(isValidTiling(focused, viewport)).toBe(true)
    const leaves = collectSolvedLeaves(focused)
    expect(leaves.find((l) => l.id === "video")!.rect.width).toBeCloseTo(100, 5)
    expect(leaves.find((l) => l.id === "footerRight")!.rect.width).toBeCloseTo(
      0,
      5
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
          // A lone root leaf can't collapse - there's no sibling to
          // redistribute its space into, so it always keeps the full
          // viewport regardless of binding state.
          if (leafIds.length < 2) return

          const boundLeafIds = new Set(
            leafIds.filter((_, i) => boundness[i % boundness.length])
          )

          const solved = solveLayoutWithBindings(tree, boundLeafIds, viewport)

          // With at least one bound leaf, the tree (root included) always
          // has somewhere to redistribute collapsed space into, so it
          // still forms a valid tiling top to bottom. With zero bound
          // leaves, the root itself has nothing above it to zero its own
          // claim on `viewport` into - "bound leaves tile V" holds only
          // vacuously then, so the whole-tree tiling check doesn't apply;
          // the per-leaf zero-area check below still does.
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
