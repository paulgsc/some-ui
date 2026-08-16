import { describe, expect, it } from "vitest"

import { routeObligation } from "./routing"
import type { TtfkObservation } from "./ttfk"
import {
  aggregateByInstance,
  computeTtfk,
  flagOutliers,
  standardizeTtfk,
} from "./ttfk"

function observation(
  overrides: Partial<TtfkObservation> = {}
): TtfkObservation {
  return {
    stepId: "step-a",
    ttfkMs: 1000,
    baselineWpm: 60,
    revealKAtFirstKeystroke: 0,
    manualRevealActiveAtFirstKeystroke: false,
    ...overrides,
  }
}

describe("standardizeTtfk", () => {
  it("expresses raw TTFK as a multiple of the baseline's own per-character time", () => {
    // 60 WPM at 5 chars/word is 300 chars/minute, 200ms per character.
    // 1000ms of TTFK is therefore 5 baseline characters' worth of waiting.
    expect(standardizeTtfk(1000, 60)).toBeCloseTo(5, 5)
  })

  it("is comparable across players of different speeds — the point of standardizing at all", () => {
    // The same 1000ms is a bigger deal for a fast typist than a slow one:
    // it represents more of their own characters' worth of typing they
    // could have been doing instead. A raw millisecond figure would call
    // both waits identical; standardizing tells them apart.
    const fast = standardizeTtfk(1000, 120)
    const slow = standardizeTtfk(1000, 30)
    expect(fast).toBeGreaterThan(slow)
  })

  it("degrades to 0 rather than dividing by a non-positive baseline", () => {
    expect(standardizeTtfk(1000, 0)).toBe(0)
    expect(standardizeTtfk(1000, -5)).toBe(0)
  })
})

describe("computeTtfk — the reveal-window interaction", () => {
  it("standardizes a normal observation, made before the window opened", () => {
    const result = computeTtfk(observation({ revealKAtFirstKeystroke: 0 }))
    expect(result.censored).toBe(false)
    expect(result).toMatchObject({ standardized: expect.any(Number) })
  })

  it("censors an observation where the reveal window opened before the first keystroke", () => {
    // RevealConfig::initial_delay_ms(attempt) ticks forward on a timer,
    // independent of keystrokes (docs/leetype/README.md's Command::Tick).
    // On a slow step the window can open before the player types anything
    // at all — at which point TTFK would measure how long the engine
    // waited, not how long the player took to respond. This is exactly
    // that case: revealKAtFirstKeystroke > 0 means the window was already
    // open by the time the keystroke landed.
    const result = computeTtfk(
      observation({ ttfkMs: 50, revealKAtFirstKeystroke: 2 })
    )
    expect(result.censored).toBe(true)
    if (result.censored) {
      expect(result.reason).toMatch(/reveal window/)
    }
  })

  it("censoring does not depend on how large ttfkMs is — only on the reveal state", () => {
    // A fast raw TTFK is not proof the window was still shut: it could be
    // fast because the window opened immediately and the player reacted to
    // the reveal rather than recalling the answer. Censoring silently
    // producing the cleanest numbers on exactly the instances it should
    // catch is the failure this test guards against.
    const result = computeTtfk(
      observation({ ttfkMs: 10, revealKAtFirstKeystroke: 1 })
    )
    expect(result.censored).toBe(true)
  })

  it("censors a manual reveal even when revealK alone would look clean", () => {
    // The gap a review caught: manual reveal (RevealState.manual_override_
    // until) shows every slot regardless of k, and k keeps evolving
    // independently of the override rather than being driven to nonzero by
    // it (reveal.rs's advance() doc comment: "the override changes what is
    // shown, never what the controller has concluded"). A player who
    // toggles manual reveal immediately can have revealKAtFirstKeystroke
    // still 0 while having already seen the whole answer — exactly the
    // deceptively-fast, uncensored TTFK this case exists to catch.
    const result = computeTtfk(
      observation({
        ttfkMs: 20,
        revealKAtFirstKeystroke: 0,
        manualRevealActiveAtFirstKeystroke: true,
      })
    )
    expect(result.censored).toBe(true)
    if (result.censored) {
      expect(result.reason).toMatch(/manual reveal/)
    }
  })
})

