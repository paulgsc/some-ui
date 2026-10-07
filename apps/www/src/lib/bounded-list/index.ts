/**
 * A newest-first list in `localStorage`, never longer than `limit`. What it
 * cannot read (no storage, bad JSON, an item `isItem` rejects) reads as
 * absent, and a failed write is dropped: the stores built on it are optional
 * extras, never something a screen waits on.
 */
export function boundedList<T>(
  key: string,
  limit: number,
  isItem: (value: unknown) => value is T
): {
  read: () => Array<T>
  /** Puts `item` first, replacing the one `same` matches. */
  put: (item: T, same: (other: T) => boolean) => void
  remove: (same: (other: T) => boolean) => void
} {
  const read = (): Array<T> => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]")
      return Array.isArray(parsed) ? parsed.filter(isItem) : []
    } catch {
      return []
    }
  }
  const write = (items: Array<T>): void => {
    try {
      localStorage.setItem(key, JSON.stringify(items.slice(0, limit)))
    } catch {
      // Full or missing storage: this item is lost, nothing else.
    }
  }
  return {
    read,
    put: (item, same) => write([item, ...read().filter((x) => !same(x))]),
    remove: (same) => write(read().filter((x) => !same(x))),
  }
}
