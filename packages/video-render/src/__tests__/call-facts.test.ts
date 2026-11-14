/**
 * The weekly call's facts read a pull request's or an epic's body by its
 * sections, outside fenced code, as the PR template and the epics write
 * them: an epic's "Where we are", whose heading may carry a date; the
 * week's calls from the calls record (ST37); and a squash commit's change
 * kind and promise trailers.
 */
import type { RecordedCall as Call } from "@video-render/call-facts"
import {
  callsEntered,
  changeOf,
  sectionOf,
  trailersOf,
  whereWeAreOf,
  whyOf,
} from "@video-render/call-facts"
import { describe, expect, it } from "vitest"

const record = (calls: Array<Call>): Array<Call> => calls

describe("the calls record", () => {
  const base = { paths: ["a"], undo: "Undo.", refs: ["#1"] }
  const c1: Call = {
    id: "C1",
    made: "2026-11-05",
    by: "claude",
    ...base,
    chose: "An icon.",
  }
  const c2: Call = {
    id: "C2",
    made: "2026-11-06",
    by: "owner",
    ...base,
    chose: "Top.",
  }
  const c3: Call = {
    id: "C3",
    made: "2026-10-30",
    by: "claude",
    ...base,
    chose: "X.",
  }

  it("gives the calls that entered it over the week, each as recorded", () => {
    expect(callsEntered(record([c1]), record([c1, c2]))).toEqual([c2])
  })

  it("goes by when a call reached main, not when it was made", () => {
    const late = { ...c1, made: "2026-10-29" }
    expect(callsEntered(record([]), record([late]))).toEqual([late])
    expect(callsEntered(record([late]), record([late]))).toEqual([])
  })

  it("gives a call the owner agreed to in the week, and every call of a first record", () => {
    const agreed = { ...c3, agreed: "2026-11-07" }
    expect(callsEntered(record([c1, c3]), record([c1, agreed]))).toEqual([
      agreed,
    ])
    expect(callsEntered(null, record([c1, c2])).map((c) => c.id)).toEqual([
      "C1",
      "C2",
    ])
  })

  it("lists each call's id, day, author and agreement first, the rest as the file has them", () => {
    const { id, made, by, ...rest } = c3
    const late = { ...rest, agreed: "2026-11-07", id, made, by }
    expect(Object.keys(callsEntered(null, record([late]))[0] ?? {})).toEqual([
      "id",
      "made",
      "by",
      "agreed",
      ...Object.keys(rest),
    ])
  })

  it("orders the folder's calls by when each was made, then by id", () => {
    const later = { ...c1, id: "C10", made: "2026-11-05" }
    expect(
      callsEntered(null, record([later, c2, c1]), { byDay: true }).map(
        (c) => c.id
      )
    ).toEqual(["C1", "C10", "C2"])
  })

  it("keeps the one-array record's order", () => {
    expect(callsEntered(null, record([c2, c1])).map((c) => c.id)).toEqual([
      "C2",
      "C1",
    ])
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

  it("gives its Why, and not a heading that only starts with it", () => {
    const epic = "**Search words:** x\n\n## Why\n\nBecause.\n\n## What\n\ny"
    expect(whyOf(epic)).toBe("Because.")
    expect(whyOf("## Whys\n\ny")).toBeNull()
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
