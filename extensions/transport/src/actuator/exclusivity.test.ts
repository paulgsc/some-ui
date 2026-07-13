import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * S9 acceptance criterion: "`actuator/` is the only directory in the
 * package containing a DOM-mutating call (grep-checkable, mirroring S4's
 * channel-purity check in the opposite direction)."
 *
 * `bootstrap/` is a deliberate, canon-declared exception: Definition D.2
 * says installing Bootstrap's sentinel "is not itself an act of
 * estimation, planning, or actuation" — it runs before any of Ĥ, Φ, or Δ
 * exist, at document rather than content granularity (Corollary D.1.1).
 * Its one `setAttribute` call is therefore excluded here by name, not
 * silently ignored.
 */

const ACTUATOR_DIR = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = join(ACTUATOR_DIR, "..")
const EXEMPT_DIRS = new Set(["bootstrap"])

const MUTATING_CALL_PATTERNS: ReadonlyArray<RegExp> = [
  /\.setAttribute\s*\(/,
  /\.removeAttribute\s*\(/,
  /\.style\s*[.=]/,
  /\.appendChild\s*\(/,
  /\.insertBefore\s*\(/,
  /\.replaceChild\s*\(/,
  /\.removeChild\s*\(/,
  /\.remove\s*\(\s*\)/,
  /\.innerHTML\s*=/,
  /\.outerHTML\s*=/,
  /\.textContent\s*=/,
  /\.classList\.(add|remove|toggle|replace)\s*\(/,
]

function allSourceFiles(dir: string): Array<string> {
  const files: Array<string> = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue
      files.push(...allSourceFiles(full))
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(full)
    }
  }
  return files
}

function topLevelDir(file: string): string {
  return relative(SRC_DIR, file).split("/")[0] ?? ""
}

function containsMutatingCall(contents: string): boolean {
  return MUTATING_CALL_PATTERNS.some((pattern) => pattern.test(contents))
}

describe("actuator/ exclusivity — the only DOM-mutating directory (besides bootstrap/'s day-zero exception)", () => {
  const files = allSourceFiles(SRC_DIR).filter(
    (file) => !EXEMPT_DIRS.has(topLevelDir(file))
  )

  for (const file of files) {
    const rel = relative(SRC_DIR, file)
    const dir = topLevelDir(file)

    if (dir === "actuator") {
      continue // actuator/ is expected to mutate the DOM; covered by the sanity check below
    }

    it(`${rel} contains no DOM-mutating call`, () => {
      const contents = readFileSync(file, "utf8")
      expect(containsMutatingCall(contents)).toBe(false)
    })
  }

  it("sanity check: actuator/ does contain a DOM-mutating call (the check above is not vacuous)", () => {
    const actuatorFiles = allSourceFiles(ACTUATOR_DIR)
    const anyMutating = actuatorFiles.some((file) =>
      containsMutatingCall(readFileSync(file, "utf8"))
    )
    expect(anyMutating).toBe(true)
  })
})
