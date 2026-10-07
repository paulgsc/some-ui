/**
 * The Leetype corpus this repository ships (`packages/ui/leetype/corpus`),
 * seeded so rounds and their runs play on a phone that never saw home. Raw
 * text, the same files the server's importer reads, so content hashes match
 * the runs. TOPIK lessons arrive only by sync (`device-backend/home-sync`).
 */
import { stringsAt } from "@/lib/device-backend/common"
import {
  removeRoundsExcept,
  upsertRound,
  upsertRuns,
} from "@/lib/device-backend/content-store"
import type { SqlDriver } from "@/lib/device-backend/sql"

const ROUNDS: Record<string, string> = import.meta.glob(
  [
    "../../../../../../packages/ui/leetype/corpus/rounds/*.json",
    "!../../../../../../packages/ui/leetype/corpus/rounds/manifest.json",
  ],
  { eager: true, query: "?raw", import: "default" }
)

const RUNS: Record<string, string> = import.meta.glob(
  "../../../../../../packages/ui/leetype/corpus/runs/*.json",
  { eager: true, query: "?raw", import: "default" }
)

export type SeedReport = { rounds: number; runs: number }

/**
 * Idempotent: an unchanged round is a read, not a write. A round the home
 * sync wrote, or home retired, is left as it is. A bundled round an earlier
 * build shipped and this one does not is deleted.
 */
export async function seedBundledCorpus(
  db: SqlDriver,
  nowMs: number
): Promise<SeedReport> {
  await removeRoundsExcept(
    db,
    stringsAt(
      Object.values(ROUNDS).map((body): unknown => JSON.parse(body)),
      "id"
    ),
    "bundled"
  )
  let rounds = 0
  for (const body of Object.values(ROUNDS)) {
    if ((await upsertRound(db, body, nowMs, "bundled")) !== "unchanged")
      rounds += 1
  }
  let runs = 0
  for (const body of Object.values(RUNS)) {
    runs += await upsertRuns(db, body, nowMs)
  }
  return { rounds, runs }
}

/** How many rounds the bundle carries; tests pin it against the corpus. */
export const BUNDLED_ROUND_COUNT = Object.keys(ROUNDS).length
