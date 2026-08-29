import { describe, expect, it } from "vitest"

import type { PropositionStatus } from "./parse-canon"
import { parsePropositionRegister } from "./parse-canon"

// Names `PropositionStatus` explicitly — see generated.test.ts's own note
// on `PropositionId` for why an unreferenced-by-name type alias needs this
// even when it is structurally used elsewhere (knip, this relay's #1240
// handoff).
const exampleStatus: PropositionStatus = "retired"

function canonFixture(
  entries: ReadonlyArray<{ num: string; name: string }>
): string {
  const body = entries
    .map(
      (entry) =>
        `#proposition("${entry.num}", name: "${entry.name}")[\n  Some body text.\n]\n`
    )
    .join("\n")
  return `= The proposition register\n\n${body}`
}

describe("parsePropositionRegister", () => {
  it("parses active entries in ascending CW-P order regardless of source order", () => {
    const source = canonFixture([
      { num: "7.2", name: "CW-P2 · Nested repetition multiplies" },
      { num: "7.1", name: "CW-P1 · Sequential composition adds" },
    ])

    expect(parsePropositionRegister(source)).toEqual([
      { id: "CW-P1", title: "Sequential composition adds", status: "active" },
      { id: "CW-P2", title: "Nested repetition multiplies", status: "active" },
    ])
  })

  it("recognizes a ' (retired)' suffix and strips it from the stored title", () => {
    const source = canonFixture([
      { num: "7.1", name: "CW-P1 · Sequential composition adds" },
      {
        num: "7.2",
        name: "CW-P2 · Nested repetition multiplies (retired)",
      },
    ])

    expect(parsePropositionRegister(source)).toEqual([
      { id: "CW-P1", title: "Sequential composition adds", status: "active" },
      {
        id: "CW-P2",
        title: "Nested repetition multiplies",
        status: exampleStatus,
      },
    ])
  })

  it("throws on a gap in the CW-P sequence", () => {
    const source = canonFixture([
      { num: "7.1", name: "CW-P1 · Sequential composition adds" },
      { num: "7.2", name: "CW-P3 · The dominant term survives" },
    ])

    expect(() => parsePropositionRegister(source)).toThrow(/missing "CW-P2"/)
  })

  it("throws on a duplicate CW-P id", () => {
    const source = canonFixture([
      { num: "7.1", name: "CW-P1 · Sequential composition adds" },
      { num: "7.2", name: "CW-P1 · A second, different entry" },
    ])

    expect(() => parsePropositionRegister(source)).toThrow(
      /cites "CW-P1" more than once/
    )
  })

  it("throws when an entry name has no ' · ' separator", () => {
    const source = canonFixture([{ num: "7.1", name: "CW-P1 no separator" }])

    expect(() => parsePropositionRegister(source)).toThrow(/no " · " separator/)
  })

  it("throws when nothing matches at all", () => {
    expect(() => parsePropositionRegister("no propositions here")).toThrow(
      /found no #proposition/
    )
  })

  it("parses the real canon's §7 into a contiguous, non-empty register", async () => {
    const { readFileSync } = await import("node:fs")
    const { execFileSync } = await import("node:child_process")
    const path = await import("node:path")

    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    }).trim()
    const canonSource = readFileSync(
      path.join(root, "docs/canon/complexity-witness-canon.typ"),
      "utf8"
    )

    const entries = parsePropositionRegister(canonSource)
    expect(entries.length).toBeGreaterThanOrEqual(16)
    expect(entries[0]).toEqual({
      id: "CW-P1",
      title: "Sequential composition adds",
      status: "active",
    })
  })
})
