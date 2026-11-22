/**
 * Where a week-shaped bundle keeps itself on the phone (RR13, IW5): a draft
 * per id under one key, and the records Send keeps under another, which only
 * grow. Each is one `localStorage` record read and written only through
 * core-utils' `openKept` and `writeKept` (KR1), so a value that can't be read
 * whole is moved aside, never written over. The caller gives each its key,
 * and the records how to read them.
 *
 * A week's sends (RR22) are such records: each names its week and when it was
 * sent, the latest home holds is what stands at the week's deadline, and the
 * helpers at the end read them so.
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

/** One send of a week: the week's id, and when it was sent, ISO. */
type WeekSend = { readonly week: string; readonly at: string }

/** Whether `at` is past a week's deadline, `due`. */
export const isPastDue = (due: string, at: string): boolean =>
  Date.parse(at) > Date.parse(due)

/** How one send of a week is known, at home and on this phone: `2026-w46/<at>`. */
export const weekSendKey = (sent: WeekSend): string => `${sent.week}/${sent.at}`

/** The send of `sends` made last, by instant; null for none. */
export const latestSend = <R extends WeekSend>(
  sends: ReadonlyArray<R>
): R | null =>
  sends.reduce<R | null>(
    (latest, sent) =>
      latest === null || Date.parse(sent.at) >= Date.parse(latest.at)
        ? sent
        : latest,
    null
  )

/** A week's sends as home has them, as far as this phone knows. */
export type SendsAtHome<R> = {
  /** The latest send home holds: what counts at the deadline; null for none. */
  readonly holds: R | null
  /** The latest send made on this phone, home's or not; null for none. */
  readonly last: R | null
}

/**
 * What home holds of week `week`: of the sends kept on this phone, the latest
 * home holds (`held`, by what the link remembers), and the latest made. A send
 * home doesn't hold by the deadline never counts: home refuses it after.
 */
export function sendsAtHome<R extends WeekSend>(
  kept: ReadonlyArray<R>,
  week: string,
  held: (sent: R) => boolean
): SendsAtHome<R> {
  const sends = kept.filter((sent) => sent.week === week)
  return { holds: latestSend(sends.filter(held)), last: latestSend(sends) }
}

/**
 * What home's own record of a week says was sent (its `GET …/:id/record`'s
 * `sent`, RR30): a send at `at`; none; or nothing heard from home on it (not
 * asked, no answer, or an answer this phone can't read).
 */
export type HomeSent =
  | { readonly kind: "sent"; readonly at: string }
  | { readonly kind: "none" }
  | { readonly kind: "unknown" }

export const HOME_UNKNOWN: HomeSent = { kind: "unknown" }

/**
 * A week's sends as home has them, and whether home's own record said so
 * (`homeSaid`): only then may a screen count what home had or say a send
 * didn't reach home (RR30). `elsewhere` is the `at` of a send home's record
 * names that this phone didn't keep.
 */
export type SendsAtHomeSaid<R> = SendsAtHome<R> & {
  readonly homeSaid: boolean
  readonly elsewhere: string | null
}

/**
 * `sendsAtHome`, settled by home's own record (`home`, RR30) where it has
 * spoken: the send it names, when this phone kept that send, or none.
 * Otherwise what the link remembers home took (`held`), which says nothing
 * of a send it doesn't remember, since that memory can be lost (a new
 * pairing, say); with `homeSaid` false, a screen shows no count and no send
 * "late".
 */
export function sendsAtHomeSaid<R extends WeekSend>(
  kept: ReadonlyArray<R>,
  week: string,
  held: (sent: R) => boolean,
  home: HomeSent = HOME_UNKNOWN
): SendsAtHomeSaid<R> {
  const remembered = sendsAtHome(kept, week, held)
  if (home.kind === "none") {
    return {
      holds: null,
      last: remembered.last,
      homeSaid: true,
      elsewhere: null,
    }
  }
  if (home.kind === "sent") {
    const named = kept.find((sent) => sent.week === week && sent.at === home.at)
    if (named !== undefined) {
      return {
        holds: named,
        last: remembered.last,
        homeSaid: true,
        elsewhere: null,
      }
    }
    // Home named another send: the link's memory of an older one is not
    // what counted.
    return {
      holds: null,
      last: remembered.last,
      homeSaid: false,
      elsewhere: home.at,
    }
  }
  return { ...remembered, homeSaid: false, elsewhere: null }
}
