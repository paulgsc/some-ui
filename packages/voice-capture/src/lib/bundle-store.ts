/**
 * Where a week-shaped bundle keeps itself on the phone (RR13, IW5): a draft
 * per id under one key, and the records Send keeps under another, which only
 * grow. Each is one `localStorage` record read and written only through
 * core-utils' `openKept` and `writeKept` (KR1), so a value that can't be read
 * whole is moved aside, never written over. The caller gives each its key,
 * and the records how to read them; Rust Rounds' week and the interview week
 * share these.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import {
  canonicalJson,
  isRecord,
  openKept,
  readJson,
  writeKept,
} from "@some-ui/core-utils"

import type { BundleDraft } from "./bundle"
import type { BundleDrafts, BundleRecords } from "./bundle-runtime"

const isStrings = (value: unknown): value is ReadonlyArray<string> =>
  Array.isArray(value) && value.every((each) => typeof each === "string")

/** A map of strings, or absent where `optional`. */
const isTextMap = (value: unknown, optional = false): boolean =>
  (optional && value === undefined) ||
  (isRecord(value) &&
    Object.values(value).every((each) => typeof each === "string"))

/** Whether `value` reads as a bundle's draft, every field of it. */
function isBundleDraft(value: unknown): value is BundleDraft {
  if (!isRecord(value)) return false
  const { id, at, typed, beside, unheard, overtaken, later } = value
  return (
    typeof id === "string" &&
    typeof at === "string" &&
    isTextMap(typed) &&
    isTextMap(beside, true) &&
    isTextMap(unheard, true) &&
    (overtaken === undefined ||
      (isRecord(overtaken) && Object.values(overtaken).every(isStrings))) &&
    isStrings(later)
  )
}

const isDraftMap = (
  value: unknown
): value is Readonly<Record<string, BundleDraft>> =>
  isRecord(value) && Object.values(value).every(isBundleDraft)

const readDrafts = readJson((value) => (isDraftMap(value) ? value : null))

/**
 * The draft of `id`, among every id's kept under `key`. Written over freely:
 * nothing in a draft has left the phone.
 */
export function keptDrafts(
  storage: KeyedStorage | null,
  key: string,
  id: string
): BundleDrafts<BundleDraft> {
  const open = (): {
    value: Readonly<Record<string, BundleDraft>>
    writable: boolean
  } => openKept(storage, key, readDrafts, {})
  return {
    read: (): BundleDraft | null | undefined => {
      const opened = open()
      return opened.writable ? (opened.value[id] ?? null) : undefined
    },
    write: (draft): boolean => {
      const opened = open()
      if (!opened.writable) return false
      const { [id]: _gone, ...others } = opened.value
      const next = draft === null ? others : { ...others, [id]: draft }
      return writeKept(storage, key, next, readDrafts)
    },
  }
}

/** Whether `next` keeps every record of `kept` as it was, in order. */
const grows = <R>(kept: ReadonlyArray<R>, next: ReadonlyArray<R>): boolean =>
  next.length >= kept.length &&
  kept.every(
    (each, i) => canonicalJson(each) === canonicalJson(next[i] ?? null)
  )

/**
 * The records kept under `key`, which only grow: a change that would drop or
 * rewrite one already kept is refused. `parse` reads the whole list, or null
 * when it can't.
 */
export function keptRecords<R>(
  storage: KeyedStorage | null,
  key: string,
  parse: (value: unknown) => ReadonlyArray<R> | null
): BundleRecords<R> {
  const read = readJson(parse)
  const open = (): { value: ReadonlyArray<R>; writable: boolean } =>
    openKept(storage, key, read, [])
  return {
    list: (): ReadonlyArray<R> | null => {
      const opened = open()
      return opened.writable ? opened.value : null
    },
    keep: (change): ReadonlyArray<R> | null => {
      const opened = open()
      if (!opened.writable) return null
      const next = change(opened.value)
      if (!grows(opened.value, next)) return null
      return writeKept(storage, key, next, read) ? next : null
    },
  }
}
