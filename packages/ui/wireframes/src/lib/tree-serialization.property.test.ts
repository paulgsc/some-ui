import type { YouTubeRegion } from "@some-ui/types"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { layoutIntentSequenceArbitrary } from "./__tests__/layout-intent-arbitrary"
import { applyIntent } from "./layout-intent"
import type { LayoutNode } from "./layout-weighted"
import {
  deserializeLayout,
  getTreeHash,
  serializeLayout,
} from "./tree-serialization"

/**
 * A saved layout that silently comes back different on reload is invisible
 * until a user notices their editor state changed underneath them - the
 * round trip below is the check that would actually catch that, as opposed
 * to "serializing one hardcoded tree produces this exact string".
 */
describe("tree-serialization - round-trip and hash invariants", () => {
  it("deserialize(serialize(tree)) reproduces the tree exactly, for any tree reachable via applyIntent", () => {
    fc.assert(
      fc.property(layoutIntentSequenceArbitrary, (intents) => {
        let tree: LayoutNode<YouTubeRegion> | null = null
        for (const intent of intents) tree = applyIntent(tree, intent)

        const roundTripped = deserializeLayout<YouTubeRegion>(
          serializeLayout(tree)
        )

        expect(roundTripped).toEqual(tree)
      })
    )
  })

  it("getTreeHash is a deterministic function of tree structure", () => {
    fc.assert(
      fc.property(layoutIntentSequenceArbitrary, (intents) => {
        let tree: LayoutNode<YouTubeRegion> | null = null
        for (const intent of intents) tree = applyIntent(tree, intent)

        // Re-derive the same tree from an independent JSON round trip so this
        // compares two structurally-equal-but-not-reference-equal trees.
        const reconstructed = deserializeLayout<YouTubeRegion>(
          serializeLayout(tree)
        )

        expect(getTreeHash(reconstructed)).toBe(getTreeHash(tree))
      })
    )
  })
})
