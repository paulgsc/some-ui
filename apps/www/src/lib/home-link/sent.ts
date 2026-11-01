/**
 * What this phone knows its paired home holds, so the drain (`./drain`)
 * carries only what changed since: each finished session's `updatedAt` and
 * `createdAt` as it was copied (`heldEntryOf`), each kept shelf item's digest as home answered for it,
 * each LeetType session's digest as home read it back (`./leetype-log`),
 * each Studio sitting's and answer's (`./studio-log`), each written
 * reflection's as home answered it (`./reflections`), each ask for the next
 * scene's as home answered it (`./prompts`), each study note's SHA-256 as
 * home answered for it (`./notes`), each grammar-lens entry's digest as home
 * read it back (`./lens-record`), and the digests home
 * refused, so the drain does not offer an unchanged refused item again
 * (it goes once its bytes change). Kept for one pairing (`pairing`, the
 * link's id for it): another pairing starts from nothing. Bookkeeping, not
 * the record: lost, it only means sending again, which home answers as
 * unchanged, and keeping the written reflections home holds until then.
 */
import type { KeyedStorage, Salvaged } from "@some-ui/core-utils"
import {
  canonicalJson,
  fnv1a,
  isRecord,
  jsonOf,
  openKept,
  sha256Hex,
  writeKept,
} from "@some-ui/core-utils"
import type { HomeSession } from "@some-ui/leetype"

import type { Kept } from "@/lib/device-backend/handlers/shelf"
import type { SessionRecord } from "@/lib/tenant/types"

export const SENT_KEY = "some-ui.home.sent.v1"

export type Sent = {
  readonly pairing: string
  readonly sessions: Readonly<Record<string, string>>
  readonly shelf: Readonly<Record<string, string>>
  readonly refused: Readonly<Record<string, string>>
  readonly leetype: Readonly<Record<string, string>>
  readonly studio: Readonly<Record<string, string>>
  readonly reflections: Readonly<Record<string, string>>
  readonly prompts: Readonly<Record<string, string>>
  readonly notes: Readonly<Record<string, string>>
  readonly lens: Readonly<Record<string, string>>
}

type Store = KeyedStorage | null

const emptyFor = (pairing: string): Sent => ({
  pairing,
  sessions: {},
  shelf: {},
  refused: {},
  leetype: {},
  studio: {},
  reflections: {},
  prompts: {},
  notes: {},
  lens: {},
})

/** The string entries of `value`, and whether every entry was one. */
function stringsOf(value: unknown): Salvaged<Record<string, string>> {
  if (value === undefined) return { value: {}, whole: true }
  if (!isRecord(value)) return { value: {}, whole: false }
  const entries = Object.entries(value)
  const kept = entries.filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  )
  return {
    value: Object.fromEntries(kept),
    whole: kept.length === entries.length,
  }
}

/**
 * Each kind's map, entry by entry: a value that is not an object is moved
 * aside, and so is one with a map or entry it could not read, before
 * anything is written over it.
 */
function readSentRecord(raw: string): Salvaged<Sent> | null {
  const parsed = jsonOf(raw)
  if (!isRecord(parsed) || typeof parsed.pairing !== "string") return null
  const sessions = stringsOf(parsed.sessions)
  const shelf = stringsOf(parsed.shelf)
  const refused = stringsOf(parsed.refused)
  const leetype = stringsOf(parsed.leetype)
  const studio = stringsOf(parsed.studio)
  const reflections = stringsOf(parsed.reflections)
  const prompts = stringsOf(parsed.prompts)
  const notes = stringsOf(parsed.notes)
  const lens = stringsOf(parsed.lens)
  return {
    value: {
      pairing: parsed.pairing,
      sessions: sessions.value,
      shelf: shelf.value,
      refused: refused.value,
      leetype: leetype.value,
      studio: studio.value,
      reflections: reflections.value,
      prompts: prompts.value,
      notes: notes.value,
      lens: lens.value,
    },
    whole: [
      sessions,
      shelf,
      refused,
      leetype,
      studio,
      reflections,
      prompts,
      notes,
      lens,
    ].every((kind) => kind.whole),
  }
}

/** What this phone knows home holds under `pairing`; nothing, for another. */
export function readSent(storage: Store, pairing: string): Sent {
  const sent = openKept<Sent | null>(storage, SENT_KEY, readSentRecord, null)
  return sent.value?.pairing === pairing ? sent.value : emptyFor(pairing)
}

/**
 * What a run carries of a record `sent` remembers by key (the study notes,
 * the grammar-lens record), and which of those keys still name something on
 * the phone, so `sent` forgets the rest.
 */
export type KeyedGoing<T> = {
  readonly going: ReadonlyArray<T>
  /** True for a key whose item is on the phone, or may be (unread). */
  readonly onPhone: (key: string) => boolean
}

/** For each map `sent` keeps only while its item is on the phone, which stay. */
export type Staying = {
  readonly notes?: (key: string) => boolean
  readonly lens?: (key: string) => boolean
}

/** `record` with only the keys `stays` keeps; all of them without it. */
function keptOnly(
  record: Record<string, string>,
  stays: ((key: string) => boolean) | undefined
): Record<string, string> {
  if (stays === undefined) return record
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => stays(key))
  )
}

