/**
 * The word sets this repo keeps, read from disk for tests: the starter and
 * level-one decks that were once compiled into the app, now JSON in
 * `packages/some-content/prompts/read-aloud-generator/sets`, which the
 * learner adds from storage like any agent's set.
 *
 * Tests only. Nothing the app imports reaches this module, so the JSON never
 * enters the bundle; the files are the sets' reviewed source, not a fallback.
 */

import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { ReadAloudDeck } from "@topik/lib/topik/read-aloud/content"
import { parseReadAloudDeck } from "@topik/lib/topik/read-aloud/content"

/**
 * The repo's root, found from where the tests run: jsdom's `import.meta.url`
 * is no file path, and the package's tests run from the package.
 */
function repoRoot(from = process.cwd()): string {
  if (existsSync(join(from, "pnpm-workspace.yaml"))) return from
  const up = dirname(from)
  if (up === from) throw new Error("no pnpm-workspace.yaml above the tests")
  return repoRoot(up)
}

const SETS = join(
  repoRoot(),
  "packages/some-content/prompts/read-aloud-generator/sets"
)

/** The file as written, before any parse. */
export function rawSet(name: "starter" | "level-one"): unknown {
  // A missing file throws, so a test can never pass having read nothing.
  const raw: unknown = JSON.parse(
    readFileSync(join(SETS, `${name}.json`), "utf8")
  )
  return raw
}

const parsed = (name: "starter" | "level-one"): ReadAloudDeck => {
  const result = parseReadAloudDeck(rawSet(name))
  if (!result.ok) throw new Error(`${name}.json: ${result.error}`)
  return result.deck
}

/** Every level, a few lines each: what most drill tests read. */
export const STARTER_SET: ReadAloudDeck = parsed("starter")

/** Level one, with roles and tenses throughout: the lens tests' material. */
export const LEVEL_ONE_SET: ReadAloudDeck = parsed("level-one")
