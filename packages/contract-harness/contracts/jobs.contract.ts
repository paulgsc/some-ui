/**
 * The owner's Jobs record (paulgsc/server `routes/jobs.rs` and
 * `handlers/jobs.rs`): the phone's log of what it did with each day's job
 * picks, kept on home once its person opts in (`apps/www/src/lib/jobs/home.ts`
 * calls these through the app's home link).
 *
 * Hand-written: `JobsRecordSchema` is the outline of what the phone's
 * `HeldSchema` takes, checked by hand against the server's `jobs_repo::Record`
 * (every event, oldest first, each with its id and when it was recorded).
 * That reader holds each event to its full shape on the way in.
 * `DigestsSchema` is the outline of the phone's `DigestsAnswer`, checked by
 * hand against the server's `handlers::jobs::Digests` (each held digest's
 * day and the file verbatim); the phone holds each digest to job-desk's
 * schema on the way in.
 *
 * Every route is per person, so every contract is a `session` contract. The
 * record is append-only, so no probe may keep anything: the write is pinned
 * by a refusal, which writes nothing.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

const JobsRecordSchema = z.object({
  events: z.array(
    z.object({ id: z.string().min(1), at: z.string(), type: z.string() })
  ),
})

const DigestsSchema = z.object({
  digests: z.array(z.object({ day: z.iso.date(), digest: z.unknown() })),
})

export const contracts = [
  defineContract({
    id: "jobs.record",
    module: "jobs",
    session: true,
    method: "GET",
    path: "/jobs",
    summary:
      "this subject's Jobs record as it stands: every event, oldest first",
    request: {},
    expect: { status: 200, schema: JobsRecordSchema },
  }),

  defineContract({
    id: "jobs.digests",
    module: "jobs",
    session: true,
    method: "GET",
    path: "/jobs/digests",
    summary:
      "the daily job digests home holds for this subject, oldest first, at most 7",
    request: {},
    expect: { status: 200, schema: DigestsSchema },
  }),

  defineContract({
    id: "jobs.event_refused",
    module: "jobs",
    session: true,
    method: "PUT",
    path: "/jobs/events/:id",
    summary:
      "a body that is not a Jobs event is a 422 naming the field, and nothing is written",
    mutates: true,
    request: {
      path: { id: "contract-harness-does-not-exist" },
      body: "not an event",
    },
    expect: { status: 422 },
  }),
]
