/**
 * Run on session files before they are placed in Drive: each must parse and
 * keep the content obligations (Rem. 10.3). Exits 1 on a parse failure or
 * any finding.
 *
 * A folder stands for the `.json` files in it. Rem. 10.3 (5) is checked over
 * every file given together: each live `M`/`A` entry with no
 * negative-discrimination round is reported. That obligation is the whole
 * corpus's, which one thread does not meet alone, so the gaps fail the run
 * only with `--corpus` (the files given are the whole corpus).
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import {
  lintSessionFile,
  negativeDiscriminationGaps,
} from "@leetype/lib/leetype/session-file"
import type { SessionFile } from "@leetype/types/session-file"
import { SessionFileSchema } from "@leetype/types/session-file"

function filesAt(target: string): Array<string> {
  if (!statSync(target).isDirectory()) return [target]
  return readdirSync(target)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(target, name))
}

/** The file, parsed, and how many problems it has. */
function check(file: string): { parsed: SessionFile | null; problems: number } {
  const parsed = SessionFileSchema.safeParse(
    JSON.parse(readFileSync(file, "utf8"))
  )
  if (!parsed.success) {
    console.error(`${file}: does not parse`)
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`)
    }
    return { parsed: null, problems: 1 }
  }
  const findings = lintSessionFile(parsed.data)
  for (const finding of findings) {
    console.error(
      `${file}: ${finding.screen}: ${finding.code}: ${finding.message}`
    )
  }
  return { parsed: parsed.data, problems: findings.length }
}

const args = process.argv.slice(2)
const corpus = args.includes("--corpus")
const paths = args.filter((arg) => arg !== "--corpus").flatMap(filesAt)
if (paths.length === 0) {
  console.error(
    "usage: pnpm --filter @some-ui/leetype lint:session-file [--corpus] <file.json | folder>..."
  )
  process.exitCode = 1
} else {
  const results = paths.map(check)
  const problems = results.reduce((total, result) => total + result.problems, 0)
  const parsed = results.flatMap((result) =>
    result.parsed === null ? [] : [result.parsed]
  )
  const gaps = negativeDiscriminationGaps(parsed)
  if (gaps.length > 0) {
    const report = corpus ? console.error : console.log
    report(
      `Rem. 10.3 (5): no round another entry decides offers ${gaps.join(", ")} as an option's fix, across ${String(parsed.length)} file(s).`
    )
  }
  if (problems > 0 || (corpus && gaps.length > 0)) process.exitCode = 1
  else
    console.log(
      `OK: ${String(paths.length)} session file(s) parse and pass the lint.`
    )
}
