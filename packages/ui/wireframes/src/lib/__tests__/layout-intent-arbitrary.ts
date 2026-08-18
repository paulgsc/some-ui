import type { YouTubeRegion } from "@some-ui/types"
import type { LayoutIntent } from "@wireframes/lib/layout-intent"
import fc from "fast-check"

/**
 * A small, fixed alphabet (the real YouTubeRegion slots) instead of unique
 * generated strings - this forces repeats and self-references within short
 * sequences, which is exactly where "weird timeline" bugs (duplicated or
 * vanished regions) hide.
 */
export const regionArbitrary: fc.Arbitrary<YouTubeRegion> = fc.constantFrom(
  "video",
  "title",
  "mainContent",
  "footerLeft",
  "sidebarTop",
  "sidebarBottom",
  "footerRight"
)

export const edgeArbitrary: fc.Arbitrary<"left" | "right" | "top" | "bottom"> =
  fc.constantFrom("left", "right", "top", "bottom")

const reorderEdgeArbitrary: fc.Arbitrary<"before" | "after"> = fc.constantFrom(
  "before",
  "after"
)

export const layoutIntentArbitrary: fc.Arbitrary<LayoutIntent<YouTubeRegion>> =
  fc.oneof(
    fc.record({
      kind: fc.constant("place" as const),
      region: regionArbitrary,
      relativeTo: fc.option(regionArbitrary, { nil: undefined }),
      edge: edgeArbitrary,
    }),
    fc.record({
      kind: fc.constant("move" as const),
      region: regionArbitrary,
      relativeTo: regionArbitrary,
      edge: edgeArbitrary,
    }),
    fc.record({
      kind: fc.constant("remove" as const),
      region: regionArbitrary,
    }),
    fc.record({
      kind: fc.constant("reorder" as const),
      region: regionArbitrary,
      relativeTo: regionArbitrary,
      edge: reorderEdgeArbitrary,
    }),
    fc.record({
      kind: fc.constant("resize" as const),
      region: regionArbitrary,
      edge: edgeArbitrary,
      deltaPx: fc.integer({ min: -400, max: 400 }),
      containerSizePx: fc.integer({ min: 100, max: 2000 }),
    })
  )

export const layoutIntentSequenceArbitrary = fc.array(layoutIntentArbitrary, {
  minLength: 1,
  maxLength: 50,
})
