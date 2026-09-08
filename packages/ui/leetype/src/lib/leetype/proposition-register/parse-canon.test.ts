import { describe, expect, it } from "vitest"

import type { PropositionStatus } from "./parse-canon"
import {
  parsePropositionRegister,
  propositionDeclarationLineNumbers,
} from "./parse-canon"

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
      {
        id: "CW-P1",
        title: "Sequential composition adds",
        statement: "Some body text.",
        status: "active",
      },
      {
        id: "CW-P2",
        title: "Nested repetition multiplies",
        statement: "Some body text.",
        status: "active",
      },
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
      {
        id: "CW-P1",
        title: "Sequential composition adds",
        statement: "Some body text.",
        status: "active",
      },
      {
        id: "CW-P2",
        title: "Nested repetition multiplies",
        statement: "Some body text.",
        status: exampleStatus,
      },
    ])
  })

  it("captures the bracketed body as `statement`, collapsing its own line breaks and indentation", () => {
    const source =
      `= The proposition register\n\n` +
      `#proposition("7.1", name: "CW-P1 · Sequential composition adds")[\n` +
      `  Sibling control flow executed in sequence contributes the sum of its\n` +
      `  members' costs: $T("Seq"(G_1, ..., G_m)) = sum_i T(G_i)$.\n` +
      `]\n`

    expect(parsePropositionRegister(source)[0]?.statement).toBe(
      `Sibling control flow executed in sequence contributes the sum of its members' costs: T("Seq"(G_1, ..., G_m)) = sum_i T(G_i).`
    )
  })

  // #1330: typst content between a body's own "[" and its matching "]" can
  // nest brackets — no canon entry does today, but a parser that only works
  // by accident of the current corpus is the same silent-miss risk this
  // module has already had to fix once (the multi-line call-site check).
  it("is bracket-depth-aware — a nested [...] inside the body does not truncate it", () => {
    const source =
      `= The proposition register\n\n` +
      `#proposition("7.1", name: "CW-P1 · Sequential composition adds")[\n` +
      `  See also #footnote[a nested block, itself closed] for detail.\n` +
      `]\n`

    expect(parsePropositionRegister(source)[0]?.statement).toBe(
      "See also #footnote[a nested block, itself closed] for detail."
    )
  })

  // Review finding on this PR (chatgpt-codex-connector): a raw span's own
  // content is never scanned for markup by typst, so a literal "[" / "]"
  // inside one (e.g. a code example like `array[0]`) must not be counted
  // as a content-block delimiter — it would otherwise truncate the body
  // early or report a false unbalanced block.
  it("does not count a literal bracket inside a raw span as structural", () => {
    const source =
      `= The proposition register\n\n` +
      '#proposition("7.1", name: "CW-P1 · Sequential composition adds")[\n' +
      "  Indexes like `array[0]` read the first element.\n" +
      "]\n"

    expect(parsePropositionRegister(source)[0]?.statement).toBe(
      "Indexes like array[0] read the first element."
    )
  })

  // Same finding: typst's own backslash escape (`\[`, `\]`) makes a bracket
  // literal too, independent of raw spans.
  it("does not count an escaped bracket as structural", () => {
    const source =
      `= The proposition register\n\n` +
      `#proposition("7.1", name: "CW-P1 · Sequential composition adds")[\n` +
      `  A literal \\[bracket\\] written by hand.\n` +
      `]\n`

    expect(parsePropositionRegister(source)[0]?.statement).toBe(
      "A literal [bracket] written by hand."
    )
  })

  it("throws on an unbalanced body — an unmatched '[' with no closing ']'", () => {
    const source =
      `= The proposition register\n\n` +
      `#proposition("7.1", name: "CW-P1 · Sequential composition adds")[\n` +
      `  Missing its own closing bracket.\n`

    expect(() => parsePropositionRegister(source)).toThrow(/no matching "\]"/)
  })

  // Review finding on this PR (chatgpt-codex-connector): a component
  // rendering `statement` verbatim would show the canon's own typst source
  // syntax to a learner, not the sentence it authors.
  describe("renders inline typst markup as display text", () => {
    it("unwraps a raw span, keeping its content as plain text", () => {
      const source =
        `= The proposition register\n\n` +
        `#proposition("7.1", name: "CW-P1 · Sequential composition adds")[\n` +
        "  See also `CW-P5` for the related rewrite.\n" +
        `]\n`

      expect(parsePropositionRegister(source)[0]?.statement).toBe(
        "See also CW-P5 for the related rewrite."
      )
    })

    it("unwraps emphasis, keeping its content as plain text", () => {
      const source =
        `= The proposition register\n\n` +
        `#proposition("7.1", name: "CW-P1 · Sequential composition adds")[\n` +
        `  Improves the *best* case only.\n` +
        `]\n`

      expect(parsePropositionRegister(source)[0]?.statement).toBe(
        "Improves the best case only."
      )
    })

    it("renders typst's '---' as a real em dash", () => {
      const source =
        `= The proposition register\n\n` +
        `#proposition("7.1", name: "CW-P1 · Sequential composition adds")[\n` +
        `  A fixed cost --- unaffected by any bound.\n` +
        `]\n`

      expect(parsePropositionRegister(source)[0]?.statement).toBe(
        "A fixed cost — unaffected by any bound."
      )
    })

    it("drops a math span's own '$' delimiters and renders known symbol names", () => {
      const source =
        `= The proposition register\n\n` +
        `#proposition("7.1", name: "CW-P1 · Sequential composition adds")[\n` +
        `  Bounded by $Theta(n^2)$ in the worst case, provided $T_A (C) <= B$.\n` +
        `]\n`

      expect(parsePropositionRegister(source)[0]?.statement).toBe(
        "Bounded by Θ(n^2) in the worst case, provided T_A (C) ≤ B."
      )
    })

    // Review finding, round 2 (chatgpt-codex-connector): `bodyOfBracketBlock`
    // already recognizes a raw span's delimiter as a run of backticks of
    // arbitrary length, but the first cut of this unwrap only stripped a
    // single pair — a double-backtick span left one backtick visible on
    // each side (`` ``foo`` `` became `` `foo` ``, not `foo`). Fixed to
    // match the same run-length rule on both sides.
    it("unwraps a multi-backtick raw span, not just a single pair", () => {
      const source =
        `= The proposition register\n\n` +
        `#proposition("7.1", name: "CW-P1 · Sequential composition adds")[\n` +
        "  A double-backtick span like ``foo`` renders clean.\n" +
        `]\n`

      expect(parsePropositionRegister(source)[0]?.statement).toBe(
        "A double-backtick span like foo renders clean."
      )
    })
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

  it("throws when §7's heading is present but has no entries", () => {
    expect(() =>
      parsePropositionRegister("= The proposition register\n\nNothing here.\n")
    ).toThrow(/found no #proposition/)
  })

  it("throws when the §7 heading itself is missing", () => {
    expect(() => parsePropositionRegister("no propositions here")).toThrow(
      /could not find the.*heading/
    )
  })

  // Review finding on #1241 (chatgpt-codex-connector): a #proposition(...)
  // call site whose args don't fit the strict single-line regex would
  // otherwise vanish silently rather than fail — the remaining, still-
  // contiguous ids pass the sequence check on their own.
  it("throws when a §7 call site is not matched by the single-line regex (e.g. wrapped across lines)", () => {
    const source =
      `= The proposition register\n\n` +
      `#proposition("7.1", name: "CW-P1 · Sequential composition adds")[\n  Body.\n]\n\n` +
      `#proposition(\n  "7.2",\n  name: "CW-P2 · Nested repetition multiplies"\n)[\n  Body.\n]\n`

    expect(() => parsePropositionRegister(source)).toThrow(
      /call site\(s\) but this parser only matched 1/
    )
  })

  it("does not count a #proposition( call site from a later section against §7's own count", () => {
    const source =
      `= The proposition register\n\n` +
      `#proposition("7.1", name: "CW-P1 · Sequential composition adds")[\n  Body.\n]\n\n` +
      `= The cycle\n\n` +
      `#proposition("8.1", name: "Some other section's result")[\n  Body.\n]\n`

    expect(parsePropositionRegister(source)).toEqual([
      {
        id: "CW-P1",
        title: "Sequential composition adds",
        statement: "Body.",
        status: "active",
      },
    ])
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
      statement:
        'Sibling control flow executed in sequence contributes the sum of its members\' costs: T("Seq"(G_1, ..., G_m)) = sum_i T(G_i).',
      status: "active",
    })
  })
})

