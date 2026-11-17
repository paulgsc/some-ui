/**
 * SN1: snips-capture.yml's bundle job names, in a build step's `run:` before
 * the step that runs its script, every workspace package the script and the
 * `@/lib` modules it imports import. The test reads the workflow's text; it
 * does not run a build. A fresh checkout has no `dist/`, and
 * tsx resolves `@some-ui/*` through it: the first dispatch on main (run
 * 44057475902) failed with ERR_MODULE_NOT_FOUND once the script began to
 * import `@some-ui/core-utils`, which no test ran from a fresh checkout.
 *
 * Family: every `@some-ui/*` import (`from`, `export … from` and bare) of
 * the script and of each `@/lib` module it imports, against the job's
 * `--filter=` arguments on non-comment lines, and their order.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const WWW = join(import.meta.dirname, "../../../..")
const REPO = join(WWW, "../..")

/** The `@some-ui/*` packages a file imports, by `from` or bare. */
function workspaceImports(text: string): ReadonlyArray<string> {
  return [...text.matchAll(/(?:from|import)\s*"(@some-ui\/[a-z0-9-]+)/g)].map(
    (m) => m[1]
  )
}

/** The `@/lib/...` modules a file imports, as files under `src/`. */
function libModules(text: string): ReadonlyArray<string> {
  return [...text.matchAll(/from "@\/(lib\/[a-z0-9/-]+)"/g)].map((m) =>
    join(WWW, "src", `${m[1]}/index.ts`)
  )
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
    const script = readFileSync(join(WWW, "scripts/snips-bundle.ts"), "utf8")
    const imports = new Set([
      ...workspaceImports(script),
      ...libModules(script).flatMap((file) =>
        workspaceImports(readFileSync(file, "utf8"))
      ),
    ])
    expect(imports.size).toBeGreaterThan(0)
    // Comments dropped, whole-line or trailing: a package named only in one
    // builds nothing.
    const job = bundleJob(
      readFileSync(join(REPO, ".github/workflows/snips-capture.yml"), "utf8")
    )
      .split("\n")
      .map((line) => line.replace(/(^|\s)#.*$/, ""))
      .join("\n")
    const runs = job.indexOf("tsx scripts/snips-bundle.ts")
    expect(runs).toBeGreaterThan(0)
    for (const name of imports) {
      // The whole name: `@some-ui/core` is not built by `@some-ui/core-utils`.
      const built = job.search(new RegExp(`--filter=${name}(?=\\s|$)`, "m"))
      expect(built, `${name} is built in the bundle job`).toBeGreaterThan(0)
      expect(built, `${name} is built before the script runs`).toBeLessThan(
        runs
      )
    }
  })
})
