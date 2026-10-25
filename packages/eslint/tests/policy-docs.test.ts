/**
 * What the policy documents' text can hold (CLAUDE.md, "Gray-area invariants:
 * declare them falsifiable"), as pure functions over markdown text.
 * `scripts/check-policy-docs.ts` feeds them every tracked `*.md`.
 */

import {
  describePolicyViolation,
  findDebtLabels,
  findDebtViolations,
  findDigestViolations,
  findHeldByViolations,
  findInvariantViolations,
  findReferenceViolations,
  parseDeclarations,
  type PolicyViolation,
} from "@eslint/policy-docs.js"
import { describe, expect, it } from "vitest"

const PARTS = [
  "- _Claim:_ a claim.",
  "- _Falsified by_ a hunk.",
  "- _Scope:_ the repo.",
  "- _Why not enforced:_ a reason.",
]
const declaration = (
  id: string,
  parts: ReadonlyArray<string> = PARTS,
  mark = ""
): string => [`**${id}${mark}: A thing.**`, "", ...parts].join("\n")
const docs = (entries: Record<string, string>): Map<string, string> =>
  new Map(Object.entries(entries))
const kinds = (violations: ReadonlyArray<PolicyViolation>): Array<string> =>
  violations.map((violation) => violation.kind)

describe("parseDeclarations", () => {
  it("reads a declaration bare, in a quote, and under each fourth label", () => {
    const text = [
      declaration("A1"),
      "",
      declaration("A2", [
        ...PARTS.slice(0, 3),
        "- _Why not lint or tests:_ a reason.",
      ]),
      "",
      declaration("A3", [
        ...PARTS.slice(0, 3),
        "- _Why not wholly enforced:_ a reason.",
      ]),
      "",
      declaration("A4")
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n"),
    ].join("\n")
    const found = parseDeclarations("x.md", text)
    expect(found.map((d) => d.id)).toEqual(["A1", "A2", "A3", "A4"])
    expect(found.flatMap((d) => d.missing)).toEqual([])
  })

  it("names each part a block lacks", () => {
    for (const [index, part] of [
      "claim",
      "falsified",
      "scope",
      "whyNot",
    ].entries()) {
      const parts = PARTS.filter((_, at) => at !== index)
      const [found] = parseDeclarations("x.md", declaration("A1", parts))
      expect(found?.missing).toEqual([part])
    }
  })

  it("needs nothing from a not-reviewable declaration", () => {
    const [found] = parseDeclarations(
      "x.md",
      declaration("A1", ["Account state."], " (not reviewable)")
    )
    expect(found).toMatchObject({ id: "A1", missing: [] })
  })

  it("asks a retired declaration for its reason", () => {
    expect(
      parseDeclarations(
        "x.md",
        declaration("A1", ["_Retired:_ the route is gone."], " (retired)")
      )[0]?.missing
    ).toEqual([])
    expect(
      parseDeclarations(
        "x.md",
        declaration("A1", ["Nothing here."], " (retired)")
      )[0]?.missing
    ).toEqual(["retired"])
    expect(
      parseDeclarations(
        "x.md",
        declaration("A1", ["_Retired:_"], " (retired)")
      )[0]?.missing
    ).toEqual(["retired"])
  })

  it("ends a block at the next heading or declaration", () => {
    const [first, second] = parseDeclarations(
      "x.md",
      [
        declaration("A1", PARTS.slice(0, 2)),
        "## Next section",
        ...PARTS.slice(2),
        declaration("A2", PARTS.slice(0, 3)),
        declaration("A3"),
      ].join("\n")
    )
    expect(first?.missing).toEqual(["scope", "whyNot"])
    expect(second?.missing).toEqual(["whyNot"])
  })

  it("closes a fence only on the same character and at least its length", () => {
    const ids = (text: string): Array<string> =>
      parseDeclarations("x.md", text).map((d) => d.id)
    const inner = ["```md", declaration("X9"), "```"]
    // A longer fence holds a shorter one, backticks or tildes.
    for (const [opening, closing] of [
      ["````md", "````"],
      ["~~~~", "~~~~"],
    ] as const) {
      const text = [opening, ...inner, closing, declaration("A1")].join("\n")
      expect(ids(text)).toEqual(["A1"])
    }
    // A closing fence may be longer than the opening one.
    expect(
      ids(["```", declaration("X9"), "`````", declaration("A1")].join("\n"))
    ).toEqual(["A1"])
    // A `~~~` fence is not closed by backticks: it runs to the end.
    expect(
      ids(["~~~", declaration("X9"), "```", declaration("A1")].join("\n"))
    ).toEqual([])
  })

  it("reads a list item, a fenced example and a lone bold ID as no declaration", () => {
    const text = [
      "- **R8:** Capacitor's consumer rules.",
      "**Q1:** a question",
      "```md",
      "**L1: Quoted.**",
      "```",
      "plain **A1: text** in a sentence",
    ].join("\n")
    expect(parseDeclarations("x.md", text)).toEqual([])
  })
})

