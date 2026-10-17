import { tenantStorage } from "@/lib/tenant/storage"

/**
 * A newest-first list in the person's storage (`tenantStorage`: the
 * browser's, or a viewer's in-memory copy), never longer than `limit`. What it
 * cannot read (no storage, bad JSON, an item `isItem` rejects) reads as
 * absent, and a failed write is dropped and said so (`false`): a store built
 * on it decides whether that matters.
 */
export function boundedList<T>(
  key: string,
  limit: number,
  isItem: (value: unknown) => value is T
): {
  read: () => Array<T>
  /**
   * Puts `item` first, replacing the one `same` matches. Says whether the
   * device stored it (false: full or missing storage).
   */
  put: (item: T, same: (other: T) => boolean) => boolean
  remove: (same: (other: T) => boolean) => boolean
} {
  const read = (): Array<T> => {
    try {
      const parsed: unknown = JSON.parse(tenantStorage.getItem(key) ?? "[]")
      return Array.isArray(parsed) ? parsed.filter(isItem) : []
    } catch {
      return []
    }
  }
  const write = (items: Array<T>): boolean => {
    try {
      tenantStorage.setItem(key, JSON.stringify(items.slice(0, limit)))
      return true
    } catch {
      // Full or missing storage: this write is lost, nothing else.
      return false
    }
  }
  return {
    read,
    put: (item, same) => write([item, ...read().filter((x) => !same(x))]),
    remove: (same) => write(read().filter((x) => !same(x))),
  }
}
