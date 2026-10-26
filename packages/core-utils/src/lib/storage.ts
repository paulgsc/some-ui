/**
 * The one reader and writer of a kept record: what a person's use of the app
 * leaves on the device (CLAUDE.md, "Never lose the record"). Every store
 * reads its key through `openRecord` (or `openSalvaged`, for a value read
 * entry by entry) and writes through `writeRecord`, over `KeyedStorage`:
 *
 * - a value it cannot read, or can read only part of (an older shape, bad
 *   JSON), is copied aside under the store's prefix before anything may be
 *   written over it, and stays there;
 * - storage that throws (a private window, blocked site data), or a value
 *   that could not be copied aside (a full quota), opens `unreadable`, and
 *   the store writes nothing over it;
 * - a write the storage refuses (full) is reported, and leaves the value
 *   that was there as it was.
 *
 * Most stores open through `openKept` and write through `writeKept`, which
 * name the moved-aside copies `<key>:unreadable:<n>`. `no-raw-storage`
 * (`packages/eslint`) keeps the browser's storage behind `localStorageOrNull`
 * and `sessionStorageOrNull` in apps/www and packages/ui, and KR1
 * (`@some-ui/vite-config/vitest/kept-records`) runs every kept store through
 * these states.
 */

import { assertNever } from "./assert-never"

/**
 * `window.localStorage`, or null wherever touching it throws (privacy mode,
 * a sandboxed frame) or there is no window (Node, a prerender).
 */
export function localStorageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

/** `window.sessionStorage`, or null where `localStorageOrNull` would be. */
export function sessionStorageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

/**
 * A `Storage` that lives as long as the page (or the test): what the viewer's
 * build installs as the page's own (`apps/www/src/lib/demo/viewer-storage`).
 */
export function inMemoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length(): number {
      return items.size
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value): void => {
      items.set(key, String(value))
    },
    removeItem: (key): void => {
      items.delete(key)
    },
    clear: (): void => {
      items.clear()
    },
  }
}

/** The part of `Storage` a kept record needs: the one storage port. */
export type KeyedStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

/**
 * What opening a kept record found: the record, nothing, an unreadable value
 * now moved aside, or storage that threw (nothing may be written). `part` is
 * what could be read of a value that could not be moved aside.
 */
export type OpenedRecord<T> =
  | { kind: "kept"; value: T }
  | { kind: "empty" }
  | { kind: "moved" }
  | { kind: "unreadable"; part?: T }

/**
 * What a reader made of a stored value read entry by entry: `whole` when it
 * read every entry, otherwise `value` is the entries it could read.
 */
export type Salvaged<T> = { value: T; whole: boolean }

/** `raw` as JSON; `undefined` (which JSON cannot hold) when it is not JSON. */
export function jsonOf(raw: string): unknown {
  try {
    const value: unknown = JSON.parse(raw)
    return value
  } catch {
    return undefined
  }
}

/**
 * Copies `raw` to the first free `<prefix><n>` key, unless a slot already
 * holds it (a launch that could not write over it finds it again); false if
 * it could not.
 */
export function quarantine(
  storage: KeyedStorage,
  raw: string,
  prefix: string
): boolean {
  try {
    let n = 1
    let held = storage.getItem(`${prefix}${n}`)
    while (held !== null) {
      if (held === raw) return true
      n += 1
      held = storage.getItem(`${prefix}${n}`)
    }
    storage.setItem(`${prefix}${n}`, raw)
    return true
  } catch {
    return false
  }
}

/**
 * Reads `key` through `read`, which says what it could read of the value
 * (null for none of it). A value it could not read whole is copied aside
 * under `quarantinePrefix` first, never overwritten, so a bad write or an
 * older shape loses nothing; the entries it could read stay `kept`.
 */
export function openSalvaged<T>(
  storage: KeyedStorage,
  key: string,
  read: (raw: string) => Salvaged<T> | null,
  quarantinePrefix: string
): OpenedRecord<T> {
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return { kind: "unreadable" }
  }
  if (raw === null) return { kind: "empty" }
  const salvaged = read(raw)
  if (salvaged?.whole === true) return { kind: "kept", value: salvaged.value }
  if (!quarantine(storage, raw, quarantinePrefix)) {
    return salvaged === null
      ? { kind: "unreadable" }
      : { kind: "unreadable", part: salvaged.value }
  }
  return salvaged === null
    ? { kind: "moved" }
    : { kind: "kept", value: salvaged.value }
}

