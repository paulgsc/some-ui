import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import {
  buildRoundPrompt,
  MAX_MEMBERS,
  ROUND_PROMPT,
} from "@leetype/lib/leetype/generation"
import type { RoundNote } from "@leetype/lib/leetype/notes"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import { serializeRound } from "@leetype/lib/leetype/round-export"
import { describe, expect, it } from "vitest"

const NOTE: RoundNote = {
  id: "n-1",
  at: "2026-10-03T12:00:00.000Z",
  kind: "unclear",
  text: 'what is "admissible" here?',
  spoken: true,
  anchor: {
    roundId: "count-present-sorted-lookup",
    own: false,
    artifact: "diffSet",
    picked: null,
    committed: false,
    sessionId: "s-1",
  },
}

describe("buildRoundPrompt", () => {
  it("carries the prompt, every active register entry and a reviewed example", () => {
    const prompt = buildRoundPrompt()
    expect(prompt.startsWith(ROUND_PROMPT.trimEnd())).toBe(true)
    for (const entry of Object.values(PROPOSITION_REGISTER)) {
      if (entry.status === "active") expect(prompt).toContain(`**${entry.id}:`)
    }
    expect(prompt).toContain(serializeRound(AUTHORED_ROUNDS[0]!).trimEnd())
  })

  it("states the request, clamping members to what a phone presents", () => {
    const prompt = buildRoundPrompt({
      focus: "CW-P7",
      premise: "  pairs that sum to k ",
      members: 9,
      recent: ["a", "b"],
    })
    expect(prompt).toContain("Focus: CW-P7")
    expect(prompt).toContain("Premise: pairs that sum to k")
    expect(prompt).toContain(`Members: ${MAX_MEMBERS}`)
    expect(prompt).toContain("Recent rounds (newest first): a, b")
  })

  it("carries the learner's notes, quoted, with where they were raised", () => {
    const prompt = buildRoundPrompt({ notes: [NOTE] })
    expect(prompt).toContain("Learner notes (newest first):")
    expect(prompt).toContain(
      `- On the rewrites of round \`count-present-sorted-lookup\`, before answering, the learner could not tell what was being asked: "what is 'admissible' here?"`
    )
    expect(buildRoundPrompt()).toContain("Learner notes: none.")
  })

  it("names no learner history for the operator's corpus rounds", () => {
    const prompt = buildRoundPrompt({
      audience: "corpus",
      recent: ["a"],
      notes: [NOTE],
    })
    expect(prompt).toContain("joins the shared corpus")
    expect(prompt).not.toContain("Recent rounds (newest first)")
    expect(prompt).not.toContain("Learner notes (newest first)")
  })
})
