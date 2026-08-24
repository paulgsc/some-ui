/**
 * The activity catalogue: `GET /activities` and `GET /activities/:id`
 * (server#271).
 *
 * Hand-written per `packages/contract-harness/src/contract.ts`'s own
 * argument and the "oracle rule" in server#254: paths and parameter names
 * are a registry the server is definitionally right about and may be
 * generated (`src/drift.ts` checks this file's paths against
 * `routes.server.json`), but a response *shape* is a belief, and generating
 * it from the server's own types would make this file agree with the thing
 * it is meant to be checking. Every schema below is transcribed from
 * `ActivityDefinition` in `packages/activity-catalog/src/lib/types.ts` (this
 * repo) and cross-checked against `ActivityRecord` in
 * `crates/db/activity/src/model.rs` (`paulgsc/server`) by hand, and this file
 * imports nothing generated.
 *
 * Three deliberate differences from `ActivityDefinition`, all server#269's:
 *
 * - No `toSceneProps` — a closure, and JSON has no way to carry one. CAT4
 *   (server#272) is the story that decided what replaces it; this contract
 *   is silent about it because the wire response is silent about it too.
 * - `minDurationMs` is present (nullable), hoisted server-side out of
 *   `fields` rather than left for a caller to re-derive.
 * - `publishedAt`/`version` are present — server-only bookkeeping the
 *   authoring type has no need of, and the one thing server#271's `ETag`
 *   and server#273's `CurriculumUpdated` producer both read "did the
 *   catalogue change" from (`ActivityRepository::fingerprint`).
 *
 * `maturity` is required here even though `ActivityDefinition.maturity` is
 * optional on the client ("absent means ready, the quiet default"): the
 * server's `activities.maturity` column is `NOT NULL` and the wire response
 * always carries a resolved value, so a contract that made it optional would
 * be describing the authoring format, not the response.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

/** `SelectField` in `packages/activity-catalog/src/lib/types.ts`. */
const SelectFieldSchema = z.object({
  kind: z.literal("select"),
  key: z.string(),
  label: z.string(),
  options: z.array(z.object({ value: z.string(), label: z.string() })),
  defaultValue: z.string(),
})

/** `DurationField` in `packages/activity-catalog/src/lib/types.ts`. */
const DurationFieldSchema = z.object({
  kind: z.literal("duration"),
  key: z.literal("durationMinutes"),
  label: z.string(),
  minMinutes: z.number(),
  maxMinutes: z.number(),
  stepMinutes: z.number(),
  defaultMinutes: z.number(),
})

/**
 * `fields` is opaque `serde_json::Value` on the server — nothing there
 * validates its internal shape (see `ActivityRecord`'s own doc comment on
 * why: a heterogeneous union nothing filters on). This is the client's
 * belief about what it actually contains, which is exactly the kind of
 * check an opaque-on-the-server column needs from somewhere.
 */
const ActivityFieldSchema = z.discriminatedUnion("kind", [
  SelectFieldSchema,
  DurationFieldSchema,
])

/**
 * `ActivityConfigValues` in `types.ts` — a flat record of scalars. The
 * server side of this exact claim is
 * `crates/db/activity/tests/session_activity_shape.rs`
 * (`every_seeded_default_config_is_shaped_like_activityconfigvalues`), which
 * fails at `cargo test` time if a seed ever smuggles in a nested object or a
 * boolean. This contract is the same claim, checked against what actually
 * crossed the wire rather than what the seed migration intended to write.
 */
const ActivityConfigValuesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number()])
)

/** `ActivityAudio` in `types.ts`. Absent means the activity is silent. */
const ActivityAudioSchema = z.object({
  channels: z.array(z.enum(["speech", "effects"])),
  blurb: z.string(),
  required: z.boolean().optional(),
})

/**
 * The wire shape of one row — `ActivityRecord` in
 * `crates/db/activity/src/model.rs`, `#[serde(rename_all = "camelCase")]`.
 */
const ActivityRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.enum(["hexagon", "book-open", "mic", "keyboard"]),
  registryKey: z.string(),
  layoutTree: z.enum(["study", "topik", "drama", "voice"]),
  maturity: z.enum(["ready", "preview", "early"]),
  /** `None` means this activity declares no duration field at all. */
  minDurationMs: z.number().nullable(),
  publishedAt: z.string(),
  version: z.number(),
  fields: z.array(ActivityFieldSchema),
  defaultConfig: ActivityConfigValuesSchema,
  audio: ActivityAudioSchema.optional(),
})

export const contracts = [
  defineContract({
    id: "activities.list",
    module: "activities",
    method: "GET",
    path: "/activities",
    summary: "the full catalogue, in the camelCase ActivityRecord uses",
    expect: { status: 200, schema: z.array(ActivityRecordSchema) },
  }),

  /**
   * `*` matches whatever the current `ETag` is, per RFC 9110 §13.1.2 — this
   * is deliberately environment-independent: it does not need to know the
   * catalogue's current fingerprint ahead of time to assert that conditional
   * `GET` is honoured. No `schema`: a `304` carries no body to check, the
   * same reasoning `expect.schema`'s own doc comment gives for audio/image
   * endpoints.
   */
  defineContract({
    id: "activities.not_modified",
    module: "activities",
    method: "GET",
    path: "/activities",
    summary: "If-None-Match: * short-circuits to a bodyless 304",
    request: { headers: { "If-None-Match": "*" } },
    expect: { status: 304 },
  }),

  defineContract({
    id: "activities.get_by_id",
    module: "activities",
    method: "GET",
    path: "/activities/:id",
    summary:
      "one activity by its stable ActivityId — honeycomb is one of the four seeded rows",
    request: { path: { id: "honeycomb" } },
    // 404 stays accepted rather than dropped: the catalogue is seeded data,
    // not a compile-time guarantee, so an environment that has not run
    // server#270's seed migration yet should not fail this contract for the
    // wrong reason.
    expect: {
      status: [200, 404],
      schemaFor: 200,
      schema: ActivityRecordSchema,
    },
  }),

  defineContract({
    id: "activities.get_by_id_not_found",
    module: "activities",
    method: "GET",
    path: "/activities/:id",
    summary:
      "an id outside the ActivityId union is a 404, never an empty 200 — server#271's own acceptance criterion",
    request: { path: { id: "contract-harness-does-not-exist" } },
    expect: { status: 404 },
  }),
]
