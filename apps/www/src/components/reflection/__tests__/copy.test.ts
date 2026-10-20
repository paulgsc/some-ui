import { describe, expect, it } from "vitest"

import { goingOut } from "@/components/reflection/copy"

describe("goingOut", () => {
  it("names what a hand-off lets go, and nothing when nothing went out", () => {
    const none = {
      reflections: 0,
      soundbites: 0,
      lensAnswers: 0,
      lensTakes: 0,
      leetypeAnswers: 0,
      leetypeTakes: 0,
    }
    expect(goingOut({ ...none, reflections: 3, soundbites: 1 })).toBe(
      "3 reflections and 1 soundbite"
    )
    expect(goingOut({ ...none, soundbites: 2 })).toBe("2 soundbites")
    expect(goingOut({ ...none, reflections: 1 })).toBe("1 reflection")
    expect(goingOut(none)).toBe("")
    expect(
      goingOut({
        ...none,
        reflections: 2,
        soundbites: 1,
        lensAnswers: 8,
        lensTakes: 1,
      })
    ).toBe(
      "2 reflections, 1 soundbite, 8 grammar-lens answers and 1 grammar-lens take"
    )
    // LeetType's answers alone still ask, so they are let go once they arrive.
    expect(goingOut({ ...none, leetypeAnswers: 3, leetypeTakes: 2 })).toBe(
      "3 LeetType answers and 2 LeetType takes"
    )
  })
})