describe("findInvariantViolations", () => {
  it("is quiet for well-formed declarations", () => {
    expect(
      findInvariantViolations(
        docs({ "a.md": declaration("A1"), "b.md": declaration("B1") }),
        docs({ "a.md": declaration("A1") })
      )
    ).toEqual([])
  })

  it("reports a missing part with its file and line", () => {
    expect(
      findInvariantViolations(
        docs({ "a.md": `intro\n\n${declaration("A1", PARTS.slice(1))}` }),
        null
      )
    ).toEqual([
      {
        kind: "missingParts",
        file: "a.md",
        line: 3,
        id: "A1",
        missing: ["_Claim:_"],
      },
    ])
  })

  it("reports an ID declared twice, naming the first", () => {
    expect(
      findInvariantViolations(
        docs({ "b.md": declaration("A1"), "a.md": declaration("A1") }),
        null
      )
    ).toEqual([
      {
        kind: "duplicateId",
        file: "b.md",
        line: 1,
        id: "A1",
        first: "a.md:1",
      },
    ])
  })

  it("lets CLAUDE.md quote L3, without the quote standing in for it", () => {
    const quoted = docs({
      "CLAUDE.md": declaration("L3"),
      "extensions/common/GOOD_CITIZEN.md": declaration("L3"),
    })
    expect(findInvariantViolations(quoted, quoted)).toEqual([])
    expect(
      findInvariantViolations(docs({ "CLAUDE.md": declaration("L3") }), quoted)
    ).toEqual([{ kind: "removedId", id: "L3" }])
  })

  it("reports a quote that is gone", () => {
    expect(
      findInvariantViolations(
        docs({
          "CLAUDE.md": "# No quote",
          "extensions/common/GOOD_CITIZEN.md": declaration("L3"),
        }),
        null
      )
    ).toEqual([{ kind: "staleQuote", id: "L3", file: "CLAUDE.md" }])
  })

  it("holds the IDs of the base ref: dropped or renumbered fails, moved or retired does not", () => {
    const base = docs({
      "a.md": [declaration("A1"), declaration("A2")].join("\n\n"),
      "c.md": declaration("A3"),
    })
    expect(
      findInvariantViolations(
        docs({
          "a.md": [declaration("A1"), declaration("A4")].join("\n\n"),
          "c.md": declaration("A3", ["_Retired:_ gone."], " (retired)"),
        }),
        base
      )
    ).toEqual([{ kind: "removedId", id: "A2" }])
    expect(
      findInvariantViolations(
        docs({
          "moved.md": [declaration("A1"), declaration("A2")].join("\n\n"),
        }),
        base
      )
    ).toEqual([{ kind: "removedId", id: "A3" }])
    expect(
      findInvariantViolations(
        docs({
          "moved.md": [
            declaration("A1"),
            declaration("A2"),
            declaration("A3"),
          ].join("\n\n"),
        }),
        base
      )
    ).toEqual([])
  })

  it("reads the base's declarations as it reads the tree's: a fenced example is none", () => {
    const fenced = docs({
      "a.md": ["```md", declaration("X9"), "```"].join("\n"),
    })
    expect(findInvariantViolations(docs({ "a.md": "# Gone" }), fenced)).toEqual(
      []
    )
  })

  it("compares no IDs without a base", () => {
    expect(
      findInvariantViolations(docs({ "CLAUDE.md": declaration("L3") }), null)
    ).toEqual([])
  })
})

const FOREIGN =
  "`.github/workflows/routes.yml` `routes.yml` `apps/servers/file_host/docs/route-inventory.md`"