/**
 * Reads `key` through `parse` (null for a value it cannot read). An
 * unreadable value is moved aside under `quarantinePrefix`, never
 * overwritten, so a bad write or an older shape loses nothing.
 */
export function openRecord<T>(
  storage: KeyedStorage,
  key: string,
  parse: (raw: string) => T | null,
  quarantinePrefix: string
): OpenedRecord<T> {
  return openSalvaged(storage, key, readWhole(parse), quarantinePrefix)
}

/** A whole reading of what `parse` reads, for `openSalvaged`. */
export function readWhole<T>(
  parse: (raw: string) => T | null
): (raw: string) => Salvaged<T> | null {
  return (raw) => {
    const value = parse(raw)
    return value === null ? null : { value, whole: true }
  }
}

/**
 * Reads a JSON array entry by entry: the entries `isItem` accepts, `whole`
 * when it accepted all of them; null for a value that is not a JSON array.
 */
export function salvageList<T>(
  isItem: (value: unknown) => value is T
): (raw: string) => Salvaged<Array<T>> | null {
  return (raw) => {
    const value = jsonOf(raw)
    if (!Array.isArray(value)) return null
    const items = value.filter(isItem)
    return { value: items, whole: items.length === value.length }
  }
}

/**
 * Reads a JSON object entry by entry: the entries `read` accepts (null
 * rejects one), `whole` when it accepted all of them; null for a value that
 * is not a JSON object.
 */
export function salvageEntries<T>(
  read: (value: unknown) => T | null
): (raw: string) => Salvaged<Record<string, T>> | null {
  return (raw) => {
    const value = jsonOf(raw)
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null
    }
    const entries = Object.entries(value)
    // Built from entries, never by assignment, so no key reaches a prototype.
    const kept = entries.flatMap(([key, entry]) => {
      const checked = read(entry)
      return checked === null ? [] : [[key, checked] as const]
    })
    return {
      value: Object.fromEntries(kept),
      whole: kept.length === entries.length,
    }
  }
}

/** A kept record opened to be read and then written over. */
export type Kept<T> = {
  /** The record, what could be read of it, or the fallback. */
  readonly value: T
  /** False when nothing may be written over what is stored. */
  readonly writable: boolean
}

/**
 * Opens `key` through `openSalvaged`, moving what `read` cannot read whole
 * aside under `<key>:unreadable:` (or `quarantinePrefix`). Null storage (no
 * window, or one that throws) is never writable.
 */
export function openKept<T>(
  storage: KeyedStorage | null,
  key: string,
  read: (raw: string) => Salvaged<T> | null,
  fallback: T,
  quarantinePrefix = `${key}:unreadable:`
): Kept<T> {
  if (storage === null) return { value: fallback, writable: false }
  const opened = openSalvaged(storage, key, read, quarantinePrefix)
  switch (opened.kind) {
    case "kept": {
      return { value: opened.value, writable: true }
    }
    case "empty":
    case "moved": {
      return { value: fallback, writable: true }
    }
    case "unreadable": {
      return { value: opened.part ?? fallback, writable: false }
    }
    default: {
      return assertNever(opened)
    }
  }
}

/**
 * Writes `value` as JSON under `key`; false when there is no storage, when
 * what is stored could not be opened writable (`openKept`: unreadable, and
 * not copied aside), when `read` would not read `value` back whole (so the
 * next open would move it aside), or when the storage refused it.
 */
export function writeKept(
  storage: KeyedStorage | null,
  key: string,
  value: unknown,
  read: (raw: string) => Salvaged<unknown> | null,
  quarantinePrefix = `${key}:unreadable:`
): boolean {
  if (storage === null) return false
  if (!openKept<unknown>(storage, key, read, null, quarantinePrefix).writable) {
    return false
  }
  let text: string
  try {
    text = JSON.stringify(value)
  } catch {
    return false
  }
  return writeRecord(storage, key, text, (raw) =>
    read(raw)?.whole === true ? true : null
  )
}

/**
 * Writes `text` to `key`; false when `parse` could not read it back (so the
 * next launch would quarantine it) or the storage refused it.
 */
export function writeRecord(
  storage: KeyedStorage,
  key: string,
  text: string,
  parse: (raw: string) => unknown
): boolean {
  if (parse(text) === null) return false
  try {
    storage.setItem(key, text)
    return true
  } catch {
    return false
  }
}

/** Removes `key`; false when the storage refused. */
export function removeRecord(storage: KeyedStorage, key: string): boolean {
  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}
