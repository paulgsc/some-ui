/**
 * CI guardrail (LTY-PROBE B1, #1218): the fifth of this repository's
 * data-as-CI-input lint family — `scripts/check-wasm-bindgen-boundary.sh`,
 * `scripts/check-mutation-boundary.sh`, `docs/canon/scripts/check-
 * citations.sh` and `check-corpus-lint.ts` are the other four. Wired into
 * `lint:corpus` (turbo-filtered, real CI today) rather than a new
 * standalone workflow step, so it runs the same way the corpus lint
 * already does.
 *
 * Two independent checks, both reported in one run:
 *
 * 1. Freshness — `generated.ts` matches what `docs/canon/complexity-
 *    witness-canon.typ` §7 produces right now (Rem. 7.2's "generated,
 *    never transcribed").
 * 2. Citations — every `CW-P`n` found anywhere in the tracked tree (outside
 *    the register's own §7 declaration lines — not the whole canon tree;
 *    a `CW-P` mention elsewhere in that same file, or in a sibling canon,
 *    is a real citation and is checked like any other — review finding on
 *    #1241, chatgpt-codex-connector) resolves against the register, and
 *    is not a retired entry (Rem. 7.1, Amendment protocol rule 2).
 *
 * Failure mode 2 of Rem. 7.1 (a register entry with no corpus instance) is
 * deliberately not run here against real data — see `checkRegisterCoverage`'s
 * own doc comment in `citation-check.ts` for why.
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

// Excluded at the file level because the *whole* file is non-citational:
// `generated.ts` is generated data (every `"CW-Pn"` in it is a real id,
// never prose), and this module's own tests intentionally write ids that
// do not resolve against the real register (proving the dangling-citation
// direction requires exactly that). Canon §7's own declaration lines are
// excluded separately, below, at line granularity — everything else in
// docs/canon/ is real citation content and stays in scope.
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
 * Drops exactly the register's own §7 declaration lines from `citations`
 * — the one legitimate exclusion `scanRepoForCitations` can't express as
 * a pathspec, since only *some* lines of `docs/canon/complexity-witness-
 * canon.typ` are definition sites and the rest is real citation content.
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
