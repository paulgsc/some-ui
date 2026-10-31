/** @vitest-environment node */
import { inMemoryStorage } from "@some-ui/core-utils"
import type { Idea } from "@soundbites/lib/idea/model"
import {
  newIdea,
  withAside,
  withReply,
  withWords,
} from "@soundbites/lib/idea/model"
import { keptIdeaStore } from "@soundbites/lib/idea/store"
import { describe, expect, it } from "vitest"

const AT = "2026-10-30T10:00:00.000Z"
const IDEA: Idea = newIdea("idea-1", AT, "what", [
  { at: AT, how: "heard", words: "a short" },
])

describe("the idea store", () => {
  it("refuses a change that lets anything go", () => {
    const storage = inMemoryStorage()
    const store = keptIdeaStore(() => storage)
    store.keep(() => [IDEA])
    expect(store.keep(() => [])).toBeNull()
    expect(store.keep(() => [{ ...IDEA, answers: [] }])).toBeNull()
    expect(
      store.keep((ideas) =>
        ideas.map((idea) =>
          withWords(idea, "what", [{ at: AT, how: "fixed", words: "a sport" }])
        )
      )?.[0]?.answers[0]?.versions
    ).toHaveLength(2)
  })

  it("keeps Claude's questions and scenes, and a mark setting it aside, and lets none go (ST19)", () => {
    const storage = inMemoryStorage()
    const store = keptIdeaStore(() => storage)
    store.keep(() => [IDEA])
    const primer = {
      title: "A short",
      budgetMs: 360_000,
      voice: "ad-lib" as const,
      cuts: [
        {
          id: "a",
          artifact: "Card",
          point: "The point",
          line: null,
          keep: [],
          voice: "ad-lib" as const,
          prompt: "The point",
          targetMs: 10_000,
          from: ["what"],
        },
      ],
    }
    const grown = store.keep((ideas) =>
      ideas.map((idea) =>
        withAside(
          withReply(idea, { primer, ask: ["Why?"] }, AT) ?? idea,
          true,
          AT
        )
      )
    )
    expect(grown?.[0]?.drafts?.[0]?.primer.idea).toBe("idea-1")
    // Read back whole from what was written.
    expect(keptIdeaStore(() => storage).list()).toEqual(grown)
    expect(
      store.keep((ideas) => ideas.map(({ drafts: _, ...idea }) => idea))
    ).toBeNull()
    expect(
      store.keep((ideas) => ideas.map((idea) => ({ ...idea, shelved: [] })))
    ).toBeNull()
  })
})
