import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Read through a variable, as `rationale-match.test.ts` does: a literal
 * inside `new URL(...)` triggers Vite's asset-URL transform, which resolves
 * to a dev-server URL here instead of a file path.
 */
function fixture(relativePath: string): unknown {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8")
  )
}

/**
 * The LeetType A/B's five prototype sessions (variants A–E), with the six
 * factual errors its compliance audit and expert persona found corrected.
 */
export const AB_FIXTURES = ["a", "b", "c", "d", "e"].map((variant) => ({
  variant,
  raw: fixture(`./fixtures/ab-${variant}.json`),
}))
