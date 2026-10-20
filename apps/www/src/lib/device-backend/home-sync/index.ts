/**
 * Copies what the home `file_host` publishes into the phone's database, for
 * offline study: TOPIK lessons and the served scene trees (which exist
 * nowhere else; each under its own curriculum activity, as home lists them)
 * and the Leetype rounds home serves.
 *
 * One direction (home -> phone) and published content only: syncing the
 * learner's own history would need a merge rule. Every route read here is
 * uncredentialed on the server, so no sign-in is needed.
 *
 * `get` is injected: the app passes `lib/home-link`'s stoppable `get`, over
 * Capacitor's native HTTP (`native-http`), which reaches a plain-`http:` LAN
 * address from the WebView's `https:` page (a `fetch` would be mixed
 * content). Tests pass a second device backend standing in for home, which
 * passes the server's own contracts.
 *
 * Lessons and runs are revalidated (`revalidated`); home being busy ends the
 * sync (`HomeBusyError`), with no retry.
 */
import { isRecord, sha256Hex, stringsAt } from "@/lib/device-backend/common"
import type { HeldBody, LessonEntry } from "@/lib/device-backend/content-store"
import {
  DEFAULT_LESSON_ACTIVITY,
  removeLessonsExcept,
  removeRoundsExcept,
  storedLesson,
  storedRoundHash,
  upsertLesson,
  upsertRound,
  upsertRuns,
} from "@/lib/device-backend/content-store"
import type { SqlDriver } from "@/lib/device-backend/sql"
import {
  DeviceStorageError,
  one,
  text,
  textOrNull,
} from "@/lib/device-backend/sql"
import type { StorageBudget } from "@/lib/device-backend/storage"
import {
  ANDROID_BACKUP_BUDGET,
  budgetedDriver,
  OverBudgetError,
} from "@/lib/device-backend/storage"
import { TREE_ACTIVITY } from "@/lib/topik-content"

/**
 * A GET against home, sent with `If-None-Match: etag` when `etag` is given.
 * `body` is the answer as text; a transport that parsed JSON on the way
 * (Capacitor's does) re-serialises it.
 */
export type HomeGet = (
  url: string,
  etag?: string
) => Promise<{ status: number; body: string; etag?: string }>

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

/**
 * The person stopped the sync (`lib/home-link`): thrown by the `get` they
 * stopped (or a send's `send`), before it sends, and never counted as an
 * item that failed. What was copied before it stays.
 */
export class SyncStoppedError extends Error {
  constructor() {
    super("the sync was stopped")
    this.name = "SyncStoppedError"
  }
}

/** Home answered `429`: it is busy. What was copied before it stays. */
export class HomeBusyError extends Error {
  constructor() {
    super("home is busy")
    this.name = "HomeBusyError"
  }
}

/**
 * The phone's storage failing, the person stopping, or home being busy is
 * not one item's failure: the sync stops and says so.
 */
