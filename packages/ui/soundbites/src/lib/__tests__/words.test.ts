// @vitest-environment node
import { bite } from "@soundbites/lib/__tests__/fixture"
import { replacedBy, SOUNDBITE_WORDS } from "@soundbites/lib/words"
import { describe, expect, it } from "vitest"

describe("the page's words about the cap", () => {
  it("say why the next one replaces that one: the pick, or its standing", () => {
    const one = bite("a", 5)
    expect(replacedBy(one, "a")).toBe("picked")
    expect(replacedBy(one, null)).toBe("current")
    expect(replacedBy({ ...one, standing: "set-aside" }, null)).toBe(
      "set-aside"
    )
    expect(replacedBy({ ...one, standing: "earlier" }, "b")).toBe("earlier")
    expect(SOUNDBITE_WORDS.whichGoes.picked).toBe("")
  })

  it("say nothing of the machinery", () => {
    const lines = [
      SOUNDBITE_WORDS.fullReplaces,
      ...Object.values(SOUNDBITE_WORDS.whichGoes),
      SOUNDBITE_WORDS.pickAnother,
      SOUNDBITE_WORDS.fullNoneHeld,
      SOUNDBITE_WORDS.unreadable,
    ]
    expect(
      lines.filter((line) => /standing|set-aside|supersede|current/.test(line))
    ).toEqual([])
  })
})
