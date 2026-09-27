import type { TopikMetadata } from "@topik/lib/topik"
import type { SurveyReport } from "@topik/lib/topik/core/lesson-survey"
import { describe, expect, it } from "vitest"

import {
  heldLevel,
  normalizeRelation,
  orderLessons,
  probeRelations,
  topikLevelOf,
} from "."

const lesson = (
  key: string,
  level: number | null,
  size: number,
  relations: Array<string> = []
): TopikMetadata => ({
  key,
  displayName: key,
  description: "",
  batchCount: 3,
  totalQuestions: size,
  totalMessages: size * 4,
  tags: [
    ...(level === null ? [] : [`topik-${level}`]),
    "makjang",
    ...relations.map((relation) => `relation:${relation}`),
  ],
})

const report = (partial: Partial<SurveyReport>): SurveyReport => ({
  topikKey: "played",
  at: 1,
  stuck: [],
  ...partial,
})

const keys = (items: Array<{ item: TopikMetadata }>): Array<string> =>
  items.map((entry) => entry.item.key)

describe("orderLessons (canon Rem. 3.5)", () => {
  const batch = [
    lesson("big", 2, 9),
    lesson("small", 2, 3),
    lesson("connective", 2, 6, ["reason connective"]),
    lesson("other-level", 3, 1),
    lesson("any-level", null, 1),
  ]

  it("keeps the served order when the reports have nothing to say", () => {
    expect(keys(orderLessons(batch, [], 2))).toEqual([
      "big",
      "small",
      "connective",
      "any-level",
    ])
  })

  it("never returns another level's lessons, and puts level-less ones last", () => {
    const order = keys(orderLessons(batch, [], 3))
    expect(order).toEqual(["other-level", "any-level"])
  })

  it("brings back what blocked the learner, and says so", () => {
    const [first] = orderLessons(
      batch,
      [
        report({
          stuck: [
            {
              batchId: 1,
              probeId: "p",
              relations: ["Reason  Connective"],
            },
          ],
        }),
      ],
      2
    )
    expect(first?.item.key).toBe("connective")
    expect(first?.reasons).toContainEqual({
      kind: "brings-back",
      relations: ["reason connective"],
    })
  })

  it("puts smaller lessons first after 'too hard', larger after 'too easy'", () => {
    expect(
      keys(orderLessons(batch, [report({ difficulty: "too-hard" })], 2))
    ).toEqual(["small", "connective", "big", "any-level"])
    expect(
      keys(orderLessons(batch, [report({ difficulty: "too-easy" })], 2))
    ).toEqual(["big", "connective", "small", "any-level"])
  })

  it("lets running out of steam outrank 'too easy'", () => {
    const [first] = orderLessons(
      batch,
      [report({ difficulty: "too-easy", enthusiasm: "drained" })],
      2
    )
    expect(first?.item.key).toBe("small")
    expect(first?.reasons).toContainEqual({
      kind: "smaller",
      because: "drained",
    })
  })

  it("orders a lesson just reported on later, but never drops it", () => {
    const order = orderLessons(batch, [report({ topikKey: "big" })], 2)
    expect(keys(order)).toEqual(["small", "connective", "big", "any-level"])
    expect(order.find((entry) => entry.item.key === "big")?.recent).toBe(true)
  })

  it("is steered by the recent reports only: the delta, not the path", () => {
    const old = report({
      stuck: [{ batchId: 1, probeId: "p", relations: ["reason connective"] }],
    })
    const quiet = report({ worthwhile: "yes" })
    expect(keys(orderLessons(batch, [quiet, quiet, quiet, old], 2))[0]).toBe(
      "big"
    )
  })
})

describe("the level the learner holds", () => {
  it("comes from the last report, then the last lesson left, then 1", () => {
    expect(heldLevel([report({ level: 4 })], lesson("x", 2, 1))).toBe(4)
    expect(heldLevel([report({})], lesson("x", 2, 1))).toBe(2)
    expect(heldLevel([])).toBe(1)
  })

  it("reads a level tag and nothing else", () => {
    expect(topikLevelOf(["makjang", "topik-5"])).toBe(5)
    expect(topikLevelOf(["topik-7", "topik-"])).toBeUndefined()
  })
})

describe("probeRelations", () => {
  it("lists every relation a choice probe's options stand in, never the gloss", () => {
    expect(
      probeRelations({
        id: "p",
        kind: "odd-one-out",
        order: 2,
        prompt: "?",
        options: [
          { text: "a", relation: "Past", valid: true, why: "" },
          { text: "b", relation: "past", valid: true, why: "" },
          { text: "c", relation: "gloss", valid: false, why: "" },
          { text: "d", relation: "negation", valid: false, why: "" },
        ],
      })
    ).toEqual(["past", "negation"])
    expect(normalizeRelation("  Reason   connective ")).toBe(
      "reason connective"
    )
  })
})
