/**
 * The owner's Korean record (paulgsc/server `routes/korean.rs` and
 * `handlers/korean.rs`): the word sets the phone studies on and what it
 * records as they are read, one kind per store the phone keeps
 * (`korean_repo::Kind`: `set`, `pace`, `tally`, `lens`, `record`,
 * `progress`, `feedback`). Epic #2100.
 *
 * Hand-written: `KoreanEntrySchema` is checked by hand against the server's
 * `korean_repo::Entry` (camelCase: the key, its standing revision, the body
 * the phone sent verbatim, and when that revision was written). The body is
 * never parsed by home, so it stays `unknown` here too.
 *
 * Every route is per person, so every contract is a `session` contract. The
 * record is append-only, so no probe may keep anything: both writes are
 * pinned by a refusal, which writes nothing.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

const KoreanEntrySchema = z.object({
  key: z.string().min(1),
  revision: z.number().int(),
  body: z.unknown(),
  writtenAt: z.string(),
})

export const contracts = [
  defineContract({
    id: "korean.entries",
    module: "korean",
    session: true,
    method: "GET",
    path: "/korean/:kind",
    summary:
      "this subject's standing entries of one kind, in the order each key was first written",
    request: { path: { kind: "set" } },
    expect: {
      status: 200,
      schema: z.object({ entries: z.array(KoreanEntrySchema) }),
    },
  }),

  defineContract({
    id: "korean.entry_refused",
    module: "korean",
    session: true,
    method: "PUT",
    path: "/korean/:kind/:key",
    summary:
      "a body that is not a JSON object or array is a 422 naming the field, and nothing is written",
    mutates: true,
    request: {
      path: { kind: "set", key: "contract-harness-does-not-exist" },
      body: "not an entry",
    },
    expect: { status: 422 },
  }),

  defineContract({
    id: "korean.removal_refused",
    module: "korean",
    session: true,
    method: "DELETE",
    path: "/korean/:kind/:key",
    summary:
      "a kind home does not keep is a 422 naming the field, and no removal is written",
    mutates: true,
    request: {
      path: {
        kind: "contract-harness-no-such-kind",
        key: "contract-harness-does-not-exist",
      },
    },
    expect: { status: 422 },
  }),
]
