/**
 * The id a create may name for a new session. `file_host` takes one only in
 * the shape `is_session_id` accepts (paulgsc/server
 * `crates/db/session/src/model.rs`): `session-`, then 16 to 56 letters,
 * digits, `-` and `_`. The phone's own backend (`device-backend`) holds a
 * create to the same rule, and answers any other id with a `422`.
 *
 * Promise SI1.
 * - Claim: every create that names its session's id names one `file_host`
 *   and the phone's backend take.
 * - Family: every caller of `SessionsStore.create` that passes `id` (today
 *   "Next lesson" and the phone's copy to home), on every store.
 * - Proof: `CreateSessionInput.id` is a `SessionId`, which only
 *   `newSessionId` makes and only `isSessionId` lets through (a type), and
 *   `__tests__/session-id.test.ts` holds both to `is_session_id`.
 */
import { generateId } from "./storage"

declare const SESSION_ID: unique symbol

/** A string `isSessionId` has checked. */
export type SessionId = string & { readonly [SESSION_ID]: true }

const SHAPE = /^session-[A-Za-z0-9_-]{16,56}$/

/** `is_session_id`. */
export function isSessionId(text: string): text is SessionId {
  return SHAPE.test(text)
}

/** A fresh id, in the shape every session store takes. */
export function newSessionId(): SessionId {
  const id = generateId("session")
  if (isSessionId(id)) return id
  // Unreachable: both of `generateId`'s forms fit (`session-id.test.ts`).
  throw new RangeError(`generateId made an id no store takes: ${id}`)
}
