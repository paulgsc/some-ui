/**
 * Generates `src/lib/leetype/proposition-register/generated.ts` from
 * `docs/canon/complexity-witness-canon.typ` §7 — the `PropositionId`
 * closed union and its register text, read from the canon rather than
 * transcribed (LTY-PROBE B1, #1218, Rem. 7.1, Rem. 7.2), the same
 * discipline `dump-routes` enforces for `packages/server-routes/src/
 * generated/routes.ts` in the paired `paulgsc/server` repo.
 *
 * Usage:
 *   pnpm --filter @some-ui/leetype run generate:proposition-register
 *   pnpm --filter @some-ui/leetype run generate:proposition-register -- --check
 *
 * `--check` regenerates in memory and diffs against the committed file
 * without writing — the freshness half of `scripts/check-proposition-
 * citations.ts`, which CI runs as part of `lint:corpus`.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { formatGeneratedModule } from "@leetype/lib/leetype/proposition-register/format-generated-module"
import type { PropositionRegisterEntry } from "@leetype/lib/leetype/proposition-register/parse-canon"
import { parsePropositionRegister } from "@leetype/lib/leetype/proposition-register/parse-canon"
import * as prettier from "prettier"

import {
  CANON_RELATIVE_PATH,
  GENERATED_RELATIVE_PATH,
  repoRoot,
} from "./proposition-register-paths"

/**
 * The freshly-generated file contents, computed from the real canon on
 * disk and run through this repo's own Prettier config — shared with
 * `check-proposition-citations.ts` so both scripts agree on what "fresh"
 * means. Pre-formatted rather than left for a separate `prettier --write`
 * pass so the committed file never legitimately differs from what this
 * function returns.
 */
async function formatForOutput(
  root: string,
  entries: ReadonlyArray<PropositionRegisterEntry>
): Promise<string> {
  const outPath = path.join(root, GENERATED_RELATIVE_PATH)
  const config = await prettier.resolveConfig(outPath)
  return prettier.format(formatGeneratedModule(entries), {
    ...config,
    filepath: outPath,
  })
}

export async function regenerate(root: string): Promise<string> {
  const canonSource = readFileSync(path.join(root, CANON_RELATIVE_PATH), "utf8")
  const entries = parsePropositionRegister(canonSource)
  return formatForOutput(root, entries)
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes("--check")
  const root = repoRoot()
  const outPath = path.join(root, GENERATED_RELATIVE_PATH)
  const generated = await regenerate(root)

  if (checkOnly) {
    const current = existsSync(outPath) ? readFileSync(outPath, "utf8") : ""
    if (current !== generated) {
      console.error(
        `${GENERATED_RELATIVE_PATH} is stale — it does not match what ${CANON_RELATIVE_PATH} §7 generates today. Run \`pnpm --filter @some-ui/leetype run generate:proposition-register\` and commit the result.`
      )
      process.exitCode = 1
      return
    }
    console.log(`OK: ${GENERATED_RELATIVE_PATH} matches canon §7.`)
    return
  }

  writeFileSync(outPath, generated)
  const canonSource = readFileSync(path.join(root, CANON_RELATIVE_PATH), "utf8")
  const entryCount = parsePropositionRegister(canonSource).length
  console.log(
    `Wrote ${entryCount} proposition(s) to ${GENERATED_RELATIVE_PATH}.`
  )
}

// Guarded so `check-proposition-citations.ts` can import `regenerate`
// without also running this file's CLI (write/--check) behavior.
const invokedPath = process.argv[1]
if (invokedPath !== undefined && import.meta.url === `file://${invokedPath}`) {
  await main()
}
