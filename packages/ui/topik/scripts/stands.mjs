#!/usr/bin/env node
// usage: pnpm --filter @some-ui/topik stands --now <ISO instant> <index.json> <drive.json>
// <drive.json> is [{"name","description"}, ...]: every scene folder in
// Read aloud/sets and under Read aloud/archive/, as Drive lists them.
// Prints whether home's reflections index stands (ROUTINE.md, "Home's index").
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { withSource } from "./source.mjs"

const USAGE =
  "usage: pnpm --filter @some-ui/topik stands --now <ISO instant> <index.json> <drive.json>"

const [flag, now, indexFile, driveFile, ...rest] = process.argv.slice(2)
if (
  flag !== "--now" ||
  Number.isNaN(Date.parse(now ?? "")) ||
  indexFile === undefined ||
  driveFile === undefined ||
  rest.length > 0
) {
  throw new Error(USAGE)
}

// `pnpm --filter` runs this from the package; INIT_CWD is where it was typed.
const read = (file) =>
  JSON.parse(
    readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), file), "utf8")
  )
await withSource(
  "/src/lib/topik/home-index/index.ts",
  ({ reflectionsIndexStands }) => {
    const standing = reflectionsIndexStands(
      read(indexFile),
      now,
      read(driveFile)
    )
    process.stdout.write(`${JSON.stringify(standing, null, 2)}\n`)
  }
)
