/**
 * What Rust Rounds keeps on home for good (RR14, paulgsc/some-ui#2689):
 * each week's answers as they stand at its deadline (RR22, #2832: each send
 * before it is a draft, the latest in place of the one before, and what
 * stands at the deadline is final), each error pasted in a week, and the
 * card-era log's sittings (`some-ui.rust-round-log/1`). The phone sends them through
 * its Rust Rounds lane (`packages/ui/rust-rounds/src/lib/kept-home`); home
 * makes each week's record from what was sent, a week that closed unsent
 * included, and counts each ticket's opens from the app events.
 *
 * Hand-written against paulgsc/server's RR14 handlers, as RR14-home settled
 * them and paulgsc/server#770 (RR22) changed them: `RecordSchema` is the
 * week's record, its `sent` the draft standing before the deadline
 * (`draft: true`) or the final after it, and `LogListSchema` the list
 * of sittings by id, revision and the SHA-256 of the latest revision as sent.
 *
 * **Who may call.** A paired phone only (`subject::Paired`): no session is
 * a `401`, a browser's cookie session a `403`.
 *
 * **Nothing here keeps anything.** All three are append-only and go only
 * with the account, so no probe may store one: a week's answers or paste
 * go to a week no routine writes (`404`, checked before the body), and a
 * sitting whose id is not the path's is refused with a `422` before any
 * write. A week's send answers `{ change, sent }`: a `201` added for its
 * first draft, a `200` replaced, unchanged (the same `at` and body) or
 * superseded (an older `at`, answered with the draft that stands), a `409`
 * for another body at the draft's `at`, and a `422` for an `at` past the
 * deadline or a week already final. Those, a paste's `201`, `200` and
 * `409`, and a sitting kept again as it grew are held by the server's own
 * handler tests.
 */

import { z } from "zod"

import { defineContract, pairedPhoneOnly } from "../src/contract"

/** A week no routine writes, in the id's own form. */
const ABSENT_WEEK = "1999-w01"

/** The sample week's id (`packages/ui/rust-rounds/src/lib/sample-week`). */
const SAMPLE_WEEK = "2026-w46"

/** A sitting id no phone makes. */
const ABSENT_SITTING = "contract-harness-absent"

const When = z.iso.datetime({ offset: true })
const NoteId = z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/)
const Ticket = z.string().regex(/^[A-Z][A-Z0-9]{0,5}-\d{1,6}$/)

/** A week's answers as the phone keeps them (`WeekSent`), which it sends exactly. */
const SENT = {
  week: ABSENT_WEEK,
  at: "1999-01-05T12:00:00.000Z",
  answers: [
    { ticket: "QM-1", take: "take-1", recordedAt: "1999-01-05T11:59:00.000Z" },
  ],
  passed: [],
}

const PASTE_AT = "1999-01-05T12:00:00.000Z"

const PASTE = { at: PASTE_AT, text: "error[E0499]", note: null }

/** A sitting of the card-era log, under an id that is not the path's. */
const MISPLACED_SITTING = {
  schema: "some-ui.rust-round-log/1",
  id: "contract-harness-other",
  startedAt: "1999-01-05T12:00:00.000Z",
  cards: [],
  pinned: [],
  fromMyDesk: [],
  tutorGuessedWrong: [],
}

/** The week's record on home. */
const RecordSchema = z.object({
  week: z.string(),
  opens: When,
  due: When,
  closed: z.boolean(),
  sent: z.object({ at: When, receivedAt: When, draft: z.boolean() }).nullable(),
  tickets: z.array(
    z.object({
      ticket: Ticket,
      answered: z.boolean(),
      take: NoteId.nullable(),
      recordedAt: When.nullable(),
      opens: z.number().int().nonnegative(),
    })
  ),
  unanswered: z.array(Ticket),
  pastes: z.array(
    z.object({
      at: When,
      text: z.string().min(1).max(20_000),
      note: NoteId.nullable(),
      receivedAt: When,
    })
  ),
})

