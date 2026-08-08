/**
 * The study-nudge boundary: consent, signals, and the sessions the engine
 * reads.
 *
 * This is the surface `apps/www/src/lib/study-nudge` and
 * `apps/www/src/lib/tenant/http-sessions-repository.ts` talk to. It is worth
 * contracting for a reason the older modules here do not share: **its failure
 * mode is silence.** A tab list that stops loading is reported within the hour.
 * A study reminder that stops arriving is indistinguishable from the policy
 * deciding, correctly, that now is not a good time — so a drift here can live
 * for weeks, and the only symptom is somebody quietly not being reminded to
 * study.
 *
 * ## What this layer can and cannot say
 *
 * It can say the two sides still fit: that `/push/vapid-key` still returns a
 * key and a topic list, that `/signals` still accepts the tagged shape the
 * client sends, that a session still comes back in `camelCase`. That is the
 * handshake.
 *
 * It cannot say a notification was ever displayed. A push leaves the server,
 * crosses a push service, and is handled by `public/sw.js` inside a browser —
 * three hops this runner does not make. Every contract below can be green
 * while the feature is dead. `apps/www/tests/study-nudge/service-worker.spec.ts`
 * is the layer that answers that half, in a real Chromium with a real push.
 *
 * ## Why most of these are read-only
 *
 * Subscribing and signalling both write, so they sit behind
 * `--include-mutations` like every other write here. That is not merely
 * caution about test data: a signal folds into the subject's engagement
 * ledger and *moves when they next get reminded*. Running the write
 * contracts against a server somebody is actually using would change their
 * reminders, which is a stranger side effect than an extra row.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

/**
 * `VapidKeyResponse` in `apps/servers/file_host/src/handlers/push.rs`.
 *
 * Both fields are load-bearing on the client and for different reasons.
 * `public_key` is fetched rather than baked into the bundle because it is
 * baked into every subscription made with it — a stale one fails as a `403`
 * on every send, in a log nobody reads. `topics` drives the consent
 * checklist, so a topic the server drops must not keep being offered as
 * something a person can agree to.
 */
const VapidKeySchema = z.object({
  public_key: z.string(),
  topics: z.array(z.string()),
})

/** `SubscribeResponse` — the endpoint stored and the grant recorded with it. */
const SubscribeResponseSchema = z.object({
  endpoint: z.string(),
  topics: z.array(z.string()),
})

/** `DeleteResponse`. False means there was nothing to remove, which is not an error. */
const DeleteResponseSchema = z.object({
  removed: z.boolean(),
})

/**
 * `SignalAccepted`. `eligible_at` is the whole reason this endpoint answers
 * with a body at all: it is when the subject could next earn an
 * intervention, and it makes the engine's arithmetic observable without
 * waiting days for a notification.
 */
const SignalAcceptedSchema = z.object({
  kind: z.string(),
  eligible_at: z.string(),
})

/**
 * `SessionRecord`, which serialises `camelCase` because the client's type is
 * the contract and the server is the side that moved.
 *
 * The optional fields really are absent rather than null — the server marks
 * them `skip_serializing_if = "Option::is_none"` — so against a store with no
 * started sessions the harness will report them as phantom fields. That is a
 * true statement about the sample, not a defect in the contract, and it is
 * exactly the `no-samples` caveat the README warns about.
 */
const SessionRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["draft", "scheduled", "active", "paused", "completed"]),
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
 * A structurally valid subscription that no push service will ever accept.
 *
 * The endpoint is `https:` and both keys decode as base64url, which is all
 * `PushSubscription::validate` checks — so this exercises the accept path
 * without registering an address that could receive somebody's reminders.
 */
const FAKE_SUBSCRIPTION = {
  endpoint: "https://contract-harness.invalid/push/not-a-real-endpoint",
  keys: {
    p256dh:
      "BLMbF9ffKBiWQLCKvTHb6LO8Nb6dcUh6TItC455vu2kElga6PQvUmaFyCdykxY2nOSSL3yKgfbmFLRTUaGv4yV8",
    auth: "xS03Fi5ErfTNH_l9WHE9Ig",
  },
}

export const contracts = [
  defineContract({
    id: "push.vapid_key",
    module: "push",
    method: "GET",
    path: "/push/vapid-key",
    summary:
      "the applicationServerKey to subscribe with, and the topics consent may be given for",
    // 503 is `feature_not_configured`: a deployment with no VAPID identity.
    // The client degrades to its tab-open-only behaviour on it rather than
    // treating it as an outage, so it is an accepted answer here too.
    expect: {
      status: [200, 503],
      schemaFor: 200,
      schema: VapidKeySchema,
    },
  }),

  defineContract({
    id: "push.subscribe",
    module: "push",
    method: "POST",
    path: "/push/subscriptions",
    summary:
      "the browser's PushSubscription flattened alongside the topics agreed to",
    mutates: true,
    // The shape is the point of this contract. The client sends
    // `{ ...subscription.toJSON(), topics }` — flattened, not nested under a
    // `subscription` key — and a server that started expecting a wrapper
    // would answer 422 rather than silently misreading it. Worth pinning
    // because the naive client version of this (spreading the live
    // PushSubscription, which has no own enumerable properties) posts a body
    // containing only `topics` and fails the same way.
    request: { body: { ...FAKE_SUBSCRIPTION, topics: ["lesson-ready"] } },
    expect: { status: 200, schema: SubscribeResponseSchema },
  }),

  defineContract({
    id: "push.unsubscribe",
    module: "push",
    method: "DELETE",
    path: "/push/subscriptions",
    summary: "withdrawing consent by endpoint, idempotent",
    mutates: true,
    request: { body: { endpoint: FAKE_SUBSCRIPTION.endpoint } },
    expect: { status: 200, schema: DeleteResponseSchema },
  }),

  defineContract({
    id: "signals.session_started",
    module: "signals",
    method: "POST",
    path: "/signals",
    summary:
      "a domain event, tagged by kind, folded into the engagement ledger",
    mutates: true,
    // Tagged-union body: `kind` selects the variant and the remaining fields
    // belong to it. A rename on either side is a 422 here rather than a
    // signal that is accepted, ignored, and never noticed — which matters
    // more than usual, because a subject who sends no signals is never
    // notified at all rather than notified late.
    request: {
      body: { kind: "session-started", session_id: "contract-harness-probe" },
    },
    expect: { status: 200, schema: SignalAcceptedSchema },
  }),

  defineContract({
    id: "sessions.list",
    module: "sessions",
    method: "GET",
    path: "/sessions",
    summary: "every session, in the camelCase the client's SessionRecord uses",
    expect: { status: 200, schema: z.array(SessionRecordSchema) },
  }),

  defineContract({
    id: "sessions.get_by_id",
    module: "sessions",
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
    request: {
      body: {
        name: "contract-harness probe",
        activities: [],
        scenes: [],
        layoutMode: "basic",
      },
    },
    expect: { status: 200, schema: SessionRecordSchema },
  }),
]
