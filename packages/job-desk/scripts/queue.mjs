#!/usr/bin/env node
// usage: pnpm --filter @some-ui/job-desk queue <digest or decisions file>...
// Prints the picks still open across every digest and decisions file named,
// each track's free slots, and the files that are neither (`skipped`).
// Reads this package's own build.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  freeSlots,
  openPicks,
  parseDecisions,
  parseDigest,
} from "@some-ui/job-desk"

const files = process.argv.slice(2)
if (files.length === 0)
  throw new Error("usage: pnpm --filter @some-ui/job-desk queue <file.json>...")

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

const open = openPicks(digests, decisions)
process.stdout.write(
  `${JSON.stringify({ open, free: freeSlots(open), skipped }, null, 2)}\n`
)