/** `record` without the keys `answered` holds. */
function without(
  record: Readonly<Record<string, string>>,
  answered: Readonly<Record<string, string>> | undefined
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => answered?.[key] === undefined)
  )
}

/**
 * `sent` with what home now holds added; unwritten, the next send repeats
 * it. A kept item is held or refused, never both: home's latest answer for
 * it replaces the other. The study notes and the grammar-lens record keep
 * only the keys `stays` says are still on the phone: those stores let items
 * go at their caps, and one value in `localStorage` must not outgrow them.
 */
export function rememberSent(
  storage: Store,
  sent: Sent,
  more: Partial<Omit<Sent, "pairing">>,
  stays: Staying = {}
): Sent {
  const next: Sent = {
    pairing: sent.pairing,
    sessions: { ...sent.sessions, ...more.sessions },
    shelf: { ...without(sent.shelf, more.refused), ...more.shelf },
    refused: { ...without(sent.refused, more.shelf), ...more.refused },
    leetype: { ...sent.leetype, ...more.leetype },
    studio: { ...sent.studio, ...more.studio },
    reflections: { ...sent.reflections, ...more.reflections },
    prompts: { ...sent.prompts, ...more.prompts },
    notes: keptOnly({ ...sent.notes, ...more.notes }, stays.notes),
    lens: keptOnly({ ...sent.lens, ...more.lens }, stays.lens),
  }
  // Unwritten (full): the next send carries these again, and home says
  // unchanged.
  writeKept(storage, SENT_KEY, next, readSentRecord)
  return next
}

/**
 * A finished session's held entry: when it last changed and when it was
 * made. An entry holding only `updatedAt` names a copy home dated on
 * arrival (before paulgsc/server#630), so it reads as changed, and the
 * drain sends that session once more: its copy's patch dates home's.
 */
const heldEntryOf = (session: SessionRecord): string =>
  `${session.updatedAt} ${session.createdAt}`

/** The finished sessions home does not hold as they are now. */
export function sessionsToSend(
  local: ReadonlyArray<SessionRecord>,
  sent: Sent
): Array<SessionRecord> {
  return local.filter(
    (session) =>
      session.status === "completed" &&
      sent.sessions[session.id] !== heldEntryOf(session)
  )
}

/** A sessions-held entry for each of `sessions`, as copied now. */
export function sessionsHeld(
  sessions: ReadonlyArray<SessionRecord>
): Record<string, string> {
  return Object.fromEntries(sessions.map((s) => [s.id, heldEntryOf(s)]))
}

/**
 * A held entry for an item that goes home whole (`./reflections`,
 * `./prompts`): a bounded fingerprint of what went, its canonical JSON's
 * length and FNV-1a.
 */
export function fingerprintOf(wire: unknown): string {
  const json = canonicalJson(wire)
  return `${String(json.length)}:${String(fnv1a(json))}`
}

/** A held entry for a log home keeps (`./leetype-log`): its events, by id. */
export function digestOf(session: {
  readonly events: ReadonlyArray<{ readonly id: string }>
}): string {
  const ids = session.events.map((event) => event.id)
  return `${String(ids.length)}:${String(fnv1a(ids.join("|")))}`
}

/** The finished LeetType sessions home does not hold as they are now. */
export function logToSend(
  sessions: ReadonlyArray<HomeSession>,
  sent: Sent
): Array<HomeSession> {
  return sessions.filter(
    (session) => sent.leetype[session.session] !== digestOf(session)
  )
}

export const shelfKeyOf = (item: Kept): string => `${item.activity}/${item.key}`

/** A shelf-held entry for each of `items`: its bytes' digest, to tell an edit. */
async function shelfHeld(
  items: ReadonlyArray<Kept>
): Promise<Record<string, string>> {
  const held: Array<[string, string]> = await Promise.all(
    items.map(async (item) => [shelfKeyOf(item), await sha256Hex(item.body)])
  )
  return Object.fromEntries(held)
}

/**
 * The kept items home does not hold as they are now, with every item's
 * digest (`shelfHeld`), to remember home's answers by. An item home refused
 * as it is now is left out too, unless `refused` says to offer it again,
 * which the drain does not: a refused item goes once its bytes change.
 */
export async function shelfToSend(
  kept: ReadonlyArray<Kept>,
  sent: Sent,
  refused: "skip" | "again" = "skip"
): Promise<{ changed: Array<Kept>; digests: Record<string, string> }> {
  const digests = await shelfHeld(kept)
  const changed = kept.filter((item) => {
    const key = shelfKeyOf(item)
    return (
      sent.shelf[key] !== digests[key] &&
      (refused === "again" || sent.refused[key] !== digests[key])
    )
  })
  return { changed, digests }
}

/**
 * How many sessions, kept items, written reflections and asks for the next
 * scene this phone knows home holds, and kept items home refused.
 */
export function heldCounts(sent: Sent): {
  sessions: number
  shelf: number
  refused: number
  reflections: number
  prompts: number
} {
  return {
    sessions: Object.keys(sent.sessions).length,
    shelf: Object.keys(sent.shelf).length,
    refused: Object.keys(sent.refused).length,
    reflections: Object.keys(sent.reflections).length,
    prompts: Object.keys(sent.prompts).length,
  }
}
