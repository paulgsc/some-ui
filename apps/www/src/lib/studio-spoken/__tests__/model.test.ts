/**
 * @vitest-environment node
 *
 * W5: a pasted script split into parts, its takes named by part, and the
 * part rules SCR1–SCR3.
 */
import { spokenLineOf, spokenPartOfLine } from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

import {
  cardId,
  flip,
  keptCard,
  parseCard,
  partAt,
  unuse,
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
          id: null,
          kind: "read",
          ask: "What is Rust Rounds?",
          text: "Rust Rounds is a week of Rust on my phone.\nMonday a ticket, by Sunday an answer.",
        },
        {
          id: null,
          kind: "own",
          ask: null,
          text: "Why I stopped writing Rust every day.",
        },
        {
          id: null,
          kind: "read",
          ask: null,
          text: "Each ticket forks a question.",
        },
      ],
    })
  })

  it("takes one word after SCRIPT or OWN WORDS as the part's id, as the showcase writes it", () => {
    const showcase = `CATEGORY introduction

SCRIPT intro-who
QUESTION Who are you, and what do you build?
paulgsc here. That's the name on my GitHub repository.

SCRIPT intro-why
It started with a question I couldn't answer.

OWN WORDS intro-adlib
QUESTION Anything to add about why the usual ways didn't stick?
Optional. In your own words: what didn't stick, and why.

SCRIPT Read this line as it is.`
    const card = parseCard(showcase)
    expect(card?.category).toBe("introduction")
    expect(
      card?.parts.map(({ id, kind, ask, text }) => ({
        id,
        kind,
        ask,
        first: text.split("\n")[0],
      }))
    ).toEqual([
      {
        id: "intro-who",
        kind: "read",
        ask: "Who are you, and what do you build?",
        first: "paulgsc here. That's the name on my GitHub repository.",
      },
      {
        id: "intro-why",
        kind: "read",
        ask: null,
        first: "It started with a question I couldn't answer.",
      },
      {
        id: "intro-adlib",
        kind: "own",
        ask: "Anything to add about why the usual ways didn't stick?",
        first: "Optional. In your own words: what didn't stick, and why.",
      },
      // More than one word after the keyword is the part's first words.
      { id: null, kind: "read", ask: null, first: "Read this line as it is." },
    ])
  })

  it("reads each paragraph as a part to read when nothing marks them", () => {
    expect(parseCard("A title\n\nFirst part.\n\nSecond part.")).toEqual({
      title: "A title",
      category: "introduction",
      parts: [
        { id: null, kind: "read", ask: null, text: "First part." },
        { id: null, kind: "read", ask: null, text: "Second part." },
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

  it("reads a marker only as a word of its own", () => {
    const card = parseCard("SCRIPT\nSCRIPTURE says so.\nQUESTIONS remain open.")
    expect(card?.parts).toEqual([
      {
        id: null,
        kind: "read",
        ask: null,
        text: "SCRIPTURE says so.\nQUESTIONS remain open.",
      },
    ])
  })

  it("keeps nothing from nothing to say", () => {
    expect(parseCard("   \n\n ")).toBeNull()
    expect(parseCard("Title\nSCRIPT\n\n")).toBeNull()
  })
})

describe("a take's line", () => {
  it("makes ids home takes in a ref", () => {
    const id = cardId(Date.UTC(2026, 10, 20), () => 0.5)
    expect(id).toMatch(/^[a-z0-9]{1,64}$/u)
    expect(spokenPartOfLine(spokenLineOf(id, 0))?.card).toBe(id)
  })
})

describe("SCR1: a part's takes only grow", () => {
  it("adds each take seen under its part's line, once, oldest first", () => {
    const seen = withSeen(script, [
      { id: "t1", line: spokenLineOf("scabc12", 0) },
      { id: "t2", line: spokenLineOf("scabc12", 0) },
      { id: "t3", line: spokenLineOf("scabc12", 1) },
      { id: "x", line: "library" },
    ])
    expect(seen.parts.map((part) => part.takes)).toEqual([
      ["t1", "t2"],
      ["t3"],
      [],
    ])
    // A take that left the phone stays the part's.
    expect(withSeen(seen, []).parts[0]?.takes).toEqual(["t1", "t2"])
    expect(
      withSeen(seen, [{ id: "t1", line: spokenLineOf("scabc12", 0) }])
    ).toBe(seen)
  })
})

describe("a part's place", () => {
  it("names no part before the first, or past the last", () => {
    expect(partAt(script, 0)?.kind).toBe("read")
    expect(partAt(script, -1)).toBeUndefined()
    expect(partAt(script, 3)).toBeUndefined()
    expect(flip(script, -1)).toBe(script)
  })
})

describe("SCR2: a part's kind changes only while it has no take", () => {
  it("flips a part with no take, and not one with a take", () => {
    expect(flip(script, 0).parts[0]?.kind).toBe("own")
    const taken = withSeen(script, [
      { id: "t1", line: spokenLineOf("scabc12", 0) },
    ])
    expect(flip(taken, 0)).toBe(taken)
  })
})

describe("SCR3: a part uses only one of its own takes", () => {
  it("picks a take of the part, and ignores any other", () => {
    const taken = withSeen(script, [
      { id: "t1", line: spokenLineOf("scabc12", 0) },
      { id: "t3", line: spokenLineOf("scabc12", 1) },
    ])
    expect(use(taken, 0, "t1").parts[0]?.using).toBe("t1")
    expect(use(taken, 0, "t3")).toBe(taken)
    expect(use(taken, -1, "t1")).toBe(taken)
  })

  it("lets go of a pick home heard nothing in, keeping the take", () => {
    const picked = use(
      withSeen(script, [{ id: "t1", line: spokenLineOf("scabc12", 0) }]),
      0,
      "t1"
    )
    const unheard = unuse(picked, "t1")
    expect(unheard.parts[0]?.using).toBeNull()
    expect(unheard.parts[0]?.takes).toEqual(["t1"])
    expect(unuse(unheard, "t1")).toBe(unheard)
  })
})
