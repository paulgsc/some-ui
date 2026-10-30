// @vitest-environment node
import type { ViewState } from "@censor/lib/content/fsm"
import type { VideoId } from "@censor/types/ids"
import { asVideoId } from "@censor/types/ids"
import { describe, expect, it } from "vitest"

import type { CourseInput, RowMark } from "./course"
import { courseOf, goesOn } from "./course"

type Kind = ViewState["kind"]

/**
 * A playlist as a string: one letter per row, its view. `p` plated, `w`
 * whole, `a` absent, `-` no card. Row `i` is the video `v<i>`.
 */
function course(
  rows: string,
  now: number,
  overrides: Partial<CourseInput> = {}
): Array<string> {
  const ids = [...rows].map((_, i) => asVideoId(`v${i}`))
  const views = new Map<VideoId, Kind>()
  ;[...rows].forEach((c, i) => {
    const id = ids[i]
    if (id === undefined) return
    if (c === "p") views.set(id, "plated")
    if (c === "w") views.set(id, "whole")
    if (c === "a") views.set(id, "absent")
  })
  const marks = courseOf({
    rows: ids,
    own: ids[now] ?? null,
    ownWhole: rows[now] === "w",
    view: (id) => views.get(id) ?? null,
    fromMusic: "admitted",
    autoplay: "stop",
    played: [],
    ...overrides,
  })
  return marks.map(show)
}

/** A mark as a word, `!` after it when autoplay stops there. */
function show(mark: RowMark | null): string {
  return mark === null ? "." : `${mark.place}${mark.stop ? "!" : ""}`
}

describe("goesOn", () => {
  it("lets autoplay into a plated or whole video, and only whole in the lane", () => {
    expect(goesOn(false, "plated")).toBe(true)
    expect(goesOn(false, "whole")).toBe(true)
    expect(goesOn(false, "absent")).toBe(false)
    expect(goesOn(false, null)).toBe(false)
    expect(goesOn(true, "whole")).toBe(true)
    expect(goesOn(true, "plated")).toBe(false)
  })
})

describe("courseOf (R12)", () => {
  it("marks what played, what plays, and what comes next", () => {
    expect(course("pppp", 1)).toEqual(["played", "now", "next", "ahead"])
  })

  it("marks nothing when the page's video is not in the list", () => {
    expect(course("ppp", 1, { own: null })).toEqual([".", ".", "."])
    expect(course("ppp", 1, { own: asVideoId("elsewhere") })).toEqual([
      ".",
      ".",
      ".",
    ])
  })

  it("leaves a held row and a row with no card unmarked", () => {
    expect(course("a-ppp", 2)).toEqual([".", ".", "now", "next", "ahead"])
  })

  it("stops under Stop before a held row, and goes on from the next shown row", () => {
    // v2 is held: autoplay stops after v1, and the owner starts v3.
    expect(course("ppapp", 1)).toEqual([
      "played",
      "now!",
      ".",
      "ahead",
      "ahead",
    ])
    // Every stop ahead is marked, not only the first.
    expect(course("ppppapp", 1)).toEqual([
      "played",
      "now",
      "next",
      "ahead!",
      ".",
      "ahead",
      "ahead",
    ])
  })

  it("skips a held row under Skip, so nothing stops", () => {
    expect(course("ppapp", 1, { autoplay: "skip" })).toEqual([
      "played",
      "now",
      ".",
      "next",
      "ahead",
    ])
  })

  it("stops under Skip when no later row is admitted", () => {
    expect(course("ppaa", 1, { autoplay: "skip" })).toEqual([
      "played",
      "now!",
      ".",
      ".",
    ])
  })

  it("marks no stop at the last row loaded: a Mix loads more behind it", () => {
    expect(course("ppp", 2)).toEqual(["played", "played", "now"])
    expect(course("ppp", 1)).toEqual(["played", "now", "next"])
  })

  it("keeps autoplay from a whole video in the lane under Strict", () => {
    const strict = { fromMusic: "music" } as const
    // From whole v0, plated v1 is not admitted: autoplay stops.
    expect(course("wpw", 0, strict)).toEqual(["now!", "ahead", "ahead"])
    // Under Skip it goes past the plated row to the whole one.
    expect(course("wpw", 0, { ...strict, autoplay: "skip" })).toEqual([
      "now",
      "passed",
      "next",
    ])
    // From a plated row, anything admitted is.
    expect(course("pww", 0, strict)).toEqual(["now", "next", "ahead"])
  })

  it("never has Skip go back to a video this tab played", () => {
    expect(
      course("ppap", 1, { autoplay: "skip", played: [asVideoId("v3")] })
    ).toEqual(["played", "now!", ".", "ahead"])
  })

  it("plays a repeated video's last row, as Skip reads it", () => {
    const ids = ["x", "y", "x", "z"].map(asVideoId)
    const marks = courseOf({
      rows: ids,
      own: asVideoId("x"),
      ownWhole: false,
      view: () => "plated",
      fromMusic: "admitted",
      autoplay: "stop",
      played: [],
    }).map(show)
    expect(marks).toEqual(["played", "played", "now", "next"])
  })
})
