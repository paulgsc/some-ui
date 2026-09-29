import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import {
  fencedBodies,
  fixRequest,
  intakeRound,
} from "@leetype/lib/leetype/generation/intake"
import { serializeRound } from "@leetype/lib/leetype/round-export"
import type { Round } from "@leetype/types/authored-round"
import { describe, expect, it } from "vitest"

const ROUND = AUTHORED_ROUNDS[0]!
const reply = (body: string): string =>
  `Here is your round.\n\n\`\`\`json\n${body}\`\`\`\n\nEnjoy.`

/** `ROUND` with one diff option replaced; the rest untouched. */
function withOption(
  index: number,
  change: (option: Round["diffOptions"][number]) => Round["diffOptions"][number]
): Round {
  return {
    ...ROUND,
    diffOptions: ROUND.diffOptions.map((option, at) =>
      at === index ? change(option) : option
    ),
  }
}

describe("intakeRound", () => {
  it("accepts a reviewed round pasted inside prose and a fence", () => {
    const intake = intakeRound(reply(serializeRound(ROUND)))
    expect(intake.ok).toBe(true)
    if (!intake.ok) return
    expect(intake.round).toEqual(ROUND)
    expect(intake.assembled.initialState.phase).toBe("posingDiffSelection")
  })

  it("accepts bare JSON with no fence", () => {
    expect(intakeRound(serializeRound(ROUND)).ok).toBe(true)
  })

  it("normalizes a repetition whose factors are out of order, leaving the cost unchanged", () => {
    const reordered = withOption(0, (option) => {
      const graph = option.graph
      if (graph.kind !== "seq") throw new Error("fixture changed shape")
      return {
        ...option,
        graph: {
          ...graph,
          children: graph.children.map((child) =>
            child.kind === "loop"
              ? { ...child, repetition: [...child.repetition].reverse() }
              : child
          ),
        },
      }
    })
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(ROUND))
    const intake = intakeRound(reply(JSON.stringify(reordered)))
    expect(intake.ok).toBe(true)
    if (!intake.ok) return
    expect(intake.round).toEqual(ROUND)
  })

  it("refuses a reply with no round in it", () => {
    const intake = intakeRound("Sorry, I can't help with that.")
    expect(intake.ok).toBe(false)
    if (intake.ok) return
    expect(intake.violations[0]).toMatch(/No round found/)
  })

  it("refuses a round whose hunk does not apply to A, naming the member", () => {
    const shifted = withOption(1, (option) => ({
      ...option,
      member: {
        ...option.member,
        hunk: { ...option.member.hunk, oldStart: 2, newStart: 2 },
      },
    }))
    const intake = intakeRound(reply(JSON.stringify(shifted)))
    expect(intake.ok).toBe(false)
    if (intake.ok) return
    expect(
      intake.violations.some(
        (v) => v.includes("diff option 1") && v.includes("does not apply")
      )
    ).toBe(true)
  })

  it("refuses a round whose admissibility claims disagree with its cost graphs", () => {
    const swapped: Round = {
      ...ROUND,
      diffOptions: ROUND.diffOptions.map((option) => ({
        ...option,
        member: {
          ...option.member,
          admissible: !option.member.admissible,
          distractorStatement:
            option.member.distractorStatement ?? "A plausible rewrite.",
        },
      })),
    }
    const intake = intakeRound(reply(JSON.stringify(swapped)))
    expect(intake.ok).toBe(false)
  })
})

describe("fencedBodies", () => {
  it("reads ``` and ```json fences, and nothing outside them", () => {
    const text = "prose\n```json\n{}\n```\nmore prose\n```\n[]\n```\n"
    expect(fencedBodies(text)).toEqual(["{}\n", "[]\n"])
  })
})

describe("fixRequest", () => {
  it("lists every violation for the model", () => {
    const text = fixRequest(["one", "two"])
    expect(text).toContain("- one\n- two")
    expect(text).toContain("```json")
  })
})
