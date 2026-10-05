/**
 * The routes around the person rather than their content: auth, study
 * signals, presence and push, as the device answers them.
 *
 * **Auth.** The phone has one person and no passkey store, so
 * `GET /auth/session` always answers signed in (`SessionView`: only
 * `expiresAt`), and the ceremony routes answer `503 feature_not_configured`,
 * which is what `file_host` says when passkeys are unconfigured. The app
 * therefore never shows the passkey screen on the device - the app's own
 * lock screen is the phone's.
 *
 * **Signals and presence** keep their wire shapes (snake_case, unlike the
 * session routes) and `presence_leases` is written as the server writes it.
 * The server's engagement fold behind `/signals` is not ported: on the device
 * the nudge decision is the client's own policy (`clientOwnsNudgeDelivery`),
 * delivered as a native notification, so `/signals` validates and answers
 * `eligible_at: now` without storing a charge nobody reads.
 *
 * **Push** answers `503 feature_not_configured`: a device has no VAPID
 * identity, and that code is the one the client already reads as "stop
 * asking and fall back" (`FileHostNotConfiguredError`).
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
      await db.transaction(() =>
        db.run(
          `INSERT INTO presence_leases (subject_id, context_key, observed_at) VALUES (?, ?, ?)
           ON CONFLICT(subject_id, context_key) DO UPDATE SET observed_at = excluded.observed_at`,
          [DEVICE_SUBJECT, contextKey, observedAt]
        )
      )
      return json(200, { context_key: contextKey, observed_at: observedAt })
    },
  },
]
