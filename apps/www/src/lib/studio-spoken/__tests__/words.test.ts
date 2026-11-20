/**
 * @vitest-environment node
 *
 * W5: what Studio's Spoken says, in the person's terms.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import { essayBlock, SPOKEN_WORDS } from "@/lib/studio-spoken/words"

function strings(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(strings)
  return []
}

const W = SPOKEN_WORDS

const all = [
  ...strings(W),
  W.paste.split(2, 1, 1),
  W.pasted("2026-11-20T22:00:00.000Z"),
  W.summary(9, 0),
  W.summary(1, 1),
  W.flip("own"),
  W.flip("read"),
  W.part(0, 9),
  W.partShort(2),
  W.asks("What is Rust Rounds?"),
  W.partTakes(0, null),
  W.partTakes(3, 2),
  W.takes(4),
  W.take(1),
  W.band.time(65_000),
]

describe("Spoken's words", () => {
  it("name no machinery, in any line they can say", () => {
    expect(all.filter((line) => MACHINERY.test(line))).toEqual([])
  })

  it("ST34: call a take a take, never a recording", () => {
    expect(all.filter((line) => /\brecordings?\b/i.test(line))).toEqual([])
  })

  it("never offer a take to cut by hand: the essay plays it from home", () => {
    expect(all.filter((line) => /\b(share|edit|cut)\b/i.test(line))).toEqual([])
  })

  it("count takes and parts as a person does", () => {
    expect(W.summary(9, 0)).toBe("9 parts · no takes yet")
    expect(W.partTakes(3, 2)).toBe("3 takes · using take 2")
  })
})

describe("the essay's copy", () => {
  it("names the category, and each question with the take that answers it", () => {
    expect(
      essayBlock({
        id: "scabc12",
        title: "How I built Rust Rounds",
        category: "introduction",
        pastedAt: "2026-11-20T22:00:00.000Z",
        parts: [
          {
            id: "intro-who",
            kind: "read",
            ask: "What is Rust Rounds?",
            text: "A week of Rust.",
            takes: ["tk0", "tk1"],
            using: "tk1",
          },
          {
            id: null,
            kind: "own",
            ask: null,
            text: "Why?",
            takes: [],
            using: null,
          },
        ],
      })
    ).toBe(
      [
        "Spoken card: How I built Rust Rounds (scabc12)",
        "Category: introduction",
        "Part 1 (intro-who), read",
        "  Asks: What is Rust Rounds?",
        "  From take tk1",
        "Part 2, own words",
        "  No take yet",
      ].join("\n")
    )
  })
})
