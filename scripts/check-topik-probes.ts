/**
 * Reports what each probe in one or more topik lesson files will actually do
 * on the handheld surface - `auditTopikFile`
 * (packages/ui/topik/src/lib/topik/core/probe-audit) over each file.
 *
 * Probes fail quietly at runtime on purpose (a malformed one is dropped, an
 * unknown anchor falls back to the last line), so a generated file can lose
 * half its probes and still load. Run this on every file the probe authoring
 * prompt (packages/some-content/prompts/topik-probe-author) produces, before
 * it is imported into file_host.
 *
 * Usage:
 *
 *   pnpm check:topik-probes packages/some-content/public/topiks/beginner.json
 *
 * Exits 1 when any file has an error, 0 when there are only warnings or none.
 * Runs under tsx with topik's own tsconfig, which is what resolves its
 * `@topik/*` path alias.
 */
import { readFileSync } from "node:fs"

// The repo root has no path alias to reach a package through; this is the
// same relative reach `check-test-layout.ts` and `dump-activity-catalog.ts`
// make.
// eslint-disable-next-line no-restricted-imports
import { auditTopikFile } from "../packages/ui/topik/src/lib/topik/core/probe-audit/index.ts"

const files = process.argv.slice(2)
if (files.length === 0) {
  throw new Error("usage: pnpm check:topik-probes <lesson.json>...")
}

let errors = 0
for (const file of files) {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, "utf8"))
  } catch (cause) {
    process.stdout.write(
      `${file}\n  error: cannot read as JSON: ${String(cause)}\n`
    )
    errors += 1
    continue
  }
  const findings = auditTopikFile(raw)
  process.stdout.write(`${file}${findings.length === 0 ? ": ok" : ""}\n`)
  for (const finding of findings) {
    const where = [
      finding.batch === null ? null : `conversation ${finding.batch}`,
      finding.probe,
    ]
      .filter(Boolean)
      .join(" / ")
    process.stdout.write(
      `  ${finding.severity}: ${where ? `${where}: ` : ""}${finding.message}\n`
    )
    if (finding.severity === "error") errors += 1
  }
}
process.exitCode = errors > 0 ? 1 : 0