const TREE = [
  "CLAUDE.md",
  "REVIEW.md",
  "AGENTS.md",
  ".github/workflows/pr.yml",
  ".claude/skills/steward/SKILL.md",
  "scripts/check-test-layout.ts",
  "packages/eslint/src/policy-docs.ts",
  "packages/ui/shared/src/index.ts",
  "apps/www/src/main.tsx",
  "extensions/common/GOOD_CITIZEN.md",
  "docs/monorepo-boundaries.md",
]
const policy = (
  claude: string,
  others: Record<string, string> = {}
): Map<string, string> =>
  docs({
    "CLAUDE.md": `${claude}\n\n${FOREIGN}`,
    "REVIEW.md": "# Review\n",
    "AGENTS.md": "# Agents\n",
    ...others,
  })

describe("findDebtLabels", () => {
  const withWhy = (why: string): string =>
    declaration("A1", [...PARTS.slice(0, 3), `- _Why not enforced:_ ${why}`])

  it("finds the label in each spelling, wrapped, quoted and bold", () => {
    for (const why of [
      "**mechanical; not yet a rule.**",
      "mechanical, not yet a rule.",
      "mechanical and not yet a rule.",
      'mechanical ("mechanical;\n  not yet a rule").',
    ]) {
      expect(findDebtLabels(withWhy(why)), why).toHaveLength(1)
    }
    const quoted = withWhy("Mechanical;\n  not yet\n  a rule.").replace(
      /^/gm,
      "> "
    )
    expect(findDebtLabels(quoted)).toHaveLength(1)
  })

  it("reads only the parts: prose before, between or after them is not counted", () => {
    const text = [
      "**A1: A thing.**",
      "",
      "Intro prose, mechanical; not yet a rule.",
      "",
      ...PARTS,
      "",
      "Trailing prose, mechanical; not yet a rule. Tracked: #4",
    ].join("\n")
    expect(findDebtLabels(text)).toEqual([])
  })

  it("gives the label's own line, and whether its block names an issue", () => {
    const text = `intro\n\n${withWhy("a reason;\n  mechanical; not yet a rule. Tracked: #12")}`
    expect(findDebtLabels(text)).toEqual([{ id: "A1", line: 9, tracked: true }])
  })

  it("counts only labels inside a declaration, outside fences", () => {
    const text = [
      'An invariant may be labelled "mechanical; not yet a rule".',
      "```md",
      withWhy("mechanical; not yet a rule"),
      "```",
      "## Next",
      "mechanical; not yet a rule",
    ].join("\n")
    expect(findDebtLabels(text)).toEqual([])
  })
})

describe("findDebtViolations", () => {
  const debt = (id: string, tracked: boolean): string =>
    declaration(id, [
      ...PARTS.slice(0, 3),
      `- _Why not enforced:_ mechanical; not yet a rule.${tracked ? " Tracked: #9" : ""}`,
    ])

  it("reports a label with no issue", () => {
    const violations = findDebtViolations(
      docs({ "a.md": debt("A1", false), "b.md": debt("B1", true) }),
      null
    )
    expect(violations).toEqual([
      { kind: "untrackedDebt", file: "a.md", line: 6, id: "A1" },
    ])
    expect(describePolicyViolation(violations[0]!)).toContain("Tracked: #")
  })

  it("holds the count to the base's: more fails, the same or fewer does not", () => {
    const base = docs({ "a.md": debt("A1", true) })
    expect(
      findDebtViolations(docs({ "a.md": debt("A1", true) }), base)
    ).toEqual([])
    expect(
      findDebtViolations(docs({ "a.md": declaration("A1") }), base)
    ).toEqual([])
    expect(
      findDebtViolations(
        docs({ "a.md": debt("A1", true), "b.md": debt("B1", true) }),
        base
      )
    ).toEqual([{ kind: "debtGrew", count: 2, base: 1 }])
    expect(
      findDebtViolations(
        docs({ "a.md": debt("A1", true), "b.md": debt("B1", true) }),
        null
      )
    ).toEqual([])
  })
})

