import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import {
  assembleRound,
  lintAuthoredRounds,
} from "@leetype/lib/leetype/round-assembly"
import { describe, expect, it } from "vitest"

describe("AUTHORED_ROUNDS — the LTY-AUTHOR (#1540) round corpus", () => {
  it("is clean under lintAuthoredRounds", () => {
    expect(lintAuthoredRounds(AUTHORED_ROUNDS)).toEqual([])
  })

  it("opens every round on its diff set at C′", () => {
    for (const round of AUTHORED_ROUNDS) {
      expect(assembleRound(round).initialState.phase, round.id).toBe(
        "posingDiffSelection"
      )
    }
  })

  it("changes A with every diff", () => {
    for (const round of AUTHORED_ROUNDS) {
      for (const patched of assembleRound(round).patchedSources) {
        expect(patched, round.id).not.toBe(round.algorithm.source)
      }
    }
  })
})
