#!/usr/bin/env node
// usage: pnpm --filter @some-ui/topik stands --now <ISO instant> <index.json> <drive.json>
// <drive.json> is [{"name","description"}, ...]: every scene folder in
// Read aloud/sets and under Read aloud/archive/, as Drive lists them.
// Prints whether home's reflections index stands (ROUTINE.md, "Home's index").
import { readJson, withSource } from "./source.mjs"

const USAGE =
  "usage: pnpm --filter @some-ui/topik stands --now <ISO instant> <index.json> <drive.json>"

const [flag, now, indexFile, driveFile, ...rest] = process.argv.slice(2)
if (
  flag !== "--now" ||
  indexFile === undefined ||
  driveFile === undefined ||
  rest.length > 0
) {
  throw new Error(USAGE)
}

await withSource(
  "/src/lib/topik/home-index/index.ts",
  ({ reflectionsIndexStands }) => {
    const standing = reflectionsIndexStands(
      readJson(indexFile),
      now,
      readJson(driveFile)
    )
    process.stdout.write(`${JSON.stringify(standing, null, 2)}\n`)
  }
)
