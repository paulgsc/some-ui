import { isPropositionId } from "@leetype/lib/leetype/proposition-register/classification"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import { READING_OPTION_COUNT } from "@leetype/lib/leetype/reading-probe"
import type { DiffHunk } from "@leetype/types/exercise"
import type { DiffSet } from "@leetype/types/round"
import { describe, expect, it } from "vitest"

import type { PropositionOption } from "./index"
import { propositionPoolOf, roundProbeOf } from "./index"

/** A minimal, schema-shaped hunk — its content is never read by anything under test. */
function hunkAt(path: string): DiffHunk {
  return {
    path,
    oldStart: 1,
    newStart: 1,
    segments: [{ kind: "addition", text: `${path}();` }],
  }
}

/** A two-member `DiffSet`: `admissibleId` restores admissibility, `distractorId` does not. */
function diffSetOf(
  admissibleId: PropositionId,
  distractorId: PropositionId
): DiffSet {
  return [
    {
      hunk: hunkAt(admissibleId),
      propositionId: admissibleId,
      admissible: true,
    },
    {
      hunk: hunkAt(distractorId),
      propositionId: distractorId,
      admissible: false,
      distractorStatement: `reuses ${distractorId}'s own rewrite here.`,
    },
  ]
}

const ACTIVE_IDS: ReadonlyArray<PropositionId> =
  Object.keys(PROPOSITION_REGISTER).filter(isPropositionId)

describe("propositionPoolOf", () => {
  it("is every active register entry, and only active ones", () => {
    const activeCount = Object.values(PROPOSITION_REGISTER).filter(
      (entry) => entry.status === "active"
    ).length
    const pool = propositionPoolOf()
    expect(pool).toHaveLength(activeCount)
    for (const option of pool) {
      expect(PROPOSITION_REGISTER[option.id].status).toBe("active")
      expect(option.text).toBe(PROPOSITION_REGISTER[option.id].title)
    }
  })
})

describe("roundProbeOf", () => {
  it("poses the round's admissible proposition as the answer, among distractors", () => {
    const probe = roundProbeOf(diffSetOf("CW-P1", "CW-P2"), 7)
    expect(probe.answerId).toBe("CW-P1")
    expect(probe.options).toHaveLength(READING_OPTION_COUNT)
    const answer = probe.options.find((option) => option.id === probe.answerId)
    expect(answer?.text).toBe(PROPOSITION_REGISTER["CW-P1"].title)
  })

  // The literal acceptance criterion this story closes (#1236, Step 5,
  // B2): the option pool is a function of the register and which
  // proposition μ(d) names, never of the round's own distractor member or
  // hunk content.
  it("two rounds sharing a CW-P proposition offer the same option pool, drawn from the register", () => {
    const roundA = diffSetOf("CW-P5", "CW-P6")
    const roundB = diffSetOf("CW-P5", "CW-P9")
    const probeA = roundProbeOf(roundA, 42)
    const probeB = roundProbeOf(roundB, 42)
    expect(probeA.answerId).toBe("CW-P5")
    expect(probeB.answerId).toBe("CW-P5")
    expect(probeA.options).toEqual(probeB.options)
  })

  it("is deterministic in the seed, and varies with it", () => {
    const diffSet = diffSetOf("CW-P3", "CW-P4")
    const first = roundProbeOf(diffSet, 99)
    const again = roundProbeOf(diffSet, 99)
    expect(again.options).toEqual(first.options)

    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
      roundProbeOf(diffSet, seed)
        .options.map((option) => option.id)
        .join(",")
    )
    expect(new Set(seeds).size).toBeGreaterThan(1)
  })

  // CW-P13 (substitution, dims ["m"]) against a hand-picked pool spanning
  // all three rank tiers: CW-P14 (loop, ["n","m"]) shares a dimension but
  // not the family; CW-P7 (substitution, ["n"]) shares the family but not
  // a dimension; CW-P9 (loop, ["n"]) shares neither. Real register data —
  // restricted to just these three via `pool` — cleanly isolates each tier
  // because none of the three has (unlike most entries) an overlap with
  // CW-P13's own single dimension "m" for the wrong reason.
  describe("preference ordering: dimension, then family, then seed", () => {
    const pool: ReadonlyArray<PropositionOption> = (
      ["CW-P14", "CW-P7", "CW-P9"] as const
    ).map((id) => ({ id, text: PROPOSITION_REGISTER[id].title }))

    it("picks the dimension-sharing candidate over family-only or neither, every seed", () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const probe = roundProbeOf(diffSetOf("CW-P13", "CW-P1"), seed, 2, pool)
        const ids = probe.options.map((option) => option.id)
        expect(ids).toContain("CW-P14")
        expect(ids).not.toContain("CW-P7")
        expect(ids).not.toContain("CW-P9")
      }
    })

    it("picks the family-only candidate before the one sharing neither, every seed", () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const probe = roundProbeOf(diffSetOf("CW-P13", "CW-P1"), seed, 3, pool)
        const ids = probe.options.map((option) => option.id)
        expect(ids).toContain("CW-P14")
        expect(ids).toContain("CW-P7")
        expect(ids).not.toContain("CW-P9")
      }
    })
  })

  // CW-P16's own dimensions array is empty by design (its whole point is a
  // cost independent of every bound) — nothing can share a dimension with
  // it, so ranking degrades to family-then-seed without throwing or
  // producing a short card.
  it("still produces a full card when the answer shares no dimension with anything (CW-P16)", () => {
    const probe = roundProbeOf(diffSetOf("CW-P16", "CW-P1"), 3)
    expect(probe.answerId).toBe("CW-P16")
    expect(probe.options).toHaveLength(READING_OPTION_COUNT)
  })

  it("is total over every active register entry as the admissible proposition", () => {
    for (let index = 0; index < ACTIVE_IDS.length; index += 1) {
      const admissibleId = ACTIVE_IDS[index]!
      const distractorId = ACTIVE_IDS[(index + 1) % ACTIVE_IDS.length]!
      const probe = roundProbeOf(diffSetOf(admissibleId, distractorId), index)
      expect(probe.answerId).toBe(admissibleId)
      expect(probe.options).toHaveLength(READING_OPTION_COUNT)
      expect(probe.options.some((option) => option.id === admissibleId)).toBe(
        true
      )
    }
  })

  it("throws rather than guess when the diff set does not have exactly one admissible member", () => {
    const noneAdmissible: DiffSet = [
      {
        hunk: hunkAt("a"),
        propositionId: "CW-P1",
        admissible: false,
        distractorStatement: "x",
      },
      {
        hunk: hunkAt("b"),
        propositionId: "CW-P2",
        admissible: false,
        distractorStatement: "y",
      },
    ]
    const bothAdmissible: DiffSet = [
      { hunk: hunkAt("a"), propositionId: "CW-P1", admissible: true },
      { hunk: hunkAt("b"), propositionId: "CW-P2", admissible: true },
    ]
    expect(() => roundProbeOf(noneAdmissible, 1)).toThrow(/exactly one/)
    expect(() => roundProbeOf(bothAdmissible, 1)).toThrow(/exactly one/)
  })
})