describe("aggregateByInstance", () => {
  it("folds observations per stepId, never per learner — there is no learner field to fold by", () => {
    const results = [
      { stepId: "step-a", result: computeTtfk(observation({ ttfkMs: 400 })) },
      { stepId: "step-a", result: computeTtfk(observation({ ttfkMs: 600 })) },
      { stepId: "step-b", result: computeTtfk(observation({ ttfkMs: 1000 })) },
    ]
    const aggregates = aggregateByInstance(results)
    expect(aggregates.map((a) => a.stepId)).toEqual(["step-a", "step-b"])
    expect(aggregates[0]?.sampleCount).toBe(2)
    expect(aggregates[1]?.sampleCount).toBe(1)
  })

  it("computes the median of uncensored observations and counts censored ones separately", () => {
    const results = [
      { stepId: "step-a", result: computeTtfk(observation({ ttfkMs: 200 })) },
      { stepId: "step-a", result: computeTtfk(observation({ ttfkMs: 400 })) },
      { stepId: "step-a", result: computeTtfk(observation({ ttfkMs: 600 })) },
      {
        stepId: "step-a",
        result: computeTtfk(
          observation({ ttfkMs: 999_999, revealKAtFirstKeystroke: 3 })
        ),
      },
    ]
    const [aggregate] = aggregateByInstance(results)
    expect(aggregate?.sampleCount).toBe(3)
    expect(aggregate?.censoredCount).toBe(1)
    // Median of the three uncensored 200/400/600ms observations at 60 WPM
    // (200ms/char): 400ms standardizes to 2.
    expect(aggregate?.medianStandardized).toBeCloseTo(2, 5)
  })

  it("returns a deterministic, stepId-sorted order regardless of input order", () => {
    const results = [
      { stepId: "z-step", result: computeTtfk(observation()) },
      { stepId: "a-step", result: computeTtfk(observation()) },
      { stepId: "m-step", result: computeTtfk(observation()) },
    ]
    expect(aggregateByInstance(results).map((a) => a.stepId)).toEqual([
      "a-step",
      "m-step",
      "z-step",
    ])
  })
})

describe("flagOutliers", () => {
  function aggregate(
    stepId: string,
    medianStandardized: number
  ): ReturnType<typeof aggregateByInstance>[number] {
    return { stepId, medianStandardized, sampleCount: 5, censoredCount: 0 }
  }

  it("flags an instance whose median sits far above the corpus's own distribution", () => {
    const aggregates = [
      aggregate("typical-1", 2),
      aggregate("typical-2", 2.2),
      aggregate("typical-3", 1.8),
      aggregate("typical-4", 2.1),
      aggregate("reads-not-types", 40),
    ]
    const flagged = flagOutliers(aggregates)
    expect(flagged).toHaveLength(1)
    expect(flagged[0]).toContain("reads-not-types")
    expect(flagged[0]).toContain("being read, not typed")
  })

  it("does not flag instances within the corpus's ordinary spread", () => {
    const aggregates = [
      aggregate("a", 2),
      aggregate("b", 2.5),
      aggregate("c", 1.5),
      aggregate("d", 2.2),
    ]
    expect(flagOutliers(aggregates)).toEqual([])
  })

  it("flags nothing when there are too few instances for a distribution to mean anything", () => {
    const aggregates = [aggregate("a", 2), aggregate("b", 1000)]
    expect(flagOutliers(aggregates)).toEqual([])
  })

  it("ignores instances with no uncensored samples — nothing to compare", () => {
    const aggregates = [
      aggregate("a", 2),
      aggregate("b", 2.1),
      aggregate("c", 1.9),
      { stepId: "d", medianStandardized: 0, sampleCount: 0, censoredCount: 5 },
    ]
    expect(flagOutliers(aggregates)).toEqual([])
  })
})

describe("not a routing input", () => {
  it("routeObligation cannot read a TTFK-shaped value — its signature only accepts attempt/assisted", () => {
    // routing.ts's own excess-property check is the enforcement mechanism:
    // routeObligation's first parameter is Pick<Snapshot, "attempt" |
    // "assisted">, so an object literal carrying anything else — including
    // a standardized TTFK figure — fails to compile. The same proof
    // routing.test.ts leans on for "reads nothing else", pointed at this
    // module instead.
    routeObligation(
      // @ts-expect-error — a TTFK-shaped value is not assignable to RoutingSignal
      { attempt: 0, assisted: 0, standardizedTtfk: 4.2 },
      { sinkRoutes: {} }
    )
  })
})
