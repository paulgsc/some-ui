/**
 * Rust Rounds' rounds on home, and what home's `rust-runner` recorded for
 * each of their programs (paulgsc/server `routes/rust_rounds.rs` and
 * `handlers/rust_rounds.rs`, RR3 #2234; the round format is RR1's
 * `some-ui.rust-round/1`, `packages/ui/rust-rounds/src/lib/formats`). The
 * phone will fetch the list and each round with its runs, and send a pasted
 * round home, through the app's home link (RR4b #2347).
 *
 * Hand-written: `RoundListSchema` is the server's `RoundList` of
 * `rust_round_repo::RoundEntry`, and `RoundWithRunsSchema` its
 * `RoundWithRuns` (`programs` of `ProgramRuns`, `runs` of `RunKept`), checked
 * by hand against them. `rustc` is RR1's `RustcRunSchema`, copied: the
 * server keeps what the runner reported and serves it verbatim. `round` is
 * the round byte for byte as it was put, so its fields are RR1's format and
 * the phone's intake reads them; here it is only an object.
 *
 * **Who may call.** Every route answers a paired phone only (`subject::Paired`):
 * no session is a `401`, a browser's cookie session a `403`, and the phone's
 * bearer token is the only way in. So each route has a signed-out contract,
 * which always runs, a `session` contract that pins the browser's `403`, and
 * `paired` contracts, which run only when a phone's token is supplied
 * (`--phone-token`). The server's `Routes / Check some-ui against it` job
 * mints a cookie session only, so there its paired contracts are skipped by
 * name until that job mints a phone session too.
 *
 * **Nothing here keeps anything.** Rounds are append-only and go only with
 * the account, so no probe may store one: every `PUT` sends a round whose id
 * is not the path's, which the server refuses with a `422` before it writes,
 * and the signed-out and browser `PUT`s are refused before the body is read.
 * Reading a stored round (`200`, its `ETag`, the `304`), the `201`/`200`/`409`
 * of a real put and another subject's round being a `404` are held by the
 * server's own handler tests. `rust-rounds.round` asks for the worked
 * example's id, so on a home that holds it the round's shape is checked, and
 * elsewhere it answers the `404` its schema does not cover.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

/** `rust_round_repo::LIST_LIMIT`. */
const ROUNDS_LISTED = 500

/** A round or card id: lower-case words joined by `-`, at most 64 characters. */
const SlugSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

/** A hex SHA-256: `contentHash` of the round as home keeps it, `sourceHash` of a program. */
const HashSchema = z.string().regex(/^[0-9a-f]{64}$/)

const RoundEntrySchema = z.object({
  id: SlugSchema,
  contentHash: HashSchema,
  receivedAt: z.iso.datetime({ offset: true }),
})

const RoundListSchema = z.object({
  rounds: z.array(RoundEntrySchema).max(ROUNDS_LISTED),
})

const TextSchema = z.string().refine((text) => text.trim() !== "")

const RustcRunSchema = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("compile-error"),
    toolchain: TextSchema,
    code: z
      .string()
      .regex(/^E\d{4}$/)
      .nullable(),
    stderr: z.string(),
    span: z
      .strictObject({
        lineStart: z.int().positive(),
        columnStart: z.int().positive(),
        lineEnd: z.int().positive(),
        columnEnd: z.int().positive(),
      })
      .nullable(),
  }),
  z.strictObject({
    outcome: z.literal("prints"),
    toolchain: TextSchema,
    compileStderr: z.string(),
    stdout: z.string(),
  }),
  z.strictObject({
    outcome: z.literal("panics"),
    toolchain: TextSchema,
    compileStderr: z.string(),
    stdout: z.string(),
    stderr: z.string(),
  }),
  z.strictObject({
    outcome: z.literal("stopped"),
    toolchain: TextSchema,
    compileStderr: z.string(),
    why: z.enum(["time", "memory", "output", "exit"]),
    stdout: z.string(),
    stderr: z.string(),
  }),
])

/** `handlers::rust_rounds::RunKept`. It carries no time on purpose (identity invariant 28). */
const RunKeptSchema = z.object({
  toolchain: TextSchema,
  ended: z.enum(["recorded", "refused", "runner-lost"]),
  refusal: z.enum(["malformed", "too-large"]).nullable(),
  rustc: RustcRunSchema,
})

const RoundWithRunsSchema = z.object({
  id: SlugSchema,
  contentHash: HashSchema,
  receivedAt: z.iso.datetime({ offset: true }),
  round: z.record(z.string(), z.unknown()),
  programs: z.array(
    z.object({
      card: SlugSchema,
      sourceHash: HashSchema,
      runs: z.array(RunKeptSchema),
    })
  ),
})

/** The worked example's id (`packages/ui/rust-rounds/src/lib/worked-example`). */
const WORKED_EXAMPLE = "indexing-01"

/** An id in the round's own form that no tutor writes. */
const ABSENT_ROUND = "contract-harness-absent"

/** Not `ABSENT_ROUND`, so a `PUT` to it carries a round whose id is not the path's. */
const OTHER_ROUND = "contract-harness-other"

