/**
 * What this phone knows its paired home holds, so a standing send
 * (`./standing`, LA11) carries only what changed since: each finished
 * session's `updatedAt` as it was copied, each kept shelf item's digest as
 * home answered for it, and the digests home refused, so an unchanged
 * refused item is not offered again. Kept for one home (`home`, the
 * pairing's base): another pairing starts from nothing. Bookkeeping, not
 * the record: lost, it only means sending again, which home answers as
 * unchanged.
 */
import { isRecord, sha256Hex } from "@/lib/device-backend/common"
import type { Kept } from "@/lib/device-backend/handlers/shelf"
import type { SessionRecord } from "@/lib/tenant/types"

export const SENT_KEY = "some-ui.home.sent.v1"

export type Sent = {
  readonly home: string
  readonly sessions: Readonly<Record<string, string>>
  readonly shelf: Readonly<Record<string, string>>
  readonly refused: Readonly<Record<string, string>>
}

type Store = Pick<Storage, "getItem" | "setItem"> | null

const emptyFor = (home: string): Sent => ({
  home,
  sessions: {},
  shelf: {},
  refused: {},
})

function stringsOf(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  )
}

/** What this phone knows `home` holds; nothing, for any other home. */
export function readSent(storage: Store, home: string): Sent {
  try {
    const text = storage?.getItem(SENT_KEY) ?? null
    if (text === null) return emptyFor(home)
    const parsed: unknown = JSON.parse(text)
    if (!isRecord(parsed) || parsed.home !== home) return emptyFor(home)
    const { sessions, shelf, refused } = parsed
    return {
      home,
      sessions: stringsOf(sessions),
      shelf: stringsOf(shelf),
      refused: stringsOf(refused),
    }
  } catch {
    return emptyFor(home)
  }
}

/** `sent` with what home now holds added; unwritten, the next send repeats it. */
export function rememberSent(
  storage: Store,
  sent: Sent,
  more: Partial<Omit<Sent, "home">>
): Sent {
  const next: Sent = {
    home: sent.home,
    sessions: { ...sent.sessions, ...more.sessions },
    shelf: { ...sent.shelf, ...more.shelf },
    refused: { ...sent.refused, ...more.refused },
  }
  try {
    storage?.setItem(SENT_KEY, JSON.stringify(next))
  } catch {
    // Full: the next send carries these again, and home says unchanged.
  }
  return next
}

/** The finished sessions home does not hold as they are now. */
export function sessionsToSend(
  local: ReadonlyArray<SessionRecord>,
  sent: Sent
): Array<SessionRecord> {
  return local.filter(
    (session) =>
      session.status === "completed" &&
      sent.sessions[session.id] !== session.updatedAt
  )
}

/** A sessions-held entry for each of `sessions`, as copied now. */
export function sessionsHeld(
  sessions: ReadonlyArray<SessionRecord>
): Record<string, string> {
  return Object.fromEntries(sessions.map((s) => [s.id, s.updatedAt]))
}

export const shelfKeyOf = (item: Kept): string => `${item.activity}/${item.key}`

/** A shelf-held entry for each of `items`: its bytes' digest, to tell an edit. */
export async function shelfHeld(
  items: ReadonlyArray<Kept>
): Promise<Record<string, string>> {
  const held: Array<[string, string]> = await Promise.all(
    items.map(async (item) => [shelfKeyOf(item), await sha256Hex(item.body)])
  )
  return Object.fromEntries(held)
}

/** How many sessions and kept items this phone knows home holds, or refused. */
export function heldCounts(sent: Sent): {
  sessions: number
  shelf: number
  refused: number
} {
  return {
    sessions: Object.keys(sent.sessions).length,
    shelf: Object.keys(sent.shelf).length,
    refused: Object.keys(sent.refused).length,
  }
}
