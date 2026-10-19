import type { PropositionStatus } from "@leetype/lib/leetype/proposition-register/parse-canon"
import {
  parsePropositionRegister,
  parseRuleRegisters,
  propositionDeclarationLineNumbers,
} from "@leetype/lib/leetype/proposition-register/parse-canon"
import { describe, expect, it } from "vitest"

// Names `PropositionStatus` so knip sees it used (see generated.test.ts).
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

/** A one-entry §7 whose body is `lines`, each indented on its own line. */
function oneEntry(...lines: ReadonlyArray<string>): string {
  const body = lines.map((line) => `  ${line}\n`).join("")
  return `= The proposition register\n\n#proposition("7.1", name: "CW-P1 · Sequential composition adds")[\n${body}]\n`
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

  it.each<[string, Array<string>, string]>([
    [
      "captures the bracketed body as `statement`, collapsing its own line breaks and indentation",
      [
        "Sibling control flow executed in sequence contributes the sum of its",
        `members' costs: $T("Seq"(G_1, ..., G_m)) = sum_i T(G_i)$.`,
      ],
      `Sibling control flow executed in sequence contributes the sum of its members' costs: T(Seq(G_1, ..., G_m)) = sum_i T(G_i).`,
    ],
    [
      "is bracket-depth-aware — a nested [...] inside the body does not truncate it",
      ["See also #footnote[a nested block, itself closed] for detail."],
      "See also #footnote[a nested block, itself closed] for detail.",
    ],
    [
      // Typst never scans a raw span for markup.
      "does not count a literal bracket inside a raw span as structural",
      ["Indexes like `array[0]` read the first element."],
      "Indexes like array[0] read the first element.",
    ],
    [
      "does not count an escaped bracket as structural",
      ["A literal \\[bracket\\] written by hand."],
      "A literal [bracket] written by hand.",
    ],
    [
      // `#link(...)` itself is kept verbatim, like `#footnote[...]`.
      "does not count a bracket inside a string literal as structural",
      ['A #link("path]part") value follows.'],
      'A #link("path]part") value follows.',
    ],
    [
      // Every "..." pair is treated as a string, so prose quotes (as in the
      // real CW-P16) must still parse unchanged.
      "does not misparse an ordinary quoted phrase in prose",
      ['The failure is of a different kind from "too slow at this size."'],
      'The failure is of a different kind from "too slow at this size."',
    ],
    [
      // Comments are dropped, not kept: a comment's "*" would read as emphasis.
      "omits a line comment entirely from the rendered statement",
      ["A real claim. // note about ]", "A second line follows."],
      "A real claim. A second line follows.",
    ],
    [
      "omits a block comment entirely from the rendered statement, even a nested one",
      [
        "A real claim. /* an aside /* nested [ note */ about ] brackets */ follows.",
      ],
      "A real claim. follows.",
    ],
  ])("%s", (_name, lines, statement) => {
    expect(parsePropositionRegister(oneEntry(...lines))[0]?.statement).toBe(
      statement
    )
  })

  it.each<[string, Array<string>, RegExp]>([
    [
      "an unterminated string literal",
      ['A #link("unterminated value follows.'],
      /unterminated string literal/,
    ],
    [
      "an unterminated block comment",
      ["A real claim. /* unterminated aside."],
      /unterminated block comment/,
    ],
  ])("throws on %s", (_name, lines, error) => {
    expect(() => parsePropositionRegister(oneEntry(...lines))).toThrow(error)
  })

  it("throws on an unbalanced body — an unmatched '[' with no closing ']'", () => {
    const source =
      `= The proposition register\n\n` +
      `#proposition("7.1", name: "CW-P1 · Sequential composition adds")[\n` +
      `  Missing its own closing bracket.\n`

    expect(() => parsePropositionRegister(source)).toThrow(/no matching "\]"/)
  })

  // A component rendering `statement` must show the sentence, not typst source.
  it.each<[string, string, string]>([
    [
      "unwraps a raw span, keeping its content as plain text",
      "See also `CW-P5` for the related rewrite.",
      "See also CW-P5 for the related rewrite.",
    ],
    [
      "unwraps emphasis, keeping its content as plain text",
      "Improves the *best* case only.",
      "Improves the best case only.",
    ],
    [
      "renders typst's '---' as a real em dash",
      "A fixed cost --- unaffected by any bound.",
      "A fixed cost — unaffected by any bound.",
    ],
    [
      "drops a math span's own '$' delimiters and renders known symbol names",
      "Bounded by $Theta(n^2)$ in the worst case, provided $T_A (C) <= B$.",
      "Bounded by Θ(n^2) in the worst case, provided T_A (C) ≤ B.",
    ],
    [
      // Upright operator names, as in the real CW-P1/CW-P2.
      "strips a quoted string's own delimiters inside math mode, without substituting its content",
      'Contributes $T("Seq"(G_1, ..., G_m)) = sum_i T(G_i)$.',
      "Contributes T(Seq(G_1, ..., G_m)) = sum_i T(G_i).",
    ],
    [
      "does not substitute a math symbol name's content when it appears inside a quoted string",
      'A rewrite named $"Theta"(x)$ is a literal identifier, not the symbol.',
      "A rewrite named Theta(x) is a literal identifier, not the symbol.",
    ],
    [
      "unwraps a multi-backtick raw span, not just a single pair",
      "A double-backtick span like ``foo`` renders clean.",
      "A double-backtick span like foo renders clean.",
    ],
    [
      "does not apply math or emphasis rendering inside a raw span's own content",
      "The syntax `*literal*` keeps its asterisks, and `$Theta$` keeps its dollar signs.",
      "The syntax *literal* keeps its asterisks, and $Theta$ keeps its dollar signs.",
    ],
  ])("renders inline typst markup: %s", (_name, line, statement) => {
    expect(parsePropositionRegister(oneEntry(line))[0]?.statement).toBe(
      statement
    )
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

  // Otherwise the unmatched entry would vanish and the rest still pass.
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
        "Sibling control flow executed in sequence contributes the sum of its members' costs: T(Seq(G_1, ..., G_m)) = sum_i T(G_i).",
      status: "active",
    })
  })
})

