/**
 * Every limit the phone can reach, each on the Settings page of its concern
 * (paulgsc/some-ui#2121, SM2): the row's words (`./words`), the bounds in
 * code it shows (`sources`, which `__tests__/coverage.test.ts` holds against
 * the code), and a read of where it stands, from the store that keeps it and
 * never from a copy. Phone-only (`build.paths.ts`): Settings' concern pages
 * are the APK's, and most of these stores exist only there.
 *
 * `limits` runs the reads: one snapshot per page load, which a page refreshes
 * when it opens. A read that fails says so on its row and is reported
 * (`reportFailure`); the others still show.
 */
import { formatSize } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { TopikKeptCounts } from "@some-ui/topik"
import type { BlobShelf } from "@some-ui/voice-capture"

import type { JobsState } from "@/lib/jobs/model"

import type { LimitWords } from "./words"
import { HOME_LIMITS, LIMITS_WORDS, PHONE_LIMITS, STATUS_LIMITS } from "./words"

/** The Settings concerns that show limits (`lib/front-desk`'s ids). */
export type LimitConcern = "phone" | "home" | "status"

/** How a row's numbers read: a count, a size, or days. */
type Unit = "count" | "bytes" | "days"

/** Where a limit stands: `kept` is `null` when there is nothing to count. */
export type LimitCount = {
  readonly kept: number | null
  readonly limit: number
}

