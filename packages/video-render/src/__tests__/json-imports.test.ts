/**
 * VRJ1: every JSON module this package's source imports carries
 * `with { type: "json" }`, so the package loads where Node itself reads it
 * (ES modules, without a bundler): Snips Capture's specs reach it through
 * its workspace link, and Node refuses a JSON import without the attribute,
 * which stopped both captures before a single screen (#3401). Vite, vitest
 * and tsx read the attribute too.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const SRC = join(import.meta.dirname, "..")

/** Every source file under src/, tests aside. */
function sources(dir: string): Array<string> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory())
      return entry.name === "__tests__" ? [] : sources(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : []
  })
}

/** The `from` clause of a static import or re-export of a .json module, and the rest of its line. */
const JSON_IMPORT = /\bfrom\s+["'][^"']+\.json["']([^\n]*)/g

/**
 * The other two ways to load a .json module, which Node refuses alike
 * without the attribute: a side-effect `import "./x.json"` and a dynamic
 * `import("./x.json")`, each with the rest of its line.
 */
const OTHER_JSON_LOAD = /\bimport\s*(?:\(\s*)?["'][^"']+\.json["']([^\n]*)/g

/** Whether the rest of a static import's line names the JSON type first. */
const typed = (rest: string): boolean =>
  /^\s*with\s*\{\s*type:\s*["']json["']\s*\}/.test(rest)

/** Whether the rest of a dynamic import's line passes the JSON type. */
const typedDynamic = (rest: string): boolean =>
  /^\s*,\s*\{\s*with:\s*\{\s*type:\s*["']json["']\s*\}\s*\}/.test(rest)

describe("VRJ1: JSON imports carry their type", () => {
  it("finds the JSON imports it checks", () => {
    const found = sources(SRC).flatMap((file) => [
      ...readFileSync(file, "utf8").matchAll(JSON_IMPORT),
    ])
    expect(found.length).toBeGreaterThan(10)
  })

  it("names the type of every JSON module it imports", () => {
    const bare = sources(SRC).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(JSON_IMPORT)]
        .filter((m) => !typed(m[1] ?? ""))
        .map((m) => `${relative(SRC, file)}: ${m[0].trim()}`)
    )
    expect(bare).toEqual([])
  })

  it("loads no JSON module by a side-effect or dynamic import without its type", () => {
    const bare = sources(SRC).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(OTHER_JSON_LOAD)]
        .filter((m) => {
          const rest = m[1] ?? ""
          return m[0].includes("(") ? !typedDynamic(rest) : !typed(rest)
        })
        .map((m) => `${relative(SRC, file)}: ${m[0].trim()}`)
    )
    expect(bare).toEqual([])
  })
})
