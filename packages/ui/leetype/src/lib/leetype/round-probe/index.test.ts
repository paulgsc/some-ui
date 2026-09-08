import { isPropositionId } from "@leetype/lib/leetype/proposition-register/classification"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { READING_OPTION_COUNT } from "@leetype/lib/leetype/reading-probe"
import type { DiffHunk } from "@leetype/types/exercise"
import type { DiffSetMember } from "@leetype/types/round"
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

/** A single diff-set member — `admissible` defaults to `true` since most tests care only about `propositionId`. */
function memberOf(
  propositionId: PropositionId,
  path: string,
  admissible = true
): DiffSetMember {
  return admissible
    ? { hunk: hunkAt(path), propositionId, admissible: true }
    : {
        hunk: hunkAt(path),
        propositionId,
        admissible: false,
        distractorStatement: `reuses ${propositionId}'s own rewrite here.`,
      }
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
  it("poses the selected diff's own proposition as the answer, among distractors", () => {
    const probe = roundProbeOf(memberOf("CW-P1", "a"), 7)
    expect(probe.answerId).toBe("CW-P1")
    expect(probe.options).toHaveLength(READING_OPTION_COUNT)
    const answer = probe.options.find((option) => option.id === probe.answerId)
    expect(answer?.text).toBe(PROPOSITION_REGISTER["CW-P1"].title)
  })

  // The literal acceptance criterion this story closes (#1236, Step 5, B2):
  // the option pool is a function of the register and which proposition
  // μ(d) names, never of the diff's own hunk content, path, or role.
  it("two diffs witnessing the same CW-P proposition offer the same option pool, drawn from the register", () => {
    const probeA = roundProbeOf(memberOf("CW-P5", "a"), 42)
    const probeB = roundProbeOf(memberOf("CW-P5", "totally/different/path"), 42)
    expect(probeA.answerId).toBe("CW-P5")
    expect(probeB.answerId).toBe("CW-P5")
    expect(probeA.options).toEqual(probeB.options)
  })

  // Thm. 6.1 and Def. 8.1 both frame the learner's selection as a pair
  // (d, p) ranging over the whole of D, not just its admissible member —
  // a distractor diff is an equally real `d` with its own `μ(d)` (review
  // finding on this PR: an earlier draft always answered with the
  // admissible member's own proposition, regardless of which diff the
  // card was posed for).
  it("answers with the selected diff's own proposition even when it is not the admissible one", () => {
    const admissibleProbe = roundProbeOf(memberOf("CW-P5", "a", true), 1)
    const distractorProbe = roundProbeOf(memberOf("CW-P9", "b", false), 1)
    expect(admissibleProbe.answerId).toBe("CW-P5")
    expect(distractorProbe.answerId).toBe("CW-P9")
  })

  it("is deterministic in the seed, and varies with it", () => {
    const selected = memberOf("CW-P3", "a")
    const first = roundProbeOf(selected, 99)
    const again = roundProbeOf(selected, 99)
    expect(again.options).toEqual(first.options)

    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
      roundProbeOf(selected, seed)
        .options.map((option) => option.id)
        .join(",")
    )
    expect(new Set(seeds).size).toBeGreaterThan(1)
  })

  // CW-P13 (substitution) against a hand-picked pool: CW-P7 shares its
  // family, CW-P9 (loop) does not — real register data, restricted via
  // `pool`, isolates the one tier this function ranks by.
  it("prefers a same-family distractor over a different-family one, every seed", () => {
    const pool: ReadonlyArray<PropositionOption> = (
      ["CW-P7", "CW-P9"] as const
    ).map((id) => ({ id, text: PROPOSITION_REGISTER[id].title }))

    for (const seed of [1, 2, 3, 4, 5]) {
      const probe = roundProbeOf(memberOf("CW-P13", "a"), seed, 2, pool)
      const ids = probe.options.map((option) => option.id)
      expect(ids).toContain("CW-P7")
      expect(ids).not.toContain("CW-P9")
    }
  })

  it("is total over every active register entry as the selected diff's own proposition", () => {
    for (let index = 0; index < ACTIVE_IDS.length; index += 1) {
      const propositionId = ACTIVE_IDS[index]!
      const probe = roundProbeOf(memberOf(propositionId, "a"), index)
      expect(probe.answerId).toBe(propositionId)
      expect(probe.options).toHaveLength(READING_OPTION_COUNT)
      expect(probe.options.some((option) => option.id === propositionId)).toBe(
        true
      )
    }
  })
})
