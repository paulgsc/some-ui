/**
 * Session reflections on this device: `./policy`'s rules over `localStorage`.
 * Every build keeps the typed lines and one-tap answers; only the phone
 * records voice, whose audio its own module keeps beside this list under each
 * reflection's id (`lib/reflection-voice`).
 *
 * LA7 (docs/learner-data-authority.md): nothing here reaches a server. A
 * reflection leaves the device only when the person shares it, through the
 * share sheet (`lib/agent-export`), and leaves the phone for good when they do.
 * The import guard is `eslint.config.js`.
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
  fromLegacy,
  parseReflection,
  REFLECTION_LIMIT,
  STALE_AFTER_MS,
  withAnswers,
} from "./policy"

export {
  answersOf,
  bySession,
  describeAge,
  inOrder,
  NO_ROOM,
  QUESTIONS,
  REFLECTION_LIMIT,
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
export type KeepResult = "kept" | "full" | "failed"

const list = boundedList(
  KEY,
  REFLECTION_LIMIT,
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
  for (const reflection of moved.slice(0, REFLECTION_LIMIT).reverse()) {
    movedAll &&=
      admit(list.read(), reflection).kind === "kept" &&
      list.put(reflection, (r) => r.id === reflection.id)
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

/** Writes `id` as `result` has it (kept, or gone); `failed` if refused. */
function put(result: ReturnType<typeof admit>, id: string): KeepResult {
  if (result.kind === "full") return "full"
  const incoming = result.next.find((r) => r.id === id)
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

  /** Keeps a typed line or a voice note's metadata; never displaces one. */
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

  /** These sessions' reflections went out through the share sheet. */
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
