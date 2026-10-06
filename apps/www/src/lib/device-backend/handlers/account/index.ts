/**
 * The routes around the person rather than their content (auth, signals,
 * presence, push), as the device answers them.
 *
 * **Auth.** One person, no passkey store: `GET /auth/session` always answers
 * signed in, and the ceremony routes answer `503 feature_not_configured`, as
 * `file_host` does with passkeys unconfigured. The lock screen is the phone's.
 *
 * **Signals and presence** keep their wire shapes (snake_case) and
 * `presence_leases` is written, and trimmed to the server's cap, as the server
 * does it. The engagement fold is not ported (the client's policy decides on
 * the device), so `/signals` validates and answers `eligible_at: now` without
 * storing.
 *
 * **Push** answers `503 feature_not_configured`: no VAPID identity, which the
 * client reads as "fall back" (`FileHostNotConfiguredError`).
 */
import { DEVICE_SUBJECT, isRecord, rfc3339 } from "@/lib/device-backend/common"
import type { DeviceRoute } from "@/lib/device-backend/router"
import {
  errorResponse,
  json,
  readJson,
  shapeRejected,
  unprocessable,
} from "@/lib/device-backend/router"

/** The server's own cap and trim (paulgsc/server `crates/db/presence`). */
const MAX_LEASES_PER_SUBJECT = 16

/** How far ahead the device's always-live session says it runs. */
const SESSION_HORIZON_MS = 30 * 24 * 60 * 60 * 1000

const SIGNAL_KINDS = [
  "session-provisioned",
  "session-started",
  "session-completed",
  "session-abandoned",
  "scored-below-target",
  "curriculum-updated",
  "app-updated",
]

const notConfigured = (): Promise<Response> =>
  Promise.resolve(errorResponse(503, "feature_not_configured"))

const CEREMONIES = [
  "/auth/register/start",
  "/auth/register/finish",
  "/auth/sign-in/start",
  "/auth/sign-in/finish",
  "/auth/passkeys/start",
  "/auth/passkeys/finish",
]

export const accountRoutes: ReadonlyArray<DeviceRoute> = [
  {
    method: "GET",
    path: "/auth/session",
    handler: (_request, { now }): Promise<Response> =>
      Promise.resolve(json(200, { expiresAt: now() + SESSION_HORIZON_MS })),
  },
  // Signing out of the device's one account has nothing to end; `{}` is
  // `file_host`'s answer, and the next `/auth/session` signs back in.
  {
    method: "POST",
    path: "/auth/sign-out",
    handler: (): Promise<Response> => Promise.resolve(json(200, {})),
  },
  {
    method: "POST",
    path: "/auth/sign-out-everywhere",
    handler: (): Promise<Response> => Promise.resolve(json(200, {})),
  },
  ...CEREMONIES.map(
    (path): DeviceRoute => ({ method: "POST", path, handler: notConfigured })
  ),
  { method: "GET", path: "/push/vapid-key", handler: notConfigured },
  { method: "POST", path: "/push/subscriptions", handler: notConfigured },
  { method: "DELETE", path: "/push/subscriptions", handler: notConfigured },
  {
    method: "POST",
    path: "/signals",
    handler: ({ body }, { now }): Promise<Response> => {
      const read = readJson(body)
      if (!read.ok) return Promise.resolve(read.response)
      const kind = isRecord(read.value) ? read.value.kind : undefined
      if (typeof kind !== "string" || !SIGNAL_KINDS.includes(kind)) {
        return Promise.resolve(shapeRejected("unknown variant `kind`"))
      }
      return Promise.resolve(json(200, { kind, eligible_at: rfc3339(now()) }))
    },
  },
  {
    method: "POST",
    path: "/presence/lease",
    handler: async ({ body }, { db, now }): Promise<Response> => {
      const read = readJson(body)
      if (!read.ok) return read.response
      const contextKey = isRecord(read.value)
        ? read.value.context_key
        : undefined
      if (typeof contextKey !== "string") {
        return shapeRejected("missing field `context_key`")
      }
      if (contextKey.trim() === "") {
        return unprocessable({ context_key: ["must not be empty"] })
      }
      const observedAt = rfc3339(now())
      await db.transaction(async () => {
        await db.run(
          `INSERT INTO presence_leases (subject_id, context_key, observed_at) VALUES (?, ?, ?)
           ON CONFLICT(subject_id, context_key) DO UPDATE SET observed_at = excluded.observed_at`,
          [DEVICE_SUBJECT, contextKey, observedAt]
        )
        await db.run(
          `DELETE FROM presence_leases
           WHERE subject_id = ?
             AND context_key NOT IN (
                 SELECT context_key FROM presence_leases
                 WHERE subject_id = ?
                 ORDER BY observed_at DESC
                 LIMIT ?
             )`,
          [DEVICE_SUBJECT, DEVICE_SUBJECT, MAX_LEASES_PER_SUBJECT]
        )
      })
      return json(200, { context_key: contextKey, observed_at: observedAt })
    },
  },
]
