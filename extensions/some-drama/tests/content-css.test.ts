/**
 * The content stylesheet ships into every page (`<all_urls>`), so a utility
 * nobody authored is not dead weight — it restyles the host. `.tab`, `.table`,
 * `.b`, `.blur`, `.btn`, `.input` all got generated at one point, harvested by
 * UnoCSS's scanner from identifiers, tag names and comments in the scanned
 * modules; `class="table"` alone is on every Bootstrap site.
 *
 * The blocklist in uno.config.ts is a denylist against English, so it only
 * ever catches the last leak. This test is the allowlist it lacks: every
 * utility the build would generate must appear in a real class string —
 * the class argument of `el()`, a `className =` assignment, or a
 * `setAttribute("class", …)` — somewhere in the scanned modules.
 */

import { globSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import unoConfig from "@drama/uno.config"
import { CONTENT_SOURCES } from "@drama/uno.sources"
import { createGenerator } from "unocss"
import { beforeAll, describe, expect, it } from "vitest"

const ROOT = resolve(import.meta.dirname, "..")

const scanned = CONTENT_SOURCES.filter((p) => !p.endsWith(".css")).flatMap(
  (pattern) => globSync(pattern, { cwd: ROOT })
)
const sources = scanned.map((f) => readFileSync(resolve(ROOT, f), "utf8"))

/** Whitespace-split tokens of every class string the modules author. */
function authoredClasses(src: string): Set<string> {
  const lists = [
    /\bel\(\s*"[^"]*"\s*,\s*"([^"]*)"/g,
    /\bclassName\s*=\s*"([^"]*)"/g,
    /setAttribute\(\s*"class"\s*,\s*"([^"]*)"/g,
  ].flatMap((re) => Array.from(src.matchAll(re), (m) => m[1] ?? ""))
  return new Set(lists.flatMap((l) => l.split(/\s+/)).filter(Boolean))
}

let matched: Array<string> = []
let authored = new Set<string>()

beforeAll(async () => {
  const uno = await createGenerator(unoConfig)
  // Generate from each module's whole source, prose included — that is what
  // the build's scanner sees.
  const result = await uno.generate(sources.join("\n"), { preflights: false })
  matched = [...result.matched].sort()
  authored = new Set(sources.flatMap((s) => [...authoredClasses(s)]))
})

describe("content stylesheet", () => {
  it("scans the modules it is meant to", () => {
    // Guards the guard: a glob typo would leave nothing scanned and pass.
    expect(scanned).toContain("src/content/content.ts")
    expect(scanned).toContain("src/components/live-strip/index.ts")
    expect(scanned.some((f) => f.includes(".stories."))).toBe(false)
  })

  it("generates only utilities some class string actually uses", () => {
    expect(matched.length).toBeGreaterThan(0)
    expect(matched.filter((u) => !authored.has(u))).toEqual([])
  })
})
