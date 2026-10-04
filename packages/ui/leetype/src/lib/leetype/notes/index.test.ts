import type { RoundNote } from "@leetype/lib/leetype/notes"
import {
  appendNoteText,
  boundNotes,
  NOTE_LIMIT,
  NOTE_TEXT_MAX,
  NOTE_TTL_MS,
  PROMPT_NOTES,
  promptLinesOf,
} from "@leetype/lib/leetype/notes"
import { describe, expect, it } from "vitest"

const NOW = Date.parse("2026-10-03T12:00:00.000Z")

function note(
  id: string,
  ageMs: number,
  extra: Partial<RoundNote> = {}
): RoundNote {
  return {
    id,
    at: new Date(NOW - ageMs).toISOString(),
    kind: "gap",
    text: "",
    spoken: false,
    anchor: {
      roundId: "r",
      own: false,
      artifact: "algorithm",
      picked: null,
      committed: false,
      sessionId: "s",
    },
    ...extra,
  }
}

describe("boundNotes (Rem. 3.7)", () => {
  it("keeps the most recent, newest first, at most NOTE_LIMIT", () => {
    const notes = Array.from({ length: NOTE_LIMIT + 5 }, (_, index) =>
      note(`n${index}`, index * 1000)
    ).reverse()
    const kept = boundNotes(notes, NOW)
    expect(kept).toHaveLength(NOTE_LIMIT)
    expect(kept[0]?.id).toBe("n0")
    expect(kept.at(-1)?.id).toBe(`n${NOTE_LIMIT - 1}`)
  })

  it("drops what has expired, what has no readable time, and repeated ids", () => {
    const kept = boundNotes(
      [
        note("old", NOTE_TTL_MS),
        note("fresh", 0),
        { ...note("broken", 0), at: "yesterday" },
        note("fresh", 5),
      ],
      NOW
    )
    expect(kept.map(({ id }) => id)).toEqual(["fresh"])
  })
})

describe("appendNoteText", () => {
  it("joins with one space and cuts at NOTE_TEXT_MAX", () => {
    expect(appendNoteText(" first ", " second ")).toBe("first second")
    expect(appendNoteText("", "only")).toBe("only")
    expect(appendNoteText("a".repeat(NOTE_TEXT_MAX), "more")).toHaveLength(
      NOTE_TEXT_MAX
    )
  })
})

describe("promptLinesOf", () => {
  it("says where, when and what, quoting the learner's words", () => {
    const [own, corpus] = promptLinesOf([
      note("a", 0, {
        kind: "wrong",
        text: 'the "budget"\n- is off',
        anchor: {
          ...note("x", 0).anchor,
          own: true,
          artifact: "budget",
          committed: true,
        },
      }),
      note("b", 0, { kind: "thought" }),
    ])
    expect(own).toBe(
      `- On the budget of their own round, after answering, the learner thinks this is wrong: "the 'budget' - is off"`
    )
    expect(corpus).toBe(
      "- On the program of round `r`, before answering, the learner noted"
    )
  })

  it("carries at most PROMPT_NOTES", () => {
    const notes = Array.from({ length: PROMPT_NOTES + 3 }, (_, index) =>
      note(`n${index}`, index)
    )
    expect(promptLinesOf(notes)).toHaveLength(PROMPT_NOTES)
  })
})
