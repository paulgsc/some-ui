/**
 * Copies what the home `file_host` publishes into the phone's database, for
 * offline study: TOPIK lessons and the served scene trees (which exist
 * nowhere else; each under its own curriculum activity, as home lists them)
 * and Leetype rounds newer than the bundled corpus.
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
  DEFAULT_LESSON_ACTIVITY,
  removeLessonsExcept,
  removeRoundsExcept,
  storedRoundHash,
  upsertLesson,
  upsertRound,
  upsertRuns,
} from "@/lib/device-backend/content-store"
import type { SqlDriver } from "@/lib/device-backend/sql"
import { DeviceStorageError } from "@/lib/device-backend/sql"
import type { StorageBudget } from "@/lib/device-backend/storage"
import {
  ANDROID_BACKUP_BUDGET,
  budgetedDriver,
  OverBudgetError,
} from "@/lib/device-backend/storage"
import { TREE_ACTIVITY } from "@/lib/topik-content"

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
  /** The served scene trees (`TREE_ACTIVITY`). */
  trees: Tally
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

/** A curriculum manifest's entries, or a refusal to remove against it. */
function topiksOf(manifest: unknown): Array<unknown> {
  // A manifest with no `topiks` array is not an empty one, and removing
  // against it would empty the catalogue.
  if (!isRecord(manifest) || !Array.isArray(manifest.topiks)) {
    throw new Error("home's curriculum manifest has no `topiks` array")
  }
  return manifest.topiks
}

/**
 * Copies one curriculum activity's listing into `tally`. `listedAnywhere` is
 * every key home lists under any activity: a key moving to another one is
 * kept until that activity's pass replaces it.
 */
async function syncLessons(
  sync: {
    db: SqlDriver
    store: SqlDriver
    get: HomeGet
    base: string
    now: () => number
    failed: Array<string>
    listedAnywhere: Array<string>
  },
  activityId: string,
  listed: Array<unknown>,
  tally: Tally
): Promise<void> {
  const { db, store, get, base, now, failed, listedAnywhere } = sync
  // Every key home still lists, including an entry this phone cannot read:
  // that one fails, and is not removed.
  const listedKeys = stringsAt(listed, "key")
  const entries = listed.filter(isLessonEntry)
  tally.listed = listedKeys.length
  for (const key of listedKeys) {
    if (!entries.some((entry) => entry.key === key)) failed.push(key)
  }
  // First, so what home dropped makes room for what it added. By what home
  // lists, so a lesson that merely fails to download below is kept.
  tally.removed = await removeLessonsExcept(db, listedAnywhere, activityId)
  for (const entry of entries) {
    try {
      const answer = await get(
        `${base}/curriculum/${encodeURIComponent(entry.key)}`
      )
      if (answer.status !== 200) throw new Error(String(answer.status))
      const outcome = await upsertLesson(
        store,
        entry,
        answer.body,
        now(),
        activityId
      )
      if (outcome === "inserted") tally.added += 1
      if (outcome === "updated") tally.updated += 1
    } catch (error) {
      // The phone's storage failing is not this item's: stop and say so.
      if (error instanceof DeviceStorageError) throw error
      if (error instanceof OverBudgetError) tally.skipped += 1
      else failed.push(entry.key)
    }
  }
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
    trees: { ...empty },
    rounds: { ...empty, runs: 0 },
    failed: [],
  }

  // The manifests first; their failure fails the sync (an unreachable home
  // must be said plainly). Every listing before any write: a failed fetch
  // aborts with nothing removed.
  const lessons = topiksOf(
    await getJson(get, base, "/curriculum/manifest.json")
  )
  const trees = topiksOf(
    await getJson(
      get,
      base,
      `/curriculum/manifest.json?activity=${TREE_ACTIVITY}`
    )
  )
  const rounds = await getJson(get, base, "/leetype/rounds")

  // Keys are one namespace, so a home that lists a lesson in both answered
  // the tree manifest with its lessons: it predates `?activity=`. Copying
  // that listing would move every lesson under the trees' activity, so the
  // trees are left as they are until home serves them.
  const lessonKeys = stringsAt(lessons, "key")
  const treeKeys = stringsAt(trees, "key")
  const scoped = !treeKeys.some((key) => lessonKeys.includes(key))
  const sync = {
    db,
    store,
    get,
    base,
    now,
    failed: report.failed,
    listedAnywhere: scoped ? [...lessonKeys, ...treeKeys] : lessonKeys,
  }
  await syncLessons(sync, DEFAULT_LESSON_ACTIVITY, lessons, report.lessons)
  if (scoped) await syncLessons(sync, TREE_ACTIVITY, trees, report.trees)

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
      // The phone's storage failing is not this item's: stop and say so.
      if (error instanceof DeviceStorageError) throw error
      if (error instanceof OverBudgetError) report.rounds.skipped += 1
      else report.failed.push(listing.id)
    }
  }
  return report
}
