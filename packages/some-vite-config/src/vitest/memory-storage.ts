/**
 * A `localStorage` stand-in for tests: a map, exposed for assertions, that
 * starts from `initial`. Set `full` and every write throws, as on quota.
 */
export type MemoryStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
> & {
  map: Map<string, string>
  full: boolean
}

export function memoryStorage(
  initial: Iterable<readonly [string, string]> = []
): MemoryStorage {
  const map = new Map<string, string>(initial)
  const storage: MemoryStorage = {
    map,
    full: false,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      if (storage.full) throw new DOMException("full", "QuotaExceededError")
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
  return storage
}
