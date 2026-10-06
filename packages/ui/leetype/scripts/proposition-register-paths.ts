import { execFileSync } from "node:child_process"

/**
 * Paths shared by `generate-proposition-register.ts` and
 * `check-proposition-citations.ts`, so the two cannot drift onto different
 * files.
 */

export const CANON_RELATIVE_PATH = "docs/canon/complexity-witness-canon.typ"

export const GENERATED_RELATIVE_PATH =
  "packages/ui/leetype/src/lib/leetype/proposition-register/generated.ts"

export function repoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim()
}
