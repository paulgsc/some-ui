/**
 * Copies what the home `file_host` publishes into the phone's database, for
 * offline study: TOPIK lessons (which exist nowhere else) and Leetype rounds
 * newer than the bundled corpus.
 *
 * One direction (home -> phone) and published content only: syncing the
 * learner's own history would need a merge rule. Every route read here is
 * uncredentialed on the server, so no sign-in is needed.
 *
 * `get` is injected: the app passes Capacitor's native HTTP (`native-http`),
 * which reaches a plain-`http:` LAN address from the WebView's `https:` page
 * (a `fetch` would be mixed content). Tests pass a second device backend
 * standing in for home, which passes the server's own contracts.
 */
import { isRecord, stringsAt } from "@/lib/device-backend/common"
import type { LessonEntry } from "@/lib/device-backend/content-store"
import {
  removeLessonsExcept,
  removeRoundsExcept,
  storedRoundHash,
  upsertLesson,
  upsertRound,
  upsertRuns,
} from "@/lib/device-backend/content-store"
import type { SqlDriver } from "@/lib/device-backend/sql"
import type { StorageBudget } from "@/lib/device-backend/storage"
import {
  ANDROID_BACKUP_BUDGET,
  budgetedDriver,
  OverBudgetError,
} from "@/lib/device-backend/storage"

/**
 * A GET against home. `body` is the answer as text; a transport that parsed
 * JSON on the way (Capacitor's does) re-serialises it.
 */
export type HomeGet = (url: string) => Promise<{ status: number; body: string }>

/** `removed`: home stopped listing it. `skipped`: it would not fit. */
type Tally = {
  listed: number
  added: number
  updated: number
  removed: number
  skipped: number
}

export type SyncReport = {
  lessons: Tally
  rounds: Tally & { runs: number }
  /** Items home listed but would not hand over, by key or id. */
  failed: Array<string>
}

export class HomeUnreachableError extends Error {
  constructor(
    readonly base: string,
    options?: ErrorOptions
  ) {
    super(`Could not reach the home server at ${base}`, options)
    this.name = "HomeUnreachableError"
  }
}

/**
 * `http://192.168.1.10:3000`, `192.168.1.10:3000/`, or a full
 * `.../api/v1` - whatever a person types - as the API base.
 */
export function homeApiBase(input: string): string {
  let base = input.trim().replace(/\/+$/, "")
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`
  return base.endsWith("/api/v1") ? base : `${base}/api/v1`
}

function isLessonEntry(value: unknown): value is LessonEntry {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.displayName === "string" &&
    typeof value.description === "string" &&
    typeof value.batchCount === "number" &&
    typeof value.totalQuestions === "number" &&
    typeof value.totalMessages === "number"
  )
}

type RoundListing = { id: string; contentHash: string }

function isRoundListing(value: unknown): value is RoundListing {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.contentHash === "string"
  )
}

async function getJson(
  get: HomeGet,
  base: string,
  route: string
): Promise<unknown> {
  let answer: { status: number; body: string }
  try {
    answer = await get(`${base}${route}`)
  } catch (cause) {
    throw new HomeUnreachableError(base, { cause })
  }
  if (answer.status !== 200) {
    throw new Error(`home answered ${answer.status} for ${route}`)
  }
  const parsed: unknown = JSON.parse(answer.body)
  return parsed
}

export async function syncFromHome(
  db: SqlDriver,
  homeInput: string,
  get: HomeGet,
  now: () => number = Date.now,
  budget: StorageBudget = ANDROID_BACKUP_BUDGET
): Promise<SyncReport> {
  const base = homeApiBase(homeInput)
  const store = budgetedDriver(db, budget)
  const empty = { listed: 0, added: 0, updated: 0, removed: 0, skipped: 0 }
  const report: SyncReport = {
    lessons: { ...empty },
    rounds: { ...empty, runs: 0 },
    failed: [],
  }

  // The manifest first; its failure fails the sync (an unreachable home must
  // be said plainly). A manifest with no `topiks` array is not an empty one,
  // and removing against it would empty the catalogue.
  const manifest = await getJson(get, base, "/curriculum/manifest.json")
  // Both listings before any write: a failed fetch aborts with nothing removed.
  const rounds = await getJson(get, base, "/leetype/rounds")
  if (!isRecord(manifest) || !Array.isArray(manifest.topiks)) {
    throw new Error("home's curriculum manifest has no `topiks` array")
  }
  const listed: Array<unknown> = manifest.topiks
  // Every key home still lists, including an entry this phone cannot read:
  // that one fails, and is not removed.
  const listedKeys = stringsAt(listed, "key")
  const entries = listed.filter(isLessonEntry)
  report.lessons.listed = listedKeys.length
  for (const key of listedKeys) {
    if (!entries.some((entry) => entry.key === key)) report.failed.push(key)
  }
  // First, so what home dropped makes room for what it added. By what home
  // lists, so a lesson that merely fails to download below is kept.
  report.lessons.removed = await removeLessonsExcept(db, listedKeys)
  for (const entry of entries) {
    try {
      const answer = await get(
        `${base}/curriculum/${encodeURIComponent(entry.key)}`
      )
      if (answer.status !== 200) throw new Error(String(answer.status))
      const outcome = await upsertLesson(store, entry, answer.body, now())
      if (outcome === "inserted") report.lessons.added += 1
      if (outcome === "updated") report.lessons.updated += 1
    } catch (error) {
      if (error instanceof OverBudgetError) report.lessons.skipped += 1
      else report.failed.push(entry.key)
    }
  }

  const roundsListed: Array<unknown> | null =
    isRecord(rounds) && Array.isArray(rounds.rounds) ? rounds.rounds : null
  const listings = (roundsListed ?? []).filter(isRoundListing)
  report.rounds.listed = listings.length
  if (roundsListed !== null) {
    report.rounds.removed = await removeRoundsExcept(
      db,
      stringsAt(roundsListed, "id"),
      "home"
    )
  }
  for (const listing of listings) {
    try {
      const id = encodeURIComponent(listing.id)
      // Same bytes: no body to fetch, but the runs still are (home can record
      // runs without changing the round, or a prior runs request failed).
      if ((await storedRoundHash(db, listing.id)) !== listing.contentHash) {
        const body = await get(`${base}/leetype/rounds/${id}`)
        if (body.status !== 200) throw new Error(String(body.status))
        const outcome = await upsertRound(
          store,
          body.body,
          now(),
          "home",
          listing.contentHash
        )
        if (outcome === "inserted") report.rounds.added += 1
        if (outcome === "updated") report.rounds.updated += 1
      }
      const runs = await get(`${base}/leetype/rounds/${id}/runs`)
      if (runs.status === 200) {
        report.rounds.runs += await upsertRuns(store, runs.body, now())
      }
    } catch (error) {
      if (error instanceof OverBudgetError) report.rounds.skipped += 1
      else report.failed.push(listing.id)
    }
  }
  return report
}
