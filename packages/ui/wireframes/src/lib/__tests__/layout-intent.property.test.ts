import type { YouTubeRegion } from "@some-ui/types"
import { applyIntent } from "@wireframes/lib/layout-intent"
import type { LayoutNode } from "@wireframes/lib/layout-weighted"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  edgeArbitrary,
  layoutIntentSequenceArbitrary,
  regionArbitrary,
} from "./layout-intent-arbitrary"
import {
  allWeightsPositiveFinite,
  countLeafOccurrences,
  isStructurallyValid,
} from "./tree-invariants"

/**
 * `applyIntent` is the editor's FSM: state is a layout tree, events are user
 * edits. These properties must hold under any sequence of edits (#344).
 */
describe("applyIntent - tree invariants under random edit sequences", () => {
  it("never produces a structurally broken tree or a non-positive weight", () => {
    fc.assert(
      fc.property(layoutIntentSequenceArbitrary, (intents) => {
        let tree: LayoutNode<YouTubeRegion> | null = null

        for (const intent of intents) {
          tree = applyIntent(tree, intent)

          expect(isStructurallyValid(tree)).toBe(true)
          expect(allWeightsPositiveFinite(tree)).toBe(true)
        }
      })
    )
  })

  it("remove drives the removed region's count to zero and leaves every other region's count untouched", () => {
    fc.assert(
      fc.property(
        layoutIntentSequenceArbitrary,
        regionArbitrary,
        (intents, target) => {
          let tree: LayoutNode<YouTubeRegion> | null = null
          for (const intent of intents) tree = applyIntent(tree, intent)

          const before = countLeafOccurrences(tree)
          const after = countLeafOccurrences(
            applyIntent(tree, { kind: "remove", region: target })
          )

          expect(after.get(target) ?? 0).toBe(0)

          for (const [region, count] of before) {
            if (region === target) continue
            expect(after.get(region) ?? 0).toBe(count)
          }
        }
      )
    )
  })

  it("placing a brand-new region and immediately removing it is a no-op on the region multiset", () => {
    fc.assert(
      fc.property(
        layoutIntentSequenceArbitrary,
        regionArbitrary,
        edgeArbitrary,
        (intents, region, edge) => {
          let tree: LayoutNode<YouTubeRegion> | null = null
          for (const intent of intents) tree = applyIntent(tree, intent)

          const before = countLeafOccurrences(tree)
          // Only for a region not yet on the canvas: "place" relocates a
          // present one, so remove would net-delete it.
          fc.pre((before.get(region) ?? 0) === 0)

          const placed = applyIntent(tree, { kind: "place", region, edge })
          const roundTripped = applyIntent(placed, { kind: "remove", region })

          expect(countLeafOccurrences(roundTripped)).toEqual(before)
        }
      )
    )
  })

  it("place never leaves more than one leaf with the placed region's id, even when it already exists elsewhere", () => {
    fc.assert(
      fc.property(
        layoutIntentSequenceArbitrary,
        regionArbitrary,
        edgeArbitrary,
        (intents, region, edge) => {
          let tree: LayoutNode<YouTubeRegion> | null = null
          for (const intent of intents) tree = applyIntent(tree, intent)

          const placed = applyIntent(tree, { kind: "place", region, edge })

          expect(countLeafOccurrences(placed).get(region)).toBe(1)
        }
      )
    )
  })

  it("a self-referential move/reorder/place (region === relativeTo) is a no-op, never a silent deletion", () => {
    fc.assert(
      fc.property(
        layoutIntentSequenceArbitrary,
        regionArbitrary,
        edgeArbitrary,
        (intents, region, edge) => {
          let tree: LayoutNode<YouTubeRegion> | null = null
          for (const intent of intents) tree = applyIntent(tree, intent)

          const before = countLeafOccurrences(tree)

          const afterMove = applyIntent(tree, {
            kind: "move",
            region,
            relativeTo: region,
            edge,
          })
          const afterReorder = applyIntent(tree, {
            kind: "reorder",
            region,
            relativeTo: region,
            edge: edge === "left" || edge === "top" ? "before" : "after",
          })
          const afterPlace = applyIntent(tree, {
            kind: "place",
            region,
            relativeTo: region,
            edge,
          })

          expect(countLeafOccurrences(afterMove)).toEqual(before)
          expect(countLeafOccurrences(afterReorder)).toEqual(before)
          expect(countLeafOccurrences(afterPlace)).toEqual(before)
        }
      )
    )
  })

  it("moving a region relative to itself keeps it on the canvas", () => {
    const withVideo = applyIntent(null, {
      kind: "place",
      region: "video",
      edge: "left",
    })
    const withTitle = applyIntent(withVideo, {
      kind: "place",
      region: "title",
      edge: "right",
    })

    const movedOntoItself = applyIntent(withTitle, {
      kind: "move",
      region: "video",
      relativeTo: "video",
      edge: "right",
    })

    expect(countLeafOccurrences(movedOntoItself).get("video")).toBe(1)
  })

  it("re-placing an already-present region relocates it instead of duplicating it", () => {
    const withVideo = applyIntent(null, {
      kind: "place",
      region: "video",
      edge: "left",
    })

    const replaced = applyIntent(withVideo, {
      kind: "place",
      region: "video",
      edge: "right",
    })

    expect(countLeafOccurrences(replaced).get("video")).toBe(1)
  })

  it("placing a region with no anchor still works once the canvas already has 2+ panels", () => {
    const withVideo = applyIntent(null, {
      kind: "place",
      region: "video",
      edge: "left",
    })
    const withTitle = applyIntent(withVideo, {
      kind: "place",
      region: "title",
      edge: "right",
    })

    // No `relativeTo`, on a tree that is already a split.
    const withMainContent = applyIntent(withTitle, {
      kind: "place",
      region: "mainContent",
      edge: "left",
    })

    expect(countLeafOccurrences(withMainContent).get("mainContent")).toBe(1)
  })
})
