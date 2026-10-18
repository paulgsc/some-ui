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

/** The part of `Storage` a kept record needs. */
export type KeyedStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

/**
 * What opening a kept record found: the record, nothing, an unreadable value
 * now moved aside, or storage that threw (nothing may be written).
 */
export type OpenedRecord<T> =
  | { kind: "kept"; value: T }
  | { kind: "empty" }
  | { kind: "moved" }
  | { kind: "unreadable" }

/** Moves `raw` to the first free `<prefix><n>` key; false if it could not. */
function quarantine(
  storage: KeyedStorage,
  raw: string,
  prefix: string
): boolean {
  try {
    let n = 1
    while (storage.getItem(`${prefix}${n}`) !== null) n += 1
    storage.setItem(`${prefix}${n}`, raw)
    return true
  } catch {
    return false
  }
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
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return { kind: "unreadable" }
  }
  if (raw === null) return { kind: "empty" }
  const value = parse(raw)
  if (value !== null) return { kind: "kept", value }
  return quarantine(storage, raw, quarantinePrefix)
    ? { kind: "moved" }
    : { kind: "unreadable" }
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
