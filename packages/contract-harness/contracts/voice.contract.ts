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
 *
 * Home's set-aside mark on a note the owner let go on the phone
 * (`PUT /voice-notes/:id/set-aside?at=`, MIC2 some-ui#2372): the voice lane
 * sends it for a note home holds (`apps/www/src/lib/home-link/set-aside.ts`).
 * Home answers `204` with no body, marked or already marked, which no probe
 * may cause: a mark is kept for good. A note the caller doesn't hold is a
 * `404`, and a time home can't read a `422` naming `at`; both write nothing,
 * and the phone reads each by its status alone (a `404` stays owed and is
 * asked again on the next run).
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

/** Home's refusal of a mark's time: `details.at` names why (`put_set_aside`). */
const AtRefusedSchema = z.object({
  error: z.object({ details: z.object({ at: z.array(z.string()) }) }),
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
    id: "voice.set_aside_unknown",
    module: "voice",
    session: true,
    method: "PUT",
    path: "/voice-notes/:id/set-aside",
    summary:
      "a set-aside mark for a note the caller doesn't hold is a 404, which the phone keeps owed for a later run, and nothing is written",
    mutates: true,
    request: {
      path: { id: "contract-harness-does-not-exist" },
      query: { at: "2026-11-01T09:15:00.000Z" },
    },
    expect: { status: 404 },
  }),
  defineContract({
    id: "voice.set_aside_refused",
    module: "voice",
    session: true,
    method: "PUT",
    path: "/voice-notes/:id/set-aside",
    summary:
      "a set-aside mark whose time home can't read is a 422, which the phone answers for good, and nothing is written",
    mutates: true,
    request: {
      path: { id: "contract-harness-does-not-exist" },
      query: { at: "soon" },
    },
    expect: { status: 422, schema: AtRefusedSchema },
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
