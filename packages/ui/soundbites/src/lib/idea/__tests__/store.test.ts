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

  it("keeps a sent bundle whole, its answers takes, and lets nothing about it change (ST26)", () => {
    const storage = inMemoryStorage()
    const store = keptIdeaStore(() => storage)
    const about = {
      title: "Two hearings",
      topic: "Studio",
      keywords: ["voice"],
      format: "short",
    } as const
    const bundle: Idea = {
      id: "idea-2",
      at: AT,
      questions: 1,
      answers: [
        { question: "what", versions: [], takes: [{ at: AT, take: "t1" }] },
      ],
      passed: ["takeaway", "spark", "picture"],
      about,
      sent: [AT],
    }
    expect(store.keep(() => [bundle])).toEqual([bundle])
    expect(keptIdeaStore(() => storage).list()).toEqual([bundle])
    const changed = (over: Partial<Idea>): ReadonlyArray<Idea> | null =>
      store.keep(() => [{ ...bundle, ...over }])
    expect(changed({ about: { ...about, title: "Another" } })).toBeNull()
    expect(changed({ sent: [] })).toBeNull()
    expect(
      changed({ answers: [{ question: "what", versions: [], takes: [] }] })
    ).toBeNull()
    // An answer with neither words nor a take is not one.
    expect(
      keptIdeaStore(() => inMemoryStorage()).keep(() => [
        { ...bundle, answers: [{ question: "what", versions: [] }] },
      ])
    ).toBeNull()
  })
})
