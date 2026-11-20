/**
 * The owner's work spans on Rust Rounds (RR26, paulgsc/some-ui#3250;
 * paulgsc/server#1008): the tracker on the phone starts a span, and closes it
 * with how much of it was work. The phone sends each from its own record
 * (`packages/ui/rust-rounds/src/lib/work-tracker/home`).
 *
 * Hand-written against paulgsc/server's `handlers/rust_work_spans.rs` and
 * `rust_round_repo::work_span` at #1008: a start or a close answers
 * `{ change, span }`, `201` added or `200` unchanged (the same event again,
 * its `at` compared as text); a week's read answers its spans in the order
 * they started and the span open now, whatever its week.
 *
 * **Who may call.** A paired phone only (`subject::Paired`): no session is a
 * `401`, a browser's cookie session a `403`.
 *
 * **Nothing here keeps anything.** Spans are append-only and go only with the
 * account, so no probe may store one: a start under an id that is not a
 * lower-case UUID is a `422` before any write, and a close of a span home
 * holds no start of is a `404`. The `409`s (a start while another is open,
 * carrying it; a start before the latest close; another event under the same
 * span) and the close's checks against its span are held by the server's
 * own handler tests.
 */

import { z } from "zod"

import { defineContract, pairedPhoneOnly } from "../src/contract"

/** A week no phone tracks time in, in the id's own form. */
const ABSENT_WEEK = "1999-w01"

/** A span id no phone makes: a UUID, so only its absence is refused. */
const ABSENT_SPAN = "00000000-0000-4000-8000-000000000000"

const When = z.iso.datetime({ offset: true })

/** A start under an id that is not a UUID. */
const UNFIT_START = {
  id: "contract-harness-not-a-uuid",
  at: "1999-01-05T12:00:00.000Z",
  week: ABSENT_WEEK,
  ticket: "QM-1",
  step: "read",
  exercise: null,
  points: [1],
  device: "contract-harness",
}

/** The close of a span home holds no start of. */
const ABSENT_CLOSE = {
  id: ABSENT_SPAN,
  at: "1999-01-05T12:30:00.000Z",
  stoppedBy: "you",
  answer: "none",
  countedSeconds: 0,
}

const SpanSchema = z.object({
  id: z.string().regex(/^[0-9a-f-]{36}$/),
  week: z.string().regex(/^\d{4}-w\d{2}$/),
  ticket: z.string(),
  step: z.enum(["read", "academy", "voice"]),
  exercise: z.number().int().positive().nullable(),
  points: z.array(z.number().int().positive()).min(1),
  device: z.string(),
  startedAt: When,
  keptAt: When,
  closed: z
    .object({
      at: When,
      stoppedBy: z.enum(["you", "itself"]),
      answer: z.enum(["all", "part", "none"]),
      countedSeconds: z.number().int().nonnegative(),
      keptAt: When,
    })
    .nullable(),
})

const WeekSpansSchema = z.object({
  week: z.string(),
  spans: z.array(SpanSchema),
  open: SpanSchema.nullable(),
})

export const contracts = [
  defineContract({
    id: "rust-work-spans.week",
    module: "rust_rounds",
    paired: true,
    method: "GET",
    path: "/rust-work-spans",
    summary:
      "a week's work spans, each its start and its close or null, in the order they started, and the span open now whatever its week",
    request: { query: { week: ABSENT_WEEK } },
    expect: { status: 200, schema: WeekSpansSchema },
  }),
  defineContract({
    id: "rust-work-spans.week_missing",
    module: "rust_rounds",
    paired: true,
    method: "GET",
    path: "/rust-work-spans",
    summary: "a read with no ISO week is a 422",
    expect: { status: 422 },
  }),
  ...pairedPhoneOnly(
    "rust_rounds",
    "rust-work-spans.week",
    "GET",
    "/rust-work-spans",
    "a week's work spans",
    { query: { week: ABSENT_WEEK } }
  ),

  defineContract({
    id: "rust-work-spans.start_unfit",
    module: "rust_rounds",
    paired: true,
    method: "POST",
    path: "/rust-work-spans/start",
    summary:
      "a start whose id is not a lower-case UUID is a 422, and nothing is kept",
    mutates: true,
    request: { body: UNFIT_START },
    expect: { status: 422 },
  }),
  ...pairedPhoneOnly(
    "rust_rounds",
    "rust-work-spans.start",
    "POST",
    "/rust-work-spans/start",
    "starting a work span",
    { body: UNFIT_START }
  ),

  defineContract({
    id: "rust-work-spans.close_absent",
    module: "rust_rounds",
    paired: true,
    method: "POST",
    path: "/rust-work-spans/close",
    summary:
      "the close of a span home holds no start of is a 404, and nothing is kept",
    mutates: true,
    request: { body: ABSENT_CLOSE },
    expect: { status: 404 },
  }),
  ...pairedPhoneOnly(
    "rust_rounds",
    "rust-work-spans.close",
    "POST",
    "/rust-work-spans/close",
    "closing a work span",
    { body: ABSENT_CLOSE }
  ),
]
