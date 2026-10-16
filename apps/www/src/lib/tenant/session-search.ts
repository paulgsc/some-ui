/**
 * Searching a list of sessions already in hand: by name and by whether they
 * were finished, newest first. Pure; nothing here reads or sends.
 */
import type { SessionRecord } from "./types"

export type SessionFilter = "all" | "finished" | "unfinished"

export type SessionQuery = {
  /** Words that must all appear in the name, in any case; "" for any. */
  readonly text: string
  readonly filter: SessionFilter
}

/** When a session last moved: when it was finished, else its last change. */
export function lastMoved(session: SessionRecord): string {
  return session.completedAt ?? session.updatedAt
}

export function searchSessions(
  sessions: ReadonlyArray<SessionRecord>,
  { text, filter }: SessionQuery
): Array<SessionRecord> {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean)
  return sessions
    .filter((session) => {
      const finished = session.status === "completed"
      if (filter === "finished" && !finished) return false
      if (filter === "unfinished" && finished) return false
      const name = session.name.toLowerCase()
      return words.every((word) => name.includes(word))
    })
    .sort((a, b) => Date.parse(lastMoved(b)) - Date.parse(lastMoved(a)))
}
