import { ACTIVITY_CATALOG, ACTIVITY_IDS } from "@activity-catalog/lib/catalog"
import {
  MAX_RECOMMENDED_COUNT,
  recommendedCount,
} from "@activity-catalog/lib/fit"
import { pickRecommended } from "@activity-catalog/lib/rank"
import { syntheticCatalogue } from "@activity-catalog/testing/synthetic-catalogue"
import { describe, expect, it } from "vitest"

/**
 * The launcher must not grow into a scrollbar as the catalogue grows (#858).
 *
 * Lint bans the class string and the ui-fit sweep measures the result, but
 * neither catches a grid that renders `N` cards inside a document that
 * scrolls. What stops it is "the launcher renders `k`, and `k` comes from
 * the box", asserted here beside the catalogue it protects.
 */

/**
 * How many activities exist today.
 *
 * A tripwire, not a rule: adding an applet needs no layout change, but its
 * author should look at the launcher once. Bump this in the same commit that
 * adds the activity, having run `pnpm --filter www test:ui-fit`.
 */
const KNOWN_CATALOGUE_SIZE = 3

describe("catalogue size", () => {
  it("has not grown without the launcher being re-checked", () => {
    expect(
      ACTIVITY_IDS.length,
      `The activity catalogue changed size (${KNOWN_CATALOGUE_SIZE} -> ${ACTIVITY_IDS.length}).\n` +
        `That is fine - it is supposed to be - but check the launcher still fits before you\n` +
        `say so, then bump KNOWN_CATALOGUE_SIZE in this file:\n\n` +
        `  pnpm --filter www test:ui-fit\n\n` +
        `If it does not fit: page it (useFittedPage, as the composer's picker does),\n` +
        `rank it (pickRecommended, as the dashboard launcher does), or search it\n` +
        `(searchActivities). Handing the remainder to a scrollbar is the one\n` +
        `answer this repo does not take - see docs/ui-fit/README.md.`
    ).toBe(KNOWN_CATALOGUE_SIZE)
  })

  it("is rendered by the launcher at k, never at N", () => {
    // `ACTIVITY_IDS.map` into a fixed four-column grid behaves only while N
    // is exactly 4; it fails here at every size but one.
    for (const size of [4, 10, 20, 50]) {
      const catalogue = syntheticCatalogue(size)
      for (const width of [390, 768, 1280, 1680]) {
        const k = recommendedCount(width)
        const rendered = pickRecommended(catalogue, k)

        expect(rendered.length).toBe(Math.min(k, size))
        expect(rendered.length).toBeLessThanOrEqual(MAX_RECOMMENDED_COUNT)
      }
    }
  })

  it("keeps every real activity reachable from the ranked order", () => {
    const real = ACTIVITY_IDS.map((id) => ACTIVITY_CATALOG[id])
    const everything = pickRecommended(real, real.length)

    expect(new Set(everything.map((activity) => activity.id))).toEqual(
      new Set(ACTIVITY_IDS)
    )
  })
})
