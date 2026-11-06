/**
 * The weekly call's facts read a pull request's or an epic's body by its
 * sections, as the PR template and the epics write them: "Calls I made"
 * unless it says none, the change kind, and an epic's "Where we are", whose
 * heading may carry a date; and a commit's promise trailers.
 */
import {
  callsOf,
  changeKindOf,
  sectionOf,
  trailersOf,
  whereWeAreOf,
} from "@video-render/call-facts"
import { describe, expect, it } from "vitest"

const pr = [
  "## Description",
  "",
  "Adds the thing.",
  "",
  "## Calls I made",
  "",
  "- Kept it in video-render. To undo, move it.",
  "",
  "## Change kind",
  "",
  "`defect`: a promise broke.",
].join("\n")

describe("a pull request's body", () => {
  it("gives its calls and its change kind", () => {
    expect(callsOf(pr)).toBe("- Kept it in video-render. To undo, move it.")
    expect(changeKindOf(pr)).toBe("defect")
  })

  it("gives no calls where it says none or has no such section", () => {
    expect(callsOf("## Calls I made\n\nNone: nothing to decide.")).toBeNull()
    expect(callsOf("## Calls I made\n\n- None.")).toBeNull()
    expect(callsOf("## Description\n\nx")).toBeNull()
    expect(changeKindOf("no sections")).toBeNull()
  })
})

describe("an epic's body", () => {
  it("gives its Where we are, under a heading that carries a date", () => {
    const epic =
      "intro\n\n## Where we are (2026-11-04)\n\nNow: a.\n\n### Log\n\nb\n\n## Stories\n\nc"
    expect(whereWeAreOf(epic)).toBe("Now: a.\n\n### Log\n\nb")
    expect(sectionOf("## Where we arena\n\nx", "Where we are")).toBeNull()
    expect(whereWeAreOf(`## Where we are\n\n${"x".repeat(10)}`, 4)).toBe(
      "xxxx…"
    )
  })
})

it("reads a commit's promise trailers in order", () => {
  expect(
    trailersOf(
      "fix: x\n\nbody\n\nChange-Kind: defect\nPromise: SS2 a | b\nRelates: SS1 widens\nCo-Authored-By: c"
    )
  ).toEqual(["Promise: SS2 a | b", "Relates: SS1 widens"])
})
