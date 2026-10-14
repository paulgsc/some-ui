/**
 * A session index over `storage.local` with **one key per session**.
 *
 * A content-script-scoped adapter (`some-filter`, `some-censor`) mints one
 * recording per page load, so a debug page needs an index to discover them.
 * One shared array would make publishing an entry a read-modify-write, and
 * two tabs opening at once could drop each other's entry; `storage.local`
 * has no compare-and-set to build a lock on.
 *
 * ## The layout
 *
 *     <namespace>.index.<sessionId>.v2   one small entry per session
 *     <prefix><sessionId><suffix>        the recording itself (the payload)
 *
 * A tab only ever writes its own index key, so no write can lose another
 * tab's. Everything that needs the whole index — listing, the cap, and the
 * orphan sweep — enumerates keys instead, in {@link SessionIndex.compact}.
 * Where the engine has `storage.local.getKeys()` (Chrome 130+, Firefox 143+)
 * enumeration returns key names alone; elsewhere it falls back to
 * `get(null)`, which clones every payload too. So the recording path calls
 * {@link SessionIndex.compactIfCheap}, which compacts only where `getKeys()`
 * exists; on older engines the cap and the sweep are enforced when a debug
 * page opens (it calls `compact`), not before.
 *
 * ## What compaction restores
 *
 * Every payload has an index entry, at most `cap` entries exist, and every
 * index key holds a valid entry whose payload was written within
 * `unflushedGraceMs`. None of it is assumed between compactions: a session
 * evicted while live rewrites its own key on its next touch and its payload
 * on its next flush, and is listed again.
 *
 * Compaction works from one enumeration, which another tab can overtake. So
 * a deletion that depends on a key being *absent* (an orphaned payload, an
 * entry with no payload) is re-checked against storage right before the
 * removal, and the legacy migration re-enumerates once it has run.
 */

import { storageLocal, type StorageAreaLike } from "./persistence"

/** The minimum an index entry carries: identity and recency. */
export type IndexedEntry = {
  readonly sessionId: string
  readonly updatedAt: number
}

/**
 * {@link StorageAreaLike} plus the optional key enumeration newer engines
 * expose. The index feature-detects it per call.
 */
export type IndexAreaLike = StorageAreaLike & {
  getKeys?(): Promise<Array<string>>
}

export type SessionIndexOptions<E extends IndexedEntry> = {
  /**
   * Key namespace, e.g. `"bc.observability"`. Index keys are
   * `<namespace>.index.<sessionId>.v2`; a legacy shared array at
   * `<namespace>.index.v1` is migrated on first enumeration.
   */
  readonly namespace: string
  /** A session's payload key is `<prefix><sessionId><suffix>`. */
  readonly payload: { readonly prefix: string; readonly suffix: string }
  readonly isEntry: (value: unknown) => value is E
  /**
   * Resolved on every operation. Defaults to the WebExtension global's
   * `storage.local`. Absent, every operation is a no-op that reports nothing.
   */
  readonly area?: () => IndexAreaLike | undefined
  /** Most recent entries kept by {@link SessionIndex.compact}. */
  readonly cap?: number
  /**
   * How long an entry may be listed with no payload before compaction drops
   * it: a tab killed before its first flush. Far longer than any recorder's
   * flush debounce, since a background tab's timers can be throttled to one
   * a minute.
   */
  readonly unflushedGraceMs?: number
  readonly now?: () => number
}

/** What compaction could not do, and at which step. */
export type CompactionFailure = {
  /**
   * `"survey"`: enumeration failed, so nothing is known and `entries` is
   * empty. `"removal"`: the listing stands, but nothing was deleted.
   */
  readonly stage: "survey" | "removal"
  readonly message: string
}

export type Compaction<E> = {
  /** The listed sessions after compaction, newest first, at most `cap`. */
  readonly entries: ReadonlyArray<E>
  /** Sessions past the cap: index key and payload deleted. */
  readonly evicted: ReadonlyArray<string>
  /** Payloads no entry lists: deleted. */
  readonly orphaned: ReadonlyArray<string>
  /**
   * Index keys deleted on their own: a value that is not an entry, or an
   * entry with no payload past `unflushedGraceMs`.
   */
  readonly discarded: ReadonlyArray<string>
  /**
   * Set when a step failed. On a removal failure, `evicted`, `orphaned` and
   * `discarded` are empty, since they report deletions and none happened.
   */
  readonly failure?: CompactionFailure
}

