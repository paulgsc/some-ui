import { describe, expect, it } from "vitest"

import type { DiffHunk } from "./exercise"
import type { DiffSet, DiffSetMember } from "./round"
import { DiffSetMemberSchema, DiffSetSchema } from "./round"

const ADMISSIBLE_HUNK: DiffHunk = {
  path: "src/lib/rate-limit.ts",
  oldStart: 1,
  newStart: 1,
  segments: [
    { kind: "addition", text: "const limiter = new TokenBucket(rate)" },
  ],
}

const DISTRACTOR_HUNK: DiffHunk = {
  path: "src/lib/rate-limit.ts",
  oldStart: 1,
  newStart: 1,
  segments: [
    { kind: "addition", text: "const limiter = new FixedWindow(rate)" },
  ],
}

const ANOTHER_DISTRACTOR_HUNK: DiffHunk = {
  path: "src/lib/rate-limit.ts",
  oldStart: 1,
  newStart: 1,
  segments: [
    { kind: "addition", text: "const limiter = new LeakyBucket(rate)" },
  ],
}

describe("DiffSetMemberSchema — Def. 1.4's diff plus Def. 1.6's μ", () => {
  it("accepts an admissible member with a resolvable propositionId and no distractor statement", () => {
    const member = {
      hunk: ADMISSIBLE_HUNK,
      propositionId: "CW-P5",
      admissible: true,
    }
    expect(DiffSetMemberSchema.parse(member)).toEqual(member)
  })

  it("accepts a non-admissible member carrying its own distractor statement", () => {
    const member = {
      hunk: DISTRACTOR_HUNK,
      propositionId: "CW-P6",
      admissible: false,
      distractorStatement:
        "swaps the token bucket for a fixed window, which still overshoots on bursty traffic instead of restoring the budget",
    }
    expect(DiffSetMemberSchema.parse(member)).toEqual(member)
  })

  it("rejects a non-admissible member with no distractor statement — Cor. 5.1's anti-strawman check", () => {
    const result = DiffSetMemberSchema.safeParse({
      hunk: DISTRACTOR_HUNK,
      propositionId: "CW-P6",
      admissible: false,
    })
    expect(result.success).toBe(false)
    expect(result.success ? "" : result.error.message).toContain("strawman")
  })

  it("rejects a propositionId that does not resolve against the register", () => {
    // Deliberately not shaped like "CW-Pn": `scripts/check-proposition-
    // citations.ts` scans every tracked file for that literal pattern, and
    // this fixture is not one of the proposition-register module's own
    // tests (the one place that scan excludes), so a "CW-Pn"-shaped id
    // here — even an out-of-range one — would be flagged as a real
    // dangling citation rather than exercising this schema's own check.
    const result = DiffSetMemberSchema.safeParse({
      hunk: ADMISSIBLE_HUNK,
      propositionId: "not-a-real-proposition-id",
      admissible: true,
    })
    expect(result.success).toBe(false)
    expect(result.success ? "" : result.error.message).toContain("register")
  })

  // Review finding (#1261, chatgpt-codex-connector): `in` walks the
  // prototype chain, so an inherited Object.prototype name would have
  // resolved here even though it is not a real register key.
  it("rejects an inherited Object.prototype name as a propositionId", () => {
    for (const value of ["constructor", "toString", "hasOwnProperty"]) {
      const result = DiffSetMemberSchema.safeParse({
        hunk: ADMISSIBLE_HUNK,
        propositionId: value,
        admissible: true,
      })
      expect(result.success, `"${value}"`).toBe(false)
    }
  })

  it("accepts an admissible member that also carries a distractor statement — not forbidden, just not required", () => {
    const member = {
      hunk: ADMISSIBLE_HUNK,
      propositionId: "CW-P5",
      admissible: true,
      distractorStatement:
        "not actually a distractor, but the field is optional either way",
    }
    expect(DiffSetMemberSchema.parse(member)).toEqual(member)
  })

  // B3 (#1220): propositionGloss is the round-specific half of a verdict's
  // justification, and always optional — a missing gloss is a real,
  // disclosed thinness (#1220's own acceptance criteria), not a validation
  // failure.
  it("accepts a member with an authored propositionGloss", () => {
    const member = {
      hunk: ADMISSIBLE_HUNK,
      propositionId: "CW-P5",
      admissible: true,
      propositionGloss:
        "this hunk trades the loop's repeated linear search for one preprocessing pass, exactly CW-P5's own rewrite",
    }
    expect(DiffSetMemberSchema.parse(member)).toEqual(member)
  })

  it("accepts a member with no propositionGloss at all", () => {
    const member = {
      hunk: ADMISSIBLE_HUNK,
      propositionId: "CW-P5",
      admissible: true,
    }
    expect(DiffSetMemberSchema.parse(member)).toEqual(member)
    expect(DiffSetMemberSchema.parse(member).propositionGloss).toBeUndefined()
  })
})

