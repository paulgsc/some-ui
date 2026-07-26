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

  it("rejects codePaths missing one of the four languages", () => {
    const { c: _c, ...codePathsWithoutC } = validChallenge.codePaths
    const result = ChallengeSchema.safeParse({
      ...validChallenge,
      codePaths: codePathsWithoutC,
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

describe("LeetypeChallengesFileSchema", () => {
  it("accepts a non-empty array of valid challenges", () => {
    const result = LeetypeChallengesFileSchema.safeParse([validChallenge])
    expect(result.success).toBe(true)
  })

  it("rejects an empty array - an empty corpus has nothing to type", () => {
    expect(LeetypeChallengesFileSchema.safeParse([]).success).toBe(false)
  })
})
