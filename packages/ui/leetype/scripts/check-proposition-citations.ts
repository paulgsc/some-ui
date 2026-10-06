/**
 * CI guardrail (LTY-PROBE B1), run by `lint:corpus`. Two checks, reported
 * together:
 *
 * 1. Freshness: `generated.ts` matches what canon §7 produces now
 *    (Rem. 7.2: "generated, never transcribed").
 * 2. Citations: every `CW-P` id in the tracked tree resolves against the
 *    register and is not retired (Rem. 7.1). Only §7's own declaration
 *    lines are excluded; any other mention, in the canon too, is checked.
 *
 * Rem. 7.1's failure mode 2 (an entry with no corpus instance) is not run
 * here; see `checkRegisterCoverage` in `citation-check.ts`.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import type { Citation } from "@leetype/lib/leetype/proposition-register/citation-check"
import { checkCitations } from "@leetype/lib/leetype/proposition-register/citation-check"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import { propositionDeclarationLineNumbers } from "@leetype/lib/leetype/proposition-register/parse-canon"

import { regenerate } from "./generate-proposition-register"
import {
  CANON_RELATIVE_PATH,
  GENERATED_RELATIVE_PATH,
  repoRoot,
} from "./proposition-register-paths"

const CITATION_PATTERN = "CW-P[0-9]+"

// Whole files with no citations: `generated.ts` is data, and the register's
// own tests write dangling ids on purpose. §7's declaration lines are
// excluded separately, below.
const EXCLUDED_PATHSPECS = [
  `:(exclude)${GENERATED_RELATIVE_PATH}`,
  ":(exclude,glob)packages/ui/leetype/src/lib/leetype/proposition-register/**/*.test.ts",
]

async function checkFreshness(root: string): Promise<Array<string>> {
  const outPath = path.join(root, GENERATED_RELATIVE_PATH)
  const current = existsSync(outPath) ? readFileSync(outPath, "utf8") : ""
  const expected = await regenerate(root)
  if (current === expected) return []
  return [
    `${GENERATED_RELATIVE_PATH} is stale — it does not match what ${CANON_RELATIVE_PATH} §7 generates today. Run \`pnpm --filter @some-ui/leetype run generate:proposition-register\` and commit the result.`,
  ]
}

function scanRepoForCitations(root: string): Array<Citation> {
  let output: string
  try {
    output = execFileSync(
      "git",
      [
        "grep",
        "-I",
        "-n",
        "-o",
        "-E",
        CITATION_PATTERN,
        "--",
        ".",
        ...EXCLUDED_PATHSPECS,
      ],
      { cwd: root, encoding: "utf8" }
    ).trim()
  } catch (error) {
    // `git grep` exits 1 (not an error here) when nothing matches at all.
    if (
      error !== null &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 1
    ) {
      return []
    }
    throw error
  }

  if (output === "") return []

  const citations: Array<Citation> = []
  for (const line of output.split("\n")) {
    const match = /^(.+?):(\d+):(.+)$/.exec(line)
    if (match === null) continue
    const [, file, lineNumber, id] = match
    if (file === undefined || lineNumber === undefined || id === undefined)
      continue
    citations.push({ file, line: Number(lineNumber), id })
  }
  return citations
}

/**
 * Drops exactly §7's declaration lines from `citations`, an exclusion a
 * pathspec cannot express.
 */
function withoutDefinitionSites(
  citations: ReadonlyArray<Citation>,
  canonSource: string
): Array<Citation> {
  const declarationLines = propositionDeclarationLineNumbers(canonSource)
  return citations.filter(
    (citation) =>
      !(
        citation.file === CANON_RELATIVE_PATH &&
        declarationLines.has(citation.line)
      )
  )
}

async function main(): Promise<void> {
  const root = repoRoot()
  const canonSource = readFileSync(path.join(root, CANON_RELATIVE_PATH), "utf8")
  const citations = withoutDefinitionSites(
    scanRepoForCitations(root),
    canonSource
  )

  const violations = [
    ...(await checkFreshness(root)),
    ...checkCitations(citations, PROPOSITION_REGISTER),
  ]

  if (violations.length > 0) {
    console.error(
      `Proposition citation check failed: ${violations.length} violation(s)\n`
    )
    for (const violation of violations) {
      console.error(`  ${violation}`)
    }
    process.exitCode = 1
  } else {
    console.log(
      `Proposition citation check passed: ${citations.length} CW-P citation(s) checked against ${Object.keys(PROPOSITION_REGISTER).length} register entries.`
    )
  }
}

await main()
