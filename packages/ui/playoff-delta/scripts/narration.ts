/** The narration's `due`, `packet`, `check` and `index` (FEED1, FEED2, FEED4); the README's "What is said" has their usage. */

import { readdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { parseArgs } from "node:util"
import {
  checkNarration,
  dueWeeks,
  fillFile,
  narrationIndex,
  packetOf,
  type FillOnDisk,
} from "@playoff-delta/lib/narration"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { StorySeasonSchema, type StorySeason } from "@playoff-delta/lib/story"
import { problemsOf } from "@some-ui/video-render"
import { fail, here, readJson, runCommand } from "@some-ui/video-render/node"

const USAGE = [
  "usage: narration due --season <file|sample> --folder <narration folder>",
  "       narration packet --season <file|sample> --week <n>",
  "       narration check <fill.json> --season <file|sample> --week <n>",
  "       narration index --root <testing>/playoff-delta",
]

async function read(file: string): Promise<unknown> {
  try {
    return await readJson(here(file))
  } catch (error) {
    return fail([`${file} can't be read as JSON: ${String(error)}`])
  }
}

async function seasonFrom(file: string): Promise<StorySeason> {
  if (file === "sample") return SAMPLE_SEASON
  const parsed = StorySeasonSchema.safeParse(await read(file))
  if (!parsed.success) fail(problemsOf(parsed.error, file))
  return parsed.data
}

const missing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT"

/**
 * The file names in `folder`. A first run's folder doesn't exist yet, and
 * has none; a folder whose season folder doesn't exist either is a wrong
 * path, refused rather than read as a first run.
 */
async function namesIn(folder: string): Promise<ReadonlyArray<string>> {
  try {
    return await readdir(here(folder))
  } catch (error) {
    if (!missing(error))
      return fail([`${folder} can't be read: ${String(error)}`])
  }
  try {
    await readdir(dirname(here(folder)))
  } catch {
    return fail([
      `${dirname(folder)} doesn't exist: is ${folder} the right path?`,
    ])
  }
  return []
}

function weekOf(value: string | undefined): number {
  const week = Number(value)
  if (value === undefined || !Number.isInteger(week) || week < 0) fail(USAGE)
  return week
}

/** Every fill under `root`: each season folder's `narration/`. */
async function fillsUnder(root: string): Promise<ReadonlyArray<FillOnDisk>> {
  const fills: Array<FillOnDisk> = []
  const entries = await readdir(here(root), { withFileTypes: true }).catch(
    (error: unknown) => fail([`${root} can't be read: ${String(error)}`])
  )
  const seasons = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  for (const season of seasons.sort()) {
    const folder = join(root, season, "narration")
    for (const name of [...(await namesIn(folder))].sort()) {
      fills.push({
        season,
        name,
        bytes: await readFile(here(join(folder, name))),
      })
    }
  }
  return fills
}

/** Writes `<root>/index.json` whole (FEED4 #2647). */
async function writeIndex(root: string): Promise<void> {
  const index = await narrationIndex(await fillsUnder(root))
  if (!index.ok) fail(index.problems)
  const file = join(here(root), "index.json")
  await writeFile(
    `${file}.partial`,
    `${JSON.stringify(index.value, null, 2)}\n`
  )
  await rename(`${file}.partial`, file)
  process.stdout.write(`${file}: ${index.value.fills.length} fills\n`)
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      season: { type: "string" },
      week: { type: "string" },
      folder: { type: "string" },
      root: { type: "string" },
    },
  })
  const [command, file] = positionals
  if (command === "index" && values.root) return writeIndex(values.root)
  if (!values.season) fail(USAGE)
  const season = await seasonFrom(values.season)

  if (command === "due" && values.folder) {
    const due = dueWeeks(season, await namesIn(values.folder))
    for (const week of due) {
      process.stdout.write(`${week}\t${fillFile(season.team, week)}\n`)
    }
    return
  }
  if (command === "packet") {
    const packet = await packetOf(season, weekOf(values.week))
    if (!packet.ok) fail(packet.problems)
    process.stdout.write(`${JSON.stringify(packet.value, null, 2)}\n`)
    return
  }
  if (command === "check" && file) {
    const week = weekOf(values.week)
    const checked = await checkNarration(season, week, await read(file))
    if (!checked.ok) fail(checked.problems.map((p) => `${file}: ${p}`))
    process.stdout.write(`${file}: ready\n`)
    return
  }
  fail(USAGE)
}

await runCommand(main)
