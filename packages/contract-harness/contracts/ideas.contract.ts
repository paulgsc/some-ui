/**
 * Studio's ideas on home, and the lists they pick from (paulgsc/server
 * `routes/ideas.rs` and `handlers/ideas.rs`, #650; STUDIO ST26, #2453). The
 * phone sends each idea sent whole with `PUT /ideas/:id`
 * (`apps/www/src/lib/home-link/ideas.ts`) through the app's home link.
 *
 * Hand-written: `IdeaSchema` is the server's `idea_repo::Idea` (its
 * `answers` of `AnswerView`, `heard` of `voice_repo::transcript::Transcript`),
 * `IdeasSchema` its `Ideas` and `ListsSchema` its `Lists`, checked by hand
 * against them. Every route is subject-scoped (`SubjectId`), so a cookie
 * session reaches it as a paired phone's bearer does: each has a signed-out
 * contract, which always runs, and `session` contracts.
 *
 * **Nothing here keeps anything.** Ideas, their marks and the lists'
 * marks are append-only and go only with the account, so no probe may
 * write one: every write is pinned by a refusal home makes before it
 * writes (a body whose id is not the path's, a furnishing body that isn't
 * one, a list entry over 40 characters), or by an idea no subject holds
 * (`404`). The `200` of a real send, `unchanged` on a repeat, a `409`
 * naming notes and another subject's idea being a `404` are held by the
 * server's own handler tests.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

/** `idea_repo::IDEAS_LISTED`. */
const IDEAS_LISTED = 1000

/** `idea_repo::MAX_LIST_ENTRIES`. */
const LIST_MAX = 100

const InstantSchema = z.iso.datetime()

const IdeaSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  createdAt: InstantSchema,
  revision: z.int().positive(),
  sentAt: InstantSchema,
  title: z.string().min(1).max(80),
  topic: z.string().min(1).max(40),
  format: z.enum(["short", "video"]),
  keywords: z.array(z.string().min(1).max(40)).max(20),
  questions: z.int().positive(),
  answers: z.array(
    z.object({
      question: z.string().min(1),
      note: z.string().nullable(),
      typed: z.string().nullable(),
      heard: z
        .object({
          text: z.string(),
          language: z.string().nullable(),
          model: z.string().min(1),
          heardAt: z.string().min(1),
        })
        .nullable(),
      setAside: z.boolean(),
    })
  ),
  furnishing: z.boolean(),
  setAside: z.boolean(),
})

const IdeasSchema = z.object({
  ideas: z.array(IdeaSchema).max(IDEAS_LISTED),
  more: z.boolean(),
})

const ListsSchema = z.object({
  topics: z.array(z.string().min(1).max(40)).max(LIST_MAX),
  keywords: z.array(z.string().min(1).max(40)).max(LIST_MAX),
})

/** An id in the phone's own form that no phone makes. */
const ABSENT_IDEA = "contract-harness-absent"

/** Not `ABSENT_IDEA`, so a send to it carries an id that is not the path's. */
const OTHER_IDEA = "contract-harness-other"

/** A send home would check further, but under `ABSENT_IDEA`. */
const MISPLACED_SEND = {
  id: ABSENT_IDEA,
  createdAt: "2026-11-01T09:00:00.000Z",
  sentAt: "2026-11-01T09:10:00.000Z",
  title: "A contract's idea",
  topic: "Studio",
  format: "short",
  keywords: [],
  questions: 1,
  answers: [{ question: "what", typed: "Never kept." }],
}

/** One past `idea_repo::MAX_ENTRY_CHARS`, so no list takes it. */
const TOO_LONG = "x".repeat(41)

type Write = {
  readonly id: string
  /** What the session contract's id adds to `id`. */
  readonly refusal: "misplaced" | "refused" | "absent"
  readonly method: "PUT" | "DELETE"
  readonly path: string
  readonly summary: string
  readonly request: { path: Record<string, string>; body?: unknown }
  readonly status: number
}

