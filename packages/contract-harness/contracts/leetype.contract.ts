/**
 * LeetType's rounds: the public read routes (paulgsc/server,
 * `routes::db::leetype`) and the operator routes beside them
 * (`routes::db::leetype_operator`). `apps/www`'s `lib/leetype-content` reads
 * the first two; `@some-ui/lesson-crm`'s `RoundCrm`, through
 * `apps/www/src/lib/round-crm-client`, calls the rest.
 *
 * Hand-written, like every contract here: `RoundManifestSchema` is what
 * `lib/leetype-content` parses, widened to the fields the CRM's
 * `OperatorRound` reads, and checked by hand against the server's
 * `RoundManifest`/`OperatorRound` in `handlers/db/leetype*.rs`. A round's
 * body is not pinned here: the server stores it verbatim and never parses
 * more than its id, language and μ, and `@some-ui/leetype`'s own
 * `RoundSchema` is what holds it on the way in.
 *
 * The operator contracts are `session` contracts whose cookie must be an
 * operator's (`OPERATOR_SUBJECTS`). None of them writes a round: a published
 * round is served to every learner, so there is no harmless probe write. The
 * PUT is pinned by its refusal, as the lesson CRM's is.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

const WitnessSchema = z.object({
  propositionId: z.string().regex(/^CW-P[1-9][0-9]{0,2}$/),
  admissible: z.boolean(),
})

const RoundEntrySchema = z.object({
  id: z.string().min(1),
  version: z.number(),
  publishedAt: z.string(),
  contentHash: z.string(),
  witnesses: z.array(WitnessSchema),
})

const OperatorRoundSchema = RoundEntrySchema.extend({
  retiredAt: z.string().nullable(),
})

/** An id no environment holds, so every miss below is a real miss. */
const ABSENT_ID = "contract-harness-does-not-exist"

export const contracts = [
  defineContract({
    id: "leetype.manifest",
    module: "leetype",
    method: "GET",
    path: "/leetype/rounds",
    summary:
      "the listed rounds, each with its μ, and a version that is the ETag",
    expect: {
      status: 200,
      schema: z.object({
        version: z.string(),
        rounds: z.array(RoundEntrySchema),
      }),
    },
  }),

  defineContract({
    id: "leetype.round_not_found",
    module: "leetype",
    method: "GET",
    path: "/leetype/rounds/:id",
    summary:
      "an id no round has is a JSON 404, never an app shell at 200 (#327)",
    request: { path: { id: ABSENT_ID } },
    expect: { status: 404 },
  }),

  defineContract({
    id: "leetype_operator.list",
    module: "leetype_operator",
    session: true,
    method: "GET",
    path: "/leetype/operator/rounds",
    summary: "every round, retired included, with the server's bookkeeping",
    expect: {
      status: 200,
      schema: z.object({ rounds: z.array(OperatorRoundSchema) }),
    },
  }),

  defineContract({
    id: "leetype_operator.write_refused",
    module: "leetype_operator",
    session: true,
    method: "PUT",
    path: "/leetype/operator/rounds/:id",
    summary:
      "a body that is not a round is a 422, and nothing is written - the server reads only a round's id, language and μ",
    mutates: true,
    request: { path: { id: ABSENT_ID }, body: { body: "not json" } },
    expect: { status: 422 },
  }),

  defineContract({
    id: "leetype_operator.retire_not_found",
    module: "leetype_operator",
    session: true,
    method: "POST",
    path: "/leetype/operator/rounds/:id/retire",
    summary: "retiring an id the table does not hold is a 404, not a no-op",
    request: { path: { id: ABSENT_ID } },
    expect: { status: 404 },
  }),

  defineContract({
    id: "leetype_operator.restore_not_found",
    module: "leetype_operator",
    session: true,
    method: "POST",
    path: "/leetype/operator/rounds/:id/restore",
    summary: "restoring an id the table does not hold is a 404, not a no-op",
    request: { path: { id: ABSENT_ID } },
    expect: { status: 404 },
  }),
]
