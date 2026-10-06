import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { MUTATING_CALL_PATTERNS } from "../../actuator/__tests__/dom-mutation"

/**
 * S6 acceptance criterion: "Estimator performs no mutation of `G_t` (no DOM
 * writes anywhere in `estimator/`)." The Estimator only folds evidence into
 * a hypothesis (Definition 5.3); §8 reserves DOM writes for the Actuator
 * alone.
 */

const ESTIMATOR_DIR = join(dirname(fileURLToPath(import.meta.url)), "..")

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
