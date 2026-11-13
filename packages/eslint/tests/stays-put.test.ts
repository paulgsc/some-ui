/**
 * HS3's count (docs/ui-fit/README.md), as pure functions.
 * `scripts/check-stays-put.ts` feeds them the tree and
 * `scripts/notices.allowlist`; these cases pin what a site is. Which files
 * are phone sources is `phone-sources.ts`, pinned through gestures.test.ts;
 * the allowlist machinery is R1's (`site-count.ts`), pinned in
 * react-coordination.test.ts.
 */
import { findStaysPutViolations, staysPutSites } from "@eslint/stays-put.js"
import { describe, expect, it } from "vitest"

const PATH = "packages/ui/aph/src/components/a/index.tsx"
const sites = (source: string): number | null => staysPutSites(PATH, source)

describe("staysPutSites", () => {
  it("counts every error or status line in the layout, shown on a condition or not", () => {
    expect(
      sites(`
        export const A = ({ a }) => (
          <div>
            {a && <p role="alert">Not saved</p>}
            <p role={"status"}>{a ? "Saved" : ""}</p>
            {a ? <Alert>Failed</Alert> : null}
          </div>
        )
      `)
    ).toBe(3)
  })

  it("does not count a Notice, another role, or a line with none", () => {
    expect(
      sites(`
        export const A = ({ a }) => (
          <div>
            {a && <Notice role="alert">Not saved</Notice>}
            <div role="group">z</div>
            <p>no role</p>
          </div>
        )
      `)
    ).toBe(0)
  })

  it("counts JSX sources only", () => {
    expect(staysPutSites("apps/www/src/a.ts", "export const a = 1")).toBeNull()
  })
})

describe("findStaysPutViolations", () => {
  it("accepts a Content or Grandfathered reason, and nothing else", () => {
    const actual = new Map([["apps/www/src/a.tsx", 1]])
    expect(
      findStaysPutViolations(
        actual,
        "# Content: the figure being typed\n1 apps/www/src/a.tsx\n"
      )
    ).toEqual([])
    expect(
      findStaysPutViolations(
        actual,
        "# Placement: after the last control\n1 apps/www/src/a.tsx\n"
      )
    ).toEqual([{ kind: "unreasoned", path: "apps/www/src/a.tsx", line: 2 }])
  })
})
