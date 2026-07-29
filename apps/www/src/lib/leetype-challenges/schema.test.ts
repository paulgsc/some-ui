import { describe, expect, it } from "vitest"

import { ChallengeSchema, LeetypeChallengesFileSchema } from "./schema"

const validChallenge = {
  id: "ds-stack",
  title: "Stack",
  description: "Implement a stack (LIFO) using an array backing store.",
  difficulty: "easy",
  mode: "data-structure",
  tags: ["stack", "lifo", "array"],
  codePaths: {
    typescript: "/leetype/samples/ds-stack.ts",
    rust: "/leetype/samples/ds-stack.rs",
    cpp: "/leetype/samples/ds-stack.cpp",
    c: "/leetype/samples/ds-stack.c",
  },
  levelRequired: 1,
}

describe("ChallengeSchema", () => {
  it("accepts a well-formed challenge", () => {
    expect(ChallengeSchema.safeParse(validChallenge).success).toBe(true)
  })

  it("rejects an entry missing a required field", () => {
    const { id: _id, ...withoutId } = validChallenge
    expect(ChallengeSchema.safeParse(withoutId).success).toBe(false)
  })

  it("accepts a Rust-only corpus - the shape the Curriculum Decomposer emits", () => {
    const result = ChallengeSchema.safeParse({
      ...validChallenge,
      codePaths: { rust: "/leetype/samples/ds-stack.rs" },
    })
    expect(result.success).toBe(true)
  })

  it("rejects codePaths with no Rust source", () => {
    const { rust: _rust, ...withoutRust } = validChallenge.codePaths
    const result = ChallengeSchema.safeParse({
      ...validChallenge,
      codePaths: withoutRust,
    })
    expect(result.success).toBe(false)
  })

  it("rejects an unrecognized difficulty", () => {
    const result = ChallengeSchema.safeParse({
      ...validChallenge,
      difficulty: "impossible",
    })
    expect(result.success).toBe(false)
  })
})

describe("ChallengeSchema curriculum", () => {
  const validCurriculum = {
    stage: "analyze",
    step: 8,
    totalSteps: 10,
    insight: "CAS turns 'read then write' into one step that can fail.",
    learningObjectives: ["Write a CAS loop that re-reads on failure"],
    conceptsIntroduced: ["compare_exchange"],
    conceptsReinforced: ["AtomicPtr"],
    dependsOn: ["treiber-07-atomic-ptr"],
    completionCriteria: [
      "Two threads incrementing 10_000 times each reach 20_000",
    ],
    targetProblem: "Implement a lock-free Treiber stack.",
  }

  it("accepts a fully decomposed entry", () => {
    const result = ChallengeSchema.safeParse({
      ...validChallenge,
      curriculum: validCurriculum,
    })
    expect(result.success).toBe(true)
  })

  it("accepts an entry with no curriculum - a pre-decomposition corpus still loads", () => {
    expect(ChallengeSchema.safeParse(validChallenge).success).toBe(true)
  })

  it("rejects a partial curriculum - half a decomposition misleads the UI", () => {
    const { insight: _insight, ...partial } = validCurriculum
    const result = ChallengeSchema.safeParse({
      ...validChallenge,
      curriculum: partial,
    })
    expect(result.success).toBe(false)
  })

  it("rejects a stage outside the ladder", () => {
    const result = ChallengeSchema.safeParse({
      ...validChallenge,
      curriculum: { ...validCurriculum, stage: "transcend" },
    })
    expect(result.success).toBe(false)
  })

  it("rejects a non-positive step", () => {
    const result = ChallengeSchema.safeParse({
      ...validChallenge,
      curriculum: { ...validCurriculum, step: 0 },
    })
    expect(result.success).toBe(false)
  })
})

describe("LeetypeChallengesFileSchema", () => {
  it("accepts a non-empty array of valid challenges", () => {
    const result = LeetypeChallengesFileSchema.safeParse([validChallenge])
    expect(result.success).toBe(true)
  })

  it("rejects an empty array - an empty corpus has nothing to type", () => {
    expect(LeetypeChallengesFileSchema.safeParse([]).success).toBe(false)
  })
})