describe("findHeldByViolations", () => {
  const WORKFLOW = [
    "jobs:",
    "  lint:",
    "    steps:",
    "      - run: pnpm check:a",
    "  guard:",
    "    steps:",
    "      - run: node scripts/check-b.ts --base x",
    "  stray:",
    "    steps:",
    "      - run: pnpm check:c",
    "  ci-gate:",
    "    needs:",
    "      [",
    "        lint,",
    "        guard,",
    "      ]",
    "    steps:",
    "      - uses: re-actors/alls-green@v1.3.0",
  ].join("\n")
  const SCRIPTS = {
    "check:a": "node scripts/check-a.ts",
    "check:b": "node scripts/check-b.ts",
    "check:c": "node scripts/check-c.ts",
  }
  const claude = (...names: Array<string>): Map<string, string> =>
    docs({
      "CLAUDE.md": names
        .map((name) => `A rule.\n\nHeld by: \`pnpm ${name}\``)
        .join("\n\n"),
    })

  it("passes a check run by a gated job, by its name or by its script's file", () => {
    expect(
      findHeldByViolations(claude("check:a", "check:b"), SCRIPTS, WORKFLOW)
    ).toEqual([])
  })

  it("fails a check with no script, or run only by a job the gate does not need", () => {
    expect(
      findHeldByViolations(claude("check:c", "check:gone"), SCRIPTS, WORKFLOW)
    ).toEqual([
      {
        kind: "heldByUnwired",
        file: "CLAUDE.md",
        line: 3,
        name: "check:c",
        why: "notInGate",
      },
      {
        kind: "heldByUnwired",
        file: "CLAUDE.md",
        line: 7,
        name: "check:gone",
        why: "noScript",
      },
    ])
  })

  it("reads a one-line needs list, and fails once on a gate it cannot read", () => {
    const oneLine = WORKFLOW.replace(
      /needs:\n {6}\[\n {8}lint,\n {8}guard,\n {6}\]/,
      "needs: [lint, guard]"
    )
    expect(oneLine).toContain("needs: [lint, guard]")
    expect(findHeldByViolations(claude("check:a"), SCRIPTS, oneLine)).toEqual(
      []
    )
    expect(
      findHeldByViolations(
        claude("check:a", "check:b"),
        SCRIPTS,
        "jobs:\n  lint:\n"
      )
    ).toEqual([{ kind: "gateUnreadable", why: "no `ci-gate` job" }])
    expect(
      findHeldByViolations(
        claude("check:a"),
        SCRIPTS,
        WORKFLOW.replace("        guard,", "        guard,\n        gone,")
      )
    ).toEqual([
      {
        kind: "gateUnreadable",
        why: "`ci-gate` needs `gone`, which is no job",
      },
    ])
  })

  it("drops comments: in the needs list, after it, on a job line, and as a run's only mention", () => {
    const commented = WORKFLOW.replace(
      "        lint,",
      "        # stray may skip\n        lint,"
    )
      .replace("      ]", "      ] # all of them")
      .replace("  guard:", "  guard: # the second")
    expect(
      findHeldByViolations(claude("check:a", "check:b"), SCRIPTS, commented)
    ).toEqual([])
    const echoed = WORKFLOW.replace(
      "      - run: pnpm check:a",
      "      - run: echo skipped # pnpm check:a"
    )
    expect(
      kinds(findHeldByViolations(claude("check:a"), SCRIPTS, echoed))
    ).toEqual(["heldByUnwired"])
  })

  it("reads a block scalar run, and not a job the gate may skip or a longer name", () => {
    const block = WORKFLOW.replace(
      "      - run: pnpm check:a",
      "      - run: |\n          echo first\n          pnpm check:a --strict"
    )
    expect(findHeldByViolations(claude("check:a"), SCRIPTS, block)).toEqual([])
    const skippable = `${WORKFLOW}\n      with:\n        allowed-skips: lint, stray`
    expect(
      kinds(findHeldByViolations(claude("check:a"), SCRIPTS, skippable))
    ).toEqual(["heldByUnwired"])
    const longer = WORKFLOW.replace("pnpm check:a", "pnpm check:a-longer")
    expect(
      kinds(findHeldByViolations(claude("check:a"), SCRIPTS, longer))
    ).toEqual(["heldByUnwired"])
  })

  it("does not count a step that may not run or whose failure does not count", () => {
    for (const key of ["if: false", "continue-on-error: true"]) {
      const conditional = WORKFLOW.replace(
        "      - run: pnpm check:a",
        `      - run: pnpm check:a\n        ${key}`
      )
      expect(
        kinds(findHeldByViolations(claude("check:a"), SCRIPTS, conditional)),
        key
      ).toEqual(["heldByUnwired"])
    }
    const named = WORKFLOW.replace(
      "      - run: pnpm check:a",
      "      - name: Check a\n        run: pnpm check:a"
    )
    expect(findHeldByViolations(claude("check:a"), SCRIPTS, named)).toEqual([])
  })

  it("fails a line that starts Held by in any other shape", () => {
    for (const line of [
      "Held by `pnpm check:a`",
      "Held by: pnpm check:a",
      "**Held by:** `pnpm check:a`",
      "Held by: `pnpm check:a`, `pnpm check:b`",
    ]) {
      expect(
        kinds(
          findHeldByViolations(docs({ "CLAUDE.md": line }), SCRIPTS, WORKFLOW)
        ),
        line
      ).toEqual(["heldByMalformed"])
    }
  })

  it("reads only a line that is the label alone, outside fences", () => {
    const text =
      "See `Held by: pnpm check:gone` inline.\n```\nHeld by: `pnpm check:gone`\n```"
    expect(
      findHeldByViolations(docs({ "CLAUDE.md": text }), SCRIPTS, WORKFLOW)
    ).toEqual([])
  })
})

