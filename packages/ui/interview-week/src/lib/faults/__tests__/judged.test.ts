import { JudgedAnswerSchema } from "@interview-week/lib/faults"
import { describe, expect, it } from "vitest"

const part = (quote: string): { mark: string; quote: string } => ({
  mark: "covered",
  quote,
})
const missing = { mark: "missing", quote: null }

const answer = {
  star: {
    situation: part("we were losing takes"),
    task: part("I had to keep them"),
    action: { mark: "partly", quote: "I moved them home" },
    result: missing,
  },
  hedges: ["I think maybe"],
  decision: null,
}

describe("JudgedAnswerSchema", () => {
  it("holds a behavioural answer", () => {
    expect(JudgedAnswerSchema.safeParse(answer).success).toBe(true)
  })

  it("holds a decision answer", () => {
    const decision = {
      options: ["keep it on the phone", "send it home"],
      why: part("home is mine"),
      tradeOff: { mark: "partly", quote: "it needs the network" },
      undo: missing,
    }
    expect(JudgedAnswerSchema.safeParse({ ...answer, decision }).success).toBe(
      true
    )
  })

  it.each([
    {
      name: "a missing part with a quote",
      result: { mark: "missing", quote: "x" },
    },
    {
      name: "a covered part with no quote",
      result: { mark: "covered", quote: null },
    },
  ])("refuses $name", ({ result }) => {
    expect(
      JudgedAnswerSchema.safeParse({
        ...answer,
        star: { ...answer.star, result },
      }).success
    ).toBe(false)
  })
})
