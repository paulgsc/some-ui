#!/usr/bin/env node
// usage: pnpm --filter @some-ui/job-desk stands --day <today> <index.json> <drive.json>
// <drive.json> is {"brief":[names],"decisions":[names],"scout":[names]}.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { indexStands } from "@some-ui/job-desk"

const USAGE =
  "usage: pnpm --filter @some-ui/job-desk stands --day <YYYY-MM-DD> <index.json> <drive.json>"

const [flag, today, indexFile, driveFile, ...rest] = process.argv.slice(2)
if (
  flag !== "--day" ||
  !/^\d{4}-\d{2}-\d{2}$/.test(today ?? "") ||
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
const drive = read(driveFile)
const standing = indexStands(read(indexFile), today, {
  brief: drive.brief ?? [],
  decisions: drive.decisions ?? [],
  scout: drive.scout ?? [],
})
process.stdout.write(`${JSON.stringify(standing, null, 2)}\n`)