describe("findDigestViolations", () => {
  // The IDs the digest compares are the declared ones.
  const DECLARED = [declaration("L3"), declaration("L4")].join("\n\n")
  const REVIEW = [
    "# REVIEW.md",
    "",
    "## Declared invariants: check the falsifier",
    "",
    "Evaluate `L3`'s falsifier.",
    "",
    "## The phone is Android only",
    "",
    "`pnpm check:android-only` already fails the tokens.",
  ].join("\n")
  const AGENTS = [
    "# AGENTS.md",
    "",
    "## Review guidelines",
    "",
    "- **Declared invariants: check the falsifier, then stop.** As `L3`",
    "  shows.",
    "- **The phone is Android only.** `pnpm check:android-only` already fails",
    "  the tokens.",
    "",
    "Full text: `REVIEW.md`.",
  ].join("\n")

  it("is quiet when each section has its bullet, naming the same checks and IDs", () => {
    expect(
      findDigestViolations(
        docs({ "REVIEW.md": REVIEW, "AGENTS.md": AGENTS, "ids.md": DECLARED })
      )
    ).toEqual([])
  })

  it("reports a section with no bullet, and a bullet with no section", () => {
    const agents = AGENTS.replace(
      "**The phone is Android only.**",
      "**Phones.**"
    )
    expect(
      kinds(
        findDigestViolations(
          docs({ "REVIEW.md": REVIEW, "AGENTS.md": agents, "ids.md": DECLARED })
        )
      )
    ).toEqual(["digestMissing", "digestExtra"])
  })

  it("leaves out a bullet with no bold lead, and an undeclared ID-shaped name", () => {
    const agents = AGENTS.replace(
      "Full text",
      "- A stray rule naming `ES2022`.\n\nFull text"
    )
    expect(
      findDigestViolations(
        docs({ "REVIEW.md": REVIEW, "AGENTS.md": agents, "ids.md": DECLARED })
      )
    ).toEqual([{ kind: "digestExtra", lead: "A stray rule naming `ES2022`." }])
  })

  it("reads a declared ID written without backticks too", () => {
    const review = REVIEW.replace(
      "Evaluate `L3`'s falsifier.",
      "Evaluate L3 and L4."
    )
    expect(
      findDigestViolations(
        docs({ "REVIEW.md": review, "AGENTS.md": AGENTS, "ids.md": DECLARED })
      )
    ).toEqual([
      {
        kind: "digestDrift",
        heading: "Declared invariants: check the falsifier",
        only: "REVIEW.md",
        names: ["L4"],
      },
    ])
  })

  it("reports a check or ID named on one side only", () => {
    const agents = AGENTS.replace("As `L3`", "As `L4`")
    expect(
      findDigestViolations(
        docs({ "REVIEW.md": REVIEW, "AGENTS.md": agents, "ids.md": DECLARED })
      )
    ).toEqual([
      {
        kind: "digestDrift",
        heading: "Declared invariants: check the falsifier",
        only: "REVIEW.md",
        names: ["L3"],
      },
      {
        kind: "digestDrift",
        heading: "Declared invariants: check the falsifier",
        only: "AGENTS.md",
        names: ["L4"],
      },
    ])
  })
})

