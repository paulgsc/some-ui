/**
 * SFEED6 (#2745): the fixed categories a note on an episode picks from, and
 * where each sends it.
 */
import {
  CATEGORIES,
  destinationOf,
  destinationsOf,
  SAID,
} from "@video-render/feedback"
import { describe, expect, it } from "vitest"

describe("where a note goes", () => {
  it("decision 10: the fixed set is decision 7's fourteen, each once", () => {
    expect(CATEGORIES).toHaveLength(14)
    expect(new Set(CATEGORIES).size).toBe(14)
  })

  it("what it said guides the next fill, a broken slide is a defect, the rest of the show the template's", () => {
    expect(
      Object.fromEntries(CATEGORIES.map((c) => [c, destinationOf(c)]))
    ).toEqual({
      ...Object.fromEntries(SAID.map((c) => [c, "nextFill"])),
      textClipped: "defect",
      slideShakes: "defect",
      overlap: "defect",
      hardToRead: "template",
      pacing: "template",
      voice: "template",
      musicLoud: "template",
      subtitlesOff: "template",
    })
  })

  it("lists each place once, in a fixed order", () => {
    expect(destinationsOf(["overlap", "pacing", "shallow", "tooLong"])).toEqual(
      ["nextFill", "template", "defect"]
    )
    expect(destinationsOf([])).toEqual([])
  })
})
