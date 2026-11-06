/**
 * HS2's count (docs/ui-fit/README.md), as pure functions.
 * `scripts/check-stays-put.ts` feeds them the tree and
 * `scripts/stays-put.allowlist`; these cases pin what a site is. Which files
 * are phone sources is `phone-sources.ts`, pinned through gestures.test.ts;
 * the allowlist machinery is R1's (`site-count.ts`), pinned in
 * react-coordination.test.ts.
 */
import { findStaysPutViolations, staysPutSites } from "@eslint/stays-put.js"
import { describe, expect, it } from "vitest"

const PATH = "packages/ui/aph/src/components/a/index.tsx"
const sites = (source: string): number | null => staysPutSites(PATH, source)

describe("staysPutSites", () => {
  it("counts a line mounted by &&, by either role, in a string or in braces", () => {
    expect(
      sites(`
        export const A = ({ a, b, c }) => (
          <div>
            {a && <p role="alert">Not saved</p>}
            {b && (<p role={"status"}>Waiting</p>)}
            {c && <Alert>Failed</Alert>}
          </div>
        )
      `)
    ).toBe(3)
  })

  it("counts a ternary with nothing on either side", () => {
    expect(
      sites(`
        export const A = ({ a }) => (
          <div>
            {a ? <p role="alert">x</p> : null}
            {a ? undefined : <p role="status">y</p>}
            {a ? false : <Alert>z</Alert>}
          </div>
        )
      `)
    ).toBe(3)
  })

  it("counts a component that returns its line or nothing, not a nested function's return", () => {
    expect(
      sites(`
        function Problem({ problem }) {
          if (problem === null) return null
          const later = () => <p role="alert">not this one</p>
          return <p role="alert">{problem}</p>
        }
      `)
    ).toBe(1)
  })

  it("does not count a line always mounted, Reserved, a swap or another role", () => {
    expect(
      sites(`
        export const A = ({ a }) => (
          <div>
            <p role="status">{a ? "Saved" : ""}</p>
            <Reserved role="alert">{a && "Not saved"}</Reserved>
            {a ? <p role="alert">x</p> : <p>y</p>}
            {a && <div role="group">z</div>}
            {a && <p>no role</p>}
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
  it("accepts a Placement or Grandfathered reason, and nothing else", () => {
    const actual = new Map([["apps/www/src/a.tsx", 1]])
    expect(
      findStaysPutViolations(
        actual,
        "# Placement: after the last control\n1 apps/www/src/a.tsx\n"
      )
    ).toEqual([])
    expect(
      findStaysPutViolations(
        actual,
        "# Because: reasons\n1 apps/www/src/a.tsx\n"
      )
    ).toEqual([{ kind: "unreasoned", path: "apps/www/src/a.tsx", line: 2 }])
  })
})
