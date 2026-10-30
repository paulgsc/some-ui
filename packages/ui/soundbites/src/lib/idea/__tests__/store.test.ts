/** @vitest-environment node */
import { inMemoryStorage } from "@some-ui/core-utils"
import type { Idea } from "@soundbites/lib/idea/model"
import { newIdea, withWords } from "@soundbites/lib/idea/model"
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
})
