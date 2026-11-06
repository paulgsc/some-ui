/** The narration's `packet` and `check` (FEED1, #2644); the README's "What is said" has their usage. */

import { createHash } from "node:crypto"
import { parseArgs } from "node:util"
import { checkNarration, packetOf } from "@playoff-delta/lib/narration"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import {
  seasonData,
  StorySeasonSchema,
  type StorySeason,
} from "@playoff-delta/lib/story"
import { problemsOf } from "@some-ui/video-render"
import { fail, here, readJson, runCommand } from "@some-ui/video-render/node"

const USAGE = [
  "usage: narration packet --season <file|sample> --week <n>",
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

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      season: { type: "string" },
      week: { type: "string" },
    },
  })
  const [command, file] = positionals
  const week = Number(values.week)
  if (!values.season || !Number.isInteger(week) || week < 0) fail(USAGE)
  const season = await seasonFrom(values.season)
  const sha256 = createHash("sha256").update(seasonData(season)).digest("hex")

  if (command === "packet") {
    const packet = packetOf(season, week, sha256)
    if (!packet.ok) fail(packet.problems)
    process.stdout.write(`${JSON.stringify(packet.value, null, 2)}\n`)
    return
  }
  if (command === "check" && file) {
    const checked = checkNarration(season, week, sha256, await read(file))
    if (!checked.ok) fail(checked.problems.map((p) => `${file}: ${p}`))
    process.stdout.write(`${file}: ready\n`)
    return
  }
  fail(USAGE)
}

await runCommand(main)
