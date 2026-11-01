/**
 * Session reflections on this device: `./policy`'s rules over `localStorage`.
 * Every build keeps the typed lines and one-tap answers; only the phone
 * records voice, whose audio its own module keeps beside this list under each
 * reflection's id (`lib/reflection-voice`).
 *
 * LA16 (docs/learner-data-authority.md): nothing here reaches a server. A
 * written reflection goes home through the drain (`lib/home-link/reflections`),
 * which tells this store what home holds (`trimOffline`); a spoken one goes as
 * its voice note (LA13), and the one-tap answers stay here. The import guard
 * is `eslint.config.js`.
 */
import {
  jsonOf,
  localStorageOrNull,
  openRecord,
  quarantine,
  removeRecord,
} from "@some-ui/core-utils"

import { boundedList } from "@/lib/bounded-list"

import type { Answers, Reflection } from "./policy"
import {
  admit,
  answersOf,
  beyondOffline,
  fromLegacy,
  parseReflection,
  STALE_AFTER_MS,
  withAnswers,
} from "./policy"

export {
  answersOf,
  bySession,
  describeAge,
  inOrder,
  OFFLINE_SET_WORDS,
  QUESTIONS,
  REFLECTION_LIMIT,
  REFLECTION_TEXT_MAX,
  staleCount,
} from "./policy"
export type { Answers, Reflection } from "./policy"

const KEY = "some-ui:reflections"
/** Before reflections had dates; read once, moved over, then removed. */
const LEGACY_KEY = "some-ui:session-reflections"
const SHARED_KEY = "some-ui:reflections-shared"
/** Shared marks are only a note on a card, so old ones may fall off. */
const SHARED_LIMIT = 50

type SharedMark = { sessionId: string; sharedAt: string }

export type ReflectionsSnapshot = {
  kept: ReadonlyArray<Reflection>
  shared: ReadonlyArray<SharedMark>
}

/** What keeping one came to. `failed`: the device would not store it. */
export type KeepResult = "kept" | "failed"

// No limit of its own: the offline set is `./policy`'s, so the list never
// drops one home does not hold (`boundedList` slices silently past a limit).
const list = boundedList(
  KEY,
  Number.POSITIVE_INFINITY,
  (value): value is Reflection => parseReflection(value) !== null
)

const marks = boundedList(
  SHARED_KEY,
  SHARED_LIMIT,
  (value): value is SharedMark =>
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "sessionId") === "string" &&
    typeof Reflect.get(value, "sharedAt") === "string"
)

/** Followed by 1, 2 …: the old list, as stored, when not all of it moved over. */
const LEGACY_PREFIX = `${LEGACY_KEY}:unreadable:`

function migrateLegacy(now: number): void {
  const storage = localStorageOrNull()
  if (storage === null) return
  const opened = openRecord(
    storage,
    LEGACY_KEY,
    (raw) => {
      const rows = jsonOf(raw)
      return Array.isArray(rows) ? rows : null
    },
    LEGACY_PREFIX
  )
  // Unreadable storage: read again next time. Moved: copied aside, nothing
  // to move over.
  if (opened.kind === "empty" || opened.kind === "unreadable") return
  const rows: ReadonlyArray<unknown> =
    opened.kind === "kept" ? opened.value : []
  const staleAt = new Date(now - STALE_AFTER_MS).toISOString()
  const moved = fromLegacy(rows, staleAt)
  // Oldest first, so the list (newest first) keeps their order. The old list
  // goes only once every row is stored; otherwise it is read again next
  // time, and `legacy-<sessionId>` ids keep the move idempotent.
  let movedAll = true
  for (const reflection of [...moved].reverse()) {
    movedAll &&= list.put(reflection, (r) => r.id === reflection.id)
  }
  if (!movedAll) return
  // A row it could not move over goes nowhere: the old list is copied
  // aside first, as stored.
  if (moved.length < rows.length) {
    let raw: string | null
    try {
      raw = storage.getItem(LEGACY_KEY)
    } catch {
      return
    }
    if (raw !== null && !quarantine(storage, raw, LEGACY_PREFIX)) return
  }
  // Unremoved, it is read again next time, as above.
  removeRecord(storage, LEGACY_KEY)
}

let snapshot: ReflectionsSnapshot | null = null
const listeners = new Set<() => void>()

function changed(): void {
  snapshot = null
  for (const listener of listeners) listener()
}

function onStorage(event: StorageEvent): void {
  if (event.key === null || event.key === KEY || event.key === SHARED_KEY)
    changed()
}

/** Writes `id` as `next` has it (kept, or gone); `failed` if refused. */
function put(next: ReadonlyArray<Reflection>, id: string): KeepResult {
  const incoming = next.find((r) => r.id === id)
  const written = incoming
    ? list.put(incoming, (r) => r.id === id)
    : list.remove((r) => r.id === id)
  changed()
  return written ? "kept" : "failed"
}

export const reflections = {
  subscribe(listener: () => void): () => void {
    if (listeners.size === 0) window.addEventListener("storage", onStorage)
    listeners.add(listener)
    return (): void => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        window.removeEventListener("storage", onStorage)
        // Unwatched, another tab's write would go unseen: read afresh.
        snapshot = null
      }
    }
  },

  getSnapshot(): ReflectionsSnapshot {
    if (snapshot === null) {
      migrateLegacy(Date.now())
      snapshot = { kept: list.read(), shared: marks.read() }
    }
    return snapshot
  },

  /** Keeps a typed line or a voice note's metadata; never refuses for room. */
  keep(reflection: Reflection): KeepResult {
    return put(admit(list.read(), reflection), reflection.id)
  },

  /** Sets a session's one-tap answers; all cleared lets the set go. */
  setAnswers(
    sessionId: string,
    answers: Answers,
    atMs: number | null,
    now: Date = new Date()
  ): KeepResult {
    const kept = list.read()
    const id = answersOf(kept, sessionId)?.id ?? crypto.randomUUID()
    return put(
      withAnswers(kept, sessionId, answers, {
        id,
        createdAt: now.toISOString(),
        atMs,
      }),
      id
    )
  },

  /**
   * Removes these for good; false if the device would not store that. A
   * voice note's audio is its module's to remove.
   */
  letGo(ids: ReadonlyArray<string>): boolean {
    const gone = new Set(ids)
    const removed = list.remove((r) => gone.has(r.id))
    changed()
    return removed
  },

  /**
   * Lets go of the reflections past the offline set that `held` names,
   * which home holds as they are (LA16; the drain alone calls it, with the
   * written reflections home read back).
   */
  trimOffline(held: ReadonlySet<string>): void {
    const gone = new Set(beyondOffline(list.read(), held))
    if (gone.size === 0) return
    list.remove((r) => gone.has(r.id))
    changed()
  },

  /** These sessions' reflections went out in the whole export's share. */
  markShared(sessionIds: ReadonlyArray<string>, at: Date = new Date()): void {
    for (const sessionId of new Set(sessionIds)) {
      marks.put(
        { sessionId, sharedAt: at.toISOString() },
        (m) => m.sessionId === sessionId
      )
    }
    changed()
  },
}
