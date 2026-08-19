import { describe, expect, it } from "vitest"

import type { GateFigures, PlayableGame } from "./deletions-are-free"
import { compareGateFigures, playToCompletion } from "./deletions-are-free"

/**
 * Unit coverage for this file's pure logic — `compareGateFigures` and the
 * keystroke-skipping loop `playToCompletion` runs. The real proof (LTY-PATCH
 * P6, #1081's "not a comment" bar) is `check-deletions-are-free.ts` driving
 * the actual compiled engine, which no `*.test.ts` file can do (see
 * `load-real-wasm.ts`'s own doc comment). What belongs here instead: proof
 * that the *comparison* itself would actually catch a real divergence,
 * rather than being a check that always passes regardless of its inputs.
 */

const FIGURES: GateFigures = {
  assisted: 1,
  correct: 10,
  weightedWpm: 42,
  gateThreshold: 20,
}

describe("compareGateFigures", () => {
  it("finds no violations when every figure matches", () => {
    expect(compareGateFigures(FIGURES, { ...FIGURES }, "label")).toEqual([])
  })

  it("reports every figure that diverges, not just the first", () => {
    const withDeletion = FIGURES
    const withoutDeletion: GateFigures = {
      ...FIGURES,
      assisted: 0,
      weightedWpm: 55,
    }
    const violations = compareGateFigures(
      withDeletion,
      withoutDeletion,
      "adversarial fixture"
    )
    expect(violations).toHaveLength(2)
    expect(violations.some((v) => v.includes("assisted"))).toBe(true)
    expect(violations.some((v) => v.includes("weightedWpm"))).toBe(true)
    expect(violations.some((v) => v.includes("correct"))).toBe(false)
    violations.forEach((v) => expect(v).toContain("adversarial fixture"))
  })

  it("catches a gateThreshold divergence — the figure that actually decides advancement", () => {
    const violations = compareGateFigures(
      FIGURES,
      { ...FIGURES, gateThreshold: 19 },
      "label"
    )
    expect(violations.some((v) => v.includes("gateThreshold"))).toBe(true)
  })
})

describe("playToCompletion", () => {
  /** A fake game recording every key it was asked to press, so tests can assert who got skipped. */
  function fakeGame(
    displaySource: string,
    roles: Uint8Array
  ): PlayableGame & { pressed: Array<string> } {
    const pressed: Array<string> = []
    return {
      pressed,
      start: () => undefined,
      press: (key: string): undefined => {
        pressed.push(key)
        return undefined
      },
      tick: () => undefined,
      layout: () => ({ displaySource }),
      roles: () => roles,
      snapshot: () => FIGURES,
      free: () => undefined,
    }
  }

  it("presses only the typeable characters, skipping context and layout", () => {
    // "a" context, "b" typeable, "c" context, "d" typeable
    const game = fakeGame("abcd", Uint8Array.from([2, 1, 2, 1]))
    playToCompletion(game, 0)
    expect(game.pressed).toEqual(["b", "d"])
  })

  it("returns exactly the four gate figures from the final snapshot", () => {
    const game = fakeGame("x", Uint8Array.from([1]))
    expect(playToCompletion(game, 0)).toEqual(FIGURES)
  })
})
