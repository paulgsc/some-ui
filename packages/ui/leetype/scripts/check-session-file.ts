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
 * Rounds Rem. 11.9 leaves unchecked for Prop. 9.1 are listed without failing,
 * and so are takes whose rubric says no round it covers (Rem. 11.10).
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import {
  lintSessionFile,
  negativeDiscriminationGaps,
  roundsWithoutNamedReturns,
} from "@leetype/lib/leetype/session-file"
import type { SessionFile } from "@leetype/types/session-file"
import { rubricCovers, SessionFileSchema } from "@leetype/types/session-file"

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
  const unchecked = roundsWithoutNamedReturns(parsed.data)
  if (unchecked.length > 0) {
    console.log(
      `${file}: unchecked: no return names a response it follows (\`returnFor\`) for ${unchecked.join(", ")} (Prop. 9.1, Rem. 11.9).`
    )
  }
  const unknown = Object.entries(parsed.data.screens)
    .filter(([, screen]) => screen.type === "record" && !rubricCovers(screen))
    .map(([id]) => id)
  if (unknown.length > 0) {
    console.log(
      `${file}: coverage unknown: no rubric point of ${unknown.join(", ")} says which rounds it covers (\`covers\`), so each is read as covering every round of the file still parked when it is shown (Rem. 11.10).`
    )
  }
  return { parsed: parsed.data, problems: findings.length }
}

const args = process.argv.slice(2)
const corpus = args.includes("--corpus")
const targets = args.filter((arg) => arg !== "--corpus")
const paths = targets.flatMap(filesAt)
if (targets.length > 0 && paths.length === 0) {
  console.error(`no .json session files in ${targets.join(", ")}`)
  process.exitCode = 1
} else if (paths.length === 0) {
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
      `Rem. 10.3 (5): no round another entry decides offers ${gaps.join(", ")} as a wrong option's fix, across ${String(parsed.length)} file(s).`
    )
  }
  if (problems > 0 || (corpus && gaps.length > 0)) process.exitCode = 1
  else
    console.log(
      `OK: ${String(paths.length)} session file(s) parse and pass the lint.`
    )
}
