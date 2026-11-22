/** @vitest-environment node */
import { describe, expect, it } from "vitest"

import { DOT_MEANINGS, dotClass } from "."

describe("a dot's colour means one thing on every screen", () => {
  it("gives each meaning its own token", () => {
    const hues = DOT_MEANINGS.map(dotClass)
    expect(new Set(hues).size).toBe(hues.length)
  })

  it("gives sky to on home and to nothing else", () => {
    const sky = DOT_MEANINGS.filter(
      (meaning) => dotClass(meaning) === "bg-chart-2"
    )
    expect(sky).toEqual(["home"])
  })
})
