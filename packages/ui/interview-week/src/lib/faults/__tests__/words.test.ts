import { FILLERS, wordsOf } from "@interview-week/lib/faults"
import { describe, expect, it } from "vitest"

describe("wordsOf", () => {
  it("takes the words of a transcript file", () => {
    const words = [
      { text: "Hi", startMs: 0, endMs: 200, p: 0.9, language: "en" },
    ]
    expect(
      wordsOf({
        schema: "some-ui.voice-transcript/1",
        note: "n1",
        of: "interview",
        at: "2026-11-13T00:00:00Z",
        text: "Hi",
        words,
      })
    ).toEqual(words)
  })

  it.each([
    {
      name: "a transcript without words",
      body: { schema: "some-ui.voice-transcript/1" },
    },
    {
      name: "a word that ends before it starts",
      body: {
        schema: "some-ui.voice-transcript/1",
        words: [{ text: "a", startMs: 10, endMs: 5 }],
      },
    },
  ])("is null for $name", ({ body }) => {
    expect(wordsOf(body)).toBeNull()
  })
})

describe("FILLERS", () => {
  it("holds vocalised hesitations and no lexical filler (C265)", () => {
    expect(FILLERS.has("um") && FILLERS.has("uh")).toBe(true)
    expect(FILLERS.has("like")).toBe(false)
  })
})
