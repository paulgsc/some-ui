/**
 * The Leetype corpus this repository ships (`packages/ui/leetype/corpus`),
 * seeded into the device's tables so rounds - and their recorded runs - play
 * on a phone that has never seen the home server.
 *
 * The same files `file_host`'s importer reads, as raw text: storing the
 * bytes rather than a re-serialisation is what keeps each round's content
 * hash equal to the hash its runs were recorded against.
 *
 * TOPIK has no counterpart here: its lessons exist only in the home
 * server's database, so they arrive by sync (`device-backend/home-sync`).
 */
import { upsertRound, upsertRuns } from "@/lib/device-backend/content-store"
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

/** Idempotent: an unchanged round is a read, not a write. */
export async function seedBundledCorpus(
  db: SqlDriver,
  nowMs: number
): Promise<SeedReport> {
  let rounds = 0
  for (const body of Object.values(ROUNDS)) {
    if ((await upsertRound(db, body, nowMs)) !== "unchanged") rounds += 1
  }
  let runs = 0
  for (const body of Object.values(RUNS)) {
    runs += await upsertRuns(db, body, nowMs)
  }
  return { rounds, runs }
}

/** How many rounds the bundle carries; tests pin it against the corpus. */
export const BUNDLED_ROUND_COUNT = Object.keys(ROUNDS).length