// Review finding on #1241 (chatgpt-codex-connector): the citation checker
// must exclude only §7's own declaration lines, not the whole canon tree
// — this is what makes that possible.
describe("propositionDeclarationLineNumbers", () => {
  it("returns the 1-indexed line of each §7 declaration", () => {
    const source = canonFixture([
      { num: "7.1", name: "CW-P1 · Sequential composition adds" },
      { num: "7.2", name: "CW-P2 · Nested repetition multiplies" },
    ])
    const lines = source.split("\n")
    const line1 = lines.findIndex((line) => line.includes('"7.1"')) + 1
    const line2 = lines.findIndex((line) => line.includes('"7.2"')) + 1

    expect(propositionDeclarationLineNumbers(source)).toEqual(
      new Set([line1, line2])
    )
  })

  it("excludes a #proposition( declaration from a different section", () => {
    const source =
      `= The proposition register\n\n` +
      `#proposition("7.1", name: "CW-P1 · Sequential composition adds")[\n  Body.\n]\n\n` +
      `= The cycle\n\n` +
      `#proposition("8.1", name: "Some other section's result")[\n  Body.\n]\n`

    // Line 3 (1-indexed) is the §7 declaration; line 9's "8.1" is not.
    expect(propositionDeclarationLineNumbers(source)).toEqual(new Set([3]))
  })
})
