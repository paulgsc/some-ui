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
 *
 * A note's audio back from home (`GET /voice-notes/:id/audio`): the phone
 * asks for it when it plays a Rust Rounds note whose audio is not on it (RR6
 * some-ui#2237, the owner's D4), or a Studio take on Takes on home (ST32)
 * (`apps/www/src/lib/home-link/voice-audio.ts`).
 * It is a paired phone's route (`subject::Paired`), as `/rust-rounds` is, so
 * no session is a `401`, a browser's cookie session a `403`, and a paired
 * contract runs only with `--phone-token`. A note the caller doesn't hold,
 * or holds of another kind, is a `404`. The `200` can't be probed (no probe
 * may keep a note), so its shape is declared and skipped, and is held by the
 * server's own test (`handlers/voice.rs`,
 * `a_paired_phone_reads_its_own_rust_round_notes_audio_back`).
 *
 * What home keeps of the caller's notes (`GET /voice-notes/kept`, MD2
 * some-ui#2476): My data asks for it each time it opens or is dragged down
 * (`apps/www/src/lib/home-link/kept-read.ts`, read by `lib/my-data`). A paired
 * phone's route, as the audio read is: no session is a `401`, a browser's a
 * `403`. The contract run's paired phone holds no notes, so its `200` is the
 * empty answer, which the harness probes for its shape; an `of` naming no
 * kind is a `422`. Each note says whether My data may delete it
 * (`deletable`, MD3 some-ui#2477), and what it is (MD8): how long, once
 * home heard it (`durationMs`), the first words home heard (`heard`), and
 * whether home gives its audio back to the phone (`playsBack`).
 *
 * The takes home keeps (`GET /voice-notes/takes`, ST32): Studio's Takes on
 * home asks for the newest as it opens and on Show the newest or a blank
 * search, and with `q` for those whose heard words hold every word of a
 * search, Try again repeating either (`apps/www/src/lib/home-link/takes-read.ts`, read by
 * `lib/take-library`). A paired phone's route, as the audio read is: no
 * session is a `401`, a browser's a `403`. The contract run's paired phone
 * holds no takes, so its `200` is the empty answer, which the harness probes
 * for its shape, with and without a search; a blank `q`, or one over 200
 * characters, is a `422`.
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

/**
 * The phone's read of a note's audio (`voice-audio.ts`'s `NoteAudio`): its
 * id, container, the SHA-256 of its bytes, and the bytes as base64.
 */
const NoteAudioSchema = z.object({
  id: z.string(),
  contentType: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  audio: z.string(),
})

/**
 * The phone's read of what home keeps (`lib/my-data/model.ts`'s `Kept`):
 * each kind's count, room, set-aside count and earliest; what reached home
 * each week; and with `of`, that kind's newest.
 */
const KeptSchema = z.object({
  kinds: z.array(
    z.object({
      of: z.string(),
      notes: z.number().int(),
      bytes: z.number().int(),
      setAside: z.number().int(),
      since: z.string(),
    })
  ),
  weeks: z.array(
    z.object({
      week: z.string(),
      notes: z.number().int(),
      bytes: z.number().int(),
    })
  ),
  notes: z
    .array(
      z.object({
        id: z.string(),
        recordedAt: z.string(),
        storedAt: z.string(),
        size: z.number().int(),
        setAsideAt: z.string().nullable(),
        deletable: z.boolean(),
        durationMs: z.number().int().nullable(),
        heard: z.string().nullable(),
        playsBack: z.boolean(),
      })
    )
    .nullable(),
})

/**
 * The phone's read of the takes home keeps (`lib/take-library/model.ts`'s
 * `TakesSchema`): each Studio take with what home heard in it (null until
 * heard), how many home keeps, how many a search matched, and how the list
 * was picked (`meaning` is reserved for home's index of meaning).
 */
const TakesSchema = z.object({
  takes: z.array(
    z.object({
      id: z.string(),
      ref: z.string(),
      recordedAt: z.string(),
      storedAt: z.string(),
      size: z.number().int(),
      setAsideAt: z.string().nullable(),
      heard: z
        .object({
          text: z.string(),
          language: z.string().nullable(),
          model: z.string(),
          heardAt: z.string(),
        })
        .nullable(),
    })
  ),
  total: z.number().int(),
  matched: z.number().int().nullable(),
  by: z.enum(["newest", "words", "meaning"]),
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
  defineContract({
    id: "voice.audio_signed_out",
    module: "voice",
    method: "GET",
    path: "/voice-notes/:id/audio",
    summary:
      "a note's audio is a paired phone's: without a session it is a 401",
    request: { path: { id: "contract-harness-does-not-exist" } },
    expect: { status: 401 },
  }),
  defineContract({
    id: "voice.audio_browser",
    module: "voice",
    session: true,
    method: "GET",
    path: "/voice-notes/:id/audio",
    summary:
      "a note's audio is a paired phone's: a browser's cookie session is a 403",
    request: { path: { id: "contract-harness-does-not-exist" } },
    expect: { status: 403 },
  }),
  defineContract({
    id: "voice.audio_unknown",
    module: "voice",
    paired: true,
    method: "GET",
    path: "/voice-notes/:id/audio",
    summary:
      "the audio of a note the caller doesn't hold is a 404, and the note can't play",
    request: { path: { id: "contract-harness-does-not-exist" } },
    expect: { status: 404 },
  }),
  defineContract({
    id: "voice.audio",
    module: "voice",
    paired: true,
    method: "GET",
    path: "/voice-notes/:id/audio",
    summary:
      "a Rust Rounds note's or a Studio take's audio as home holds it, with its container and SHA-256, the SHA-256 its ETag",
    request: { path: { id: "a-rust-round-note-home-holds" } },
    expect: { status: 200, schema: NoteAudioSchema },
    skip: "needs a Rust Rounds note home holds, which no probe may keep and the contract run doesn't seed",
  }),
  defineContract({
    id: "voice.kept_signed_out",
    module: "voice",
    method: "GET",
    path: "/voice-notes/kept",
    summary:
      "what home keeps is a paired phone's: without a session it is a 401",
    request: {},
    expect: { status: 401 },
  }),
  defineContract({
    id: "voice.kept_browser",
    module: "voice",
    session: true,
    method: "GET",
    path: "/voice-notes/kept",
    summary:
      "what home keeps is a paired phone's: a browser's cookie session is a 403",
    request: {},
    expect: { status: 403 },
  }),
  defineContract({
    id: "voice.kept",
    module: "voice",
    paired: true,
    method: "GET",
    path: "/voice-notes/kept",
    summary:
      "what home keeps of the caller's notes: each kind's count and room, what reached it each week, and the newest of the kind asked about",
    request: { query: { of: "studio" } },
    expect: { status: 200, schema: KeptSchema },
  }),
  defineContract({
    id: "voice.kept_unknown_kind",
    module: "voice",
    paired: true,
    method: "GET",
    path: "/voice-notes/kept",
    summary: "an of that names no kind of note is a 422, and nothing is read",
    request: { query: { of: "diary" } },
    expect: { status: 422 },
  }),
  defineContract({
    id: "voice.takes_signed_out",
    module: "voice",
    method: "GET",
    path: "/voice-notes/takes",
    summary:
      "the takes home keeps are a paired phone's: without a session it is a 401",
    request: {},
    expect: { status: 401 },
  }),
  defineContract({
    id: "voice.takes_browser",
    module: "voice",
    session: true,
    method: "GET",
    path: "/voice-notes/takes",
    summary:
      "the takes home keeps are a paired phone's: a browser's cookie session is a 403",
    request: {},
    expect: { status: 403 },
  }),
  defineContract({
    id: "voice.takes",
    module: "voice",
    paired: true,
    method: "GET",
    path: "/voice-notes/takes",
    summary:
      "the newest takes home keeps of the caller, each with what home heard in it, and how many it keeps",
    request: {},
    expect: { status: 200, schema: TakesSchema },
  }),
  defineContract({
    id: "voice.takes_search",
    module: "voice",
    paired: true,
    method: "GET",
    path: "/voice-notes/takes",
    summary:
      "the takes whose heard words hold every word of q, newest first, with how many matched",
    request: { query: { q: "brand intro" } },
    expect: { status: 200, schema: TakesSchema },
  }),
  defineContract({
    id: "voice.takes_blank_search",
    module: "voice",
    paired: true,
    method: "GET",
    path: "/voice-notes/takes",
    summary: "a blank q is a 422, and nothing is read",
    request: { query: { q: "   " } },
    expect: { status: 422 },
  }),
  defineContract({
    id: "voice.takes_long_search",
    module: "voice",
    paired: true,
    method: "GET",
    path: "/voice-notes/takes",
    summary: "a q over 200 characters is a 422, and nothing is read",
    request: { query: { q: "a".repeat(201) } },
    expect: { status: 422 },
  }),
]
