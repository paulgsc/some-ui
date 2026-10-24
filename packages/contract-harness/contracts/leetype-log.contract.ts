/**
 * The owner's LeetType session log on home (paulgsc/server
 * `routes/leetype_log.rs` and `handlers/leetype_log.rs`): the finished
 * sessions "Send to home" copies there, one event per PUT in its home form,
 * then reads back (`apps/www/src/lib/home-link/leetype-log.ts` calls these
 * through the app's home link).
 *
 * Hand-written: `SessionEventsSchema` is the outline of what the phone's
 * read-back takes, checked by hand against the server's
 * `leetype_log_repo::SessionEvents` (the session, and every event it holds
 * of it, each with its id).
 *
 * Every route is per person, so every contract is a `session` contract. The
 * log is append-only, so no probe may keep anything: the write is pinned by
 * a refusal, which writes nothing.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

const SessionEventsSchema = z.object({
  session: z.string(),
  events: z.array(
    z.object({ id: z.string().min(1), at: z.string(), type: z.string() })
  ),
})

const ABSENT_SESSION = "contract-harness-does-not-exist"

export const contracts = [
  defineContract({
    id: "leetype-log.session_events",
    module: "leetype",
    session: true,
    method: "GET",
    path: "/leetype/sessions/:session/events",
    summary:
      "the events home holds of one of this subject's sessions; none for a session it has never seen",
    request: { path: { session: ABSENT_SESSION } },
    expect: { status: 200, schema: SessionEventsSchema },
  }),

  defineContract({
    id: "leetype-log.event_refused",
    module: "leetype",
    session: true,
    method: "PUT",
    path: "/leetype/sessions/:session/events/:id",
    summary:
      "a body that is not a session-log event is a 422 naming the field, and nothing is written",
    mutates: true,
    request: {
      path: { session: ABSENT_SESSION, id: ABSENT_SESSION },
      body: "not an event",
    },
    expect: { status: 422 },
  }),
]
