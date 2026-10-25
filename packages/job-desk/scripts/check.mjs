#!/usr/bin/env node
// usage: pnpm --filter @some-ui/job-desk check <file.json>
// Exits 0 only when it prints []. Reads this package's own build.
import { readFileSync } from "node:fs"
import { basename, resolve } from "node:path"
import {
  digestFindings,
  parseDecisions,
  parseDigest,
  parseJobsRun,
  parseScouts,
  runFindings,
} from "@some-ui/job-desk"

const PARSERS = new Map([
  ["some-ui.job-digest/1", parseDigest],
  ["some-ui.job-decisions/1", parseDecisions],
  ["some-ui.job-scouts/1", parseScouts],
  ["some-ui.routine-run/1", parseJobsRun],
])

function check(raw, name) {
  let schema
  try {
    schema = JSON.parse(raw)?.schema
  } catch {
    return "That file isn’t JSON."
  }
  const parse = PARSERS.get(schema)
  if (!parse) {
    return `Unknown schema ${JSON.stringify(schema)}: expected one of ${[...PARSERS.keys()].join(", ")}`
  }
  const parsed = parse(raw)
  if (!parsed.ok) return parsed.problem
  if (parse === parseDigest) return digestFindings(parsed.value)
  if (parse === parseJobsRun) return runFindings(parsed.value, name)
  return []
}

const [file] = process.argv.slice(2)
if (!file)
  throw new Error("usage: pnpm --filter @some-ui/job-desk check <file.json>")
// `pnpm --filter` runs this from the package; INIT_CWD is where it was typed.
const at = resolve(process.env.INIT_CWD ?? process.cwd(), file)
const result = check(readFileSync(at, "utf8"), basename(at))
const ready = Array.isArray(result) && result.length === 0
process.stdout.write(
  `${typeof result === "string" ? result : JSON.stringify(result, null, 2)}\n`
)
process.exitCode = ready ? 0 : 1
