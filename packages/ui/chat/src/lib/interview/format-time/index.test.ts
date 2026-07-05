import { describe, expect, it } from "vitest"

import { formatTime } from "."

describe("formatTime - boundaries", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [59, "0:59"],
    [60, "1:00"],
    [61, "1:01"],
    [3599, "59:59"],
    [3600, "60:00"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatTime(seconds)).toBe(expected)
  })

  it("floors fractional seconds", () => {
    expect(formatTime(90.9)).toBe("1:30")
  })
})
