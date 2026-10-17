import DECK_PROMPT from "@topik/lib/topik/read-aloud/deck-prompt.md?raw"
import { MISTAKES } from "@topik/lib/topik/read-aloud/mistakes"
import { describe, expect, it } from "vitest"

describe("the mistake catalogue", () => {
  it("is the one the deck prompt offers a model, entry for entry", () => {
    const lens = DECK_PROMPT.slice(
      DECK_PROMPT.indexOf("## The lens"),
      DECK_PROMPT.indexOf("## Before you answer")
    )
    const offered = Object.fromEntries(
      Array.from(lens.matchAll(/^\| `([a-z-]+)` +\| ([^|]+?) +\|/gm), (m) => [
        m[1],
        m[2],
      ])
    )
    delete offered.mistake
    const named = Object.fromEntries(
      Object.entries(MISTAKES).map(([id, { name }]) => [id, name])
    )
    expect(offered).toEqual(named)
  })
})
