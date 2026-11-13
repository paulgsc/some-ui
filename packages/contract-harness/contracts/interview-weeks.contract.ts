/**
 * The interview week on home (IW4, paulgsc/some-ui#2935): the weeks the
 * Monday routine writes (`some-ui.interview-week/1`, kept from the mailbox's
 * `brief/interview-week-<id>.json`, so there is no `PUT` of a week), the
 * phone's send of a week's takes, and the week's record.
 *
 * Hand-written against paulgsc/server's `handlers/interview_weeks.rs` and
 * `rust_round_repo::interview` (`Sent`, strict), as on its `main` at
 * 3e8910c: `WeekList` of `WeekEntry`, at most `LIST_LIMIT`, and
 * `HeldInterviewWeek` and `InterviewRecord`. `week` is the routine's file byte for byte, so
 * here it is only an object; the interview week's own format reads it (IW4).
 *
 * A send is a draft until the week's due, and what stands then is final, as
 * Rust Rounds' are (RR22): `{ change, sent }`, a `201` added, a `200`
 * replaced, unchanged or superseded, a `409` for another body at the draft's
 * `at`, and a `422` once the week is final. Those are held by the server's
 * own handler tests.
 *
 * **Who may call.** A paired phone only: no session is a `401`, a browser's
 * cookie session a `403`.
 *
 * **Nothing here keeps anything.** A send goes to a week no routine writes,
 * a `404` before anything is kept.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

const MODULE = "interview_weeks"

/** A week no routine writes, in the id's own form. */
const ABSENT_WEEK = "1999-w01"

/** The first week the routine writes (Monday 16 November 2026); a home that holds it shows its shape. */
const FIRST_WEEK = "2026-w47"

const When = z.iso.datetime({ offset: true })
const NoteId = z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/)
const Slug = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const HashSchema = z.string().regex(/^[0-9a-f]{64}$/)

const WeekEntrySchema = z.object({
  id: z.string().regex(/^\d{4}-w\d{2}$/),
  sha256: HashSchema,
  receivedAt: When,
})

/** `rust_round_repo::LIST_LIMIT`. */
const WEEKS_LISTED = 500

const WeekListSchema = z.object({
  weeks: z.array(WeekEntrySchema).max(WEEKS_LISTED),
})

const WeekSchema = WeekEntrySchema.extend({
  week: z.record(z.string(), z.unknown()),
})

const RecordSchema = z.object({
  week: z.string(),
  opens: When,
  due: When,
  closed: z.boolean(),
  sent: z.object({ at: When, receivedAt: When, draft: z.boolean() }).nullable(),
  questions: z.array(
    z.object({
      question: Slug,
      answered: z.boolean(),
      take: NoteId.nullable(),
      recordedAt: When.nullable(),
    })
  ),
  cards: z.array(
    z.object({
      card: Slug,
      read: z.boolean(),
      take: NoteId.nullable(),
      recordedAt: When.nullable(),
    })
  ),
  unanswered: z.array(Slug),
  unread: z.array(Slug),
})

/** A week's send as the phone makes it. */
const SENT = {
  week: ABSENT_WEEK,
  at: "1999-01-05T12:00:00.000Z",
  answers: [
    {
      question: "conflict",
      take: "take-1",
      recordedAt: "1999-01-05T11:59:00.000Z",
    },
  ],
  reads: [],
  passed: [],
  passedReads: [],
}

/** The two answers every route gives a caller that isn't a paired phone. */
function strangers(
  id: string,
  method: "GET" | "PUT",
  path: string,
  what: string,
  request: { path?: Record<string, string>; body?: unknown }
): Array<ReturnType<typeof defineContract>> {
  const mutates = method === "PUT"
  return [
    defineContract({
      id: `${id}_signed_out`,
      module: MODULE,
      method,
      path,
      summary: `${what} is a paired phone's: without a session it is a 401`,
      ...(mutates ? { mutates } : {}),
      request,
      expect: { status: 401 },
    }),
    defineContract({
      id: `${id}_browser`,
      module: MODULE,
      session: true,
      method,
      path,
      summary: `${what} is a paired phone's: a browser's cookie session is a 403`,
      ...(mutates ? { mutates } : {}),
      request,
      expect: { status: 403 },
    }),
  ]
}

export const contracts = [
  defineContract({
    id: "interview-weeks.list",
    module: MODULE,
    paired: true,
    method: "GET",
    path: "/interview-weeks",
    summary: `this subject's interview weeks home holds, newest first, at most ${WEEKS_LISTED}: each by the ISO week it opens, the hash of what home keeps and when it arrived`,
    expect: { status: 200, schema: WeekListSchema },
  }),
  ...strangers(
    "interview-weeks.list",
    "GET",
    "/interview-weeks",
    "the interview weeks",
    {}
  ),

  defineContract({
    id: "interview-weeks.week",
    module: MODULE,
    paired: true,
    method: "GET",
    path: "/interview-weeks/:id",
    summary:
      "one interview week as the routine put it, byte for byte, with the hash home keeps and when it arrived; a 404 where home holds no such week",
    request: { path: { id: FIRST_WEEK } },
    expect: { status: [200, 404], schemaFor: 200, schema: WeekSchema },
  }),
  defineContract({
    id: "interview-weeks.week_absent",
    module: MODULE,
    paired: true,
    method: "GET",
    path: "/interview-weeks/:id",
    summary: "an interview week home holds none of is a 404",
    request: { path: { id: ABSENT_WEEK } },
    expect: { status: 404 },
  }),
  ...strangers(
    "interview-weeks.week",
    "GET",
    "/interview-weeks/:id",
    "an interview week",
    { path: { id: ABSENT_WEEK } }
  ),

  defineContract({
    id: "interview-weeks.sent_absent",
    module: MODULE,
    paired: true,
    method: "PUT",
    path: "/interview-weeks/:id/sent",
    summary:
      "a send for an interview week home holds none of is a 404, and nothing is kept",
    mutates: true,
    request: { path: { id: ABSENT_WEEK }, body: SENT },
    expect: { status: 404 },
  }),
  ...strangers(
    "interview-weeks.sent",
    "PUT",
    "/interview-weeks/:id/sent",
    "sending an interview week's takes",
    { path: { id: ABSENT_WEEK }, body: SENT }
  ),

  defineContract({
    id: "interview-weeks.record",
    module: MODULE,
    paired: true,
    method: "GET",
    path: "/interview-weeks/:id/record",
    summary:
      "an interview week's record: what was sent, as the draft standing before the deadline or the final after it; each question answered or not and each card read or not, with its take and when it was said; a 404 where home holds no such week",
    request: { path: { id: FIRST_WEEK } },
    expect: { status: [200, 404], schemaFor: 200, schema: RecordSchema },
  }),
  defineContract({
    id: "interview-weeks.record_absent",
    module: MODULE,
    paired: true,
    method: "GET",
    path: "/interview-weeks/:id/record",
    summary: "the record of an interview week home holds none of is a 404",
    request: { path: { id: ABSENT_WEEK } },
    expect: { status: 404 },
  }),
  ...strangers(
    "interview-weeks.record",
    "GET",
    "/interview-weeks/:id/record",
    "an interview week's record",
    { path: { id: ABSENT_WEEK } }
  ),
]
