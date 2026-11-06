// @vitest-environment node
import { bite } from "@soundbites/lib/memory-store"
import { replacedBy, SOUNDBITE_WORDS } from "@soundbites/lib/words"
import { describe, expect, it } from "vitest"

describe("the page's words about the cap", () => {
  it("say why the next one replaces that one: its standing", () => {
    const one = bite("a", 5)
    expect(replacedBy(one)).toBe("current")
    expect(replacedBy({ ...one, standing: "set-aside" })).toBe("set-aside")
    expect(replacedBy({ ...one, standing: "earlier" })).toBe("earlier")
  })

  it("say nothing of the machinery", () => {
    const lines = [
      SOUNDBITE_WORDS.fullReplaces,
      ...Object.values(SOUNDBITE_WORDS.whichGoes),
      SOUNDBITE_WORDS.fullNoneHeld,
      SOUNDBITE_WORDS.unreadable,
    ]
    expect(
      lines.filter((line) => /standing|set-aside|supersede|current/.test(line))
    ).toEqual([])
  })
})
