/**
 * SN1: snips-capture.yml's bundle job names, in a build step's `run:` before
 * the step that runs its script, every workspace package each script
 * (`snips-bundle.ts`, `walks-bundle.ts`) and the `@/lib` modules it imports
 * import. The test reads the workflow's text; it
 * does not run a build. A fresh checkout has no `dist/`, and
 * tsx resolves `@some-ui/*` through it: the first dispatch on main (run
 * 44057475902) failed with ERR_MODULE_NOT_FOUND once the script began to
 * import `@some-ui/core-utils`, which no test ran from a fresh checkout.
 *
 * Family: every `@some-ui/*` module the script and each `@/lib` module it
 * imports load at run time (`specifiersOf`, the reader RI1 holds the render
 * image with: imports, re-exports and dynamic `import()`, not types), against the job's
 * `--filter=` arguments on non-comment lines, and their order.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { specifiersOf } from "@/stage-packages"
import { describe, expect, it } from "vitest"

const WWW = join(import.meta.dirname, "../../../..")
const REPO = join(WWW, "../..")

/** The `@some-ui/*` packages a source file loads (`specifiersOf`, as RI1 reads). */
function workspaceImports(text: string): ReadonlyArray<string> {
  return specifiersOf(text, ".ts")
    .map((spec) => /^@some-ui\/[a-z0-9-]+/.exec(spec)?.[0])
    .filter((name): name is string => name !== undefined)
}

/** The `@/lib/...` modules a file loads, as files under `src/`. */
function libModules(text: string): ReadonlyArray<string> {
  return specifiersOf(text, ".ts")
    .filter((spec) => spec.startsWith("@/lib/"))
    .map((spec) => join(WWW, "src", `${spec.slice(2)}/index.ts`))
}

/** The bundle job's text: from its key to the next top-level job. */
function bundleJob(workflow: string): string {
  const start = workflow.indexOf("\n  bundle:\n")
  if (start < 0) throw new Error("no bundle job in snips-capture.yml")
  const rest = workflow.slice(start + 1)
  const next = rest.slice(1).search(/\n {2}[a-z][a-z0-9_-]*:\n/)
  return next < 0 ? rest : rest.slice(0, next + 1)
}

describe("the bundle job builds what its scripts import (SN1)", () => {
  it.each(["snips-bundle.ts", "walks-bundle.ts"])(
    "names every workspace package %s imports in its build step, before the script",
    (name) => {
      const script = readFileSync(join(WWW, "scripts", name), "utf8")
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
      const runs = job.indexOf(`tsx scripts/${name}`)
      expect(runs).toBeGreaterThan(0)
      for (const pkg of imports) {
        // The whole name: `@some-ui/core` is not built by `@some-ui/core-utils`.
        const built = job.search(new RegExp(`--filter=${pkg}(?=\\s|$)`, "m"))
        expect(built, `${pkg} is built in the bundle job`).toBeGreaterThan(0)
        expect(built, `${pkg} is built before ${name} runs`).toBeLessThan(runs)
      }
    }
  )
})

describe("the walks never fail the run the snips come in", () => {
  it("lets every walks step fail, says so, and uploads only a bundle that was made", () => {
    const job = bundleJob(
      readFileSync(join(REPO, ".github/workflows/snips-capture.yml"), "utf8")
    )
    /** The step at `marker`, up to the next step. */
    const step = (marker: string): { at: number; text: string } => {
      const at = job.indexOf(marker)
      expect(at, marker).toBeGreaterThan(0)
      const start = job.lastIndexOf("\n      - ", at)
      const end = job.indexOf("\n      - ", at)
      return { at, text: job.slice(start, end < 0 ? undefined : end) }
    }
    const snips = step("name: snips-bundle-")
    const download = step("id: walks-download")
    const write = step("id: walks\n")
    const warn = step("name: Say a walks bundle couldn't be made")
    const upload = step("name: Upload the walks bundle")
    // After the snips' bundle is uploaded, in this order.
    expect(snips.at).toBeLessThan(download.at)
    expect(download.at).toBeLessThan(write.at)
    expect(write.at).toBeLessThan(upload.at)
    expect(upload.at).toBeLessThan(warn.at)
    for (const s of [download, write, upload]) {
      // The whole line, as a key of the step: not a comment saying it.
      expect(s.text).toContain("\n        continue-on-error: true\n")
    }
    expect(warn.text).toContain(
      "if: steps.walks-download.outcome == 'failure' || steps.walks.outcome == 'failure' || steps.walks-upload.outcome == 'failure'\n"
    )
    expect(warn.text).toContain('\n        run: echo "::warning ')
    expect(upload.text).toContain("if: steps.walks.outcome == 'success'\n")
  })
})
