/**
 * What this phone knows its paired home holds, so a standing send
 * (`./standing`, LA11) carries only what changed since: each session's
 * `updatedAt` as it was copied, and each kept shelf item's digest as home
 * answered for it. Bookkeeping, not the record: lost, it only means sending
 * again, which home answers as unchanged.
 */
import { isRecord } from "@/lib/device-backend/common"
import type { Kept } from "@/lib/device-backend/handlers/shelf"
import type { SessionRecord } from "@/lib/tenant/types"

export const SENT_KEY = "some-ui.home.sent.v1"

export type Sent = {
  readonly sessions: Readonly<Record<string, string>>
  readonly shelf: Readonly<Record<string, string>>
}

type Store = Pick<Storage, "getItem" | "setItem"> | null

const EMPTY: Sent = { sessions: {}, shelf: {} }

function stringsOf(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  )
}

export function readSent(storage: Store): Sent {
  try {
    const text = storage?.getItem(SENT_KEY) ?? null
    if (text === null) return EMPTY
    const parsed: unknown = JSON.parse(text)
    if (!isRecord(parsed)) return EMPTY
    const { sessions, shelf } = parsed
    return { sessions: stringsOf(sessions), shelf: stringsOf(shelf) }
  } catch {
    return EMPTY
  }
}

/** `sent` with what home now holds added; unwritten, the next send repeats it. */
export function rememberSent(
  storage: Store,
  sent: Sent,
  more: Partial<Sent>
): Sent {
  const next: Sent = {
    sessions: { ...sent.sessions, ...more.sessions },
    shelf: { ...sent.shelf, ...more.shelf },
  }
  try {
    storage?.setItem(SENT_KEY, JSON.stringify(next))
  } catch {
    // Full: the next send carries these again, and home says unchanged.
  }
  return next
}

/** The sessions home does not hold as they are now. */
export function sessionsToSend(
  local: ReadonlyArray<SessionRecord>,
  sent: Sent
): Array<SessionRecord> {
  return local.filter(
    (session) => sent.sessions[session.id] !== session.updatedAt
  )
}

/** A sessions-held entry for each of `sessions`, as copied now. */
export function sessionsHeld(
  sessions: ReadonlyArray<SessionRecord>
): Record<string, string> {
  return Object.fromEntries(sessions.map((s) => [s.id, s.updatedAt]))
}

export const shelfKeyOf = (item: Kept): string => `${item.activity}/${item.key}`

/** A kept item's bytes as a hex SHA-256, to tell an edit from what home has. */
export async function digestOf(body: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body)
  )
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

/** How many sessions and kept items this phone knows home holds. */
export function heldCounts(sent: Sent): { sessions: number; shelf: number } {
  return {
    sessions: Object.keys(sent.sessions).length,
    shelf: Object.keys(sent.shelf).length,
  }
}
