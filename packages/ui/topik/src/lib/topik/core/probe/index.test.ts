import type { Message, ProbeOption } from "@topik/lib/topik"
import { describe, expect, it } from "vitest"

import type { ChoiceProbe } from "."
import {
  acceptedForms,
  anchorOf,
  isCorrectChoice,
  orderedOptions,
  relationLabel,
  showsRelations,
} from "."

const option = (
  text: string,
  valid: boolean,
  relation: ProbeOption["relation"] = "past"
): ProbeOption => ({ text, valid, relation, why: "" })

const odd: ChoiceProbe = {
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
    const pick: ChoiceProbe = {
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

  it("shows relation chips on an odd-one-out only, where the chip is the claim", () => {
    expect(showsRelations(odd)).toBe(true)
    expect(showsRelations({ ...odd, kind: "pick-valid" })).toBe(false)
  })

  it("labels relations, honouring an authored override", () => {
    expect(relationLabel("negation")).toBe("Negation")
    expect(relationLabel("register", "Politer")).toBe("Politer")
  })

  it("shows any other relation as its author named it (canon Rem. 4.8)", () => {
    expect(relationLabel("Reason: -아서 → -(으)니까")).toBe(
      "Reason: -아서 → -(으)니까"
    )
  })

  it("lists a build probe's accepted forms, target first, without repeats", () => {
    expect(
      acceptedForms({
        id: "b",
        kind: "build",
        order: 2,
        prompt: "",
        relation: "negation",
        target: "포장하지 마세요",
        acceptedAnswers: ["포장하지 마세요", "포장하지 마세요."],
      })
    ).toEqual(["포장하지 마세요", "포장하지 마세요."])
  })
})

describe("anchorOf", () => {
  const message = (id: string, korean: string): Message => ({
    id,
    role: "assistant",
    content: korean,
    timestamp: "00:00",
    korean,
    english: `gloss of ${id}`,
  })
  const messages = [
    message("m1", "안녕하세요, 저는 민수예요."),
    message("m2", "오늘 날씨가 정말 좋네요."),
    message("m3", "같이 산책할까요?"),
  ]

  it("prefers a declared anchor, then containment, then the last line", () => {
    expect(anchorOf({ anchorMessageId: "m1" }, messages)).toBe(0)
    expect(anchorOf({ excerpt: "날씨가 정말 좋네요" }, messages)).toBe(1)
    expect(anchorOf({ excerpt: "unrelated" }, messages)).toBe(2)
  })

  it("ignores a declared anchor that no longer resolves", () => {
    expect(
      anchorOf(
        { anchorMessageId: "gone", excerpt: "같이 산책할까요" },
        messages
      )
    ).toBe(2)
  })
})
