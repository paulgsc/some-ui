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
        cuts: [
          {
            id: "gap",
            artifact: "Artifact gap",
            prompt: "Say something about gap",
            targetMs: 25_000,
          },
          {
            id: "flow",
            artifact: "Artifact flow",
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
      primer({ version: 2 }),
      "That primer's version isn't one this app reads (1).",
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
