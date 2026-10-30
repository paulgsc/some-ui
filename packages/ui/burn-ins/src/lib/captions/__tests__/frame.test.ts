/** @vitest-environment node */
import { frameAt, popLook } from "@burn-ins/lib/captions/frame"
import { THEMES, type CaptionTheme } from "@burn-ins/lib/captions/theme"
import { groupCaptions } from "@burn-ins/lib/captions/timing"
import { describe, expect, it } from "vitest"

import { byChars, word } from "./word"

// Two captions: "third and" (said 0 to 400, up until 900) and "eleven"
// (said 1000 to 1300, up until 1800).
const CAPTIONS = groupCaptions(
  [
    { words: [word("third", 0, 200), word("and", 250, 400)] },
    { words: [word("eleven", 1000, 1300)] },
  ],
  byChars(40)
)
const popping: CaptionTheme = THEMES.gridiron
const still: CaptionTheme = THEMES.broadcast

const states = (t: number, theme = popping): Array<string> | null => {
  const f = frameAt(CAPTIONS, theme, t)
  return f.caption === null ? null : f.rows.flat().map((w) => w.state)
}

describe("the frame at a time", () => {
  it("shows nothing before the first word and after the last caption", () => {
    expect(frameAt(CAPTIONS, popping, -1).caption).toBeNull()
    expect(frameAt(CAPTIONS, popping, 1800).caption).toBeNull()
    expect(frameAt([], popping, 0).caption).toBeNull()
  })

  it("changes caption exactly at the boundary", () => {
    expect(frameAt(CAPTIONS, popping, 899).caption).toBe(0)
    expect(frameAt(CAPTIONS, popping, 900).caption).toBeNull()
    expect(frameAt(CAPTIONS, popping, 1000).caption).toBe(1)
    expect(frameAt(CAPTIONS, popping, 1799).caption).toBe(1)
  })

  it("moves the highlight word by word, and holds it in the gap between words", () => {
    expect(states(0)).toEqual(["now", "ahead"])
    expect(states(220)).toEqual(["now", "ahead"])
    expect(states(250)).toEqual(["said", "now"])
    expect(states(850)).toEqual(["said", "now"])
  })

  it("pops each word in from when it is said, over the theme's duration", () => {
    const pops = (t: number): Array<number> => {
      const f = frameAt(CAPTIONS, popping, t)
      return f.caption === null ? [] : f.rows.flat().map((w) => w.pop)
    }
    expect(pops(0)).toEqual([0, 0])
    expect(pops(70)).toEqual([0.5, 0])
    expect(pops(250 + 140)).toEqual([1, 1])
  })

  it("shows the whole caption at once when the theme has no pop-in", () => {
    const f = frameAt(CAPTIONS, still, 0)
    expect(f.caption === null ? [] : f.rows.flat().map((w) => w.pop)).toEqual([
      1, 1,
    ])
  })
})

describe("a word's pop", () => {
  it("starts hidden and small, overshoots, and settles at full size", () => {
    expect(popLook(0).scale).toBeCloseTo(0.6)
    expect(popLook(0).opacity).toBe(0)
    expect(popLook(0.7).scale).toBeGreaterThan(1)
    expect(popLook(1)).toEqual({ scale: 1, opacity: 1 })
  })
})
