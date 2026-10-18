import { describe, expect, it } from "vitest"

import { fnv1a, initial, tone } from "./plate"

describe("fnv1a", () => {
  it("matches the reference vectors", () => {
    expect(fnv1a("")).toBe(0x811c9dc5)
    expect(fnv1a("a")).toBe(0xe40c292c)
    expect(fnv1a("foobar")).toBe(0xbf9cf968)
  })
})

describe("tone", () => {
  it("is stable per id and stays inside its bounds", () => {
    for (let i = 0; i < 2000; i++) {
      const id = `vid_${i.toString(36)}`
      const value = tone(id)
      expect(tone(id)).toBe(value)
      const [, h, s, l] = /^hsl\((\d+) (\d+)% (\d+)%\)$/.exec(value) ?? []
      expect(Number(h)).toBeLessThan(360)
      expect(Number(s)).toBeGreaterThanOrEqual(10)
      expect(Number(s)).toBeLessThanOrEqual(17)
      expect(Number(l)).toBeGreaterThanOrEqual(17)
      expect(Number(l)).toBeLessThanOrEqual(22)
    }
  })

  it("differs between neighbouring ids", () => {
    expect(tone("dQw4w9WgXcQ")).not.toBe(tone("dQw4w9WgXcR"))
  })
})

describe("initial", () => {
  it.each([
    ["《Lost Summer》", "L"],
    ["@handle", "H"],
    ["3Blue1Brown", "3"],
    ["…한국", "한"],
    ["", ""],
    ["!!!", ""],
    [null, ""],
  ])("reads %j as %j", (name, letter) => {
    expect(initial(name)).toBe(letter)
  })
})
