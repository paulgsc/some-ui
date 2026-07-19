/**
 * Folds a downloaded `<fixture-id>.eyescore.json` (produced by Comfort Lab's
 * "Download annotation" button, #727) into the committed
 * `tests/e2e/fixtures/eye-scores.json` (#729) — so a reviewer never
 * hand-edits the committed file directly.
 *
 * Validation already happened client-side: `EyeScorePanel` disables
 * "Download annotation" until `validateEyeScore` (#728) reports zero
 * issues. This script's only job is the merge — kept dependency-free (plain
 * Node `fs`/`path`, no TypeScript import) so it needs nothing beyond what
 * ships with Node itself. `mergeEyeScores` is the pure part, exported for
 * `tests/e2e/specs/merge-eye-score.spec.ts` to check directly; `main()` is
 * the thin file-I/O wrapper, guarded so importing this module for tests
 * never touches disk.
 */

/* eslint-disable no-console -- this file's only output surface is its own CLI */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const EYE_SCORES_PATH = path.resolve(
  __dirname,
  "../tests/e2e/fixtures/eye-scores.json"
)

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Pure merge: folds a `{ [fixtureId]: EyeScore }` payload into an existing
 * map, overwriting that one key, with keys sorted for a stable, reviewable
 * diff (one entry changes per re-score, not a full-file reshuffle).
 */
export function mergeEyeScores(existing, incoming) {
  if (!isPlainObject(incoming)) {
    throw new Error(
      'incoming eye-score payload is not a JSON object — expected { "<fixture-id>": EyeScore }'
    )
  }

  const incomingIds = Object.keys(incoming)
  if (incomingIds.length !== 1) {
    throw new Error(
      `expected exactly one fixture id in the incoming payload, found ${incomingIds.length}: ${incomingIds.join(", ")}`
    )
  }

  const [fixtureId] = incomingIds
  const isUpdate = fixtureId in existing

  const merged = { ...existing, ...incoming }
  const sorted = Object.fromEntries(
    Object.keys(merged)
      .sort()
      .map((id) => [id, merged[id]])
  )

  return { merged: sorted, fixtureId, isUpdate }
}

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    console.error(
      "Usage: pnpm eye-score:merge <path-to-downloaded-eyescore.json>"
    )
    process.exitCode = 1
    return
  }

  const incoming = readJson(path.resolve(inputPath), null)
  if (incoming === null) {
    console.error(`${inputPath} does not exist or is not valid JSON`)
    process.exitCode = 1
    return
  }

  const existing = readJson(EYE_SCORES_PATH, {})

  let result
  try {
    result = mergeEyeScores(existing, incoming)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  writeFileSync(EYE_SCORES_PATH, `${JSON.stringify(result.merged, null, 2)}\n`)

  const score = incoming[result.fixtureId]
  console.log(
    `${result.isUpdate ? "Updated" : "Added"} "${result.fixtureId}" in ` +
      `${path.relative(process.cwd(), EYE_SCORES_PATH)} ` +
      `(overall=${score.overall}, reviewer="${score.reviewer}")`
  )
}

// Only run the CLI when executed directly — importing this module (as the
// test spec does) must never touch disk.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
