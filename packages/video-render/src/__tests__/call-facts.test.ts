/**
 * The weekly call's facts read a pull request's or an epic's body by its
 * sections, outside fenced code, as the PR template and the epics write
 * them: an epic's "Where we are", whose heading may carry a date; the
 * week's calls from the calls record (ST37); and a squash commit's change
 * kind and promise trailers.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  callsOfWeek,
  changeOf,
  sectionOf,
  trailersOf,
  whereWeAreOf,
} from "@video-render/call-facts"
import { describe, expect, it } from "vitest"

const record = (calls: Array<Record<string, unknown>>): string =>
  JSON.stringify({ schema: "some-ui.calls/1", calls })

describe("the calls record", () => {
  const calls = [
    { id: "C1", made: "2026-11-05", by: "claude", chose: "An icon." },
    { id: "C2", made: "2026-11-06", by: "owner", chose: "Top." },
    { id: "C3", made: "2026-10-30", by: "claude", agreed: "2026-11-12" },
    { id: "C4", made: "2026-11-13", by: "claude" },
  ]

  it("gives the calls made or agreed to in the week, each as recorded", () => {
    expect(
      callsOfWeek(record(calls), "2026-11-06", "2026-11-12").map((c) => c.id)
    ).toEqual(["C2", "C3"])
    expect(callsOfWeek(record(calls), "2026-11-06", "2026-11-12")[0]).toEqual(
      calls[1]
    )
  })

  it("reads the repo's own record", () => {
    const text = readFileSync(
      join(import.meta.dirname, "../../../../docs/calls.json"),
      "utf8"
    )
    expect(
      callsOfWeek(text, "2026-11-06", "2026-11-06").length
    ).toBeGreaterThan(0)
  })

  it("refuses what is not the record", () => {
    expect(() => callsOfWeek("{}", "2026-11-06", "2026-11-12")).toThrow()
  })
})

describe("a body's sections", () => {
  it("reads a section past a fenced block, never a heading inside one", () => {
    const fenced =
      "## Where we are\n\n```sh\n# install\n## Where we are\n```\n\nNow.\n\n## Next"
    expect(sectionOf(fenced, "Where we are")).toBe(
      "```sh\n# install\n## Where we are\n```\n\nNow."
    )
    expect(sectionOf("```\n## Where we are\nx\n```", "Where we are")).toBeNull()
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