const WRITES: ReadonlyArray<Write> = [
  {
    id: "ideas.put",
    refusal: "misplaced",
    method: "PUT",
    path: "/ideas/:id",
    summary:
      "a send whose idea is not the path's is a 422 naming the id, and nothing is kept",
    request: { path: { id: OTHER_IDEA }, body: MISPLACED_SEND },
    status: 422,
  },
  {
    id: "ideas.furnishing",
    refusal: "refused",
    method: "PUT",
    path: "/ideas/:id/furnishing",
    summary:
      "a body that is not one furnishing mark is a 422 naming furnishing, and nothing is kept",
    request: { path: { id: ABSENT_IDEA }, body: { furnishing: "yes" } },
    status: 422,
  },
  {
    id: "ideas.set_aside",
    refusal: "absent",
    method: "PUT",
    path: "/ideas/:id/set-aside",
    summary:
      "setting aside an idea this subject doesn't hold is a 404, and nothing is kept",
    request: { path: { id: ABSENT_IDEA } },
    status: 404,
  },
  {
    id: "ideas.topic_put",
    refusal: "refused",
    method: "PUT",
    path: "/idea-lists/topics/:name",
    summary:
      "a topic over 40 characters is a 422 naming the name, and the list is as it was",
    request: { path: { name: TOO_LONG } },
    status: 422,
  },
  {
    id: "ideas.topic_delete",
    refusal: "refused",
    method: "DELETE",
    path: "/idea-lists/topics/:name",
    summary:
      "taking off a topic over 40 characters is a 422 naming the name, and the list is as it was",
    request: { path: { name: TOO_LONG } },
    status: 422,
  },
  {
    id: "ideas.keyword_put",
    refusal: "refused",
    method: "PUT",
    path: "/idea-lists/keywords/:name",
    summary:
      "a keyword over 40 characters is a 422 naming the name, and the list is as it was",
    request: { path: { name: TOO_LONG } },
    status: 422,
  },
  {
    id: "ideas.keyword_delete",
    refusal: "refused",
    method: "DELETE",
    path: "/idea-lists/keywords/:name",
    summary:
      "taking off a keyword over 40 characters is a 422 naming the name, and the list is as it was",
    request: { path: { name: TOO_LONG } },
    status: 422,
  },
]

export const contracts = [
  defineContract({
    id: "ideas.list",
    module: "ideas",
    session: true,
    method: "GET",
    path: "/ideas",
    summary: `this subject's ideas home holds, newest begun first, set-aside ones left out, at most ${String(IDEAS_LISTED)}, and whether more are held back`,
    expect: { status: 200, schema: IdeasSchema },
  }),

  defineContract({
    id: "ideas.list_signed_out",
    module: "ideas",
    method: "GET",
    path: "/ideas",
    summary: "the ideas are a subject's: without a session it is a 401",
    expect: { status: 401 },
  }),

  defineContract({
    id: "ideas.idea_absent",
    module: "ideas",
    session: true,
    method: "GET",
    path: "/ideas/:id",
    summary: "an idea this subject doesn't hold is a 404",
    request: { path: { id: ABSENT_IDEA } },
    expect: { status: 404 },
  }),

  defineContract({
    id: "ideas.idea_signed_out",
    module: "ideas",
    method: "GET",
    path: "/ideas/:id",
    summary: "an idea is a subject's: without a session it is a 401",
    request: { path: { id: ABSENT_IDEA } },
    expect: { status: 401 },
  }),

  defineContract({
    id: "ideas.lists",
    module: "ideas",
    session: true,
    method: "GET",
    path: "/idea-lists",
    summary:
      "the topics and keywords this subject's ideas pick from: the seeds still on, then the entries added",
    expect: { status: 200, schema: ListsSchema },
  }),

  defineContract({
    id: "ideas.lists_signed_out",
    module: "ideas",
    method: "GET",
    path: "/idea-lists",
    summary: "the lists are a subject's: without a session it is a 401",
    expect: { status: 401 },
  }),

  ...WRITES.flatMap((write) => [
    defineContract({
      id: `${write.id}_${write.refusal}`,
      module: "ideas",
      session: true,
      method: write.method,
      path: write.path,
      summary: write.summary,
      mutates: true,
      request: write.request,
      expect: { status: write.status },
    }),
    defineContract({
      id: `${write.id}_signed_out`,
      module: "ideas",
      method: write.method,
      path: write.path,
      summary:
        "a write is a subject's: without a session it is a 401, and nothing is kept",
      mutates: true,
      request: write.request,
      expect: { status: 401 },
    }),
  ]),
]
