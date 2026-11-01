/**
 * The owner's voice notes on home (paulgsc/server `routes/voice.rs` and
 * `handlers/voice.rs`): each finished note the phone sends, the raw audio as
 * the body, kept for good and transcribed there
 * (`apps/www/src/lib/voice-home/home.ts` calls this through the app's home
 * link).
 *
 * Hand-written. The route is per person, so the contract is a `session`
 * contract. The notes are append-only, so no probe may keep anything: the
 * write is pinned by a refusal, which writes nothing. The phone reads only
 * the held note's id and SHA-256 from a `200`, checked by hand against
 * `voice_repo::Note`.
 *
 * What home heard in a note (`GET /voice-notes/:id/heard`, MIC10,
 * some-ui#2428): Studio's idea screen asks for it while it shows a take home
 * is hearing (`apps/www/src/lib/home-link/heard.ts`). A note the caller
 * doesn't hold is a `404`, which the harness can pin. A note home holds can't
 * be named here: no probe may keep a note, and the server's contract run
 * seeds only an account and its session, so `{ "heard": null }` and
 * `{ "heard": { "text", "heardAt", … } }` are declared and skipped, and are
 * held by the server's own test
 * (`handlers/voice.rs`, `the_phone_reads_back_what_home_heard_in_its_note`).
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

/**
 * The phone's read of home's answer (`heard.ts`'s `Heard`): `heard` is null
 * while home holds the note and hasn't heard it, else its words and when.
 * Home also sends `language` and `model`, which the phone doesn't read.
 */
const NoteHeardSchema = z.object({
  heard: z.object({ text: z.string(), heardAt: z.string() }).nullable(),
})

export const contracts = [
  defineContract({
    id: "voice.note_refused",
    module: "voice",
    session: true,
    method: "PUT",
    path: "/voice-notes/:id",
    summary:
      "a note whose description and audio home won't take is a 422 naming the fields, and nothing is written",
    mutates: true,
    request: {
      path: { id: "contract-harness-does-not-exist" },
      query: { of: "nope", ref: "x", at: "not a time" },
      headers: { "content-type": "text/plain" },
      body: "not audio",
    },
    expect: { status: 422 },
  }),
  defineContract({
    id: "voice.heard_unknown",
    module: "voice",
    session: true,
    method: "GET",
    path: "/voice-notes/:id/heard",
    summary:
      "home's words for a note the caller doesn't hold are a 404, which the phone reads as not held yet",
    request: { path: { id: "contract-harness-does-not-exist" } },
    expect: { status: 404 },
  }),
  defineContract({
    id: "voice.heard",
    module: "voice",
    session: true,
    method: "GET",
    path: "/voice-notes/:id/heard",
    summary:
      "home's words for a note it holds: null until heard, then the text and when",
    request: { path: { id: "a-note-home-holds" } },
    expect: { status: 200, schema: NoteHeardSchema },
    skip: "needs a voice note home holds, which no probe may keep and the contract run doesn't seed",
  }),
]
