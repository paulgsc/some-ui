/**
 * Run on session files before they are placed in Drive: each must parse and
 * keep the content obligations (Rem. 10.3). Exits 1 on a parse failure or
 * any finding.
 */
import { readFileSync } from "node:fs"
import { lintSessionFile } from "@leetype/lib/leetype/session-file"
import { SessionFileSchema } from "@leetype/types/session-file"

function check(path: string): number {
  const parsed = SessionFileSchema.safeParse(
    JSON.parse(readFileSync(path, "utf8"))
  )
  if (!parsed.success) {
    console.error(`${path}: does not parse`)
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`)
    }
    return 1
  }
  const findings = lintSessionFile(parsed.data)
  for (const finding of findings) {
    console.error(
      `${path}: ${finding.screen}: ${finding.code}: ${finding.message}`
    )
  }
  return findings.length
}

const paths = process.argv.slice(2)
if (paths.length === 0) {
  console.error(
    "usage: pnpm --filter @some-ui/leetype lint:session-file <file.json>..."
  )
  process.exitCode = 1
} else {
  const problems = paths.reduce((total, path) => total + check(path), 0)
  if (problems > 0) process.exitCode = 1
  else
    console.log(
      `OK: ${String(paths.length)} session file(s) parse and pass the lint.`
    )
}