/**
 * A round the server would keep, but under `ABSENT_ROUND`: put to
 * `OTHER_ROUND`, it is refused as "must be the id in the path", before any
 * write.
 */
const MISPLACED_ROUND = {
  schema: "some-ui.rust-round/1",
  id: ABSENT_ROUND,
  by: "contract-harness",
  concept: "indexing",
  edges: [],
  cards: [
    {
      kind: "read",
      id: "a",
      program: "fn main() {}\n",
      ask: "?",
      choices: [],
      expect: { outcome: "panics" },
    },
  ],
}

export const contracts = [
  defineContract({
    id: "rust-rounds.list",
    module: "rust_rounds",
    paired: true,
    method: "GET",
    path: "/rust-rounds",
    summary: `this subject's rounds home holds, newest first, at most ${ROUNDS_LISTED}: each by id, the hash of what home keeps and when it arrived`,
    expect: { status: 200, schema: RoundListSchema },
  }),

  defineContract({
    id: "rust-rounds.list_signed_out",
    module: "rust_rounds",
    method: "GET",
    path: "/rust-rounds",
    summary: "the list is a paired phone's: without a session it is a 401",
    expect: { status: 401 },
  }),

  defineContract({
    id: "rust-rounds.list_browser",
    module: "rust_rounds",
    session: true,
    method: "GET",
    path: "/rust-rounds",
    summary:
      "the list is a paired phone's: a browser's cookie session is a 403",
    expect: { status: 403 },
  }),

  defineContract({
    id: "rust-rounds.round",
    module: "rust_rounds",
    paired: true,
    method: "GET",
    path: "/rust-rounds/:id",
    summary:
      "one round as home keeps it, with each read and variant card's program and every run home's rust-runner recorded for it; a 404 where home holds none under the id",
    request: { path: { id: WORKED_EXAMPLE } },
    expect: {
      status: [200, 404],
      schemaFor: 200,
      schema: RoundWithRunsSchema,
    },
  }),

  defineContract({
    id: "rust-rounds.round_absent",
    module: "rust_rounds",
    paired: true,
    method: "GET",
    path: "/rust-rounds/:id",
    summary: "an id home holds no round under for this subject is a 404",
    request: { path: { id: ABSENT_ROUND } },
    expect: { status: 404 },
  }),

  defineContract({
    id: "rust-rounds.round_absent_conditional",
    module: "rust_rounds",
    paired: true,
    method: "GET",
    path: "/rust-rounds/:id",
    summary:
      "asking with a version the phone holds is still a 404 when home holds no such round, never a 304",
    request: {
      path: { id: ABSENT_ROUND },
      headers: { "If-None-Match": '"contract-harness-held-version"' },
    },
    expect: { status: 404 },
  }),

  defineContract({
    id: "rust-rounds.round_signed_out",
    module: "rust_rounds",
    method: "GET",
    path: "/rust-rounds/:id",
    summary: "a round is a paired phone's: without a session it is a 401",
    request: { path: { id: ABSENT_ROUND } },
    expect: { status: 401 },
  }),

  defineContract({
    id: "rust-rounds.round_browser",
    module: "rust_rounds",
    session: true,
    method: "GET",
    path: "/rust-rounds/:id",
    summary: "a round is a paired phone's: a browser's cookie session is a 403",
    request: { path: { id: ABSENT_ROUND } },
    expect: { status: 403 },
  }),

  defineContract({
    id: "rust-rounds.put_misplaced",
    module: "rust_rounds",
    paired: true,
    method: "PUT",
    path: "/rust-rounds/:id",
    summary:
      "a round whose id is not the path's is a 422 naming the id, and nothing is kept",
    mutates: true,
    request: { path: { id: OTHER_ROUND }, body: MISPLACED_ROUND },
    expect: { status: 422 },
  }),

  defineContract({
    id: "rust-rounds.put_refused",
    module: "rust_rounds",
    paired: true,
    method: "PUT",
    path: "/rust-rounds/:id",
    summary:
      "a body that is not a round is a 422 naming each field, and nothing is kept",
    mutates: true,
    request: {
      path: { id: ABSENT_ROUND },
      body: { schema: "some-ui.rust-round/0", id: ABSENT_ROUND },
    },
    expect: { status: 422 },
  }),

  defineContract({
    id: "rust-rounds.put_signed_out",
    module: "rust_rounds",
    method: "PUT",
    path: "/rust-rounds/:id",
    summary:
      "putting a round is a paired phone's: without a session it is a 401, and nothing is kept",
    mutates: true,
    request: { path: { id: OTHER_ROUND }, body: MISPLACED_ROUND },
    expect: { status: 401 },
  }),

  defineContract({
    id: "rust-rounds.put_browser",
    module: "rust_rounds",
    session: true,
    method: "PUT",
    path: "/rust-rounds/:id",
    summary:
      "putting a round is a paired phone's: a browser's cookie session is a 403, and nothing is kept",
    mutates: true,
    request: { path: { id: OTHER_ROUND }, body: MISPLACED_ROUND },
    expect: { status: 403 },
  }),
]
