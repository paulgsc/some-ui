/**
 * @vitest-environment node
 *
 * W5: a pasted script split into parts, its takes named by part, and the
 * part rules SCR1–SCR3.
 */
import { describe, expect, it } from "vitest"

import {
  cardId,
  essayParts,
  flip,
  keptCard,
  lineOf,
  parseCard,
  partOfLine,
  phrasesOf,
  use,
  withSeen,
} from "@/lib/studio-spoken/model"

const PASTED = `How I built Rust Rounds

SCRIPT
QUESTION What is Rust Rounds?
Rust Rounds is a week of Rust on my phone.
Monday a ticket, by Sunday an answer.

OWN WORDS
Why I stopped writing Rust every day.

SCRIPT
Each ticket forks a question.`

const script = keptCard(
  parseCard(PASTED) ?? { title: "", category: "introduction", parts: [] },
  "scabc12",
  "2026-11-20T22:00:00.000Z"
)

describe("parseCard", () => {
  it("splits SCRIPT and OWN WORDS parts, with a part's question", () => {
    expect(parseCard(PASTED)).toEqual({
      title: "How I built Rust Rounds",
      category: "introduction",
      parts: [
        {
          kind: "read",
          ask: "What is Rust Rounds?",
          text: "Rust Rounds is a week of Rust on my phone.\nMonday a ticket, by Sunday an answer.",
        },
        {
          kind: "own",
          ask: null,
          text: "Why I stopped writing Rust every day.",
        },
        { kind: "read", ask: null, text: "Each ticket forks a question." },
      ],
    })
  })

  it("reads each paragraph as a part to read when nothing marks them", () => {
    expect(parseCard("A title\n\nFirst part.\n\nSecond part.")).toEqual({
      title: "A title",
      category: "introduction",
      parts: [
        { kind: "read", ask: null, text: "First part." },
        { kind: "read", ask: null, text: "Second part." },
      ],
    })
    expect(parseCard("Only one part.")?.parts).toHaveLength(1)
  })

  it("reads the card's category, and keeps none Studio doesn't know", () => {
    expect(parseCard(`CATEGORY introduction\n${PASTED}`)?.category).toBe(
      "introduction"
    )
    expect(parseCard(`CATEGORY Introduction\n${PASTED}`)?.title).toBe(
      "How I built Rust Rounds"
    )
    expect(parseCard(`CATEGORY trailer\n${PASTED}`)).toBeNull()
  })

  it("keeps nothing from nothing to say", () => {
    expect(parseCard("   \n\n ")).toBeNull()
    expect(parseCard("Title\nSCRIPT\n\n")).toBeNull()
  })
})

describe("a take's line", () => {
  it("names the script and part, in two parts on ':' so home keeps it as a take with no scene", () => {
    const line = lineOf("scabc12", 3)
    expect(line).toBe("spoken:scabc12.3")
    expect(line.split(":")).toHaveLength(2)
    expect(line.startsWith("idea:")).toBe(false)
    expect(partOfLine(line)).toEqual({ script: "scabc12", part: 3 })
    expect(partOfLine("library")).toBeNull()
    expect(partOfLine("spoken:a:b")).toBeNull()
  })

  it("makes ids home takes in a ref", () => {
    const id = cardId(Date.UTC(2026, 10, 20), () => 0.5)
    expect(id).toMatch(/^[a-z0-9]{1,64}$/u)
    expect(partOfLine(lineOf(id, 0))?.script).toBe(id)
  })
})

describe("SCR1: a part's takes only grow", () => {
  it("adds each take seen under its part's line, once, oldest first", () => {
    const seen = withSeen(script, [
      { id: "t1", line: lineOf("scabc12", 0) },
      { id: "t2", line: lineOf("scabc12", 0) },
      { id: "t3", line: lineOf("scabc12", 1) },
      { id: "x", line: "library" },
    ])
    expect(seen.parts.map((part) => part.takes)).toEqual([
      ["t1", "t2"],
      ["t3"],
      [],
    ])
    // A take that left the phone stays the part's.
    expect(withSeen(seen, []).parts[0]?.takes).toEqual(["t1", "t2"])
    expect(withSeen(seen, [{ id: "t1", line: lineOf("scabc12", 0) }])).toBe(
      seen
    )
  })
})

describe("SCR2: a part's kind changes only while it has no take", () => {
  it("flips a part with no take, and not one with a take", () => {
    expect(flip(script, 0).parts[0]?.kind).toBe("own")
    const taken = withSeen(script, [{ id: "t1", line: lineOf("scabc12", 0) }])
    expect(flip(taken, 0)).toBe(taken)
  })
})

describe("SCR3: a part uses only one of its own takes", () => {
  it("picks a take of the part, and ignores any other", () => {
    const taken = withSeen(script, [
      { id: "t1", line: lineOf("scabc12", 0) },
      { id: "t3", line: lineOf("scabc12", 1) },
    ])
    expect(use(taken, 0, "t1").parts[0]?.using).toBe("t1")
    expect(use(taken, 0, "t3")).toBe(taken)
    expect(essayParts(use(taken, 0, "t1"))).toEqual([
      { n: 0, kind: "read", ask: "What is Rust Rounds?", take: "t1" },
      { n: 1, kind: "own", ask: null, take: null },
      { n: 2, kind: "read", ask: null, take: null },
    ])
  })
})

describe("the band", () => {
  it("shows one phrase a line", () => {
    expect(
      phrasesOf("Monday a ticket, by Sunday an answer. Then more")
    ).toEqual(["Monday a ticket,", "by Sunday an answer.", "Then more"])
  })
})
