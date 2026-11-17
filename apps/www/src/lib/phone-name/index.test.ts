/**
 * A phone's name as home takes it (SIGNIN2, #3088; SIGNIN7; C498): trimmed,
 * at most 40 characters, nothing hidden or line-breaking, the joiners
 * emoji and some scripts need kept.
 */
import { describe, expect, it } from "vitest"

import { typedName } from "@/lib/phone-name"

describe("a typed name for this phone", () => {
  it("is none when blank, and trimmed otherwise", () => {
    expect(typedName("   ")).toEqual({ kind: "none" })
    expect(typedName("  Pixel at home ")).toEqual({
      kind: "name",
      name: "Pixel at home",
    })
  })

  it("counts characters, not code units, up to 40", () => {
    expect(typedName("a".repeat(40))).toEqual({
      kind: "name",
      name: "a".repeat(40),
    })
    expect(typedName("a".repeat(41))).toEqual({ kind: "refused" })
    // Forty astral characters are eighty code units, and still forty.
    const forty = "😀".repeat(40)
    expect(typedName(forty)).toEqual({ kind: "name", name: forty })
  })

  it("keeps the joiners, and refuses what is hidden or breaks a line", () => {
    const coder = "👩‍💻 phone"
    expect(typedName(coder)).toEqual({ kind: "name", name: coder })
    expect(typedName("می‌خواهم")).toMatchObject({ kind: "name" })
    for (const hidden of [
      "a​b",
      "a‮b",
      "a⁦b",
      "a‏b",
      "a\nb",
      "a b",
      "a\u0007b",
    ]) {
      expect(typedName(hidden)).toEqual({ kind: "refused" })
    }
  })
})
