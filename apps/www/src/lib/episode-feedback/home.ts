/**
 * The notes home keeps on the feeds' episodes (SFEED6, #2745), as Studio's
 * Feedback page reads them: `GET /feeds/:feed/notes` for each feed
 * (paulgsc/server `handlers::episode_notes`, `episode_note_repo::Held`),
 * through `lib/home-link/episode-notes-read`. The answer's reading is pure,
 * so every answer is held by a test. The read is `./home-read`, and the
 * page's query `./home-query`, which React imports (R1).
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import { z } from "zod"

const NotesSchema = z.object({
  notes: z.array(
    z.object({
      id: z.string().min(1),
      storedAt: z.string().min(1),
    })
  ),
})

/** What one feed's answer says. */
export type FeedNotesRead =
  /** When home came to keep each note, by the phone's id for it. */
  | { readonly kind: "read"; readonly storedAt: ReadonlyMap<string, string> }
  /** A home from before notes: it serves no such path. */
  | { readonly kind: "older" }
  | { readonly kind: "unreadable" }

export function readFeedNotes(answer: HomeAnswer): FeedNotesRead {
  if (answer.status === 404) return { kind: "older" }
  if (answer.status !== 200) return { kind: "unreadable" }
  const read = readAs(NotesSchema, answer.body)
  return read === null
    ? { kind: "unreadable" }
    : {
        kind: "read",
        storedAt: new Map(read.notes.map((note) => [note.id, note.storedAt])),
      }
}
