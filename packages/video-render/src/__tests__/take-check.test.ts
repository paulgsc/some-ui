import type { HeardWord } from "@video-render/take-check"
import { checkTake, factTerms, normalized } from "@video-render/take-check"
import { describe, expect, it } from "vitest"

/** `text` heard word by word, half a second each, from `fromMs`. */
function heard(text: string, fromMs = 0, p?: number): Array<HeardWord> {
  return text.split(/\s+/).map((word, n) => ({
    text: word,
    startMs: fromMs + 500 * n,
    endMs: fromMs + 500 * n + 400,
    ...(p === undefined ? {} : { p }),
  }))
}

const LINE = "Following the model paid off this week: three of four picks hit."
const READ = { voice: "read", line: LINE, keep: [] } as const
const AD_LIB = {
  voice: "ad-lib",
  line: null,
  keep: ["3 of 4 picks hit", "the model, not a hunch"],
} as const

describe("checkTake", () => {
  it("passes a read take that says its line", () => {
    expect(checkTake(READ, heard(LINE))).toEqual({ kind: "ok" })
  })

  it("gives trim points for a read take with an aside before or after the line", () => {
    const take = [...heard("okay so um", 0), ...heard(LINE, 2_000)]
    expect(checkTake(READ, take)).toEqual({
      kind: "trim",
      takeInMs: 2_000,
      takeOutMs: 2_000 + 500 * 11 + 400,
    })
    const after = [...heard(LINE, 0), ...heard("was that okay", 8_000)]
    expect(checkTake(READ, after)).toMatchObject({
      kind: "trim",
      takeInMs: 0,
      takeOutMs: 5_900,
    })
  })

  it("asks for a look at a read take that says most of its line, naming the rest", () => {
    const take = heard("Following the model paid off this week: three of four")
    expect(checkTake(READ, take)).toEqual({
      kind: "check",
      coverage: 10 / 12,
      facts: [{ fact: LINE, unsure: [], missing: ["pick", "hit"] }],
    })
  })

  it("reads again a take that says little of its line, or nothing", () => {
    expect(checkTake(READ, heard("so the thing is"))).toMatchObject({
      kind: "redo",
    })
    expect(checkTake(READ, [])).toEqual({ kind: "redo", coverage: 0 })
  })

  it("passes a correct ad-libbed take, however the point is made", () => {
    const take = heard(
      "Three of the four picks hit this week, and that came from the model rather than a hunch"
    )
    expect(checkTake(AD_LIB, take)).toEqual({ kind: "ok" })
  })

  it("asks for a look at an ad-libbed take missing a fact's number, naming the fact", () => {
    const take = heard("Most of the picks hit, the model not a hunch")
    expect(checkTake(AD_LIB, take)).toEqual({
      kind: "check",
      coverage: null,
      facts: [{ fact: "3 of 4 picks hit", unsure: [], missing: ["3", "4"] }],
    })
  })

  it("reads again an empty ad-libbed take, and says missing with no transcript", () => {
    expect(checkTake(AD_LIB, [])).toEqual({ kind: "redo", coverage: null })
    expect(checkTake(AD_LIB, null)).toEqual({ kind: "missing" })
  })

  it("counts an unsure word as not said, and reports it as unsure", () => {
    const unsureFour = heard(
      "three of four picks hit, the model not a hunch"
    ).map((word) => (word.text === "four" ? { ...word, p: 0.2 } : word))
    expect(checkTake(AD_LIB, unsureFour)).toEqual({
      kind: "check",
      coverage: null,
      facts: [{ fact: "3 of 4 picks hit", unsure: ["4"], missing: [] }],
    })
    const disagreed = heard(LINE).map((word) =>
      word.text === "model" ? { ...word, unsure: true } : word
    )
    expect(checkTake(READ, disagreed)).toEqual({
      kind: "check",
      coverage: 11 / 12,
      facts: [{ fact: LINE, unsure: ["model"], missing: [] }],
    })
    expect(checkTake(AD_LIB, unsureFour, { confidenceFloor: 0.1 })).toEqual({
      kind: "ok",
    })
  })

  it("compares numbers however they are written", () => {
    expect(normalized("Three")).toBe("3")
    expect(normalized("1,000")).toBe("1000")
    expect(normalized("picks,")).toBe("pick")
    expect(normalized("...")).toBe("")
    expect(factTerms("3 of 4 picks hit, 12.5% over the model's line")).toEqual({
      numbers: ["3", "4", "12.5"],
      terms: ["pick", "over", "model'", "line"].filter((t) => t !== "over"),
    })
  })
})
