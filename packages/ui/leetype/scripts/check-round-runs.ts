/**
 * CI guardrail (X2, #1223): the recorded runs this package bundles
 * (`corpus/runs/<id>.json`, `lib/leetype/round-runs/bundled`) still
 * describe the reviewed rounds.
 *
 * Fails when:
 * - a reviewed round (`AUTHORED_ROUNDS`) has no transcript, or one is
 *   missing from `BUNDLED_ROUND_RUNS`;
 * - a file in `corpus/runs/` belongs to no reviewed round, or is not in the
 *   bundled map (it would never be shown);
 * - a transcript does not parse with `RoundRunsSchema`, names another
 *   round, or is empty;
 * - a transcript was recorded for other bytes than the round's current
 *   export (`contentHash` ≠ SHA-256 of `serializeRound(round)`): the round
 *   surface would silently show nothing for it;
 * - a transcript lacks a `before` or `after` run of `A` or of any `A + d`.
 *
 * The transcripts are machine-produced (Rem. 11.3). After editing a round,
 * re-record them with `paulgsc/server`'s `record-leetype-runs` and
 * `dump-leetype-snapshot` (its `apps/servers/file_host/docs/leetype-execution.md`),
 * then copy the snapshot's `runs/` here. Never edit one by hand.
 *
 * Usage: part of `pnpm --filter @some-ui/leetype lint:corpus`.
 */
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import {
  roundContentHash,
  RoundRunsSchema,
  variantOf,
} from "@leetype/lib/leetype/round-runs"
import { BUNDLED_ROUND_RUNS } from "@leetype/lib/leetype/round-runs/bundled"

const RUNS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "corpus",
  "runs"
)

async function main(): Promise<void> {
  const problems: Array<string> = []
  const files = readdirSync(RUNS_DIR).filter((name) => name.endsWith(".json"))
  const reviewed = new Set(AUTHORED_ROUNDS.map((round) => round.id))

  for (const name of files) {
    const id = name.slice(0, -".json".length)
    if (!reviewed.has(id)) {
      problems.push(`corpus/runs/${name}: no reviewed round has this id`)
    }
    if (!Object.hasOwn(BUNDLED_ROUND_RUNS, id)) {
      problems.push(
        `corpus/runs/${name}: not imported by lib/leetype/round-runs/bundled.ts`
      )
    }
  }

  for (const round of AUTHORED_ROUNDS) {
    const where = `corpus/runs/${round.id}.json`
    if (!files.includes(`${round.id}.json`)) {
      problems.push(`${where}: missing; every reviewed round needs its runs`)
      continue
    }
    const raw: unknown = JSON.parse(
      readFileSync(join(RUNS_DIR, `${round.id}.json`), "utf8")
    )
    if (JSON.stringify(raw) !== JSON.stringify(BUNDLED_ROUND_RUNS[round.id])) {
      problems.push(
        `${where}: differs from what bundled.ts imports for this id`
      )
    }
    const parsed = RoundRunsSchema.safeParse(raw)
    if (!parsed.success) {
      problems.push(`${where}: does not parse: ${parsed.error.message}`)
      continue
    }
    const transcript = parsed.data
    if (transcript.roundId !== round.id) {
      problems.push(`${where}: names round "${transcript.roundId}"`)
    }
    const hash = await roundContentHash(round)
    if (transcript.contentHash !== hash) {
      problems.push(
        `${where}: recorded for contentHash ${transcript.contentHash}, but the round's export hashes to ${hash ?? "(no Web Crypto)"}; re-record it`
      )
    }
    const variants = [
      "A",
      ...round.diffOptions.map((_, index) => variantOf(index)),
    ]
    for (const variant of variants) {
      for (const bounds of ["before", "after"] as const) {
        const found = transcript.runs.some(
          (run) => run.variant === variant && run.bounds === bounds
        )
        if (!found) problems.push(`${where}: no ${bounds} run of ${variant}`)
      }
    }
  }

  if (problems.length > 0) {
    console.error(`Recorded runs check failed: ${problems.length} problem(s)\n`)
    for (const problem of problems) console.error(`  ${problem}`)
    process.exitCode = 1
    return
  }
  console.log(
    `Recorded runs are current: ${AUTHORED_ROUNDS.length} round(s), each keyed to its export's hash.`
  )
}

await main()
