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
import {
  findGrandfatherGrowth,
  type AllowlistEntry,
} from "@eslint/site-count.js"
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
      "apps/www/src/test-support/a.ts",
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

  it("treats a module importing a React binding library as React", () => {
    const source = `
      import { useQueryClient } from "@tanstack/react-query"
      export function usePrefetch() {
        const client = useQueryClient()
        return async (key: string) => { await client.prefetchQuery({ queryKey: [key] }) }
      }
    `
    expect(coordinationSites("packages/x/src/lib/queries.ts", source)).toBe(1)
  })

  it("treats a hook built only on other hooks as React: no import needed", () => {
    const declared = `
      import { useSessions } from "@/lib/tenant"
      export const useLatest = () => { const s = useSessions(); return s }
      export async function load() { return await fetch("/x") }
    `
    expect(coordinationSites("apps/www/src/lib/latest.ts", declared)).toBe(1)
    const calledOnly = `
      import { useStore } from "./store"
      export function select() { return useStore((s) => s.x) }
      export const save = async () => { await Promise.resolve() }
    `
    expect(coordinationSites("apps/www/src/lib/select.ts", calledOnly)).toBe(1)
  })

  it("treats a hook declared from a factory's result as React", () => {
    const source = `
      import { apiHooks } from "./api"
      export const useChapters = apiHooks.createQueryHook("chapters")
      export const load = async () => { await Promise.resolve() }
    `
    expect(coordinationSites("packages/x/src/data/chapters.ts", source)).toBe(1)
  })

  it("treats a hook called through a PascalCase namespace as React", () => {
    const source = `
      import * as Hooks from "./hooks"
      export function current() { return Hooks.useSession() }
      export const save = async () => { await Promise.resolve() }
    `
    expect(coordinationSites("apps/www/src/lib/current.ts", source)).toBe(1)
  })

  it("does not take a lowercase object's use-named method for a hook", () => {
    const source = `
      import { vi } from "vitest"
      vi.useFakeTimers()
      export const tick = async () => { await vi.runAllTimersAsync() }
    `
    expect(coordinationSites("packages/x/src/timers.ts", source)).toBeNull()
  })

  it("does not mistake a non-hook name or a method called use for a hook", () => {
    const source = `
      declare const app: { use: (f: unknown) => void }
      const useless = () => 0
      app.use(useless)
      export const load = async () => { await fetch("/x") }
    `
    expect(coordinationSites("packages/x/src/server.ts", source)).toBeNull()
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

const e = (
  path: string,
  sites: number,
  line: number,
  reasoned: boolean,
  grandfathered: boolean
): AllowlistEntry => ({ path, sites, line, reasoned, grandfathered })

describe("parseAllowlist", () => {
  it("reasons every entry by its group's Coordination or Grandfathered line, and marks the debt", () => {
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
      e("packages/a.tsx", 2, 4, true, true),
      e("packages/b.tsx", 1, 5, true, true),
      e("packages/c.tsx", 1, 9, true, false),
      e("packages/d.tsx", 3, 11, false, false),
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

describe("findGrandfatherGrowth (R1 and F1: the Grandfathered group only shrinks)", () => {
  const REASON = /^#\s*(?:Coordination|Grandfathered):\s*\S/
  const base = [
    "# Grandfathered: before R1",
    "3 packages/a.tsx",
    "2 packages/b.tsx",
    "",
    "# Coordination: one awaited submit",
    "1 packages/c.tsx",
  ].join("\n")
  const grow = (allowlist: string): ReturnType<typeof findGrandfatherGrowth> =>
    findGrandfatherGrowth(allowlist, base, REASON)

  it("passes the same group, a lowered count and a paid-off entry", () => {
    expect(grow(base)).toEqual([])
    expect(
      grow(
        "# Grandfathered: before R1\n1 packages/a.tsx\n\n# Coordination: x\n1 packages/c.tsx"
      )
    ).toEqual([])
  })

  it("passes debt that moves out under a reason of its own, at any count", () => {
    expect(
      grow(
        "# Grandfathered: before R1\n3 packages/a.tsx\n\n# Coordination: the mic\n5 packages/b.tsx"
      )
    ).toEqual([])
  })

  it("fails a raised count in the group", () => {
    expect(
      grow("# Grandfathered: before R1\n4 packages/a.tsx\n2 packages/b.tsx")
    ).toEqual([
      {
        kind: "raisedGrandfathered",
        path: "packages/a.tsx",
        line: 2,
        base: 3,
        listed: 4,
      },
    ])
  })

  it("fails an entry that joins the group, a reasoned one or a moved file included", () => {
    expect(
      grow(
        "# Grandfathered: before R1\n3 packages/a.tsx\n1 packages/c.tsx\n2 packages/moved/b.tsx"
      )
    ).toEqual([
      { kind: "joinedGrandfathered", path: "packages/c.tsx", line: 3 },
      { kind: "joinedGrandfathered", path: "packages/moved/b.tsx", line: 4 },
    ])
  })

  it("reads a second Grandfathered group as the same debt", () => {
    expect(
      grow(
        "# Grandfathered: before R1\n3 packages/a.tsx\n\n# Grandfathered: again\n9 packages/new.tsx"
      )
    ).toEqual([
      { kind: "joinedGrandfathered", path: "packages/new.tsx", line: 5 },
    ])
  })

  it("says where the entry goes instead", () => {
    expect(
      describeCoordinationViolation({
        kind: "joinedGrandfathered",
        path: "packages/c.tsx",
        line: 3,
      })
    ).toContain(
      'only shrinks (R1). Put it in its own group under a "# Coordination: <why>" line'
    )
    expect(
      describeCoordinationViolation({
        kind: "raisedGrandfathered",
        path: "packages/a.tsx",
        line: 2,
        base: 3,
        listed: 4,
      })
    ).toContain("rises from 3 to 4")
  })
})
