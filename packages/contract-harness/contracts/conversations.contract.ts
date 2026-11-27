/**
 * A conversation essay's record and the previews it offers (paulgsc/server
 * `routes/conversations.rs`, `handlers/conversations.rs`, `conversations.rs`,
 * `conversation_repo`; HOST16-S, paulgsc/server#1243). The phone's preview
 * approval card (HOST16, #3558) reads the previews with
 * `GET /conversations/:id/previews` (each the agent's `offer` event, with its
 * clips' URLs and the standing pick), plays each variant from its `video`,
 * and keeps the owner's pick as an `approve` event (`some-ui.conversation/2`,
 * `packages/video-render/src/conversation.ts`) with
 * `POST /conversations/:id/events`; `GET /conversations/:id` is the record,
 * which `parseConversationRecord` replays.
 *
 * Hand-written. Every route is a subject's (a paired phone's or a browser's
 * session): without one it is a `401`, and a `POST` without one keeps
 * nothing. With a session (`--session-cookie`): a conversation home keeps no
 * event of is a `404`, and offers no preview; and an approval on it is
 * refused by the record's step (`out-of-phase`: a new record takes only a
 * topic), with the refusal under the record's own names, and nothing kept.
 * The shapes a kept event and an offered preview answer are held by the
 * server's handler and `conversations` tests; that the server's step refuses
 * what this repository's does is held by the refusal corpus
 * (`conversation-corpus.ts`), which the server replays.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

const LIST = "/conversations"
const RECORD = "/conversations/:id"
const PREVIEWS = "/conversations/:id/previews"
const VIDEO = "/conversations/:id/previews/:preview/:variant/video"
const EVENTS = "/conversations/:id/events"

/** A conversation no contract run ever gives a topic. */
const UNKEPT = { path: { id: "contract-unkept" } }

/** The owner's pick (`some-ui.conversation/2`, C1582): an offer and a variant. */
const APPROVE = {
  event: "approve",
  by: "owner",
  at: "2026-11-26T10:06:00.000Z",
  preview: "p-close",
  chose: { kind: "variant", variant: "b" },
}

const PreviewsSchema = z.strictObject({
  previews: z.array(
    z.strictObject({
      preview: z.string(),
      about: z.string(),
      recommended: z.string(),
      variants: z.array(
        z.strictObject({
          variant: z.string(),
          title: z.string(),
          rule: z.string(),
          callouts: z.array(z.string()),
          video: z.string(),
        })
      ),
      approved: z.strictObject({ chose: z.unknown() }).nullable(),
    })
  ),
  unreadable: z.array(z.string()),
})

const ListSchema = z.strictObject({
  conversations: z.array(
    z.strictObject({
      id: z.string(),
      topic: z.string().max(80),
      phase: z.enum(["new", "drafting", "podcast", "flagged", "green-lit"]),
      offers: z.number().int().nonnegative(),
      standing: z.number().int().nonnegative(),
    })
  ),
  unreadable: z.array(z.string()),
})

const RefusedSchema = z.strictObject({
  refused: z.strictObject({
    why: z.literal("out-of-phase"),
    phase: z.literal("new"),
    event: z.literal("approve"),
  }),
  at: z.literal(0),
})

export const contracts = [
  defineContract({
    id: "conversations.list_signed_out",
    module: "conversations",
    method: "GET",
    path: LIST,
    summary:
      "the list of conversations is a subject's: without a session it is a 401",
    expect: { status: 401 },
  }),

  defineContract({
    id: "conversations.list",
    module: "conversations",
    session: true,
    method: "GET",
    path: LIST,
    summary:
      "a subject's conversations, newest first, each with its topic, phase, offers and standing picks, and those that do not replay named apart",
    expect: {
      status: 200,
      schema: ListSchema,
      unknownFields: "reject",
    },
  }),

  defineContract({
    id: "conversations.record_signed_out",
    module: "conversations",
    method: "GET",
    path: RECORD,
    request: UNKEPT,
    summary:
      "a conversation's record is a subject's: without a session it is a 401",
    expect: { status: 401 },
  }),

  defineContract({
    id: "conversations.previews_signed_out",
    module: "conversations",
    method: "GET",
    path: PREVIEWS,
    request: UNKEPT,
    summary:
      "a conversation's previews are a subject's: without a session it is a 401",
    expect: { status: 401 },
  }),

  defineContract({
    id: "conversations.video_signed_out",
    module: "conversations",
    method: "GET",
    path: VIDEO,
    request: {
      path: { id: "contract-unkept", preview: "p-close", variant: "a" },
    },
    summary: "a preview's video is a subject's: without a session it is a 401",
    expect: { status: 401 },
  }),

  defineContract({
    id: "conversations.event_signed_out",
    module: "conversations",
    method: "POST",
    path: EVENTS,
    summary:
      "an event is a subject's: without a session it is a 401, and nothing is kept",
    mutates: true,
    request: { ...UNKEPT, body: APPROVE },
    expect: { status: 401 },
  }),

  defineContract({
    id: "conversations.record_unkept",
    module: "conversations",
    session: true,
    method: "GET",
    path: RECORD,
    request: UNKEPT,
    summary: "a conversation home keeps no event of is a 404",
    expect: { status: 404 },
  }),

  defineContract({
    id: "conversations.previews_unkept",
    module: "conversations",
    session: true,
    method: "GET",
    path: PREVIEWS,
    request: UNKEPT,
    summary: "a conversation home holds no preview of offers none",
    expect: {
      status: 200,
      schema: PreviewsSchema,
      unknownFields: "reject",
    },
  }),

  defineContract({
    id: "conversations.approve_out_of_phase",
    module: "conversations",
    session: true,
    method: "POST",
    path: EVENTS,
    summary:
      "an approval on a record with no topic is refused by the record's step, by its own names, and nothing is kept",
    mutates: true,
    request: { ...UNKEPT, body: APPROVE },
    expect: {
      status: 409,
      schema: RefusedSchema,
      unknownFields: "reject",
    },
  }),
]
