/**
 * One read of the notes home keeps on every feed (SFEED6, #2745), asked
 * again while the link is busy, and what it came to, and what home last
 * answered for each note the phone sent (`lib/home-link/episode-notes`).
 * Kept out of the query's module, which React imports (R1).
 */
import { localStorageOrNull } from "@some-ui/core-utils"

import { FEEDS } from "@/lib/feeds"
import { pairingOf } from "@/lib/home-link"
import { episodeNotesWaiting } from "@/lib/home-link/episode-notes"
import { askEpisodeNotes } from "@/lib/home-link/episode-notes-read"
import { askWhileBusy } from "@/lib/home-link/while-busy"

import { readFeedNotes } from "./home"

export { episodeNotesMoved } from "@/lib/home-link/episode-notes"

/** What a read of every feed came to. */
export type HomeNotesOutcome =
  | { readonly kind: "read"; readonly storedAt: ReadonlyMap<string, string> }
  | { readonly kind: "older" }
  | { readonly kind: "unpaired" }

/**
 * Reads the notes home keeps on every feed, asking again while the link is
 * busy. Rejects when home didn't answer or an answer couldn't be read, so the
 * page keeps what it last read and says so.
 */
export async function readHomeNotes(): Promise<HomeNotesOutcome> {
  const storedAt = new Map<string, string>()
  for (const feed of FEEDS) {
    const asked = await askWhileBusy(() => askEpisodeNotes(feed))
    if (asked.kind === "unpaired") return asked
    if (asked.kind === "unreachable") throw new Error("home didn't answer")
    const read = readFeedNotes(asked.answer)
    if (read.kind === "older") return read
    if (read.kind === "unreadable")
      throw new Error("home's answer was unreadable")
    for (const [id, at] of read.storedAt) storedAt.set(id, at)
  }
  return { kind: "read", storedAt }
}

/** The notes home read back, and refused, as this phone sent them under the pairing now. */
export function notesAnswered(): {
  readonly held: ReadonlySet<string>
  readonly refused: ReadonlySet<string>
} {
  const { held, refused } = episodeNotesWaiting(
    localStorageOrNull(),
    pairingOf()
  )
  return { held, refused }
}
