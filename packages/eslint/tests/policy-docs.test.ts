/**
 * What the policy documents' text can hold (CLAUDE.md, "Gray-area invariants:
 * declare them falsifiable"), as pure functions over markdown text.
 * `scripts/check-policy-docs.ts` feeds them every tracked `*.md`.
 */

import {
  describePolicyViolation,
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
