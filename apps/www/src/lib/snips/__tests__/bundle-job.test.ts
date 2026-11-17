/**
 * SN1: snips-capture.yml's bundle job builds every workspace package its
 * script imports, before running it. A fresh checkout has no `dist/`, and
 * tsx resolves `@some-ui/*` through it: the first dispatch on main (run
 * 44057475902) failed with ERR_MODULE_NOT_FOUND once the script began to
 * import `@some-ui/core-utils`, which no test ran from a fresh checkout.
 *
 * Family: every `@some-ui/*` import of the script and of the model it
 * imports (`@/lib/snips`), against the job's `--filter=` list.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const WWW = join(import.meta.dirname, "../../../..")
const REPO = join(WWW, "../..")

/** The `@some-ui/*` packages a file imports. */
function workspaceImports(file: string): ReadonlyArray<string> {
  const text = readFileSync(file, "utf8")
  return [...text.matchAll(/from "(@some-ui\/[a-z0-9-]+)/g)].map((m) => m[1])
}

/** The bundle job's text: from its key to the next top-level job. */
function bundleJob(workflow: string): string {
  const start = workflow.indexOf("\n  bundle:\n")
  if (start < 0) throw new Error("no bundle job in snips-capture.yml")
  const rest = workflow.slice(start + 1)
  const next = rest.slice(1).search(/\n {2}[a-z][a-z0-9_-]*:\n/)
  return next < 0 ? rest : rest.slice(0, next + 1)
}

describe("the bundle job builds what its script imports (SN1)", () => {
  it("names every workspace package in its build step, before the script", () => {
    const imports = new Set([
      ...workspaceImports(join(WWW, "scripts/snips-bundle.ts")),
      ...workspaceImports(join(WWW, "src/lib/snips/index.ts")),
    ])
    expect(imports.size).toBeGreaterThan(0)
    const job = bundleJob(
      readFileSync(join(REPO, ".github/workflows/snips-capture.yml"), "utf8")
    )
    const script = job.indexOf("tsx scripts/snips-bundle.ts")
    expect(script).toBeGreaterThan(0)
    for (const name of imports) {
      const built = job.indexOf(`--filter=${name}`)
      expect(built, `${name} is built in the bundle job`).toBeGreaterThan(0)
      expect(built, `${name} is built before the script runs`).toBeLessThan(
        script
      )
    }
  })
})