// The citation checker excludes only these lines, not the whole canon.
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

/** Rem. 7.4 with `machine` and `agreement` rows, each `[id, rule]`. */
function registersFixture(
  machine: ReadonlyArray<readonly [string, string]>,
  agreement: ReadonlyArray<readonly [string, string]>
): string {
  const rows = (list: ReadonlyArray<readonly [string, string]>): string =>
    list
      .map(
        ([id, rule]) => `    [\`${id}\`], [${rule}], [The *line* for ${id}.],`
      )
      .join("\n")
  return [
    '#remark("7.4", name: "Two registers beside `CW-P` (v1.2)")[',
    "  *Machine register (v0).*",
    "  #table(",
    "    [*Id*], [*Rule*], [*Its one line*],",
    rows(machine),
    "  )",
    "  *Agreement register (v0).*",
    "  #table(",
    "    [*Id*], [*Rule*], [*Its one line*],",
    rows(agreement),
    "  )",
    "]",
  ].join("\n")
}

describe("parseRuleRegisters", () => {
  it("reads both tables in order, the rule and its one line rendered", () => {
    const entries = parseRuleRegisters(
      registersFixture(
        [
          ["M2", "Batch"],
          ["M1", "Ladder"],
        ],
        [["A1", "Model (superseded)"]]
      )
    )
    expect(entries).toEqual([
      { id: "M1", rule: "Ladder", line: "The line for M1.", status: "active" },
      { id: "M2", rule: "Batch", line: "The line for M2.", status: "active" },
      {
        id: "A1",
        rule: "Model",
        line: "The line for A1.",
        status: "superseded",
      },
    ])
  })

  it("throws on a gap, naming the register", () => {
    expect(() =>
      parseRuleRegisters(registersFixture([["M1", "Ladder"]], [["A2", "B"]]))
    ).toThrow(/Agreement register is missing "A1"/)
  })

  it("throws when a register has no rows", () => {
    expect(() =>
      parseRuleRegisters(registersFixture([["M1", "L"]], []))
    ).toThrow(/Agreement register has no rows/)
  })

  it("reads an id cell with spaces inside its brackets", () => {
    const source = registersFixture([["M1", "Ladder"]], [["A1", "Model"]])
    expect(
      parseRuleRegisters(source.replace("[`M1`]", "[ `M1` ]")).map((e) => e.id)
    ).toEqual(["M1", "A1"])
  })

  it("throws on a row whose id cell it cannot read, rather than dropping it", () => {
    const source = registersFixture(
      [
        ["M1", "Ladder"],
        ["M2", "Batch"],
      ],
      [["A1", "Model"]]
    )
    expect(() => parseRuleRegisters(source.replace("[`M2`]", "[M2]"))).toThrow(
      /3 rule id cell\(s\) but this parser matched 2/
    )
  })

  it("throws when Rem. 7.4 is missing", () => {
    expect(() => parseRuleRegisters("= Nothing here")).toThrow(/7\.4/)
  })

  it("reads the real canon's Rem. 7.4: M1..M8 and A1..A10", async () => {
    const { readFileSync } = await import("node:fs")
    const { execFileSync } = await import("node:child_process")
    const path = await import("node:path")
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    }).trim()
    const entries = parseRuleRegisters(
      readFileSync(
        path.join(root, "docs/canon/complexity-witness-canon.typ"),
        "utf8"
      )
    )
    expect(entries.filter((e) => e.id.startsWith("M"))).toHaveLength(8)
    expect(entries.filter((e) => e.id.startsWith("A"))).toHaveLength(10)
    expect(entries.find((e) => e.id === "M8")).toMatchObject({
      rule: "Durability has a price",
      line: "An acknowledgement is only as durable as what was flushed before it was sent.",
    })
  })
})