describe("DiffSetSchema — Ax. 1.1's floor and Prop. 2.1's exactly-one-admissible constraint", () => {
  const admissibleMember: DiffSetMember = {
    hunk: ADMISSIBLE_HUNK,
    propositionId: "CW-P5",
    admissible: true,
  }
  const distractorMember: DiffSetMember = {
    hunk: DISTRACTOR_HUNK,
    propositionId: "CW-P6",
    admissible: false,
    distractorStatement:
      "swaps the token bucket for a fixed window, which still overshoots on bursty traffic instead of restoring the budget",
  }
  const secondDistractorMember: DiffSetMember = {
    hunk: ANOTHER_DISTRACTOR_HUNK,
    propositionId: "CW-P10",
    admissible: false,
    distractorStatement:
      "batches refills instead of metering them, which restores the average but not the worst case",
  }

  it("accepts a diff set with exactly one admissible member and one distractor", () => {
    const diffSet: DiffSet = [admissibleMember, distractorMember]
    expect(DiffSetSchema.parse(diffSet)).toEqual(diffSet)
  })

  it("accepts an ordered set larger than two, still exactly one admissible", () => {
    const diffSet: DiffSet = [
      admissibleMember,
      distractorMember,
      secondDistractorMember,
    ]
    expect(DiffSetSchema.parse(diffSet)).toEqual(diffSet)
  })

  it("rejects a diff set smaller than two members", () => {
    const result = DiffSetSchema.safeParse([admissibleMember])
    expect(result.success).toBe(false)
  })

  it("rejects an empty diff set", () => {
    const result = DiffSetSchema.safeParse([])
    expect(result.success).toBe(false)
  })

  it("rejects a diff set with zero admissible members", () => {
    const result = DiffSetSchema.safeParse([
      distractorMember,
      secondDistractorMember,
    ])
    expect(result.success).toBe(false)
    expect(result.success ? "" : result.error.message).toContain(
      "exactly one member of D is authored as admissible"
    )
  })

  it("rejects a diff set with two admissible members", () => {
    const secondAdmissible = {
      ...admissibleMember,
      hunk: ANOTHER_DISTRACTOR_HUNK,
    }
    const result = DiffSetSchema.safeParse([admissibleMember, secondAdmissible])
    expect(result.success).toBe(false)
    expect(result.success ? "" : result.error.message).toContain(
      "exactly one member of D is authored as admissible"
    )
  })

  // Review finding (#1261, chatgpt-codex-connector): D is Def. 1.4's own
  // *set* of diffs — the same hunk appearing under two members is one hunk
  // with an ambiguous μ, not two alternatives, even when exactly one of
  // the two is marked admissible.
  it("rejects a diff set carrying the same hunk under two members", () => {
    const duplicate: DiffSetMember = {
      hunk: distractorMember.hunk,
      propositionId: "CW-P10",
      admissible: false,
      distractorStatement: "a different account of the same rewrite",
    }
    const result = DiffSetSchema.safeParse([
      admissibleMember,
      distractorMember,
      duplicate,
    ])
    expect(result.success).toBe(false)
    expect(result.success ? "" : result.error.message).toContain(
      "D is a set of diffs"
    )
  })

  it("still catches a duplicate hunk whose segment fields were authored in a different key order", () => {
    // hunkKeyOf must not be fooled by JSON.stringify's key-order
    // sensitivity: the same content, re-keyed, is still the same hunk.
    const reorderedHunk: DiffHunk = {
      ...distractorMember.hunk,
      segments: distractorMember.hunk.segments.map((segment) => ({
        text: segment.text,
        kind: segment.kind,
      })),
    }
    const diffSet: DiffSet = [
      admissibleMember,
      distractorMember,
      { ...secondDistractorMember, hunk: reorderedHunk },
    ]
    const result = DiffSetSchema.safeParse(diffSet)
    expect(result.success).toBe(false)
    expect(result.success ? "" : result.error.message).toContain(
      "D is a set of diffs"
    )
  })
})
