import type { Snapshot } from "@leetype/types/leetype"
import { describe, expect, it } from "vitest"

import type { Obligation } from "./obligation-graph"
import { routeObligation } from "./routing"

const NO_ALTERNATIVE: Pick<Obligation, "sinkRoutes"> = { sinkRoutes: {} }
const HAS_ALTERNATIVE: Pick<Obligation, "sinkRoutes"> = {
  sinkRoutes: { "some-sink": "a-declared-bridge" },
}

/**
 * A complete, realistic `Snapshot` — every field a real engine tick would
 * report — used only by the "reads nothing else" test below. Everywhere
 * else, tests pass the narrow `{ attempt, assisted }` shape directly,
 * which is the point: `routeObligation`'s first parameter can't hold
 * anything more.
 */
function fullSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    cursorSlot: 12,
    cursorDisplay: 14,
    cursorSection: null,
    slotCount: 40,
    filled: 12,
    correct: 11,
    firstGapSlot: 3,
    progress: 0.3,
    accuracy: 0.92,
    wpm: 38,
    instantWpm: 22,
    weightedWpm: 19,
    gateThreshold: 25,
    attempt: 0,
    revealK: 2,
    runCount: 6,
    manualRevealActive: false,
    manualRevealFraction: 0,
    assisted: 0,
    elapsedTime: 8.4,
    sessionElapsedTime: 120.1,
    totalErrors: 3,
    consecutiveErrors: 0,
    showErrorAlert: false,
    isComplete: true,
    started: true,
    ...overrides,
  }
}

describe("routeObligation — the five-row table", () => {
  it("row 1: fluent completion (no assistance, below the cap) -> next-fluent", () => {
    expect(routeObligation({ attempt: 0, assisted: 0 }, NO_ALTERNATIVE)).toBe(
      "next-fluent"
    )
    // Fluent on a retry is still fluent — attempt alone doesn't escalate.
    expect(routeObligation({ attempt: 1, assisted: 0 }, NO_ALTERNATIVE)).toBe(
      "next-fluent"
    )
  })

  it("row 3: fully revealed on the first attempt -> next-uncredited", () => {
    expect(routeObligation({ attempt: 0, assisted: 7 }, NO_ALTERNATIVE)).toBe(
      "next-uncredited"
    )
  })

  it("row 2: assisted on a repeat, no declared alternative -> next-partial-reveal", () => {
    expect(routeObligation({ attempt: 1, assisted: 4 }, NO_ALTERNATIVE)).toBe(
      "next-partial-reveal"
    )
  })

  it("row 4: assisted on a repeat, a declared alternative exists -> decompose", () => {
    expect(routeObligation({ attempt: 1, assisted: 4 }, HAS_ALTERNATIVE)).toBe(
      "decompose"
    )
  })

  it("row 5: escape at the cap -> worked-route, regardless of assistance", () => {
    expect(routeObligation({ attempt: 2, assisted: 0 }, NO_ALTERNATIVE)).toBe(
      "worked-route"
    )
    expect(routeObligation({ attempt: 2, assisted: 9 }, HAS_ALTERNATIVE)).toBe(
      "worked-route"
    )
  })

  it("stays at worked-route past the cap — attempt is never assumed bounded", () => {
    expect(routeObligation({ attempt: 5, assisted: 0 }, NO_ALTERNATIVE)).toBe(
      "worked-route"
    )
  })
})

describe("routeObligation — reads attempt and assisted, and nothing else", () => {
  it("is unaffected by every other Snapshot field", () => {
    // Two full snapshots, identical in attempt/assisted, deliberately
    // wildly different in everything else the real engine reports —
    // wpm, accuracy, reveal state, error counts, timing, completion
    // flags. If routeObligation's decision changed here, it would prove
    // some other field was actually reaching it.
    const calm = fullSnapshot({
      attempt: 1,
      assisted: 3,
      wpm: 90,
      instantWpm: 85,
      weightedWpm: 80,
      accuracy: 0.99,
      totalErrors: 0,
      consecutiveErrors: 0,
      manualRevealActive: false,
      manualRevealFraction: 0,
      elapsedTime: 4,
      sessionElapsedTime: 40,
      showErrorAlert: false,
    })
    const chaotic = fullSnapshot({
      attempt: 1,
      assisted: 3,
      wpm: 5,
      instantWpm: 2,
      weightedWpm: 1,
      accuracy: 0.1,
      totalErrors: 40,
      consecutiveErrors: 12,
      manualRevealActive: true,
      manualRevealFraction: 0.9,
      elapsedTime: 600,
      sessionElapsedTime: 9000,
      showErrorAlert: true,
    })

    const calmResult = routeObligation(calm, NO_ALTERNATIVE)
    const chaoticResult = routeObligation(chaotic, NO_ALTERNATIVE)

    expect(calmResult).toBe(chaoticResult)
    expect(calmResult).toBe("next-partial-reveal")
  })

  it("a fluent completion short-circuits before sinkRoutes is ever consulted", () => {
    // sinkRoutes legitimately changes the outcome (rows 2 vs. 4 above) —
    // but only in the repeat-with-assistance case. A fluent completion
    // never reaches that branch, so it must be identical regardless of
    // what the obligation declares.
    const richerObligation: Pick<Obligation, "sinkRoutes"> = {
      sinkRoutes: { a: "x", b: "y", c: "z" },
    }
    expect(routeObligation({ attempt: 0, assisted: 0 }, richerObligation)).toBe(
      routeObligation({ attempt: 0, assisted: 0 }, NO_ALTERNATIVE)
    )
  })
})
