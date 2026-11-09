/**
 * The owner's notes on the feeds' episodes (paulgsc/server
 * `routes/episode_notes.rs`, `handlers/episode_notes.rs`; SFEED6, #2745).
 * The phone sends each note with `PUT /feeds/:feed/notes/:id`
 * (`apps/www/src/lib/home-link/episode-notes.ts`, on the voice lane's run) and
 * Studio's Feedback page reads them with `GET /feeds/:feed/notes`
 * (`apps/www/src/lib/home-link/episode-notes-read.ts`).
 *
 * Hand-written. A note is a subject's: without a session each route is a
 * `401`, and a `PUT` without one keeps nothing. The shapes a session reaches
 * (`NoteKept`, `Notes`) are held by the server's handler tests and the
 * phone's readers (`carriesBack`, `lib/episode-feedback/home.ts`).
 */

import { defineContract } from "../src/contract"

const NOTE = {
  id: "contract-note",
  feed: "call",
  episode: "2026-11-13",
  atMs: 134_000,
  categories: ["shallow", "musicLoud"],
  writtenAt: "2026-11-14T03:00:00.000Z",
}

export const contracts = [
  defineContract({
    id: "episode_notes.list_signed_out",
    module: "episode_notes",
    method: "GET",
    path: "/feeds/:feed/notes",
    summary: "the notes are a subject's: without a session it is a 401",
    request: { path: { feed: "call" } },
    expect: { status: 401 },
  }),

  defineContract({
    id: "episode_notes.put_signed_out",
    module: "episode_notes",
    method: "PUT",
    path: "/feeds/:feed/notes/:id",
    summary:
      "a note is a subject's: without a session it is a 401, and nothing is kept",
    mutates: true,
    request: { path: { feed: "call", id: NOTE.id }, body: NOTE },
    expect: { status: 401 },
  }),
]
