import { describe, expect, it } from "vitest"

import { checkCitations, checkRegisterCoverage } from "./citation-check"
import type { PropositionRegisterEntry } from "./parse-canon"

const ACTIVE_ENTRY: PropositionRegisterEntry = {
  id: "CW-P1",
  title: "Sequential composition adds",
  statement:
    "Sibling control flow executed in sequence contributes the sum of its members' costs.",
  status: "active",
}

const RETIRED_ENTRY: PropositionRegisterEntry = {
  id: "CW-P2",
  title: "Nested repetition multiplies",
  statement:
    "A body enclosed in a repetition contributes the product of the repetition count and the body's cost.",
  status: "retired",
}

const REGISTER: Readonly<Record<string, PropositionRegisterEntry>> = {
  "CW-P1": ACTIVE_ENTRY,
  "CW-P2": RETIRED_ENTRY,
}

describe("checkCitations", () => {
  it("reports nothing for a citation that resolves to an active entry", () => {
    expect(
      checkCitations(
        [{ id: "CW-P1", file: "src/example.ts", line: 3 }],
        REGISTER
      )
    ).toEqual([])
  })

  // Failure direction 1 of Rem. 7.1: an identifier in source with no
  // register entry — the "easy" direction, a plain typo.
  it("reports a dangling citation — an id absent from the register", () => {
    const violations = checkCitations(
      [{ id: "CW-P99", file: "src/example.ts", line: 5 }],
      REGISTER
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("src/example.ts:5")
    expect(violations[0]).toContain("CW-P99")
    expect(violations[0]).toContain("dangling citation")
  })

  it("reports a retired citation distinctly from a dangling one", () => {
    const violations = checkCitations(
      [{ id: "CW-P2", file: "src/example.ts", line: 7 }],
      REGISTER
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("CW-P2")
    expect(violations[0]).toContain("retired")
    expect(violations[0]).not.toContain("dangling")
  })

  it("reports every violation in one call, not just the first", () => {
    const violations = checkCitations(
      [
        { id: "CW-P99", file: "a.ts", line: 1 },
        { id: "CW-P2", file: "b.ts", line: 2 },
      ],
      REGISTER
    )
    expect(violations).toHaveLength(2)
  })
})

// Failure direction 2 of Rem. 7.1 — "the easy-to-forget second one": a
// register entry marked instantiable with no corpus instance. Proven by
// fixture per B1's own acceptance criteria; not wired against real corpus
// data yet (see checkRegisterCoverage's own doc comment).
describe("checkRegisterCoverage", () => {
  it("reports an active entry with no corpus instance", () => {
    const violations = checkRegisterCoverage(new Set(), {
      "CW-P1": ACTIVE_ENTRY,
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("CW-P1")
    expect(violations[0]).toContain("no corpus instance")
  })

  it("does not report an active entry that is instantiated", () => {
    const violations = checkRegisterCoverage(new Set(["CW-P1"]), {
      "CW-P1": ACTIVE_ENTRY,
    })
    expect(violations).toEqual([])
  })

  it("exempts a retired entry even with no corpus instance", () => {
    const violations = checkRegisterCoverage(new Set(), {
      "CW-P2": RETIRED_ENTRY,
    })
    expect(violations).toEqual([])
  })
})
