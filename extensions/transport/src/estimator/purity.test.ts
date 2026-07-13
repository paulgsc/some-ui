import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * S6 acceptance criterion: "Estimator performs no mutation of `G_t` (no DOM
 * writes anywhere in `estimator/`)." The Estimator only folds evidence into
 * a hypothesis (Definition 5.3); §8 reserves DOM writes for the Actuator
 * alone.
 */

const ESTIMATOR_DIR = dirname(fileURLToPath(import.meta.url))

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

describe("estimator/ purity — no DOM mutation", () => {
  for (const file of sourceFiles(ESTIMATOR_DIR)) {
    it(`${file} contains no DOM-mutating call`, () => {
      const contents = readFileSync(join(ESTIMATOR_DIR, file), "utf8")
      for (const pattern of MUTATING_CALL_PATTERNS) {
        expect(contents).not.toMatch(pattern)
      }
    })
  }
})
