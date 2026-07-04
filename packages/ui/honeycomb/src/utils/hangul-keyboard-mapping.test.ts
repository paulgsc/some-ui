import { describe, expect, it } from "vitest"

import {
  ALL_MAPPINGS,
  CONSONANTS,
  getHangulColor,
  getRandomHangul,
  HANGUL_TO_QWERTY,
  isCorrectKey,
  QWERTY_TO_HANGUL,
  VOWELS,
} from "./hangul-keyboard-mapping"

describe("ALL_MAPPINGS integrity", () => {
  it("combines every consonant and vowel with no overlap", () => {
    expect(ALL_MAPPINGS).toHaveLength(CONSONANTS.length + VOWELS.length)
  })

  it("has no duplicate hangul entries", () => {
    const hanguls = ALL_MAPPINGS.map((m) => m.hangul)
    expect(new Set(hanguls).size).toBe(hanguls.length)
  })

  it("has no duplicate qwerty entries", () => {
    const qwertyKeys = ALL_MAPPINGS.map((m) => m.qwerty)
    expect(new Set(qwertyKeys).size).toBe(qwertyKeys.length)
  })
})

describe("reverse lookup maps", () => {
  it("HANGUL_TO_QWERTY has one entry per mapping (no collisions)", () => {
    expect(HANGUL_TO_QWERTY.size).toBe(ALL_MAPPINGS.length)
  })

  it("QWERTY_TO_HANGUL has one entry per mapping (no collisions)", () => {
    expect(QWERTY_TO_HANGUL.size).toBe(ALL_MAPPINGS.length)
  })

  it.each(ALL_MAPPINGS)(
    "maps $hangul <-> $qwerty in both directions",
    (mapping) => {
      expect(HANGUL_TO_QWERTY.get(mapping.hangul)).toBe(mapping.qwerty)
      expect(QWERTY_TO_HANGUL.get(mapping.qwerty)).toBe(mapping.hangul)
    }
  )
})

describe("isCorrectKey", () => {
  it.each(ALL_MAPPINGS)(
    "accepts the correct qwerty key for $hangul",
    (mapping) => {
      expect(isCorrectKey(mapping.hangul, mapping.qwerty)).toBe(true)
    }
  )

  it("rejects an incorrect key", () => {
    expect(isCorrectKey("ㄱ", "z")).toBe(false)
  })

  it("rejects any key for an unmapped hangul", () => {
    expect(isCorrectKey("not-a-real-jamo", "r")).toBe(false)
  })
})

describe("getRandomHangul", () => {
  it("always returns a member of ALL_MAPPINGS", () => {
    for (let i = 0; i < 50; i++) {
      expect(ALL_MAPPINGS).toContainEqual(getRandomHangul())
    }
  })
})

describe("getHangulColor", () => {
  const consonantColors = [
    "#3b82f6",
    "#8b5cf6",
    "#06b6d4",
    "#14b8a6",
    "#6366f1",
  ]
  const vowelColors = ["#f59e0b", "#ef4444", "#ec4899", "#f97316", "#eab308"]

  it("picks from the cool palette for consonants", () => {
    for (const { hangul } of CONSONANTS) {
      expect(consonantColors).toContain(getHangulColor(hangul))
    }
  })

  it("picks from the warm palette for vowels and unmapped input", () => {
    for (const { hangul } of VOWELS) {
      expect(vowelColors).toContain(getHangulColor(hangul))
    }
    expect(vowelColors).toContain(getHangulColor("not-a-real-jamo"))
  })
})
