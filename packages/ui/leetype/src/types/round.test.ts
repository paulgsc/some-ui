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
    const result = DiffSetMemberSchema.safeParse({
      hunk: ADMISSIBLE_HUNK,
      propositionId: "CW-P999",
      admissible: true,
    })
    expect(result.success).toBe(false)
    expect(result.success ? "" : result.error.message).toContain("register")
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
})
