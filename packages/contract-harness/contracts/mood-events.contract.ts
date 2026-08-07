/**
 * Mood event handshakes.
 *
 * `MoodEventSchema` below is a deliberate copy of the schema the client
 * actually validates against, in
 * `packages/ui/nfl/src/hooks/hopium/use-hopium-queries.ts`. It is copied rather
 * than imported because that module pulls in `@tanstack/react-query` and React
 * at import time, and a Node CLI should not have to boot a UI stack to ask the
 * server a question.
 *
 * The copy is the point, not a compromise: a contract states what the client
 * *believes*, and the runner's job is to find out whether the server agrees.
 * Deriving the expectation from either side would make the check circular.
 *
 * The natural next step is to hoist these schemas into `@some-ui/types` — a
 * plain package with no React dependency — so the hook and the contract can
 * share one declaration. That removes the copy without making the check
 * circular, since the server side of the comparison still comes from the wire.
 *
 * Note `time` below. The client declares it optional; the server's `MoodEvent`
 * (`crates/db/mood_event/src/core/model.rs`) has no such field. Because it is
 * optional, zod accepts every response and the mismatch never surfaces. The
 * harness reports it as a phantom field — that is the case this whole layer
 * exists to catch, so the contract keeps the field rather than quietly
 * correcting it.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

const MoodEventSchema = z.object({
  id: z.number(),
  index: z.number(),
  week: z.number(),
  label: z.string(),
  description: z.string(),
  team: z.string(),
  category: z.string(),
  delta: z.number(),
  mood: z.number(),
  time: z.string().optional(),
})

const MoodEventsSchema = z.array(MoodEventSchema)

/** Mirrors `MoodStats` in `crates/db/mood_event/src/core/model.rs`. */
const MoodStatsSchema = z.object({
  total_events: z.number(),
  min_mood: z.number().nullable(),
  max_mood: z.number().nullable(),
  avg_mood: z.number().nullable(),
  positive_events: z.number(),
  negative_events: z.number(),
  neutral_events: z.number(),
})

export const contracts = [
  defineContract({
    id: "mood_events.list",
    module: "mood_events",
    method: "GET",
    path: "/mood_events",
    summary: "every mood event, as the hopium dashboard loads them",
    expect: { status: 200, schema: MoodEventsSchema },
  }),

  defineContract({
    id: "mood_events.stats",
    module: "mood_events",
    method: "GET",
    path: "/mood_events/stats",
    summary: "aggregate mood statistics",
    expect: { status: 200, schema: MoodStatsSchema },
  }),

  defineContract({
    id: "mood_events.get_by_id",
    module: "mood_events",
    method: "GET",
    path: "/mood_events/:id",
    summary: "single mood event by id — exercises path parameter binding",
    request: { path: { id: 1 } },
    // 404 is accepted because this runs against whatever data the target server
    // happens to hold. The handshake being pinned is "this route exists, and
    // when it answers 200 the body is a MoodEvent" — not "row 1 exists".
    expect: { status: [200, 404], schemaFor: 200, schema: MoodEventSchema },
  }),
]
