import { describe, expect, it } from "vitest"

import { HangulVocabFileSchema, WordEntrySchema } from "./schema"

const validEntry = {
  id: "one",
  word: "하나",
  romanization: "hana",
  answerKeys: ["g", "k", "s", "k"],
  answerGlyphs: ["ㅎ", "ㅏ", "ㄴ", "ㅏ"],
  icon: "1️⃣",
  ttsText: "하나",
  category: "numbers",
}

describe("WordEntrySchema", () => {
  it("accepts a well-formed entry with a free-form category", () => {
    expect(WordEntrySchema.safeParse(validEntry).success).toBe(true)
  })

  it("rejects a mismatched answerKeys/answerGlyphs length - the most likely LLM-authoring mistake", () => {
    const result = WordEntrySchema.safeParse({
      ...validEntry,
      answerKeys: ["g", "k", "s"],
    })
    expect(result.success).toBe(false)
  })

  it("rejects an entry missing a required field", () => {
    const { id: _id, ...withoutId } = validEntry
    expect(WordEntrySchema.safeParse(withoutId).success).toBe(false)
  })
})

describe("HangulVocabFileSchema", () => {
  it("accepts a non-empty array of valid entries", () => {
    const result = HangulVocabFileSchema.safeParse([validEntry])
    expect(result.success).toBe(true)
  })

  it("rejects an empty array - an empty vocab file has nothing to challenge with", () => {
    expect(HangulVocabFileSchema.safeParse([]).success).toBe(false)
  })
})
