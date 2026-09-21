/**
 * A session index over `storage.local` with **one key per session** (#1398).
 *
 * ## The problem this replaces
 *
 * A content-script-scoped adapter (`some-filter`, `some-censor`) mints one
 * recording per page load, so a debug page needs an index to discover them.
 * Both adapters first kept that index as one shared array under one key, and
 * publishing an entry was a read-modify-write over the whole array: two tabs
 * opening at the same moment could each read the same array and each write
 * their own replacement, the later write dropping the earlier tab's entry —
 * a recording still on disk that nothing could list. `storage.local` has no
 * compare-and-set to build a lock on, so that race could be narrowed (a
 * read-back and re-apply) but never closed.
 *
 * ## The layout
 *
 *     <namespace>.index.<sessionId>.v2   one small entry per session
 *     <payload key>                      the recording itself (the adapter's)
 *
 * A tab only ever writes its own index key, so no write can lose another
 * tab's. Everything that needs the whole index — listing, the cap, and the
 * orphan sweep — enumerates keys instead. That enumeration is the one cost of
 * the layout, and it is kept off the recording path: {@link SessionIndex.touch}
 * is a single `set`; {@link SessionIndex.compact} runs once per session start
 * and from the debug page, where a human asked for it. Where the engine has
 * `storage.local.getKeys()` (Chromium 130+, Firefox 135+) enumeration returns
 * key names alone; elsewhere it falls back to `get(null)`, which returns every
 * payload too — the fallback is why compaction is rare, not per-touch.
 *
 * ## Eviction is something a session can observe about itself
 *
 * The cap deletes an evicted session's index key *and* its payload. A session
 * evicted while still live simply rewrites its own key on its next touch and
 * its payload on its next flush, and is listed again; its payload written in
 * between, with no index key beside it, is an orphan the next compaction
 * sweeps. So the invariant compaction restores is: every payload has an index
 * key, and at most `cap` index keys exist. Neither is assumed to hold between
 * compactions, and nothing depends on it.
 */

import type { StorageAreaLike } from "./persistence"

/** The minimum an index entry carries: identity and recency. */
export type IndexedEntry = {
  readonly sessionId: string
  readonly updatedAt: number
}

/**
 * {@link StorageAreaLike} plus the optional key enumeration newer engines
 * expose. The port feature-detects it per call.
 */
export type IndexAreaLike = StorageAreaLike & {
  getKeys?(): Promise<Array<string>>
}

export type SessionIndexOptions<E extends IndexedEntry> = {
  /**
   * Key namespace, e.g. `"bc.observability"`. Index keys are
   * `<namespace>.index.<sessionId>.v2`; the shared array this layout replaces
   * lived at `<namespace>.index.v1` and is migrated on first enumeration.
   */
  readonly namespace: string
  /** The payload key of a session, and its inverse over an arbitrary key. */
  readonly payload: {
    readonly key: (sessionId: string) => string
    readonly sessionId: (key: string) => string | undefined
  }
  readonly isEntry: (value: unknown) => value is E
  /**
   * Resolved on every operation rather than captured once: the area may not
   * exist yet when the adapter module loads (tests), or at all. Absent, every
   * operation is a no-op that reports nothing.
   */
  readonly area: () => IndexAreaLike | undefined
  /** Most recent entries kept by {@link SessionIndex.compact}. */
  readonly cap?: number
}

export type Compaction<E> = {
  /** What the index holds after compaction, newest first. */
  readonly entries: ReadonlyArray<E>
  /** Sessions past the cap: index key and payload deleted. */
  readonly evicted: ReadonlyArray<string>
  /** Payloads with no index key: deleted. */
  readonly orphaned: ReadonlyArray<string>
}

export type SessionIndex<E extends IndexedEntry> = {
  indexKey(sessionId: string): string
  /** Publish or refresh one entry. One `set` of one key; never reads. */
  touch(entry: E): Promise<void>
  /** Forget a session: its index key and its payload. */
  remove(sessionId: string): Promise<void>
  /** Every listed session, newest first, at most `cap`. Never throws. */
  list(): Promise<Array<E>>
  /** Enforce the cap and sweep orphaned payloads. Never throws. */
  compact(): Promise<Compaction<E>>
}

export const DEFAULT_INDEX_CAP = 20

const NOTHING: Compaction<never> = { entries: [], evicted: [], orphaned: [] }

