import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import { describe, expect, it } from "vitest"

import { ALL_FIXTURE_ROUNDS } from "./index"

describe("ALL_FIXTURE_ROUNDS — the R5 (#1208) round fixture corpus", () => {
  it("has one round per active proposition register entry", () => {
    const activeCount = Object.values(PROPOSITION_REGISTER).filter(
      (entry) => entry.status === "active"
    ).length
    expect(ALL_FIXTURE_ROUNDS).toHaveLength(activeCount)
  })

  it("has a unique id per round", () => {
    const ids = ALL_FIXTURE_ROUNDS.map((round) => round.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("gives every round exactly one admissible member", () => {
    for (const round of ALL_FIXTURE_ROUNDS) {
      const admissibleCount = round.diffSet.filter(
        (member) => member.admissible
      ).length
      expect(admissibleCount, `round "${round.id}"`).toBe(1)
    }
  })

  it("has every active register entry as some round's admissible propositionId", () => {
    const admissibleIds: ReadonlySet<string> = new Set(
      ALL_FIXTURE_ROUNDS.flatMap((round) =>
        round.diffSet
          .filter((member) => member.admissible)
          .map((member) => member.propositionId)
      )
    )
    for (const entry of Object.values(PROPOSITION_REGISTER)) {
      if (entry.status === "active") {
        expect(admissibleIds.has(entry.id), entry.id).toBe(true)
      }
    }
  })
})
