import { readPrimer } from "@soundbites/lib/journal/primer"
import { describe, expect, it } from "vitest"

const cut = (id: string, targetSec = 30): Record<string, unknown> => ({
  id,
  artifact: `Artifact ${id}`,
  prompt: `Say something about ${id}`,
  targetSec,
})

const primer = (fields: Record<string, unknown> = {}): string =>
  JSON.stringify({
    version: 1,
    title: "AMO release notes",
    cuts: [cut("gap", 25), cut("flow", 40)],
    ...fields,
  })

describe("readPrimer", () => {
  it("reads a primer, defaulting the budget to three minutes", () => {
    const reading = readPrimer(primer())
    expect(reading).toEqual({
      ok: true,
      primer: {
        title: "AMO release notes",
        budgetMs: 180_000,
        voice: "read",
        cuts: [
          {
            id: "gap",
            artifact: "Artifact gap",
            point: "Say something about gap",
            line: "Say something about gap",
            keep: [],
            voice: "read",
            prompt: "Say something about gap",
            targetMs: 25_000,
          },
          {
            id: "flow",
            artifact: "Artifact flow",
            point: "Say something about flow",
            line: "Say something about flow",
            keep: [],
            voice: "read",
            prompt: "Say something about flow",
            targetMs: 40_000,
          },
        ],
      },
    })
  })

  it("keeps a shorter budget the primer asks for", () => {
    const reading = readPrimer(primer({ budgetSec: 90 }))
    expect(reading.ok && reading.primer.budgetMs).toBe(90_000)
  })

  it.each([
    ["not JSON", "{", "That file isn't JSON."],
    ["an array", "[]", "That file isn't a primer."],
    [
      "another version",
      primer({ version: 3 }),
      "That primer's version isn't one this app reads (1 or 2).",
    ],
    ["no title", primer({ title: " " }), "That primer has no title."],
    [
      "a budget past three minutes",
      primer({ budgetSec: 240 }),
      "budgetSec should be at most 180.",
    ],
    ["no cuts", primer({ cuts: [] }), "That primer has no cuts."],
    [
      "too many cuts",
      primer({ cuts: Array.from({ length: 13 }, (_, i) => cut(`c${i}`, 5)) }),
      "A primer has at most 12 cuts.",
    ],
    [
      "an id unfit for a file name",
      primer({ cuts: [cut("Gap One")] }),
      "Cut 1's id should be short, lowercase letters, digits or dashes.",
    ],
    [
      "a cut with no prompt",
      primer({ cuts: [cut("gap"), { ...cut("flow"), prompt: "" }] }),
      "Cut 2 has no prompt.",
    ],
    [
      "a cut with no artifact",
      primer({ cuts: [{ ...cut("gap"), artifact: 3 }] }),
      "Cut 1 has no artifact.",
    ],
    [
      "a target under three seconds",
      primer({ cuts: [cut("gap", 2)] }),
      "Cut 1's targetSec should be between 3 and 180.",
    ],
    [
      "a target past the budget",
      primer({ budgetSec: 60, cuts: [cut("gap", 61)] }),
      "Cut 1's targetSec should be between 3 and 60.",
    ],
    [
      "two cuts with one id",
      primer({ cuts: [cut("gap"), cut("gap")] }),
      'Two cuts share the id "gap".',
    ],
  ])("names what is wrong with %s", (_, source, problem) => {
    expect(readPrimer(source)).toEqual({ ok: false, problem })
  })
})

/** Playoff Delta's week 8, as PDM15 (#2230) asks for it: points to make, facts to keep. */
const WEEK_8 = {
  version: 2,
  title: "Playoff Delta, week 8",
  voice: "mixed",
  cuts: [
    {
      id: "open",
      artifact: "The week's title card",
      point: "This is the week following the model would have paid",
      line: "Week eight. Did following the model pay?",
      targetSec: 12,
    },
    {
      id: "path",
      artifact: "The path card",
      point: "Three of the four picks the model made came in",
      keep: ["3 of 4 picks hit", "the Lions were the miss"],
      targetSec: 45,
    },
    {
      id: "way-in",
      artifact: "The odds card",
      point: "There is still a way in for a team two games back",
      keep: ["two games back", "a 1 in 6 chance"],
      voice: "ad-lib",
      targetSec: 40,
    },
  ],
}