export function createSessionIndex<E extends IndexedEntry>(
  options: SessionIndexOptions<E>
): SessionIndex<E> {
  const { namespace, payload, isEntry, cap = DEFAULT_INDEX_CAP } = options
  const prefix = `${namespace}.index.`
  const suffix = ".v2"
  const legacyKey = `${namespace}.index.v1`
  const indexKey = (sessionId: string): string =>
    `${prefix}${sessionId}${suffix}`

  const byRecency = (a: E, b: E): number => b.updatedAt - a.updatedAt

  async function allKeys(area: IndexAreaLike): Promise<Array<string>> {
    if (typeof area.getKeys === "function") return area.getKeys()
    const everything: unknown = await area.get(null)
    return everything !== null && typeof everything === "object"
      ? Object.keys(everything)
      : []
  }

  async function readEntries(
    area: IndexAreaLike,
    keys: ReadonlyArray<string>
  ): Promise<Array<E>> {
    if (keys.length === 0) return []
    const raw: unknown = await area.get([...keys])
    if (raw === null || typeof raw !== "object") return []
    const entries: Array<E> = []
    for (const key of keys) {
      const value: unknown = Reflect.get(raw, key)
      if (isEntry(value)) entries.push(value)
    }
    return entries
  }

  /**
   * Move the shared-array index to per-session keys, once. Only entries whose
   * payload still exists are carried over — the old layout could delist a
   * recording without deleting it and vice versa, and this is the last point
   * at which the two are reconciled by hand.
   */
  async function migrateLegacy(
    area: IndexAreaLike,
    keys: ReadonlyArray<string>
  ): Promise<Array<E>> {
    if (!keys.includes(legacyKey)) return []
    const raw: unknown = await area.get(legacyKey)
    const value: unknown =
      raw !== null && typeof raw === "object"
        ? Reflect.get(raw, legacyKey)
        : undefined
    const present = new Set(keys)
    const carried: Array<E> = Array.isArray(value)
      ? value
          .filter(isEntry)
          .filter((e) => present.has(payload.key(e.sessionId)))
      : []
    if (carried.length > 0) {
      const items: Record<string, unknown> = {}
      for (const entry of carried) items[indexKey(entry.sessionId)] = entry
      await area.set(items)
    }
    await area.remove(legacyKey)
    return carried
  }

  /** One enumeration serving both `list` and `compact`. */
  async function survey(area: IndexAreaLike): Promise<{
    entries: Array<E>
    payloads: Array<string>
  }> {
    const keys = await allKeys(area)
    const migrated = await migrateLegacy(area, keys)
    const stored = await readEntries(
      area,
      keys.filter((k) => k.startsWith(prefix) && k.endsWith(suffix))
    )
    const seen = new Set(stored.map((e) => e.sessionId))
    const entries = [
      ...stored,
      ...migrated.filter((e) => !seen.has(e.sessionId)),
    ].sort(byRecency)
    const payloads = keys.filter((k) => payload.sessionId(k) !== undefined)
    return { entries, payloads }
  }

  return {
    indexKey,

    async touch(entry: E): Promise<void> {
      const area = options.area()
      if (area === undefined) return
      try {
        await area.set({ [indexKey(entry.sessionId)]: entry })
      } catch {
        // Best-effort: diagnostics degrading must never affect the extension.
      }
    },

    async remove(sessionId: string): Promise<void> {
      const area = options.area()
      if (area === undefined) return
      try {
        await area.remove([indexKey(sessionId), payload.key(sessionId)])
      } catch {
        // Best-effort.
      }
    },

    async list(): Promise<Array<E>> {
      const area = options.area()
      if (area === undefined) return []
      try {
        const { entries } = await survey(area)
        return entries.slice(0, cap)
      } catch {
        return []
      }
    },

    async compact(): Promise<Compaction<E>> {
      const area = options.area()
      if (area === undefined) return NOTHING
      try {
        const { entries, payloads } = await survey(area)
        const kept = entries.slice(0, cap)
        const listed = new Set(kept.map((e) => e.sessionId))
        const evicted = entries.slice(cap).map((e) => e.sessionId)
        const orphaned: Array<string> = []
        for (const key of payloads) {
          const sessionId = payload.sessionId(key)
          if (sessionId !== undefined && !listed.has(sessionId)) {
            // Past the cap, or listed by nothing at all: either way the
            // payload goes. An evicted session's payload is counted under
            // `evicted`, not here.
            if (!evicted.includes(sessionId)) orphaned.push(sessionId)
          }
        }
        const doomed = [
          ...evicted.flatMap((id) => [indexKey(id), payload.key(id)]),
          ...orphaned.map((id) => payload.key(id)),
        ]
        if (doomed.length > 0) await area.remove(doomed)
        return { entries: kept, evicted, orphaned }
      } catch {
        return NOTHING
      }
    },
  }
}
