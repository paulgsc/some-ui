/**
 * R1's count (docs/monorepo-boundaries.md), as pure functions.
 * `scripts/check-react-coordination.ts` feeds them `git ls-files` and
 * `scripts/react-coordination.allowlist`; these cases pin the rule itself.
 * See src/react-coordination.ts for why it counts rather than judges.
 */

import {
  coordinationSites,
  describeCoordinationViolation,
  findCoordinationViolations,
  isInScope,
  parseAllowlist,
} from "@eslint/react-coordination.js"
import { describe, expect, it } from "vitest"

describe("isInScope", () => {
  it("covers source under apps, packages and extensions", () => {
    expect(isInScope("apps/www/src/routes/auth.tsx")).toBe(true)
    expect(isInScope("packages/ui/x/src/hooks/use-x.ts")).toBe(true)
    expect(isInScope("extensions/some-filter/src/popup/index.tsx")).toBe(true)
  })

  it("leaves out tests, stories, fixtures, generated files and declarations", () => {
    for (const path of [
      "packages/ui/x/src/a.test.tsx",
      "packages/ui/x/src/__tests__/a.tsx",
      "packages/ui/x/src/a.stories.tsx",
      "apps/www/e2e/a.ts",
      "packages/eslint/tests/lint-fixtures/a.tsx",
      "apps/www/src/routeTree.gen.ts",
      "packages/x/src/a.d.ts",
      "packages/x/dist/a.js",
      "scripts/a.ts",
      "packages/x/README.md",
    ])
      expect(isInScope(path)).toBe(false)
  })
})

describe("coordinationSites", () => {
  it("counts await, for await, and then/catch/finally calls", () => {
    const source = `
      import { useEffect } from "react"
      export function useX(load: () => Promise<number>, items: AsyncIterable<number>) {
        useEffect(() => {
          void (async () => {
            await load()
            for await (const item of items) console.log(item)
            load().then(String).catch(() => 0).finally(() => undefined)
          })()
        }, [load, items])
      }
    `
    expect(coordinationSites("packages/x/src/use-x.ts", source)).toBe(5)
  })

  it("counts a .tsx file with no react import: JSX makes it a React module", () => {
    const source = `
      export const X = ({ save }: { save: () => Promise<void> }) => (
        <button onClick={async () => { await save() }}>Save</button>
      )
    `
    expect(coordinationSites("packages/x/src/x.tsx", source)).toBe(1)
  })

  it("does not count the word in JSX text, a string or a comment", () => {
    const source = `
      // await this, then that
      const hint = "await the result, then .then( it"
      export const X = () => <p>We await your reply, then {hint}</p>
    `
    expect(coordinationSites("packages/x/src/x.tsx", source)).toBe(0)
  })

  it("is null for a module that is not React: R1 does not cover it", () => {
    const source = `export async function load() { return await fetch("/x") }`
    expect(coordinationSites("packages/x/src/lib/load.ts", source)).toBeNull()
  })

  it("treats a react-dom or react subpath import as React too", () => {
    expect(
      coordinationSites(
        "packages/x/src/a.ts",
        `import { flushSync } from "react-dom"\nexport const a = async () => { await 1 }`
      )
    ).toBe(1)
    expect(
      coordinationSites(
        "packages/x/src/b.ts",
        `export type { JSX } from "react/jsx-runtime"\nexport const b = async () => { await 1 }`
      )
    ).toBe(1)
  })
})

describe("parseAllowlist", () => {
  it("reasons every entry by its group's Coordination or Grandfathered line", () => {
    const { entries, problems } = parseAllowlist(
      [
        "# header, no reason",
        "",
        "# Grandfathered: before R1",
        "2 packages/a.tsx",
        "1 packages/b.tsx",
        "",
        "# a note",
        "# Coordination: one awaited submit",
        "1 packages/c.tsx",
        "",
        "3 packages/d.tsx",
      ].join("\n")
    )
    expect(problems).toEqual([])
    expect(entries).toEqual([
      { path: "packages/a.tsx", sites: 2, line: 4, reasoned: true },
      { path: "packages/b.tsx", sites: 1, line: 5, reasoned: true },
      { path: "packages/c.tsx", sites: 1, line: 9, reasoned: true },
      { path: "packages/d.tsx", sites: 3, line: 11, reasoned: false },
    ])
  })

  it("does not let an empty reason count", () => {
    const { entries } = parseAllowlist("# Coordination:\n1 packages/a.tsx")
    expect(entries[0]?.reasoned).toBe(false)
  })

  it("reports a line that is not an entry, a comment or blank", () => {
    expect(
      parseAllowlist("# Grandfathered: x\npackages/a.tsx 2").problems
    ).toEqual([{ line: 2, text: "packages/a.tsx 2" }])
  })
})

describe("findCoordinationViolations", () => {
  const listed = "# Coordination: one awaited submit\n2 packages/a.tsx\n"

  it("passes when every coordinating module is listed with its exact count", () => {
    expect(
      findCoordinationViolations(new Map([["packages/a.tsx", 2]]), listed)
    ).toEqual([])
  })

  it("fails a new coordinating module that is not listed", () => {
    expect(
      findCoordinationViolations(
        new Map([
          ["packages/a.tsx", 2],
          ["packages/new.tsx", 10],
        ]),
        listed
      )
    ).toEqual([{ kind: "unlisted", path: "packages/new.tsx", sites: 10 }])
  })

  it("fails a count that moved, up or down", () => {
    for (const sites of [1, 3])
      expect(
        findCoordinationViolations(new Map([["packages/a.tsx", sites]]), listed)
      ).toEqual([
        { kind: "changed", path: "packages/a.tsx", line: 2, listed: 2, sites },
      ])
  })

  it("fails an entry whose module no longer coordinates, or is gone", () => {
    expect(findCoordinationViolations(new Map(), listed)).toEqual([
      { kind: "stale", path: "packages/a.tsx", line: 2 },
    ])
  })

  it("fails an unreasoned, duplicate or malformed entry", () => {
    expect(
      findCoordinationViolations(
        new Map([["packages/a.tsx", 2]]),
        "2 packages/a.tsx\n2 packages/a.tsx\nnonsense"
      )
    ).toEqual([
      { kind: "malformed", line: 3, text: "nonsense" },
      { kind: "unreasoned", path: "packages/a.tsx", line: 1 },
      { kind: "duplicate", path: "packages/a.tsx", line: 2 },
    ])
  })

  it("says how to resolve each kind", () => {
    expect(
      describeCoordinationViolation({
        kind: "unlisted",
        path: "packages/new.tsx",
        sites: 10,
      })
    ).toContain('"10 packages/new.tsx" under a "# Coordination: <why>" line')
    expect(
      describeCoordinationViolation({
        kind: "changed",
        path: "packages/a.tsx",
        line: 2,
        listed: 2,
        sites: 3,
      })
    ).toContain("Grandfathered, move it under its own")
  })
})