const v2 = (fields: Record<string, unknown> = {}): string =>
  JSON.stringify({ ...WEEK_8, ...fields })

const v2Cut = (fields: Record<string, unknown>): Record<string, unknown> => ({
  id: "c",
  artifact: "A card",
  point: "A point",
  targetSec: 10,
  ...fields,
})

describe("readPrimer, version 2", () => {
  it("reads Playoff Delta's week 8: points, lines where read, facts to keep", () => {
    const reading = readPrimer(v2())
    if (!reading.ok) throw new Error(reading.problem)
    expect(reading.primer.budgetMs).toBe(360_000)
    expect(reading.primer.voice).toBe("mixed")
    expect(
      reading.primer.cuts.map((c) => [c.id, c.voice, c.prompt, c.keep])
    ).toEqual([
      ["open", "read", "Week eight. Did following the model pay?", []],
      [
        "path",
        "ad-lib",
        "Three of the four picks the model made came in",
        ["3 of 4 picks hit", "the Lions were the miss"],
      ],
      [
        "way-in",
        "ad-lib",
        "There is still a way in for a team two games back",
        ["two games back", "a 1 in 6 chance"],
      ],
    ])
  })

  it("ad-libs by default, and reads every cut under a read plan", () => {
    const adLib = readPrimer(v2({ voice: undefined }))
    expect(adLib.ok && adLib.primer.cuts.map((c) => c.voice)).toEqual([
      "ad-lib",
      "ad-lib",
      "ad-lib",
    ])
    const read = readPrimer(
      v2({ voice: "read", cuts: [v2Cut({ line: "Read me." })] })
    )
    expect(read.ok && read.primer.cuts[0]?.prompt).toBe("Read me.")
  })

  it("runs up to six minutes and 24 cuts", () => {
    const cuts = Array.from({ length: 24 }, (_, i) =>
      v2Cut({ id: `c${i}`, targetSec: 15 })
    )
    expect(readPrimer(v2({ budgetSec: 360, cuts })).ok).toBe(true)
  })

  it.each([
    [
      "a budget past six minutes",
      v2({ budgetSec: 361 }),
      "budgetSec should be at most 360.",
    ],
    [
      "too many cuts",
      v2({
        cuts: Array.from({ length: 25 }, (_, i) => v2Cut({ id: `c${i}` })),
      }),
      "A primer has at most 24 cuts.",
    ],
    [
      "an unknown plan",
      v2({ voice: "sing" }),
      "The primer's voice should be ad-lib, read or mixed.",
    ],
    [
      "a cut with no point",
      v2({ cuts: [v2Cut({ point: " " })] }),
      "Cut 1 has no point.",
    ],
    [
      "a read cut with no line",
      v2({ cuts: [v2Cut({ voice: "read" })] }),
      "Cut 1 is read word for word but has no line.",
    ],
    [
      "an empty line",
      v2({ cuts: [v2Cut({ line: "" })] }),
      "Cut 1's line is empty.",
    ],
    [
      "a fact left blank",
      v2({ cuts: [v2Cut({ keep: ["3 of 4", ""] })] }),
      "Cut 1's keep should be a list of facts, each written out.",
    ],
    [
      "an unknown cut voice",
      v2({ cuts: [v2Cut({ voice: "mixed" })] }),
      "Cut 1's voice should be ad-lib or read.",
    ],
  ])("names what is wrong with %s", (_, source, problem) => {
    expect(readPrimer(source)).toEqual({ ok: false, problem })
  })
})
