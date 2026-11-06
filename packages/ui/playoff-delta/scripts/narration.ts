/** The narration's `due`, `packet` and `check` (FEED1, FEED2); the README's "What is said" has their usage. */

import { readdir } from "node:fs/promises"
import { dirname } from "node:path"
import { parseArgs } from "node:util"
import {
  checkNarration,
  dueWeeks,
  fillFile,
  packetOf,
} from "@playoff-delta/lib/narration"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { StorySeasonSchema, type StorySeason } from "@playoff-delta/lib/story"
import { problemsOf } from "@some-ui/video-render"
import { fail, here, readJson, runCommand } from "@some-ui/video-render/node"

const USAGE = [
  "usage: narration due --season <file|sample> --folder <narration folder>",
  "       narration packet --season <file|sample> --week <n>",
  "       narration check <fill.json> --season <file|sample> --week <n>",
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

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      season: { type: "string" },
      week: { type: "string" },
      folder: { type: "string" },
    },
  })
  const [command, file] = positionals
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
