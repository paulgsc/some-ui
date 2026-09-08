import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { READING_OPTION_COUNT } from "@leetype/lib/leetype/reading-probe"
import type { DiffHunk } from "@leetype/types/exercise"
import type { DiffSetMember } from "@leetype/types/round"
import { describe, expect, it } from "vitest"

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

/** A diff-set member carrying an authored round-specific gloss. */
function memberWithGlossOf(
  propositionId: PropositionId,
  path: string,
  gloss: string
): DiffSetMember {
  return {
    hunk: hunkAt(path),
    propositionId,
    admissible: true,
    propositionGloss: gloss,
  }
}

const ACTIVE_IDS: ReadonlyArray<PropositionId> = propositionPoolOf().map(
  (option) => option.id
)

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

  // No preference ranking exists (see round-probe/index.ts's own doc
  // comment, "No preference ranking," for why): a restricted pool proves
  // distractors are drawn from exactly the candidates handed in, nothing
  // more and nothing preferred among them.
  it("draws distractors only from the pool handed in", () => {
    const pool = (["CW-P7", "CW-P9"] as const).map((id) => ({
      id,
      text: PROPOSITION_REGISTER[id].title,
    }))

    for (const seed of [1, 2, 3, 4, 5]) {
      const probe = roundProbeOf(memberOf("CW-P13", "a"), seed, 3, pool)
      const distractorIds = probe.options
        .map((option) => option.id)
        .filter((id) => id !== "CW-P13")
      expect(distractorIds.sort()).toEqual(["CW-P7", "CW-P9"])
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

  // PropositionIdSchema legitimately accepts a retired id (Rem. 7.1/7.2's
  // amendment protocol keeps old citations resolving) — but a live card's
  // *answer* is a different claim than "this citation still resolves,"
  // and propositionPoolOf already refuses to offer a retired entry as a
  // distractor. The real register has no retired entries yet, so this
  // exercises a synthetic one (review finding on this PR: an earlier draft
  // built the answer straight from the register, bypassing that same
  // active-only reasoning entirely).
  it("refuses to answer with a retired proposition, even though it still resolves as a citation", () => {
    const retiredRegister = {
      ...PROPOSITION_REGISTER,
      "CW-P1": { ...PROPOSITION_REGISTER["CW-P1"], status: "retired" as const },
    }
    expect(() =>
      roundProbeOf(
        memberOf("CW-P1", "a"),
        1,
        READING_OPTION_COUNT,
        propositionPoolOf(),
        retiredRegister
      )
    ).toThrow(/retired/)
  })

  // B3 (#1220), #1330: the verdict's justification is the answer's own
  // register statement — canon §7's full authored claim, not the short
  // `title` `options` carry.
  describe("justification and gloss (#1220)", () => {
    it("carries the answer entry's own register statement as justification", () => {
      const probe = roundProbeOf(memberOf("CW-P1", "a"), 1)
      expect(probe.justification).toBe(PROPOSITION_REGISTER["CW-P1"].statement)
      expect(probe.justification).not.toBe(PROPOSITION_REGISTER["CW-P1"].title)
    })

    it("is total — every active proposition has a non-empty justification", () => {
      for (let index = 0; index < ACTIVE_IDS.length; index += 1) {
        const propositionId = ACTIVE_IDS[index]!
        const probe = roundProbeOf(memberOf(propositionId, "a"), index)
        expect(probe.justification.length).toBeGreaterThan(0)
      }
    })

    it("omits gloss when the selected diff carries none", () => {
      const probe = roundProbeOf(memberOf("CW-P1", "a"), 1)
      expect(probe.gloss).toBeUndefined()
    })

    it("passes the selected diff's own authored gloss through unchanged", () => {
      const gloss =
        "this hunk trades the loop's repeated linear search for one preprocessing pass, exactly CW-P5's own rewrite"
      const probe = roundProbeOf(memberWithGlossOf("CW-P5", "a", gloss), 1)
      expect(probe.gloss).toBe(gloss)
    })

    // A distractor diff's own μ(d) is still a real proposition (per this
    // module's own "answer is μ(d) of the selected diff" section) — its
    // gloss, when authored, must follow the same diff, not the round's
    // admissible member.
    it("reads gloss off the selected diff even when it is the non-admissible one", () => {
      const gloss = "this distractor rewrite instantiates CW-P9 instead"
      const distractorMember: DiffSetMember = {
        hunk: hunkAt("b"),
        propositionId: "CW-P9",
        admissible: false,
        distractorStatement:
          "a well-formed rewrite that doesn't restore budget",
        propositionGloss: gloss,
      }
      const probe = roundProbeOf(distractorMember, 1)
      expect(probe.gloss).toBe(gloss)
    })
  })
})