function endsTheSync(error: unknown): boolean {
  return (
    error instanceof DeviceStorageError ||
    error instanceof SyncStoppedError ||
    error instanceof HomeBusyError
  )
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

/** One read's answer, and `keep`, which keeps its `ETag` once it is stored. */
type Read = {
  status: number
  body: string
  keep: () => Promise<void>
}

type Reads = {
  db: SqlDriver
  store: SqlDriver
  get: HomeGet
  /** Every address this sync revalidated. */
  read: Set<string>
}

const done = (): Promise<void> => Promise.resolve()

/**
 * `url`, revalidated (`device_home_answer`): sent with the `ETag` this phone
 * kept for it only while it holds the bytes that tag names: for a lesson its
 * row (`held`), by digest, else the body kept with the tag. A `304` then
 * answers with those bytes, as a `200`. The tag is kept only by `keep`,
 * once the caller has stored what the answer carried, and within the
 * phone's budget.
 */
async function revalidated(
  sync: Reads,
  url: string,
  held?: () => Promise<HeldBody | null>
): Promise<Read> {
  const { db, store, get } = sync
  sync.read.add(url)
  const kept = await one(
    db,
    "SELECT etag, hash, body FROM device_home_answer WHERE url = ?",
    [url]
  )
  // What the phone holds that the kept tag names: a lesson's row while its
  // digest is the one kept with the tag, or the body written with the tag.
  let holding: { body: string; etag: string } | null = null
  if (kept !== null) {
    const etag = text(kept, "etag")
    const body = textOrNull(kept, "body")
    if (held) {
      const lesson = await held()
      if (lesson !== null && lesson.hash === textOrNull(kept, "hash")) {
        holding = { body: lesson.body, etag }
      }
    } else if (body !== null) {
      holding = { body, etag }
    }
  }
  const answer = await get(url, holding?.etag)
  if (answer.status === 304 && holding !== null) {
    return { status: 200, body: holding.body, keep: done }
  }
  if (answer.status !== 200) return { ...answer, keep: done }
  const { etag } = answer
  const keep = async (): Promise<void> => {
    if (etag === undefined) {
      await db.run("DELETE FROM device_home_answer WHERE url = ?", [url])
      return
    }
    const hash = held ? await sha256Hex(answer.body) : null
    try {
      await store.transaction(() =>
        store.run(
          `INSERT INTO device_home_answer (url, etag, hash, body) VALUES (?, ?, ?, ?)
           ON CONFLICT(url) DO UPDATE SET
             etag = excluded.etag, hash = excluded.hash, body = excluded.body`,
          [url, etag, hash, held ? null : answer.body]
        )
      )
    } catch (error) {
      // A tag that does not fit costs only the next sync the download: the
      // one kept before still names its own bytes.
      if (!(error instanceof OverBudgetError)) throw error
    }
  }
  return { status: 200, body: answer.body, keep }
}

/** `get`, throwing `HomeBusyError` for each answer home was too busy for. */
function busyAware(get: HomeGet): HomeGet {
  return async (url, etag) => {
    const answer = await get(url, etag)
    if (answer.status === 429) throw new HomeBusyError()
    return answer
  }
}

/** A listing every write waits on: home unreachable or refusing fails it. */
async function getJson(
  get: HomeGet,
  base: string,
  route: string
): Promise<unknown> {
  let answer: { status: number; body: string }
  try {
    answer = await get(`${base}${route}`)
  } catch (cause) {
    if (endsTheSync(cause)) throw cause
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
  sync: Reads & {
    base: string
    now: () => number
    failed: Array<string>
    listedAnywhere: Array<string>
  },
  activityId: string,
  listed: Array<unknown>,
  tally: Tally
): Promise<void> {
  const { db, store, base, now, failed, listedAnywhere } = sync
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
      const answer = await revalidated(
        sync,
        `${base}/curriculum/${encodeURIComponent(entry.key)}`,
        () => storedLesson(db, entry.key)
      )
      if (answer.status !== 200) throw new Error(String(answer.status))
      // A `304` still writes: home can rename a lesson, or move it to
      // another activity, without changing its body.
      const outcome = await upsertLesson(
        store,
        entry,
        answer.body,
        now(),
        activityId
      )
      await answer.keep()
      if (outcome === "inserted") tally.added += 1
      if (outcome === "updated") tally.updated += 1
    } catch (error) {
      if (endsTheSync(error)) throw error
      if (error instanceof OverBudgetError) tally.skipped += 1
      else failed.push(entry.key)
    }
  }
}

export async function syncFromHome(
  db: SqlDriver,
  homeInput: string,
  homeGet: HomeGet,
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

  const get = busyAware(homeGet)
  const reads: Reads = { db, store, get, read: new Set() }
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
    ...reads,
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
      stringsAt(roundsListed, "id")
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
          listing.contentHash
        )
        if (outcome === "inserted") report.rounds.added += 1
        if (outcome === "updated") report.rounds.updated += 1
      }
      const runs = await revalidated(reads, `${base}/leetype/rounds/${id}/runs`)
      if (runs.status === 200) {
        report.rounds.runs += await upsertRuns(store, runs.body, now())
        await runs.keep()
      }
    } catch (error) {
      if (endsTheSync(error)) throw error
      if (error instanceof OverBudgetError) report.rounds.skipped += 1
      else report.failed.push(listing.id)
    }
  }
  await forgetUnread(db, reads.read)
  return report
}

/**
 * Drops every tag this sync did not read, once it read all it lists: what
 * home stopped listing, and what another address served.
 */
async function forgetUnread(
  db: SqlDriver,
  read: ReadonlySet<string>
): Promise<void> {
  const rows = await db.all("SELECT url FROM device_home_answer")
  for (const row of rows) {
    const url = text(row, "url")
    if (!read.has(url)) {
      await db.run("DELETE FROM device_home_answer WHERE url = ?", [url])
    }
  }
}