describe("findReferenceViolations: paths", () => {
  it("resolves a path by its full name, a suffix, a basename or a directory", () => {
    const text = [
      "`scripts/check-test-layout.ts`",
      "`.github/workflows/pr.yml`",
      "`workflows/pr.yml`",
      "`main.tsx`",
      "`policy-docs.ts:12-20`",
      "`packages/ui/shared`",
      "`packages/ui/shared/`",
      "`.claude/skills/steward/SKILL.md`",
      "`steward/SKILL.md`",
    ].join(" ")
    expect(findReferenceViolations(policy(text), TREE)).toEqual([])
  })

  it("reports a path that is not in the tree, with its line", () => {
    const text = [
      "intro",
      "see `scripts/check-test-layoutz.ts` and `packages/ui/missing`",
      "and `.github/workflows/gone.yml` and `nowhere.md`",
    ].join("\n")
    expect(findReferenceViolations(policy(text), TREE)).toEqual([
      {
        kind: "missingPath",
        file: "CLAUDE.md",
        line: 2,
        ref: "scripts/check-test-layoutz.ts",
      },
      {
        kind: "missingPath",
        file: "CLAUDE.md",
        line: 2,
        ref: "packages/ui/missing",
      },
      {
        kind: "missingPath",
        file: "CLAUDE.md",
        line: 3,
        ref: ".github/workflows/gone.yml",
      },
      { kind: "missingPath", file: "CLAUDE.md", line: 3, ref: "nowhere.md" },
    ])
  })

  it("reads a path under a top-level directory by its full path only", () => {
    const tree = [...TREE, "packages/x/scripts/moved.ts", "scripts/other.ts"]
    expect(
      kinds(findReferenceViolations(policy("`scripts/moved.ts`"), tree))
    ).toEqual(["missingPath"])
    expect(
      findReferenceViolations(policy("`packages/x/scripts/moved.ts`"), tree)
    ).toEqual([])
  })

  it("leaves what is not a repo path alone", () => {
    const text = [
      "`pnpm check:workflows` `lib/` `core/` `dist/` `@some-ui/intent-kit`",
      "`@/lib/build-profile` `/presence` `/opt/bin/x` `origin/main` `../up`",
      "`https://example.com/x.md` `docs/*` `a b.ts` `v1.2` `0.5`",
      "`owner-guard/no-mount-snapshot` `actions/upload-artifact`",
    ].join("\n")
    expect(findReferenceViolations(policy(text), TREE)).toEqual([])
  })

  it("skips fenced code, and reads only the policy documents", () => {
    const text = ["```", "`scripts/not-there.ts`", "```", "after"].join("\n")
    expect(
      findReferenceViolations(
        policy(text, { "docs/other.md": "`scripts/not-there.ts`" }),
        TREE
      )
    ).toEqual([])
  })

  it("exempts a path in another repository, and reports an exemption nothing uses", () => {
    expect(
      kinds(
        findReferenceViolations(
          docs({
            "CLAUDE.md": "`routes.yml` only",
            "REVIEW.md": "",
            "AGENTS.md": "",
          }),
          TREE
        )
      )
    ).toEqual(["staleForeign", "staleForeign"])
  })

  it("reports a policy document that is not in the tree", () => {
    const violations = findReferenceViolations(
      docs({ "CLAUDE.md": FOREIGN, "REVIEW.md": "" }),
      TREE
    )
    expect(violations).toEqual([
      { kind: "missingPolicyDoc", file: "AGENTS.md" },
    ])
  })
})