const LogListSchema = z.object({
  sessions: z.array(
    z.object({
      id: NoteId,
      startedAt: When,
      revision: z.number().int().positive(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      writtenAt: When,
    })
  ),
})

export const contracts = [
  defineContract({
    id: "rust-weeks.sent_absent",
    module: "rust_rounds",
    paired: true,
    method: "PUT",
    path: "/rust-weeks/:id/sent",
    summary:
      "a week's answers for a week home holds none of are a 404, and nothing is kept",
    mutates: true,
    request: { path: { id: ABSENT_WEEK }, body: SENT },
    expect: { status: 404 },
  }),
  ...pairedPhoneOnly(
    "rust_rounds",
    "rust-weeks.sent",
    "PUT",
    "/rust-weeks/:id/sent",
    "sending a week's answers",
    {
      path: { id: ABSENT_WEEK },
      body: SENT,
    }
  ),

  defineContract({
    id: "rust-weeks.paste_absent",
    module: "rust_rounds",
    paired: true,
    method: "PUT",
    path: "/rust-weeks/:id/pastes/:at",
    summary:
      "an error pasted in a week home holds none of is a 404, and nothing is kept",
    mutates: true,
    request: { path: { id: ABSENT_WEEK, at: PASTE_AT }, body: PASTE },
    expect: { status: 404 },
  }),
  ...pairedPhoneOnly(
    "rust_rounds",
    "rust-weeks.paste",
    "PUT",
    "/rust-weeks/:id/pastes/:at",
    "sending a paste",
    { path: { id: ABSENT_WEEK, at: PASTE_AT }, body: PASTE }
  ),

  defineContract({
    id: "rust-weeks.record",
    module: "rust_rounds",
    paired: true,
    method: "GET",
    path: "/rust-weeks/:id/record",
    summary:
      "a week's record: what was sent, as the draft standing before the deadline or the final after it; each ticket answered or not, with its take, when it was said and how often it was opened, the tickets unanswered and the errors pasted; a week that closed unsent has every ticket unanswered; a 404 where home holds no such week",
    request: { path: { id: SAMPLE_WEEK } },
    expect: { status: [200, 404], schemaFor: 200, schema: RecordSchema },
  }),
  defineContract({
    id: "rust-weeks.record_absent",
    module: "rust_rounds",
    paired: true,
    method: "GET",
    path: "/rust-weeks/:id/record",
    summary: "the record of a week home holds none of is a 404",
    request: { path: { id: ABSENT_WEEK } },
    expect: { status: 404 },
  }),
  ...pairedPhoneOnly(
    "rust_rounds",
    "rust-weeks.record",
    "GET",
    "/rust-weeks/:id/record",
    "a week's record",
    {
      path: { id: ABSENT_WEEK },
    }
  ),

  defineContract({
    id: "rust-round-log.list",
    module: "rust_rounds",
    paired: true,
    method: "GET",
    path: "/rust-round-log/sessions",
    summary:
      "this subject's sittings of the card-era log home keeps: each by id, when it started, its latest revision, the SHA-256 of that revision as sent and when it was written",
    expect: { status: 200, schema: LogListSchema },
  }),
  ...pairedPhoneOnly(
    "rust_rounds",
    "rust-round-log.list",
    "GET",
    "/rust-round-log/sessions",
    "the log's sittings",
    {}
  ),

  defineContract({
    id: "rust-round-log.session_absent",
    module: "rust_rounds",
    paired: true,
    method: "GET",
    path: "/rust-round-log/sessions/:id",
    summary: "a sitting home keeps none of under the id is a 404",
    request: { path: { id: ABSENT_SITTING } },
    expect: { status: 404 },
  }),
  defineContract({
    id: "rust-round-log.put_misplaced",
    module: "rust_rounds",
    paired: true,
    method: "PUT",
    path: "/rust-round-log/sessions/:id",
    summary:
      "a sitting whose id is not the path's is a 422 naming the id, and nothing is kept",
    mutates: true,
    request: { path: { id: ABSENT_SITTING }, body: MISPLACED_SITTING },
    expect: { status: 422 },
  }),
  ...pairedPhoneOnly(
    "rust_rounds",
    "rust-round-log.put",
    "PUT",
    "/rust-round-log/sessions/:id",
    "sending a sitting",
    { path: { id: ABSENT_SITTING }, body: MISPLACED_SITTING }
  ),
]
