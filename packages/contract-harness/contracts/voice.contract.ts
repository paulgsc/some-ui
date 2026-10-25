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
 */

import { defineContract } from "../src/contract"

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
]
