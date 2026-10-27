import type { Probe, ProbeOption } from "@topik/lib/topik/entity/topik-types"
import { describe, expect, it } from "vitest"

import { isCorrectChoice, orderedOptions } from "."

const option = (
  text: string,
  valid: boolean,
  relation: ProbeOption["relation"] = "past"
): ProbeOption => ({ text, valid, relation, why: "" })

const odd: Probe = {
  id: "o",
  kind: "odd-one-out",
  order: 2,
  prompt: "Which is NOT valid?",
  options: [
    option("가사가 예뻤어요", true, "past"),
    option("가사가 안 예뻐요", true, "negation"),
    option("가사가 예뻐요?", true, "question"),
    option("가사가 예뻐겠어요", false, "future"),
  ],
}

describe("probe grading", () => {
  it("answers an odd-one-out with its one invalid candidate", () => {
    expect(isCorrectChoice(odd, odd.options[3]!)).toBe(true)
    expect(isCorrectChoice(odd, odd.options[0]!)).toBe(false)
  })

  it("answers a pick-valid with its one valid candidate", () => {
    const pick: Probe = {
      ...odd,
      kind: "pick-valid",
      options: [option("a", true), option("b", false)],
    }
    expect(isCorrectChoice(pick, pick.options[0]!)).toBe(true)
    expect(isCorrectChoice(pick, pick.options[1]!)).toBe(false)
  })
})

describe("probe presentation", () => {
  it("orders options by seed, stably, and keeps every option", () => {
    const a = orderedOptions(odd, "seed")
    expect(orderedOptions(odd, "seed")).toEqual(a)
    expect([...a].sort((x, y) => x.text.localeCompare(y.text))).toEqual(
      [...odd.options].sort((x, y) => x.text.localeCompare(y.text))
    )
  })
})
