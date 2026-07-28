/**
 * Persistence ports for the recorder — tier-1 (the extension-storage port
 * touches `browser.storage`; the memory port is tier-0 and safe anywhere).
 *
 * The recorder never imports a storage API directly. That indirection is what
 * lets the same core run under vitest with no browser mock, and lets a future
 * extension swap in IndexedDB when its event volume outgrows `storage.local`
 * without any change to the recording call sites.
 */

import type { ObservabilityPersistence, PersistedState } from "./types"

/** In-memory port. Tests, and any surface that must not touch disk. */
export function memoryPersistence(): ObservabilityPersistence & {
  peek(): PersistedState | undefined
} {
  let state: PersistedState | undefined
  return {
    load: (): Promise<PersistedState | undefined> => Promise.resolve(state),
    save: (next: PersistedState): Promise<void> => {
      state = next
      return Promise.resolve()
    },
    clear: (): Promise<void> => {
      state = undefined
      return Promise.resolve()
    },
    peek: (): PersistedState | undefined => state,
  }
}

/** The minimum storage-area surface the port needs. */
export type StorageAreaLike = {
  get(keys: string | Array<string> | Record<string, unknown>): Promise<unknown>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string | Array<string>): Promise<void>
}

export type ExtensionPersistenceOptions = {
  /** Storage key. Namespace it per workspace (Good-Citizen Charter §4). */
  key: string
  /** The area to write to. Defaults to `browser.storage.local`. */
  area?: StorageAreaLike
  /**
   * Hard ceiling on the serialized payload. Events are shed oldest-first until
   * the bundle fits — the last line of defence against storage creep when an
   * adapter records unexpectedly fat `detail` payloads.
   */
  maxBytes?: number
}

/** Default ceiling: ~256 KB, comfortably inside every engine's quota. */
const DEFAULT_MAX_BYTES = 256 * 1024

/**
 * `browser.storage`-backed port.
 *
 * Writes are whole-bundle rather than incremental. That is the right trade for
 * a flight recorder: the recorder already debounces, so writes are rare, and a
 * single atomic key means a worker killed mid-write leaves the previous
 * generation's bundle intact instead of a half-applied delta.
 */
export function extensionStoragePersistence(
  options: ExtensionPersistenceOptions
): ObservabilityPersistence {
  const { key, maxBytes = DEFAULT_MAX_BYTES } = options
  const area = options.area ?? defaultArea()

  return {
    async load(): Promise<PersistedState | undefined> {
      try {
        const raw: unknown = await area.get(key)
        if (raw === null || typeof raw !== "object") {
          return undefined
        }
        const value: unknown = Reflect.get(raw, key)
        return isPersistedState(value) ? value : undefined
      } catch {
        // A storage read failure must never break the thing being observed.
        return undefined
      }
    },

    async save(state: PersistedState): Promise<void> {
      try {
        await area.set({ [key]: fitToBudget(state, maxBytes) })
      } catch {
        // Same contract as load: observability degrades, the extension does not.
      }
    },

    async clear(): Promise<void> {
      try {
        await area.remove(key)
      } catch {
        // ignore
      }
    },
  }
}

function defaultArea(): StorageAreaLike {
  // eslint-disable-next-line no-restricted-globals -- `browser` is absent on Chrome; this port is used by both engines
  const api: unknown = typeof browser === "undefined" ? chrome : browser
  const storage: unknown =
    api !== null && typeof api === "object"
      ? Reflect.get(api, "storage")
      : undefined
  const local: unknown =
    storage !== null && typeof storage === "object"
      ? Reflect.get(storage, "local")
      : undefined
  if (local === null || typeof local !== "object") {
    throw new Error("extensionStoragePersistence: no storage.local available")
  }
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowed structurally above
  return local as StorageAreaLike
}

/**
 * Shed the oldest events until the serialized bundle fits `maxBytes`. Metrics
 * and snapshots are never shed: they are small, fixed-size, and are the part a
 * bug report needs most.
 */
function fitToBudget(state: PersistedState, maxBytes: number): PersistedState {
  let candidate = state
  let size = byteLength(candidate)
  if (size <= maxBytes) {
    return candidate
  }
  let events = candidate.events
  let dropped = candidate.dropped
  // Halve repeatedly rather than shedding one at a time: this runs on the
  // worker's thread and an O(n) stringify per event would be pathological.
  while (size > maxBytes && events.length > 1) {
    const keep = Math.floor(events.length / 2)
    dropped += events.length - keep
    events = events.slice(events.length - keep)
    candidate = { ...state, events, dropped }
    size = byteLength(candidate)
  }
  return candidate
}

function byteLength(value: unknown): number {
  try {
    return JSON.stringify(value).length
  } catch {
    // A cyclic or exotic payload cannot be budgeted; report it as infinite so
    // the caller sheds events rather than writing something unbounded.
    return Number.POSITIVE_INFINITY
  }
}

function isPersistedState(value: unknown): value is PersistedState {
  if (value === null || typeof value !== "object") {
    return false
  }
  return (
    Reflect.get(value, "version") === 1 &&
    Array.isArray(Reflect.get(value, "events")) &&
    typeof Reflect.get(value, "namespace") === "string"
  )
}
