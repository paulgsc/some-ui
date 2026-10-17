/**
 * aph kept on home: the record lives on the paired home server
 * (paulgsc/server `handlers/aph.rs`), and the phone keeps only what home has
 * not yet confirmed it holds. Pure: no storage, no network. `store.ts` holds
 * the state, and the app's home link (apps/www `lib/home-link/aph`) sends and
 * reads.
 *
 * What the phone keeps while kept on home (`HomeRecord`, under its own key in
 * `stored.ts`):
 *
 * - the settings, as last read from home or as changed here, because logging
 *   needs the checkpoints and goals even when home cannot be reached;
 * - every entry changed on this phone that home has not confirmed, each as it
 *   was last changed (`pending`);
 * - the ones home refused, with why, so they are not sent again unchanged.
 *
 * An entry leaves `pending` only once home answers with the same entry
 * (`sameEntry`), so the phone never lets go of something home does not hold.
 */
import type { AphSettings, Entry } from "./model"
import { violations } from "./model"

export type Refusal = { readonly id: string; readonly why: string }

export type HomeRecord = {
  readonly settings: AphSettings
  /** The settings were changed here and home has not confirmed them. */
  readonly settingsPending: boolean
  readonly pending: ReadonlyArray<Entry>
  readonly refused: ReadonlyArray<Refusal>
}

/** What the phone has to send: what is pending and was not refused. */
export type Outbox = {
  readonly settings: AphSettings | null
  readonly entries: ReadonlyArray<Entry>
}

/** Home's record as `GET /aph` answers it. */
export type HomeHeld = {
  readonly settings: AphSettings | null
  readonly entries: ReadonlyArray<Entry>
}

/**
 * What a send learned: each entry home now holds, as it answered it; each it
 * refused, as it was sent, with why; and the settings, if home took them.
 */
export type Receipt = {
  readonly settings: AphSettings | null
  readonly held: ReadonlyArray<Entry>
  readonly refused: ReadonlyArray<{
    readonly entry: Entry
    readonly why: string
  }>
}

/** Every field in the server's order, so two copies compare as text. */
function canonicalEntry(e: Entry): string {
  return JSON.stringify([
    e.id,
    e.day,
    e.checkpoint,
    e.time,
    e.mine === null ? null : [e.mine.value, e.mine.approx],
    e.theirs === null ? null : e.theirs.value,
    e.goal,
    e.labels,
    e.note,
    e.review,
  ])
}

function canonicalSettings(s: AphSettings): string {
  return JSON.stringify([
    s.checkpoints.map((c) => [c.id, c.label, c.minutes, c.goal]),
    s.labels,
    s.step,
    s.usualLow,
    s.usualHigh,
    s.tolerance,
    s.since,
  ])
}

/** The same entry, field for field. */
export function sameEntry(a: Entry, b: Entry): boolean {
  return canonicalEntry(a) === canonicalEntry(b)
}

export function sameSettings(a: AphSettings, b: AphSettings): boolean {
  return canonicalSettings(a) === canonicalSettings(b)
}

/** The first home record: everything this phone holds, not yet sent. */
export function startHome(
  settings: AphSettings,
  entries: ReadonlyArray<Entry>
): HomeRecord {
  return { settings, settingsPending: true, pending: entries, refused: [] }
}

export function outboxOf(record: HomeRecord): Outbox {
  const refused = new Set(record.refused.map((r) => r.id))
  return {
    settings: record.settingsPending ? record.settings : null,
    entries: record.pending.filter((e) => !refused.has(e.id)),
  }
}

/** How many changes wait on this phone, refused ones included. */
export function unsentCount(record: HomeRecord): number {
  return record.pending.length + (record.settingsPending ? 1 : 0)
}

/**
 * `record` with the entries that moved from `before` to `after` pending, as
 * they now are, and no longer refused: a change to a refused entry is a new
 * try. The settings are pending when they changed.
 */
export function recordChange(
  record: HomeRecord,
  before: { settings: AphSettings; entries: ReadonlyArray<Entry> },
  after: { settings: AphSettings; entries: ReadonlyArray<Entry> }
): HomeRecord {
  const was = new Map(before.entries.map((e) => [e.id, e]))
  const changed = after.entries.filter((e) => {
    const old = was.get(e.id)
    return old === undefined || !sameEntry(old, e)
  })
  const settingsChanged = !sameSettings(before.settings, after.settings)
  if (changed.length === 0 && !settingsChanged) return record
  const ids = new Set(changed.map((e) => e.id))
  return {
    settings: after.settings,
    settingsPending: record.settingsPending || settingsChanged,
    pending: [...record.pending.filter((e) => !ids.has(e.id)), ...changed],
    refused: record.refused.filter((r) => !ids.has(r.id)),
  }
}

/**
 * `record` after a send: each entry home answered with exactly as it is
 * still pending leaves `pending`, each it refused as it is still pending is
 * marked refused, and the settings stop pending when home holds them as they
 * are. Anything changed on the phone since it was sent stays as it is.
 */
export function afterSend(record: HomeRecord, receipt: Receipt): HomeRecord {
  const held = new Map(receipt.held.map((e) => [e.id, e]))
  const pending = record.pending.filter((e) => {
    const home = held.get(e.id)
    return home === undefined || !sameEntry(home, e)
  })
  const stillAsSent = receipt.refused.filter(({ entry }) =>
    pending.some((e) => e.id === entry.id && sameEntry(e, entry))
  )
  const refusedIds = new Set(stillAsSent.map(({ entry }) => entry.id))
  return {
    settings: record.settings,
    settingsPending:
      record.settingsPending &&
      !(
        receipt.settings !== null &&
        sameSettings(receipt.settings, record.settings)
      ),
    pending,
    refused: [
      ...record.refused.filter(
        (r) => !refusedIds.has(r.id) && pending.some((e) => e.id === r.id)
      ),
      ...stillAsSent.map(({ entry, why }) => ({ id: entry.id, why })),
    ],
  }
}

/**
 * What the screens show from home's record: home's settings unless this
 * phone's are pending, and home's entries with each pending one laid over
 * them, every one that keeps the whole valid. Null when home's own record
 * does not pass `violations` against those settings, which would leave the
 * store unable to take any edit.
 */
export function shown(
  record: HomeRecord,
  home: HomeHeld
): {
  settings: AphSettings
  entries: Array<Entry>
  /** Pending entries that conflict with home's record, not shown. */
  hidden: number
} | null {
  const settings =
    record.settingsPending || home.settings === null
      ? record.settings
      : home.settings
  if (violations(settings, home.entries).length > 0) return null
  let entries = [...home.entries]
  let hidden = 0
  for (const mine of record.pending) {
    const next = entries.some((e) => e.id === mine.id)
      ? entries.map((e) => (e.id === mine.id ? mine : e))
      : [...entries, mine]
    if (violations(settings, next).length === 0) entries = next
    else hidden += 1
  }
  return { settings, entries, hidden }
}
