/** The narration's `due`, `packet` and `check` (FEED1, FEED2); the README's "What is said" has their usage. */

import { createHash } from "node:crypto"
import { readdir } from "node:fs/promises"
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

const sumOf = (data: string): string =>
  createHash("sha256").update(data).digest("hex")

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

/** The weeks with a fill in `folder`, read from their file names; none if it doesn't exist yet. */
async function filledIn(
  folder: string,
  season: StorySeason
): Promise<ReadonlySet<number>> {
  let names: ReadonlyArray<string>
  try {
    names = await readdir(here(folder))
  } catch {
    return new Set()
  }
  const weeks = [0, ...season.weeks.map((w) => w.week)]
  return new Set(weeks.filter((w) => names.includes(fillFile(season.team, w))))
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
    const due = dueWeeks(season, await filledIn(values.folder, season))
    for (const week of due) {
      process.stdout.write(`${week}\t${fillFile(season.team, week)}\n`)
    }
    return
  }
  if (command === "packet") {
    const packet = packetOf(season, weekOf(values.week), sumOf)
    if (!packet.ok) fail(packet.problems)
    process.stdout.write(`${JSON.stringify(packet.value, null, 2)}\n`)
    return
  }
  if (command === "check" && file) {
    const week = weekOf(values.week)
    const checked = checkNarration(season, week, sumOf, await read(file))
    if (!checked.ok) fail(checked.problems.map((p) => `${file}: ${p}`))
    process.stdout.write(`${file}: ready\n`)
    return
  }
  fail(USAGE)
}

await runCommand(main)
