/**
 * What this phone knows its paired home holds, so the drain (`./drain`)
 * carries only what changed since: each finished session's `updatedAt` and
 * `createdAt` as it was copied (`heldEntryOf`), each kept shelf item's digest as home answered for it,
 * each LeetType session's digest as home read it back (`./leetype-log`),
 * each Studio sitting's and answer's (`./studio-log`), each written
 * reflection's as home answered it (`./reflections`), each ask for the next
 * scene's as home answered it (`./prompts`), each study note's SHA-256 as
 * home answered for it (`./notes`), each grammar-lens entry's digest as home
 * read it back (`./lens-record`), each other Korean entry's (`./korean-record`,
 * as `<kind>/<key>`), each Studio idea's as home answered it
 * (`./ideas`, held or refused), each note on an episode as home answered it
 * (`./episode-notes`, held or refused), each Studio video kept for home to make as
 * home answered it (`./videos`), each Rust Rounds week sent, paste and
 * card-log sitting as home answered or read it back (`./rust-kept`), what home
 * said of each work span event (`./rust-spans`), the events of a log home took
 * (`events`, `./leetype-log`'s `TakenEvents`), and the digests home refused, so the drain does not offer an unchanged refused item again
 * (it goes once its bytes change). Kept for one pairing (`pairing`, the
 * link's id for it), and for its scope (`scope`, home's address and the
 * account home names at pairing, C751): another pairing starts from
 * nothing, unless it is to the same home and account (`readSent`, MP1), as
 * after a reinstall whose backup restores this record but not the pairing.
 * Bookkeeping, not
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

import type { Pairing } from "./model"

export const SENT_KEY = "some-ui.home.sent.v1"

export type Sent = {
  readonly pairing: string
  /** Home's address and the account home named at pairing (C751); absent when home named none. */
  readonly scope?: string
  readonly sessions: Readonly<Record<string, string>>
  readonly shelf: Readonly<Record<string, string>>
  readonly refused: Readonly<Record<string, string>>
  readonly leetype: Readonly<Record<string, string>>
  readonly studio: Readonly<Record<string, string>>
  readonly reflections: Readonly<Record<string, string>>
  readonly prompts: Readonly<Record<string, string>>
  readonly notes: Readonly<Record<string, string>>
  readonly lens: Readonly<Record<string, string>>
  readonly korean: Readonly<Record<string, string>>
  readonly ideas: Readonly<Record<string, string>>
  readonly episodeNotes: Readonly<Record<string, string>>
  readonly videos: Readonly<Record<string, string>>
  readonly rustWeeks: Readonly<Record<string, string>>
  readonly interviewWeeks: Readonly<Record<string, string>>
  readonly rustPastes: Readonly<Record<string, string>>
  readonly roundLog: Readonly<Record<string, string>>
  /** What home said of each work span event (RR26), `held` or `refused`. */
  readonly rustSpans: Readonly<Record<string, string>>
  readonly events: Readonly<Record<string, string>>
}

type Store = KeyedStorage | null

