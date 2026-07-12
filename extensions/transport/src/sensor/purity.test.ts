import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * S4 acceptance criterion: "The channel never mutates the DOM (grep-
 * checkable: no `.style`, `.setAttribute`, `.remove()`, `.appendChild` etc.
 * in `sensor/`)." Enforced here as an executable test rather than only a CI
 * grep, so a violation fails `pnpm test` locally, not just in CI.
 */

const SENSOR_DIR = dirname(fileURLToPath(import.meta.url))

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

function sourceFiles(dir: string): Array<string> {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
}

describe("sensor/ purity — no DOM mutation", () => {
  for (const file of sourceFiles(SENSOR_DIR)) {
    it(`${file} contains no DOM-mutating call`, () => {
      const contents = readFileSync(join(SENSOR_DIR, file), "utf8")
      for (const pattern of MUTATING_CALL_PATTERNS) {
        expect(contents).not.toMatch(pattern)
      }
    })
  }
})
