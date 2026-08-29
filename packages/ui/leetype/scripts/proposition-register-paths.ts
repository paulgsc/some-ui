import { execFileSync } from "node:child_process"

/**
 * Paths shared between `generate-proposition-register.ts` and
 * `check-proposition-citations.ts` (LTY-PROBE B1, #1218) — kept in one
 * place so the two scripts can't drift onto different files without either
 * failing loudly (a missing canon) or silently checking the wrong output.
 */

export const CANON_RELATIVE_PATH = "docs/canon/complexity-witness-canon.typ"

export const GENERATED_RELATIVE_PATH =
  "packages/ui/leetype/src/lib/leetype/proposition-register/generated.ts"

export function repoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim()
}
