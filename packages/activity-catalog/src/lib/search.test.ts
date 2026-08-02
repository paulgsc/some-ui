import { describe, expect, it } from "vitest"

import { syntheticCatalogue } from "../testing/synthetic-catalogue"
import { ACTIVITY_CATALOG, ACTIVITY_IDS } from "./catalog"
import { SEARCH_RESULT_LIMIT } from "./fit"
import { rankActivities } from "./rank"
import { searchActivities } from "./search"

const REAL = ACTIVITY_IDS.map((id) => ACTIVITY_CATALOG[id])

describe("searchActivities", () => {
  it("finds an activity by part of its name, case-insensitively", () => {
    expect(searchActivities(REAL, "hangul")[0]!.id).toBe("honeycomb")
    expect(searchActivities(REAL, "LeetType")[0]!.id).toBe("leetype")
  })

  it("finds an activity by its description when the name gives nothing", () => {
    expect(searchActivities(REAL, "mock interview")[0]!.id).toBe("interview")
  })

  it("finds an activity by its audio blurb", () => {
    expect(searchActivities(REAL, "pronunciation")[0]!.id).toBe("topik")
  })

  it("ranks a name hit above a description hit", () => {
    // "type" is in LeetType's name and in two other activities' descriptions
    // ("Type the falling Hangul…", "Type out real code…"). The name wins.
    const results = searchActivities(REAL, "type")
    expect(results[0]!.id).toBe("leetype")
    expect(results.map((activity) => activity.id)).toContain("honeycomb")
  })

  it("treats an empty query as 'no search', not 'everything'", () => {
    expect(searchActivities(REAL, "")).toEqual([])
    expect(searchActivities(REAL, "   ")).toEqual([])
  })

  it("returns nothing at all for a query nothing matches", () => {
    expect(searchActivities(REAL, "zzzzqqq")).toEqual([])
  })

  /**
   * The story's acceptance criterion, asserted for all 50 rather than for a
   * sample: with the launcher showing `k` of `N`, search is the *only* thing
   * making the other `N - k` reachable. One unreachable activity is a
   * feature nobody can get to.
   */
  it("makes every activity in a 50-entry catalogue reachable by its name", () => {
    const catalogue = rankActivities(syntheticCatalogue(50))

    for (const activity of catalogue) {
      const results = searchActivities(catalogue, activity.name)
      expect(
        results[0]?.id,
        `"${activity.name}" did not rank itself first`
      ).toBe(activity.id)
    }
  })

  it("never returns more than m, whatever the catalogue size", () => {
    const catalogue = syntheticCatalogue(50)
    // "a" is a single character - subsequence matching is off, but plenty of
    // names still contain it as a substring.
    for (const query of ["a", "dr", "quiz", "synthetic"]) {
      expect(
        searchActivities(catalogue, query).length
      ).toBeLessThanOrEqual(SEARCH_RESULT_LIMIT)
    }
  })

  it("honours an explicit limit, and refuses a nonsensical one", () => {
    const catalogue = syntheticCatalogue(50)
    expect(searchActivities(catalogue, "quiz", { limit: 3 })).toHaveLength(3)
    expect(searchActivities(catalogue, "quiz", { limit: 0 })).toEqual([])
    expect(searchActivities(catalogue, "quiz", { limit: -1 })).toEqual([])
  })

  it("breaks ties on the order it was handed, so ranking carries through", () => {
    const catalogue = syntheticCatalogue(30, { uniformMaturity: true })
    const ranked = rankActivities(catalogue, {
      history: [{ activityId: catalogue[26]!.id, at: Date.now() }],
    })

    // Both entries share the "Quiz" format, so the query scores them
    // identically and the recommendation order is what separates them.
    const results = searchActivities(ranked, "quiz")
    expect(results[0]!.id).toBe(catalogue[26]!.id)
  })
})
