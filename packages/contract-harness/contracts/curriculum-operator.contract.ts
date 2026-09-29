/**
 * The operator's lesson routes: `GET /curriculum/operator/lessons`, and the
 * write, retire and restore routes beside it (paulgsc/server,
 * `routes::db::curriculum_operator`). `@some-ui/lesson-crm` is the one caller.
 *
 * Hand-written, like every contract here: the schema is transcribed from
 * `OperatorLesson` in `packages/ui/lesson-crm/src/lib/client.ts` (this repo)
 * and cross-checked by hand against `OperatorLesson` in
 * `apps/servers/file_host/src/handlers/db/curriculum_operator.rs` - a
 * `ManifestEntry` flattened into the server's bookkeeping, camelCase, with
 * `retiredAt` always present and `null` while the lesson is listed.
 *
 * Every route here is operator-only (paulgsc/server `auth::operator`): `401`
 * without a passkey session, `403` for a subject not in the server's
 * `OPERATOR_SUBJECTS`. So each contract is marked `session`, and the cookie
 * passed with `--session-cookie` must be an operator's.
 *
 * No contract writes a lesson. A lesson written to a real server is served to
 * everyone and announced as new material by the study nudge, so there is no
 * such thing as a harmless probe write. The write route is pinned by its
 * refusal instead, and marked `mutates` anyway: a PUT is only safe while the
 * server refuses it, and that is the thing under test.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

/** `TopikMetadataSchema` (`@some-ui/topik`), field for field. */
const ManifestEntrySchema = z.object({
  key: z.string(),
  displayName: z.string(),
  description: z.string(),
  batchCount: z.number(),
  totalQuestions: z.number(),
  totalMessages: z.number(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  tags: z.array(z.string()).optional(),
})

const OperatorLessonSchema = ManifestEntrySchema.extend({
  activityId: z.string(),
  publishedAt: z.string(),
  version: z.number(),
  contentHash: z.string(),
  retiredAt: z.string().nullable(),
})

/** A key no environment holds, so every miss below is a real miss. */
const ABSENT_KEY = "contract-harness-does-not-exist"

export const contracts = [
  defineContract({
    id: "curriculum_operator.list",
    module: "curriculum_operator",
    session: true,
    method: "GET",
    path: "/curriculum/operator/lessons",
    summary: "every lesson, retired included, with the server's bookkeeping",
    expect: {
      status: 200,
      schema: z.object({ lessons: z.array(OperatorLessonSchema) }),
    },
  }),

  defineContract({
    id: "curriculum_operator.write_refused",
    module: "curriculum_operator",
    session: true,
    method: "PUT",
    path: "/curriculum/operator/lessons/:key",
    summary:
      "a body that is not JSON is a 422, and nothing is written - the server stores the body verbatim, so this is its one check on it",
    mutates: true,
    request: {
      path: { key: ABSENT_KEY },
      body: {
        activityId: "topik",
        metadata: {
          key: ABSENT_KEY,
          displayName: "x",
          description: "x",
          batchCount: 0,
          totalQuestions: 0,
          totalMessages: 0,
        },
        body: "not json",
      },
    },
    expect: { status: 422 },
  }),

  defineContract({
    id: "curriculum_operator.retire_not_found",
    module: "curriculum_operator",
    session: true,
    method: "POST",
    path: "/curriculum/operator/lessons/:key/retire",
    summary: "retiring a key the table does not hold is a 404, not a no-op",
    request: { path: { key: ABSENT_KEY } },
    expect: { status: 404 },
  }),

  defineContract({
    id: "curriculum_operator.restore_not_found",
    module: "curriculum_operator",
    session: true,
    method: "POST",
    path: "/curriculum/operator/lessons/:key/restore",
    summary: "restoring a key the table does not hold is a 404, not a no-op",
    request: { path: { key: ABSENT_KEY } },
    expect: { status: 404 },
  }),
]
