import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { syntheticCatalogue } from "../testing/synthetic-catalogue"
import { ACTIVITY_CATALOG, ACTIVITY_IDS } from "./catalog"
import { pickRecommended, rankActivities } from "./rank"
import type { ActivityPlay } from "./rank"
import type { ActivityDefinition, TopikLevel } from "./types"

const NOW = Date.UTC(2026, 7, 1)
const DAY = 24 * 60 * 60 * 1000

function idsOf(activities: ReadonlyArray<ActivityDefinition>): Array<string> {
  return activities.map((activity) => activity.id)
}

describe("rankActivities", () => {
  it("puts the most recently played first", () => {
    const catalogue = syntheticCatalogue(10, { uniformMaturity: true })
    const history: Array<ActivityPlay> = [
      { activityId: catalogue[7]!.id, at: NOW - DAY },
      { activityId: catalogue[2]!.id, at: NOW - 20 * DAY },
    ]

    const ranked = rankActivities(catalogue, { history, now: NOW })

    expect(ranked[0]!.id).toBe(catalogue[7]!.id)
    expect(idsOf(ranked).indexOf(catalogue[2]!.id)).toBeLessThan(
      idsOf(ranked).indexOf(catalogue[0]!.id)
    )
  })

  it("breaks a recency tie on how often each was played", () => {
    const catalogue = syntheticCatalogue(6, { uniformMaturity: true })
    const history: Array<ActivityPlay> = [
      { activityId: catalogue[1]!.id, at: NOW - DAY },
      { activityId: catalogue[4]!.id, at: NOW - DAY },
      { activityId: catalogue[4]!.id, at: NOW - 5 * DAY },
      { activityId: catalogue[4]!.id, at: NOW - 9 * DAY },
    ]

    const ranked = rankActivities(catalogue, { history, now: NOW })

    expect(ranked[0]!.id).toBe(catalogue[4]!.id)
    expect(ranked[1]!.id).toBe(catalogue[1]!.id)
  })

  it("prefers an activity that already defaults to the profile's level", () => {
    const catalogue = syntheticCatalogue(9, { uniformMaturity: true })
    // The fixture cycles levels, so index 1 defaults to "intermediate".
    const target: TopikLevel = "intermediate"

    const ranked = rankActivities(catalogue, { targetLevel: target, now: NOW })

    expect(ranked[0]!.defaultConfig.level).toBe(target)
  })

  it("ranks a construction zone below anything finished", () => {
    const catalogue = syntheticCatalogue(8)
    const ranked = rankActivities(catalogue, { now: NOW })
    const maturities = ranked.map((activity) => activity.maturity ?? "ready")

    const lastReady = maturities.lastIndexOf("ready")
    const firstEarly = maturities.indexOf("early")

    expect(lastReady).toBeGreaterThanOrEqual(0)
    expect(firstEarly).toBeGreaterThan(lastReady)
  })

  it("gives someone with no history at all a stable, non-empty set", () => {
    const catalogue = syntheticCatalogue(20)

    const first = idsOf(rankActivities(catalogue, { now: NOW }))
    const second = idsOf(rankActivities(catalogue, { now: NOW + 60_000 }))

    expect(first).toHaveLength(20)
    expect(second).toEqual(first)
  })

  it("ranks the real catalogue with no signals at all, keeping every entry", () => {
    const real = ACTIVITY_IDS.map((id) => ACTIVITY_CATALOG[id])
    const ranked = rankActivities(real)

    expect(new Set(idsOf(ranked))).toEqual(new Set(ACTIVITY_IDS))
    // topik is "preview" and interview is "early", so both sit below the two
    // finished activities - the dashboard's default order, with no history.
    expect(ranked.at(-1)!.id).toBe("interview")
  })
})

describe("pickRecommended", () => {
  /**
   * The property the launcher's layout depends on, stated once rather than
   * as three examples: whatever the catalogue and whatever the history, the
   * launcher gets exactly `min(k, N)` distinct activities back, and asking
   * twice with the same signals gives the same answer.
   *
   * "Stable under re-ranking" is the one that actually protects a person:
   * the dashboard re-renders on every session mutation, and a set that
   * reshuffles between renders moves the card out from under the click.
   */
  it("returns min(k, N) distinct activities, stably, for any catalogue and history", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 1, max: 8 }),
        fc.array(
          fc.record({
            index: fc.integer({ min: 0, max: 59 }),
            at: fc.integer({ min: 0, max: NOW }),
          }),
          { maxLength: 40 }
        ),
        fc.option(
          fc.constantFrom<TopikLevel>("beginner", "intermediate", "advanced"),
          { nil: undefined }
        ),
        (size, k, plays, targetLevel) => {
          const catalogue = syntheticCatalogue(size)
          const history = plays
            .filter((play) => play.index < size)
            .map((play) => ({
              activityId: catalogue[play.index]!.id,
              at: play.at,
            }))
          const signals = { history, targetLevel, now: NOW }

          const picked = pickRecommended(catalogue, k, signals)
          const again = pickRecommended(catalogue, k, signals)

          expect(picked).toHaveLength(Math.min(k, size))
          expect(new Set(idsOf(picked)).size).toBe(picked.length)
          expect(idsOf(again)).toEqual(idsOf(picked))
          return true
        }
      )
    )
  })

  it("is empty rather than throwing for a nonsensical k", () => {
    const catalogue = syntheticCatalogue(10)
    expect(pickRecommended(catalogue, 0)).toEqual([])
    expect(pickRecommended(catalogue, -3)).toEqual([])
    expect(pickRecommended(catalogue, Number.NaN)).toEqual([])
  })

  it("never returns more than the catalogue holds", () => {
    expect(pickRecommended(syntheticCatalogue(2), 4)).toHaveLength(2)
  })
})
