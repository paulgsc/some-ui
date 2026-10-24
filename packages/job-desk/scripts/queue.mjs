#!/usr/bin/env node
// usage: pnpm --filter @some-ui/job-desk queue --day <today> <digest or decisions file>...
// Prints the picks still open across every digest and decisions file named,
// those that lapse on <today> (the day of the digest being written), each
// track's free slots, and the files that are neither (`skipped`).
// Reads this package's own build.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  freeSlots,
  parseDecisions,
  parseDigest,
  queueOf,
} from "@some-ui/job-desk"

const USAGE =
  "usage: pnpm --filter @some-ui/job-desk queue --day <YYYY-MM-DD> <file.json>..."

const [flag, today, ...files] = process.argv.slice(2)
if (flag !== "--day" || !/^\d{4}-\d{2}-\d{2}$/.test(today ?? "")) {
  throw new Error(USAGE)
}
if (files.length === 0) throw new Error(USAGE)

const digests = []
const decisions = []
const skipped = []
for (const file of files) {
  // `pnpm --filter` runs this from the package; INIT_CWD is where it was typed.
  const raw = readFileSync(
    resolve(process.env.INIT_CWD ?? process.cwd(), file),
    "utf8"
  )
  const asDigest = parseDigest(raw)
  const asDecisions = asDigest.ok ? null : parseDecisions(raw)
  if (asDigest.ok) digests.push(asDigest.value)
  else if (asDecisions?.ok) decisions.push(asDecisions.value)
  else skipped.push(file)
}

const { open, lapsed } = queueOf(digests, decisions, today)
process.stdout.write(
  `${JSON.stringify({ open, lapsed, free: freeSlots(open), skipped }, null, 2)}\n`
)