const emptyFor = (pairing: string, scope: string | null): Sent => ({
  pairing,
  ...(scope === null ? {} : { scope }),
  sessions: {},
  shelf: {},
  refused: {},
  leetype: {},
  studio: {},
  reflections: {},
  prompts: {},
  notes: {},
  lens: {},
  korean: {},
  ideas: {},
  episodeNotes: {},
  videos: {},
  rustWeeks: {},
  interviewWeeks: {},
  rustPastes: {},
  roundLog: {},
  rustSpans: {},
  events: {},
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
  const korean = stringsOf(parsed.korean)
  const ideas = stringsOf(parsed.ideas)
  const episodeNotes = stringsOf(parsed.episodeNotes)
  const videos = stringsOf(parsed.videos)
  const rustWeeks = stringsOf(parsed.rustWeeks)
  const interviewWeeks = stringsOf(parsed.interviewWeeks)
  const rustPastes = stringsOf(parsed.rustPastes)
  const roundLog = stringsOf(parsed.roundLog)
  const rustSpans = stringsOf(parsed.rustSpans)
  const events = stringsOf(parsed.events)
  return {
    value: {
      pairing: parsed.pairing,
      ...(typeof parsed.scope === "string" && parsed.scope !== ""
        ? { scope: parsed.scope }
        : {}),
      sessions: sessions.value,
      shelf: shelf.value,
      refused: refused.value,
      leetype: leetype.value,
      studio: studio.value,
      reflections: reflections.value,
      prompts: prompts.value,
      notes: notes.value,
      lens: lens.value,
      korean: korean.value,
      ideas: ideas.value,
      episodeNotes: episodeNotes.value,
      videos: videos.value,
      rustWeeks: rustWeeks.value,
      interviewWeeks: interviewWeeks.value,
      rustPastes: rustPastes.value,
      roundLog: roundLog.value,
      rustSpans: rustSpans.value,
      events: events.value,
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
      korean,
      ideas,
      episodeNotes,
      videos,
      rustWeeks,
      interviewWeeks,
      rustPastes,
      roundLog,
      rustSpans,
      events,
    ].every((kind) => kind.whole),
  }
}

/**
 * What this phone knows home holds under `pairing` (#3152): its record for
 * a pairing; none while the phone's record is still being read, or with no
 * pairing, since nothing is known held then.
 */
export function sentUnder(storage: Store, pairing: Pairing): Sent | null {
  return pairing.kind === "paired" ? readSent(storage, pairing.id) : null
}

/** Where each pairing's scope is noted, as the link reads or makes it (MP1). */
const SCOPE_KEY = "some-ui.home.pairing-scope.v1"

/**
 * A pairing's scope: home's address and the account home named at pairing
 * (C751), or null when home named none.
 */
export const scopeOf = (base: string, account: string | null): string | null =>
  // An empty account names no account: never one scope two accounts share.
  account === null || account.trim() === "" ? null : `${base}#${account}`

/**
 * Notes `scope` for pairing `id` (MP1): the link's, as it reads the phone's
 * record or pairs. One pairing at a time is this phone's.
 */
export function notePairingScope(
  storage: Store,
  id: string,
  scope: string | null
): void {
  if (storage === null) return
  const now = JSON.stringify({ id, scope })
  try {
    if (storage.getItem(SCOPE_KEY) !== now) storage.setItem(SCOPE_KEY, now)
  } catch {
    // Ignored: unwritten, the memory stays this pairing's alone, as every
    // memory was before MP1; nothing is lost but the carry-over.
  }
}

/** The scope noted for pairing `id`, or null. */
function scopeOfPairing(storage: Store, id: string): string | null {
  if (storage === null) return null
  let raw: string | null
  try {
    raw = storage.getItem(SCOPE_KEY)
  } catch {
    return null
  }
  const noted = jsonOf(raw ?? "null")
  return isRecord(noted) && noted.id === id && typeof noted.scope === "string"
    ? noted.scope
    : null
}

/**
 * What this phone knows home holds under `pairing`; nothing, for another,
 * unless it is to the same home and account (MP1): the memory a reinstall's
 * backup restored, kept by another pairing of the same scope, is this one's.
 */
export function readSent(storage: Store, pairing: string): Sent {
  const sent = openKept<Sent | null>(storage, SENT_KEY, readSentRecord, null)
  const scope = scopeOfPairing(storage, pairing)
  const value = sent.value
  if (value?.pairing === pairing) {
    return scope === null || value.scope === scope ? value : { ...value, scope }
  }
  if (value !== null && scope !== null && value.scope === scope) {
    return { ...value, pairing }
  }
  return emptyFor(pairing, scope)
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
  readonly korean?: (key: string) => boolean
  readonly events?: (key: string) => boolean
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
 * it replaces the other. The study notes and the Korean record keep
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
    ...(sent.scope === undefined ? {} : { scope: sent.scope }),
    sessions: { ...sent.sessions, ...more.sessions },
    shelf: { ...without(sent.shelf, more.refused), ...more.shelf },
    refused: { ...without(sent.refused, more.shelf), ...more.refused },
    leetype: { ...sent.leetype, ...more.leetype },
    studio: { ...sent.studio, ...more.studio },
    reflections: { ...sent.reflections, ...more.reflections },
    prompts: { ...sent.prompts, ...more.prompts },
    notes: keptOnly({ ...sent.notes, ...more.notes }, stays.notes),
    lens: keptOnly({ ...sent.lens, ...more.lens }, stays.lens),
    korean: keptOnly({ ...sent.korean, ...more.korean }, stays.korean),
    ideas: { ...sent.ideas, ...more.ideas },
    episodeNotes: { ...sent.episodeNotes, ...more.episodeNotes },
    videos: { ...sent.videos, ...more.videos },
    rustWeeks: { ...sent.rustWeeks, ...more.rustWeeks },
    interviewWeeks: { ...sent.interviewWeeks, ...more.interviewWeeks },
    rustPastes: { ...sent.rustPastes, ...more.rustPastes },
    roundLog: { ...sent.roundLog, ...more.roundLog },
    rustSpans: { ...sent.rustSpans, ...more.rustSpans },
    events: keptOnly({ ...sent.events, ...more.events }, stays.events),
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
