/** @vitest-environment node */
import { plan, PRIMER } from "@soundbites/lib/journal/__tests__/fixture"
import { upgraded } from "@soundbites/lib/journal/store"
import { describe, expect, it } from "vitest"

describe("a plan kept before primer version 2", () => {
  it("opens with its cuts read as the version 1 cuts they were", () => {
    const kept = plan()
    // As the phone stored it: cuts with only a prompt, no voice anywhere.
    const before = {
      ...kept,
      primer: {
        title: kept.primer.title,
        budgetMs: kept.primer.budgetMs,
        cuts: kept.primer.cuts.map(({ id, artifact, prompt, targetMs }) => ({
          id,
          artifact,
          prompt,
          targetMs,
        })),
      },
    }
    expect(upgraded(before).primer).toEqual(PRIMER)
  })

  it("leaves a plan from version 2 as it is", () => {
    const kept = plan()
    expect(upgraded(kept)).toEqual(kept)
  })
})
