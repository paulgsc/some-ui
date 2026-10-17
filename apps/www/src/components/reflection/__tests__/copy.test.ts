import { describe, expect, it } from "vitest"

import { goingOut } from "@/components/reflection/copy"

describe("goingOut", () => {
  it("names what a hand-off lets go, and nothing when nothing went out", () => {
    expect(goingOut(3, 1, 0)).toBe("3 reflections and 1 soundbite")
    expect(goingOut(0, 2, 0)).toBe("2 soundbites")
    expect(goingOut(1, 0, 0)).toBe("1 reflection")
    expect(goingOut(0, 0, 0)).toBe("")
    expect(goingOut(2, 1, 8)).toBe(
      "2 reflections, 1 soundbite and 8 grammar-lens answers"
    )
    expect(goingOut(0, 0, 1)).toBe("1 grammar-lens answer")
  })
})