export type LimitRow = {
  readonly id: string
  readonly concern: LimitConcern
  readonly words: LimitWords
  readonly unit: Unit
  /**
   * Each bound in code this row shows, as `<path from the repo root>#<name>`:
   * the constant, or the argument a `boundedList` or audio shelf is given.
   */
  readonly sources: ReadonlyArray<string>
  readonly read: () => Promise<LimitCount>
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The bytes a shelf's audio holds, read from the shelf. */
async function shelfBytes(shelf: BlobShelf): Promise<number> {
  const blobs = await Promise.all(
    (await shelf.ids()).map((id) => shelf.get(id))
  )
  return blobs.reduce((sum, blob) => sum + (blob?.size ?? 0), 0)
}

async function topik(): Promise<TopikKeptCounts> {
  const { topikKeptCounts } = await import("@some-ui/topik")
  return topikKeptCounts()
}

async function shelfCount(activity: "topik" | "leetype"): Promise<LimitCount> {
  const { createShelfClient } = await import("@/lib/shelf-client")
  const client = createShelfClient(activity)
  if (client === undefined) throw new Error("this build keeps no shelf")
  const { items, cap } = await client.list()
  return { kept: items.length, limit: cap }
}

async function jobsKept(): Promise<JobsState | null> {
  const [{ openStored }, { browserLocalStorage }] = await Promise.all([
    import("@/lib/jobs/stored"),
    import("@/lib/tenant/storage"),
  ])
  const opened = openStored(browserLocalStorage)
  if (opened.kind === "unreadable") throw new Error("jobs record unreadable")
  return opened.kind === "kept" ? opened.state : null
}

const WWW = "apps/www/src/lib"
const TOPIK = "packages/ui/topik/src/lib/topik"

export const LIMIT_ROWS: ReadonlyArray<LimitRow> = [
  {
    id: "storage",
    concern: "phone",
    words: PHONE_LIMITS.storage,
    unit: "bytes",
    sources: [`${WWW}/device-backend/storage/index.ts#ANDROID_BACKUP_BUDGET`],
    read: async (): Promise<LimitCount> => {
      const [{ deviceBackend }, { storageUse }] = await Promise.all([
        import("@/lib/device-backend/boot"),
        import("@/lib/device-backend/storage"),
      ])
      const { context } = await deviceBackend()
      const use = await storageUse(context.db, context.budget)
      return {
        kept: use.databaseBytes + use.webViewBytes,
        limit: use.quotaBytes,
      }
    },
  },
  {
    id: "wordSets",
    concern: "phone",
    words: PHONE_LIMITS.wordSets,
    unit: "count",
    sources: [`${TOPIK}/read-aloud/added-sets/index.ts#ADDED_SET_LIMIT`],
    read: async () => (await topik()).wordSets,
  },
  {
    id: "practiceDays",
    concern: "phone",
    words: PHONE_LIMITS.practiceDays,
    unit: "count",
    sources: [`${TOPIK}/read-aloud/records/index.ts#RECORD_DAYS`],
    read: async () => (await topik()).practiceDays,
  },
  {
    id: "lastDrama",
    concern: "phone",
    words: PHONE_LIMITS.lastDrama,
    unit: "days",
    sources: [`${TOPIK}/adapter/last-drama-store/index.ts#LAST_DRAMA_TTL_MS`],
    read: async (): Promise<LimitCount> => {
      const { ageMs, keptMs } = (await topik()).lastDrama
      return {
        kept: ageMs === null ? null : Math.floor(ageMs / DAY_MS),
        limit: Math.floor(keptMs / DAY_MS),
      }
    },
  },
  {
    id: "shelfKorean",
    concern: "phone",
    words: PHONE_LIMITS.shelfKorean,
    unit: "count",
    sources: [`${WWW}/device-backend/handlers/shelf/index.ts#SHELF_CAP`],
    read: () => shelfCount("topik"),
  },
  {
    id: "shelfLeetype",
    concern: "phone",
    words: PHONE_LIMITS.shelfLeetype,
    unit: "count",
    sources: [`${WWW}/device-backend/handlers/shelf/index.ts#SHELF_CAP`],
    read: () => shelfCount("leetype"),
  },
  {
    id: "stops",
    concern: "phone",
    words: PHONE_LIMITS.stops,
    unit: "count",
    sources: [`${WWW}/session-stop/index.ts#STOP_LIMIT`],
    read: async (): Promise<LimitCount> => {
      const { allStops, STOP_LIMIT } = await import("@/lib/session-stop")
      return { kept: allStops().length, limit: STOP_LIMIT }
    },
  },
  {
    id: "sessionPaths",
    concern: "phone",
    words: PHONE_LIMITS.sessionPaths,
    unit: "count",
    sources: [`${WWW}/session-stop/index.ts#STOP_LIMIT`],
    read: async (): Promise<LimitCount> => {
      const { allPathCounts, STOP_LIMIT } = await import("@/lib/session-stop")
      return { kept: allPathCounts().length, limit: STOP_LIMIT }
    },
  },
  {
    id: "sceneNotes",
    concern: "phone",
    words: PHONE_LIMITS.sceneNotes,
    unit: "count",
    sources: [
      `${WWW}/scene-voice/budget.ts#SCENE_NOTES_MAX`,
      `${WWW}/scene-voice/budget.ts#SCENE_AUDIO_MAX_BYTES`,
      `${WWW}/scene-voice/index.ts#SCENE_NOTES_MAX`,
      `${WWW}/scene-voice/index.ts#SCENE_AUDIO_MAX_BYTES`,
    ],
    read: async (): Promise<LimitCount> => {
      const [{ keptSceneNotes }, { SCENE_NOTES_MAX }] = await Promise.all([
        import("@/lib/scene-voice"),
        import("@/lib/scene-voice/budget"),
      ])
      return { kept: keptSceneNotes(), limit: SCENE_NOTES_MAX }
    },
  },
  {
    id: "jobDigests",
    concern: "phone",
    words: PHONE_LIMITS.jobDigests,
    unit: "count",
    sources: [`${WWW}/jobs/model.ts#DIGESTS_KEPT`],
    read: async (): Promise<LimitCount> => {
      const [state, { DIGESTS_KEPT }] = await Promise.all([
        jobsKept(),
        import("@/lib/jobs/model"),
      ])
      return { kept: state?.digests.length ?? 0, limit: DIGESTS_KEPT }
    },
  },
  {
    id: "jobRuns",
    concern: "phone",
    words: PHONE_LIMITS.jobRuns,
    unit: "count",
    sources: [`${WWW}/jobs/model.ts#RUNS_KEPT`],
    read: async (): Promise<LimitCount> => {
      const [state, { RUNS_KEPT }] = await Promise.all([
        jobsKept(),
        import("@/lib/jobs/model"),
      ])
      return { kept: state?.home.runs?.length ?? 0, limit: RUNS_KEPT }
    },
  },
  {
    id: "jobVoice",
    concern: "phone",
    words: PHONE_LIMITS.jobVoice,
    unit: "bytes",
    sources: [`${WWW}/jobs/index.ts#JOB_VOICE_MAX_BYTES`],
    read: async (): Promise<LimitCount> => {
      const { jobVoiceAudio, JOB_VOICE_MAX_BYTES } = await import("@/lib/jobs")
      return {
        kept: await shelfBytes(jobVoiceAudio()),
        limit: JOB_VOICE_MAX_BYTES,
      }
    },
  },
  {
    id: "voiceWaiting",
    concern: "home",
    words: HOME_LIMITS.voiceWaiting,
    unit: "bytes",
    sources: [`${WWW}/voice-home/index.ts#VOICE_HOME_MAX_BYTES`],
    read: async (): Promise<LimitCount> => {
      const { voiceHomeAudio, VOICE_HOME_MAX_BYTES } = await import(
        "@/lib/voice-home"
      )
      return {
        kept: await shelfBytes(voiceHomeAudio()),
        limit: VOICE_HOME_MAX_BYTES,
      }
    },
  },
  {
    id: "failureLog",
    concern: "status",
    words: STATUS_LIMITS.failureLog,
    unit: "count",
    sources: [`${WWW}/failure-log/index.ts#FAILURE_LOG_CAP`],
    read: async (): Promise<LimitCount> => {
      const { failureLogSnapshot, FAILURE_LOG_CAP } = await import(
        "@/lib/failure-log"
      )
      return { kept: failureLogSnapshot().length, limit: FAILURE_LOG_CAP }
    },
  },
]

const amount = (unit: Unit, n: number): string => {
  if (unit === "bytes") return formatSize(n)
  if (unit === "days") {
    return n < 1 ? LIMITS_WORDS.underADay : LIMITS_WORDS.days(n)
  }
  return String(n)
}

/** Where `row` stands at `count`, as its page says it. */
export function standingOf(
  row: Pick<LimitRow, "words" | "unit">,
  count: LimitCount
): string {
  const limit = amount(row.unit, count.limit)
  if (count.kept === null) {
    return row.words.nothing?.(limit) ?? row.words.standing("0", limit)
  }
  return row.words.standing(amount(row.unit, count.kept), limit)
}

export type LimitReading =
  | { readonly kind: "counting" }
  | { readonly kind: "counted"; readonly count: LimitCount }
  | { readonly kind: "unread" }

/** Each row's reading, by its id; a row not read yet is absent. */
export type LimitsSnapshot = Readonly<Partial<Record<string, LimitReading>>>

export type Limits = {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => LimitsSnapshot
  /**
   * Reads `concern`'s rows again. A read that lands after a newer refresh of
   * the same row began is dropped: the newer one says where it stands.
   */
  refresh: (concern: LimitConcern) => Promise<void>
}

export function createLimits(rows: ReadonlyArray<LimitRow>): Limits {
  let snapshot: LimitsSnapshot = {}
  /** Each row's newest refresh: a read from an older one is stale. */
  const generations = new Map<string, number>()
  const listeners = new Set<() => void>()

  const set = (id: string, reading: LimitReading): void => {
    snapshot = { ...snapshot, [id]: reading }
    for (const listener of listeners) listener()
  }

  const readRow = async (row: LimitRow): Promise<void> => {
    const generation = (generations.get(row.id) ?? 0) + 1
    generations.set(row.id, generation)
    if (snapshot[row.id] === undefined) set(row.id, { kind: "counting" })
    let reading: LimitReading
    try {
      reading = { kind: "counted", count: await row.read() }
    } catch (error) {
      reportFailure({ port: `limits (${row.id})`, error: toIntentError(error) })
      reading = { kind: "unread" }
    }
    if (generations.get(row.id) === generation) set(row.id, reading)
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => snapshot,
    refresh: async (concern): Promise<void> => {
      await Promise.all(
        rows.filter((row) => row.concern === concern).map(readRow)
      )
    },
  }
}

/** The phone's limits, one snapshot per page load. */
export const limits = createLimits(LIMIT_ROWS)

/** `concern`'s rows, in the order its page lists them. */
export const rowsOf = (concern: LimitConcern): ReadonlyArray<LimitRow> =>
  LIMIT_ROWS.filter((row) => row.concern === concern)
