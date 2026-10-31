import { describe, expect, it } from "vitest"

import { readSeeds } from "../seeds"

describe("readSeeds", () => {
  const names = ["CONTRACT_A", "CONTRACT_B"] as const

  it("hands back every value when each is set", () => {
    expect(readSeeds(names, { CONTRACT_A: "a", CONTRACT_B: "b" })).toEqual({
      values: { CONTRACT_A: "a", CONTRACT_B: "b" },
    })
  })

  it("names each variable it lacks", () => {
    const seeded = readSeeds(names, { CONTRACT_B: "b" })
    expect(seeded.skip).toMatch(/\$CONTRACT_A/)
    expect(seeded.skip).not.toMatch(/\$CONTRACT_B/)
  })

  it("counts an empty value as absent", () => {
    const seeded = readSeeds(names, { CONTRACT_A: "", CONTRACT_B: "b" })
    expect(seeded.skip).toMatch(/\$CONTRACT_A/)
  })
})
