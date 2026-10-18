#!/usr/bin/env node
// usage: pnpm --filter @some-ui/job-desk check <file.json>
// Checks a digest, decisions or scouts file the way the phone will read it,
// picked by its `schema`. Prints [] and exits 0 when the file is ready to
// upload; otherwise prints what is wrong and exits 1. Reads this package's
// own build, so build it first (pnpm --filter @some-ui/job-desk build).
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  digestFindings,
  parseDecisions,
  parseDigest,
  parseScouts,
} from "@some-ui/job-desk"

const PARSERS = {
  "some-ui.job-decisions/1": parseDecisions,
  "some-ui.job-scouts/1": parseScouts,
}

function check(raw) {
  let schema = null
  try {
    schema = JSON.parse(raw).schema
  } catch {
    // parseDigest names the problem below
  }
  const parse = PARSERS[schema] ?? parseDigest
  const parsed = parse(raw)
  if (!parsed.ok) return parsed.problem
  return parse === parseDigest ? digestFindings(parsed.value) : []
}

const [file] = process.argv.slice(2)
if (!file)
  throw new Error("usage: pnpm --filter @some-ui/job-desk check <file.json>")
// `pnpm --filter` runs this from the package; INIT_CWD is where it was typed.
const at = resolve(process.env.INIT_CWD ?? process.cwd(), file)
const result = check(readFileSync(at, "utf8"))
const ready = Array.isArray(result) && result.length === 0
process.stdout.write(
  `${typeof result === "string" ? result : JSON.stringify(result, null, 2)}\n`
)
process.exitCode = ready ? 0 : 1
