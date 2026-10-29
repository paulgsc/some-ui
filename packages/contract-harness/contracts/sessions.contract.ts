/**
 * `/sessions`, every route of it (paulgsc/server `routes::db::session` and
 * `handlers/db/session.rs`): what `apps/www/src/lib/tenant/http-sessions-repository`
 * calls, and what the phone's own copy (`apps/www/src/lib/device-backend`)
 * answers in its place.
 *
 * Hand-written, like every contract here: `SessionRecordSchema` is the
 * client's `SessionRecord` (`apps/www/src/lib/tenant/types.ts`), checked by
 * hand against the server's, which serialises `camelCase`.
 *
 * Per person, so every contract is a `session` contract. The writes name ids
 * no one holds, so a miss is the answer under test, with two exceptions: a
 * create makes a draft, and a create under a named id makes that one draft
 * however often it is sent.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

/**
 * `SessionRecord`. The optional fields really are absent rather than null:
 * the server marks them `skip_serializing_if = "Option::is_none"`. Against a
 * store with no started session the harness reports them as phantom fields,
 * a fact about the sample rather than the contract.
 */
const SessionRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["draft", "scheduled", "active", "paused", "completed"]),
  origin: z.enum(["user", "system"]),
  activities: z.array(z.unknown()),
  scenes: z.array(z.unknown()),
  layoutMode: z.enum(["basic", "advanced"]),
  layout: z.unknown().optional(),
  totalDurationMs: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  finalElapsedMs: z.number().optional(),
})

/**
 * What `POST /sessions` answers: a draft nobody has started, so none of the
 * fields a start, a finish or the live editor would set. One that arrived
 * with them would show as an unknown field.
 */
const CreatedSessionSchema = SessionRecordSchema.omit({
  layout: true,
  startedAt: true,
  completedAt: true,
  finalElapsedMs: true,
}).extend({ status: z.literal("draft"), origin: z.literal("user") })

/**
 * An id the server takes for a session's (`is_session_id`: `session-`, then
 * 16 to 56 letters, digits, `-` and `_`), which no one else names.
 */
const NAMED_ID = "session-contract-harness-named-probe"

/** An id no one holds, so every miss below is a real miss. */
const ABSENT_ID = "session-contract-harness-does-not-exist"

const DRAFT = {
  name: "contract-harness probe",
  activities: [],
  scenes: [],
  layoutMode: "basic",
}

export const contracts = [
  defineContract({
    id: "sessions.list",
    module: "sessions",
    session: true,
    method: "GET",
    path: "/sessions",
    summary: "every session, in the camelCase the client's SessionRecord uses",
    expect: { status: 200, schema: z.array(SessionRecordSchema) },
  }),

  defineContract({
    id: "sessions.get_by_id",
    module: "sessions",
    session: true,
    method: "GET",
    path: "/sessions/:id",
    summary:
      "one session, or a 404 the client maps to null rather than to an outage",
    request: { path: { id: "session-does-not-exist" } },
    // The 404 is as much the contract as the 200. `HttpSessionsRepository.get`
    // returns null on it and `update`/`duplicate` raise SessionNotFoundError;
    // a 500 in its place would have the app reporting an outage for a session
    // somebody deleted in another tab.
    expect: { status: [200, 404], schemaFor: 200, schema: SessionRecordSchema },
  }),

  defineContract({
    id: "sessions.create",
    module: "sessions",
    session: true,
    method: "POST",
    path: "/sessions",
    summary:
      "the four fields the composer collects; the id and the duration come back from the server",
    mutates: true,
    // No `id` and no `totalDurationMs` in the request, deliberately. Both
    // moved server-side because two implementations of them drift, and the
    // duration is the one that bites: a client that sends a stale zero
    // produces a reminder offering a "~1 min" session. The response schema
    // requires both, so a server that stopped computing them fails here.
    request: { body: DRAFT },
    expect: { status: 200, schema: CreatedSessionSchema },
  }),

  defineContract({
    id: "sessions.create_named",
    module: "sessions",
    session: true,
    method: "POST",
    path: "/sessions",
    summary:
      "a create that names its id makes the session under that id, and the same create sent again answers with it",
    mutates: true,
    // `sessions-copy` names the id of each session it copies, so a copy whose
    // answer was lost can be sent again without making a second session. A
    // store that minted its own id here would make one per attempt.
    request: { body: { id: NAMED_ID, ...DRAFT } },
    expect: {
      status: 200,
      schema: CreatedSessionSchema.extend({ id: z.literal(NAMED_ID) }),
    },
  }),

  defineContract({
    id: "sessions.create_named_refused",
    module: "sessions",
    session: true,
    method: "POST",
    path: "/sessions",
    summary: "a named id that is not a session's is a 422, and nothing is made",
    mutates: true,
    request: { body: { id: "contract-harness", ...DRAFT } },
    expect: { status: 422 },
  }),

  defineContract({
    id: "sessions.update_not_found",
    module: "sessions",
    session: true,
    method: "PATCH",
    path: "/sessions/:id",
    summary:
      "a patch to an id this subject does not hold is a 404, which the client raises as SessionNotFoundError",
    mutates: true,
    request: { path: { id: ABSENT_ID }, body: { name: "contract-harness" } },
    expect: { status: 404 },
  }),

  defineContract({
    id: "sessions.remove_absent",
    module: "sessions",
    session: true,
    method: "DELETE",
    path: "/sessions/:id",
    summary:
      "removing an id this subject does not hold is a 200 saying nothing went, never a 404",
    mutates: true,
    request: { path: { id: ABSENT_ID } },
    expect: { status: 200, schema: z.object({ removed: z.literal(false) }) },
  }),

  defineContract({
    id: "sessions.remove_many_absent",
    module: "sessions",
    session: true,
    method: "DELETE",
    path: "/sessions",
    summary: "removing several counts only those this subject held",
    mutates: true,
    request: { body: { ids: [ABSENT_ID] } },
    expect: {
      status: 200,
      schema: z.object({ deletedCount: z.literal(0) }),
    },
  }),

  defineContract({
    id: "sessions.set_status_absent",
    module: "sessions",
    session: true,
    method: "PATCH",
    path: "/sessions/status",
    summary:
      "one status across several answers with the sessions this subject held, so an id it did not hold is left out",
    mutates: true,
    request: { body: { ids: [ABSENT_ID], status: "paused" } },
    expect: { status: 200, schema: z.array(SessionRecordSchema).max(0) },
  }),

  defineContract({
    id: "sessions.set_status_refused",
    module: "sessions",
    session: true,
    method: "PATCH",
    path: "/sessions/status",
    summary: "a status outside the five is a 422, and nothing changes",
    mutates: true,
    request: { body: { ids: [ABSENT_ID], status: "finished" } },
    expect: { status: 422 },
  }),

  defineContract({
    id: "sessions.duplicate_not_found",
    module: "sessions",
    session: true,
    method: "POST",
    path: "/sessions/:id/duplicate",
    summary:
      "duplicating an id this subject does not hold is a 404, and no copy is made",
    mutates: true,
    request: { path: { id: ABSENT_ID } },
    expect: { status: 404 },
  }),
]
