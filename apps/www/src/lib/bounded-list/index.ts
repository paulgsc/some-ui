/**
 * A newest-first list in `localStorage`, never longer than `limit`, read and
 * written through core-utils' `openKept`/`writeKept`: a value it cannot read
 * whole (bad JSON, an item `isItem` rejects, such as an older shape) is
 * copied aside under `<key>:unreadable:` before anything is written over it,
 * and the items it could read stay. Where nothing can be read or copied
 * aside (no storage, or a full one), every write is refused and said so
 * (`false`): a store built on it decides whether that matters.
 */
import type { Kept } from "@some-ui/core-utils"
import {
  localStorageOrNull,
  openKept,
  salvageList,
  writeKept,
} from "@some-ui/core-utils"

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
  /** Rewrites each item in place, keeping the order. Says whether it stored. */
  update: (change: (item: T) => T) => boolean
} {
  const items = salvageList(isItem)
  // Looked up on each call: the viewer's in-memory copy
  // (`lib/demo/viewer-storage`) or a test's may replace it.
  const open = (): Kept<Array<T>> =>
    openKept(localStorageOrNull(), key, items, [])
  const write = (next: Array<T>): boolean =>
    writeKept(localStorageOrNull(), key, next.slice(0, limit), items)
  const change = (next: (kept: Array<T>) => Array<T>): boolean =>
    write(next(open().value))
  return {
    read: () => open().value,
    put: (item, same) =>
      change((kept) => [item, ...kept.filter((x) => !same(x))]),
    remove: (same) => change((kept) => kept.filter((x) => !same(x))),
    update: (each) => change((kept) => kept.map(each)),
  }
}
