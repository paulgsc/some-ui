/**
 * The weekly call's facts read a pull request's or an epic's body by its
 * sections, outside fenced code, as the PR template and the epics write
 * them: "Calls I made" unless it says none, and an epic's "Where we are",
 * whose heading may carry a date; and a squash commit's change kind and
 * promise trailers.
 */
import {
  callsOf,
  changeOf,
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
  "`story` (the user story moved) or `defect`, as in every commit's trailer.",
  "",
  "`defect`",
].join("\n")

describe("a pull request's body", () => {
  it("gives its calls", () => {
    expect(callsOf(pr)).toBe("- Kept it in video-render. To undo, move it.")
  })

  it("reads a section past a fenced block, never a heading inside one", () => {
    const fenced =
      "## Calls I made\n\n```sh\n# install\n## Calls I made\n```\n\nKept it.\n\n## Next"
    expect(callsOf(fenced)).toBe(
      "```sh\n# install\n## Calls I made\n```\n\nKept it."
    )
    expect(sectionOf("```\n## Calls I made\nx\n```", "Calls I made")).toBeNull()
  })

  it("gives no calls where it says none, only the template's guidance, or has no such section", () => {
    for (const none of [
      "None: nothing to decide.",
      "- None.",
      "**None.**",
      "<!-- guidance -->\nNone.",
      "<!-- guidance -->",
    ])
      expect(callsOf(`## Calls I made\n\n${none}`)).toBeNull()
    expect(callsOf("## Description\n\nx")).toBeNull()
    expect(
      callsOf("## Calls I made\n\n- Kept it.\n<!-- unclosed guidance")
    ).toBe("- Kept it.")
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

it("reads a squash commit's change kind and the pull request it closes", () => {
  const squash = (kinds: Array<string>): string =>
    [
      "feat(x): y (#2624)",
      "",
      "* a",
      "",
      ...kinds.map((k) => `Change-Kind: ${k}`),
    ].join("\n")
  expect(changeOf(squash(["story"]))).toEqual({ pull: 2624, change: "story" })
  expect(changeOf(squash(["story", "defect"]))).toEqual({
    pull: 2624,
    change: "defect",
  })
  expect(changeOf(squash([]))).toBeNull()
  expect(changeOf("feat: no number\n\nChange-Kind: story")).toBeNull()
})

it("reads a commit's promise trailers in order", () => {
  expect(
    trailersOf(
      "fix: x\n\nbody\n\nChange-Kind: defect\nPromise: SS2 a | b\nRelates: SS1 widens\nCo-Authored-By: c"
    )
  ).toEqual(["Promise: SS2 a | b", "Relates: SS1 widens"])
})
