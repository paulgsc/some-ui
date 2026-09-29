/**
 * LeetType's rounds: the public read routes (paulgsc/server,
 * `routes::db::leetype`) and the operator routes beside them
 * (`routes::db::leetype_operator`). `apps/www`'s `lib/leetype-content` reads
 * the first two, and the round's recorded runs (X2/X5, paulgsc/server#381);
 * `@some-ui/lesson-crm`'s `RoundCrm`, through
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

/**
 * `RunResult` (X1, `@some-ui/leetype`'s `lib/leetype/run-result`), as the
 * runs route carries it: checked by hand against the server's
 * `leetype_round_repo::RunResult` (`crates/db/leetype_round/src/runs.rs`).
 */
const RunResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    inputSize: z.number().int().nonnegative(),
    observation: z.object({
      output: z.string(),
      logs: z.array(z.string()),
      elapsed: z.object({ milliseconds: z.number().nonnegative() }),
    }),
  }),
  z.object({
    kind: z.literal("error"),
    inputSize: z.number().int().nonnegative(),
    error: z.object({
      errorClass: z.enum(["compile", "runtime", "budget-exceeded"]),
      message: z.string(),
    }),
  }),
])

/**
 * `GET /leetype/rounds/:id/runs` (`leetype_round_repo::RoundRuns`): the
 * transcript recorded for the round's current bytes. Its keys are the whole
 * contract (`unknownFields: "reject"` below): X5's never #3 is that the
 * route never returns a complexity claim, so a field this schema does not
 * know, a `class` say, is a finding rather than growth.
 */
const RoundRunsSchema = z.object({
  roundId: z.string().min(1),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  runs: z.array(
    z.object({
      variant: z.string().regex(/^(A|d[0-9])$/),
      bounds: z.enum(["before", "after"]),
      sizes: z.record(z.string(), z.number().int().nonnegative()),
      result: RunResultSchema,
    })
  ),
})

const OperatorRoundSchema = RoundEntrySchema.extend({
  retiredAt: z.string().nullable(),
})

/** An id no environment holds, so every miss below is a real miss. */
const ABSENT_ID = "contract-harness-does-not-exist"

/**
 * A reviewed round's id (`corpus/rounds/` in `@some-ui/leetype`), for the
 * runs contract's shape. An environment that has not imported the corpus
 * answers `404`, which that contract accepts without a schema: the shape is
 * checked wherever the round exists.
 */
const CORPUS_ROUND_ID = "has-duplicate-sort-adjacent"

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
    id: "leetype.runs_not_found",
    module: "leetype",
    method: "GET",
    path: "/leetype/rounds/:id/runs",
    summary:
      "an id no round has is a JSON 404, the case a client meets first (#1226)",
    request: { path: { id: ABSENT_ID } },
    expect: { status: 404 },
  }),

  defineContract({
    id: "leetype.runs",
    module: "leetype",
    method: "GET",
    path: "/leetype/rounds/:id/runs",
    summary:
      "a round's recorded runs for its current bytes: variant, bounds, sizes and a RunResult each, and no complexity claim",
    request: { path: { id: CORPUS_ROUND_ID } },
    expect: {
      status: [200, 404],
      schema: RoundRunsSchema,
      schemaFor: 200,
      unknownFields: "reject",
    },
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
