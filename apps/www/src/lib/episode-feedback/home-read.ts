/**
 * One read of the notes home keeps on every feed (SFEED6, #2745), asked
 * again while the link is busy, and what it came to, and what home last
 * answered for each note the phone sent (`lib/home-link/episode-notes`).
 * Kept out of the query's module, which React imports (R1).
 */
import { localStorageOrNull } from "@some-ui/core-utils"

import type { Feed } from "@/lib/feeds"
import { FEEDS } from "@/lib/feeds"
import { pairing } from "@/lib/home-link"
import { episodeNotesWaiting } from "@/lib/home-link/episode-notes"
import { askEpisodeNotes } from "@/lib/home-link/episode-notes-read"
import { askWhileBusy } from "@/lib/home-link/while-busy"
import { PhoneBusyError } from "@/lib/phone-busy"

import { readFeedNotes } from "./home"

export { episodeNotesMoved } from "@/lib/home-link/episode-notes"

/** What a read of every feed came to. */
export type HomeNotesOutcome =
  | {
      readonly kind: "read"
      readonly storedAt: ReadonlyMap<string, string>
      /** The feeds whose notes this home doesn't keep yet, so theirs wait on the phone. */
      readonly notYet: ReadonlySet<Feed>
    }
  /** A home that keeps notes on no feed yet. */
  | { readonly kind: "older" }
  | { readonly kind: "unpaired" }

/**
 * Reads the notes home keeps on every feed, asking again while the link is
 * busy. Rejects when home didn't answer, the phone stayed busy with home
 * (`PhoneBusyError`, #3155), or an answer couldn't be read, so the
 * page keeps what it last read and says so.
 */
export async function readHomeNotes(
  wanted: () => boolean = () => true
): Promise<HomeNotesOutcome> {
  const storedAt = new Map<string, string>()
  const notYet = new Set<Feed>()
  for (const feed of FEEDS) {
    const asked = await askWhileBusy(() => askEpisodeNotes(feed), wanted)
    if (asked.kind === "unpaired") return asked
    if (asked.kind === "busy") throw new PhoneBusyError("this phone was busy")
    if (asked.kind === "unreachable") throw new Error("home didn't answer")
    const read = readFeedNotes(asked.answer)
    if (read.kind === "older") {
      notYet.add(feed)
      continue
    }
    if (read.kind === "unreadable")
      throw new Error("home's answer was unreadable")
    for (const [id, at] of read.storedAt) storedAt.set(id, at)
  }
  return notYet.size === FEEDS.length
    ? { kind: "older" }
    : { kind: "read", storedAt, notYet }
}

/**
 * The notes home read back, and refused, as this phone sent them under the
 * pairing now; null while the pairing record is read, when neither is known
 * (PO1, #3157). The page renders again once its read of home ends, which
 * waits on that record.
 */
export function notesAnswered(): {
  readonly held: ReadonlySet<string>
  readonly refused: ReadonlySet<string>
} | null {
  const now = pairing()
  if (now.kind === "reading") return null
  const { held, refused } = episodeNotesWaiting(localStorageOrNull(), now)
  return { held, refused }
}