describe("findReferenceViolations: headings", () => {
  const GOOD_CITIZEN = [
    "# Good citizen",
    "## Resource lifetimes: what is enforced, and what is not",
    "```",
    "# Not a heading",
    "```",
    "### `code` and **bold**",
  ].join("\n")
  const others = {
    "extensions/common/GOOD_CITIZEN.md": GOOD_CITIZEN,
    "docs/monorepo-boundaries.md": "# Boundaries\n## Other\n",
  }

  it("resolves a heading whole, to its title, in other case, across lines or after an arrow", () => {
    const text = [
      '`extensions/common/GOOD_CITIZEN.md` → "Resource lifetimes: what is enforced, and what is not"',
      '(`GOOD_CITIZEN.md`, "Resource lifetimes")',
      '`GOOD_CITIZEN.md`, "resource  lifetimes"',
      '`GOOD_CITIZEN.md` -> "code and bold"',
      '(`GOOD_CITIZEN.md`,\n  "Resource lifetimes:\n  what is enforced, and what is not")',
    ].join("\n")
    expect(findReferenceViolations(policy(text, others), TREE)).toEqual([])
  })

  it("reports a heading the file does not have, or only has in a fence", () => {
    const text = [
      '`GOOD_CITIZEN.md`, "Resource lifetime"',
      '`GOOD_CITIZEN.md`, "Not a heading"',
      '`docs/monorepo-boundaries.md`, "Resource lifetimes"',
    ].join("\n")
    expect(findReferenceViolations(policy(text, others), TREE)).toEqual([
      {
        kind: "missingHeading",
        file: "CLAUDE.md",
        line: 1,
        target: "GOOD_CITIZEN.md",
        heading: "Resource lifetime",
      },
      {
        kind: "missingHeading",
        file: "CLAUDE.md",
        line: 2,
        target: "GOOD_CITIZEN.md",
        heading: "Not a heading",
      },
      {
        kind: "missingHeading",
        file: "CLAUDE.md",
        line: 3,
        target: "docs/monorepo-boundaries.md",
        heading: "Resource lifetimes",
      },
    ])
  })

  it("reads a quoted word after a file as prose, not a heading", () => {
    expect(
      findReferenceViolations(
        policy('the `REVIEW.md` "not reviewable" rule'),
        TREE
      )
    ).toEqual([])
  })

  it("keeps a `#` that ends a heading's text", () => {
    const others = {
      "docs/monorepo-boundaries.md": "## Notes on C#\n## Closed ##\n",
    }
    const text =
      '`docs/monorepo-boundaries.md`, "Notes on C#" `docs/monorepo-boundaries.md`, "Closed"'
    expect(findReferenceViolations(policy(text, others), TREE)).toEqual([])
  })

  it("reports a missing file once, as a path", () => {
    expect(
      kinds(findReferenceViolations(policy('`gone.md`, "Anything"'), TREE))
    ).toEqual(["missingPath"])
  })

  it("is met by any file the basename names", () => {
    const text = '`README.md`, "Second"'
    const tree = [...TREE, "a/README.md", "b/README.md"]
    const readmes = { "a/README.md": "# First", "b/README.md": "# Second" }
    expect(findReferenceViolations(policy(text, readmes), tree)).toEqual([])
    expect(
      kinds(
        findReferenceViolations(policy('`README.md`, "Third"', readmes), tree)
      )
    ).toEqual(["missingHeading"])
  })
})

describe("describePolicyViolation", () => {
  it("says one line naming each violation's place and its fix", () => {
    const cases: Array<[PolicyViolation, string]> = [
      [
        {
          kind: "missingParts",
          file: "a.md",
          line: 4,
          id: "A1",
          missing: ["_Scope:_"],
        },
        "a.md:4",
      ],
      [
        {
          kind: "duplicateId",
          file: "b.md",
          line: 9,
          id: "A1",
          first: "a.md:4",
        },
        "b.md:9",
      ],
      [{ kind: "removedId", id: "A2" }, "A2"],
      [{ kind: "staleQuote", id: "L3", file: "CLAUDE.md" }, "L3"],
      [{ kind: "missingPolicyDoc", file: "AGENTS.md" }, "AGENTS.md"],
      [
        { kind: "missingPath", file: "CLAUDE.md", line: 7, ref: "x/y.ts" },
        "CLAUDE.md:7",
      ],
      [
        {
          kind: "missingHeading",
          file: "CLAUDE.md",
          line: 8,
          target: "REVIEW.md",
          heading: "Gone",
        },
        "CLAUDE.md:8",
      ],
      [{ kind: "staleForeign", path: "routes.yml" }, "routes.yml"],
    ]
    for (const [violation, place] of cases) {
      const text = describePolicyViolation(violation)
      expect(text).toContain(place)
      expect(text).not.toContain("\n")
    }
  })
})