export type SessionIndex<E extends IndexedEntry> = {
  indexKey(sessionId: string): string
  payloadKey(sessionId: string): string
  /** The legacy shared-array key, migrated on first enumeration. */
  readonly legacyKey: string
  /** Publish or refresh one entry. One `set` of one key; never reads. */
  touch(entry: E): Promise<void>
  /** Forget a session: its index key and its payload. */
  remove(sessionId: string): Promise<void>
  /** List, enforce the cap and sweep. Never throws; see `failure`. */
  compact(): Promise<Compaction<E>>
  /** {@link compact}, only where the engine enumerates key names alone. */
  compactIfCheap(): Promise<void>
}

const DEFAULT_INDEX_CAP = 20
const DEFAULT_UNFLUSHED_GRACE_MS = 5 * 60_000

const NOTHING: Compaction<never> = {
  entries: [],
  evicted: [],
  orphaned: [],
  discarded: [],
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function createSessionIndex<E extends IndexedEntry>(
  options: SessionIndexOptions<E>
): SessionIndex<E> {
  const {
    namespace,
    payload,
    isEntry,
    cap = DEFAULT_INDEX_CAP,
    unflushedGraceMs = DEFAULT_UNFLUSHED_GRACE_MS,
    now = Date.now,
  } = options
  const resolveArea: () => IndexAreaLike | undefined =
    options.area ?? storageLocal
  const prefix = `${namespace}.index.`
  const suffix = ".v2"
  const legacyKey = `${namespace}.index.v1`
  const indexKey = (sessionId: string): string =>
    `${prefix}${sessionId}${suffix}`
  const payloadKey = (sessionId: string): string =>
    `${payload.prefix}${sessionId}${payload.suffix}`

  const between = (
    key: string,
    head: string,
    tail: string
  ): string | undefined =>
    key.length > head.length + tail.length &&
    key.startsWith(head) &&
    key.endsWith(tail)
      ? key.slice(head.length, key.length - tail.length)
      : undefined

  const byRecency = (a: E, b: E): number => b.updatedAt - a.updatedAt

  async function allKeys(area: IndexAreaLike): Promise<Array<string>> {
    if (typeof area.getKeys === "function") return area.getKeys()
    const everything: unknown = await area.get(null)
    return everything !== null && typeof everything === "object"
      ? Object.keys(everything)
      : []
  }

  async function read(
    area: IndexAreaLike,
    keys: ReadonlyArray<string>
  ): Promise<Record<string, unknown>> {
    if (keys.length === 0) return {}
    const raw: unknown = await area.get([...keys])
    const out: Record<string, unknown> = {}
    if (raw === null || typeof raw !== "object") return out
    for (const key of keys) {
      const value: unknown = Reflect.get(raw, key)
      if (value !== undefined) out[key] = value
    }
    return out
  }

  /**
   * Move the legacy shared-array index to per-session keys, once. Only
   * entries whose payload still exists are carried over: the array could list
   * a recording whose bundle was gone.
   */
  async function migrateLegacy(
    area: IndexAreaLike,
    keys: ReadonlyArray<string>
  ): Promise<void> {
    const value = (await read(area, [legacyKey]))[legacyKey]
    const present = new Set(keys)
    const carried: Array<E> = Array.isArray(value)
      ? value
          .filter(isEntry)
          .filter((e) => present.has(payloadKey(e.sessionId)))
      : []
    if (carried.length > 0) {
      const items: Record<string, unknown> = {}
      for (const entry of carried) items[indexKey(entry.sessionId)] = entry
      await area.set(items)
    }
    await area.remove(legacyKey)
  }

  type Survey = {
    /** Every valid entry, newest first. */
    entries: Array<E>
    /** Sessions whose index key holds something that is not an entry. */
    malformed: Array<string>
    /** Sessions with a payload. */
    payloads: Set<string>
  }

  async function survey(area: IndexAreaLike): Promise<Survey> {
    let keys = await allKeys(area)
    if (keys.includes(legacyKey)) {
      await migrateLegacy(area, keys)
      // Another tab may have migrated first, so this tab's enumeration can
      // predate the per-session keys: without re-reading, every payload
      // would look orphaned.
      keys = await allKeys(area)
    }
    const indexed = new Map<string, string>()
    const payloads = new Set<string>()
    for (const key of keys) {
      const listed = between(key, prefix, suffix)
      if (listed !== undefined) indexed.set(key, listed)
      const stored = between(key, payload.prefix, payload.suffix)
      if (stored !== undefined) payloads.add(stored)
    }
    const values = await read(area, [...indexed.keys()])
    const entries: Array<E> = []
    const malformed: Array<string> = []
    for (const [key, sessionId] of indexed) {
      if (!(key in values)) continue
      const value = values[key]
      if (isEntry(value)) entries.push(value)
      else malformed.push(sessionId)
    }
    return { entries: entries.sort(byRecency), malformed, payloads }
  }

  async function compact(area: IndexAreaLike): Promise<Compaction<E>> {
    let surveyed: Survey
    try {
      surveyed = await survey(area)
    } catch (e) {
      return { ...NOTHING, failure: { stage: "survey", message: messageOf(e) } }
    }
    const { entries, malformed, payloads } = surveyed
    const listed = new Set(entries.map((e) => e.sessionId))
    const cutoff = now() - unflushedGraceMs
    const unflushedCandidates = entries
      .filter((e) => !payloads.has(e.sessionId) && e.updatedAt < cutoff)
      .map((e) => e.sessionId)
    const orphanCandidates = [...payloads].filter((id) => !listed.has(id))

    const unavailable = (e: unknown): Compaction<E> => {
      const dropped = new Set(unflushedCandidates)
      return {
        ...NOTHING,
        entries: entries.filter((x) => !dropped.has(x.sessionId)).slice(0, cap),
        failure: { stage: "removal", message: messageOf(e) },
      }
    }

    // Re-check what the enumeration said was absent: a tab may have touched
    // its index key or flushed its payload since.
    let recheck: Record<string, unknown>
    try {
      recheck = await read(area, [
        ...orphanCandidates.map(indexKey),
        ...malformed.map(indexKey),
        ...unflushedCandidates.map(payloadKey),
      ])
    } catch (e) {
      return unavailable(e)
    }
    const nowListed = (id: string): boolean => isEntry(recheck[indexKey(id)])
    const orphaned = orphanCandidates.filter((id) => !nowListed(id))
    const unflushed = unflushedCandidates.filter(
      (id) => !(payloadKey(id) in recheck)
    )
    const discarded = [
      ...malformed.filter((id) => !nowListed(id)),
      ...unflushed,
    ]

    const dropped = new Set(unflushed)
    const live = entries.filter((e) => !dropped.has(e.sessionId))
    const kept = live.slice(0, cap)
    const evicted = live.slice(cap).map((e) => e.sessionId)
    const doomed = [
      ...evicted.flatMap((id) => [indexKey(id), payloadKey(id)]),
      ...orphaned.map(payloadKey),
      ...discarded.map(indexKey),
    ]
    try {
      if (doomed.length > 0) await area.remove(doomed)
    } catch (e) {
      return unavailable(e)
    }
    return { entries: kept, evicted, orphaned, discarded }
  }

  return {
    indexKey,
    payloadKey,
    legacyKey,

    async touch(entry: E): Promise<void> {
      const area = resolveArea()
      if (area === undefined) return
      try {
        await area.set({ [indexKey(entry.sessionId)]: entry })
      } catch {
        // Best-effort: diagnostics degrading must never affect the extension.
      }
    },

    async remove(sessionId: string): Promise<void> {
      const area = resolveArea()
      if (area === undefined) return
      try {
        await area.remove([indexKey(sessionId), payloadKey(sessionId)])
      } catch {
        // Best-effort.
      }
    },

    async compact(): Promise<Compaction<E>> {
      const area = resolveArea()
      return area === undefined ? NOTHING : compact(area)
    },

    async compactIfCheap(): Promise<void> {
      const area = resolveArea()
      if (typeof area?.getKeys !== "function") return
      await compact(area)
    },
  }
}
