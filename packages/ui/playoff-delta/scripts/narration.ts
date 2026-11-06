/**
 * The narration's two commands (FEED1, #2644), for whoever fills a week and
 * for the gate that takes it:
 *
 *   pnpm --filter @some-ui/playoff-delta narration packet --season <file|sample> --week <n>
 *   pnpm --filter @some-ui/playoff-delta narration check <fill.json> --season <file|sample> --week <n>
 *
 * `--season` is a published season (`paulgsc/testing`'s
 * `playoff-delta/<season>/<team>.json`) or `sample`, the 2025 fixture the
 * stage plays where no season is given. `--week 0` is the legend.
 *
 * `packet` prints what a filler reads (`packetOf`). `check` reads a fill and
 * says it is ready, or prints every reason it isn't and exits 1.
 */

import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import {
  checkNarration,
  packetOf,
  seasonData,
} from "@playoff-delta/lib/narration"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { parseStorySeason, type StorySeason } from "@playoff-delta/lib/story"

const USAGE = [
  "usage: narration packet --season <file|sample> --week <n>",
  "       narration check <fill.json> --season <file|sample> --week <n>",
]

/** Stops the command, saying why; the caller prints it and sets the exit code. */
class Refused extends Error {}

function fail(lines: ReadonlyArray<string>): never {
  throw new Refused(lines.join("\n"))
}

// pnpm runs a package's script in its own folder; a path is the caller's.
const callerPath = (path: string): string =>
  resolve(process.env.INIT_CWD ?? process.cwd(), path)

async function seasonFrom(path: string): Promise<StorySeason> {
  if (path === "sample") return SAMPLE_SEASON
  return parseStorySeason(JSON.parse(await readFile(callerPath(path), "utf8")))
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
    let data: unknown
    try {
      data = JSON.parse(await readFile(callerPath(file), "utf8"))
    } catch (error) {
      fail([`${file} isn't JSON: ${String(error)}`])
    }
    const checked = checkNarration(season, week, sha256, data)
    if (!checked.ok) fail(checked.problems.map((p) => `${file}: ${p}`))
    process.stdout.write(`${file}: ready\n`)
    return
  }
  fail(USAGE)
}

try {
  await main()
} catch (e) {
  if (!(e instanceof Refused)) throw e
  process.stderr.write(`${e.message}\n`)
  process.exitCode = 1
}
