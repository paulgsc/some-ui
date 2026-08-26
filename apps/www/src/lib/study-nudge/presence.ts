/**
 * Telling `file_host` what session is currently on screen.
 *
 * Presence used to be inferred from a WebSocket connection count, which
 * server-side redesign (`paulgsc/server` nudge::presence) replaced with a
 * lease this app asserts directly: `POST /presence/lease` with the session id
 * currently in view. There is no "start presence" / "stop presence" call —
 * every post is just "I am looking at this, right now" — so this module has
 * exactly one entry point rather than a subsystem with its own lifecycle.
 *
 * `context_key` has to be the literal string the server compares against
 * `StudyAction::session_id()`, unmodified — that is the same string the
 * app's own `/sessions/:id` route param already carries, which is what
 * `use-presence-lease.ts` passes in.
 */

import { DATA_MODE } from "@/lib/data-mode"
import type { FileHostTransport } from "@/lib/file-host-config/client"
import {
  createFileHostTransport,
  requestJSON,
} from "@/lib/file-host-config/client"

type PresenceDeps = {
  transport?: FileHostTransport | null
  mode?: typeof DATA_MODE
}

/** `observed_at` is the server's own clock, echoed back — nothing here reads
 * it, since the caller's job ends at "the request landed". */
type PresenceLeaseResponse = { context_key: string; observed_at: string }

/**
 * Assert presence on one session, swallowing every failure.
 *
 * A missed write just means presence reads as absent, which is the server's
 * safe default — not a broken feature — so there is nothing for a caller to
 * retry or surface. Returns whether it landed, for tests only.
 */
export async function reportPresence(
  contextKey: string,
  deps: PresenceDeps = {}
): Promise<boolean> {
  // The Pages build has no backend and no presence ledger to write to.
  if ((deps.mode ?? DATA_MODE) === "static") return false
  if (!contextKey) return false

  const transport =
    deps.transport === undefined ? createFileHostTransport() : deps.transport
  if (!transport) return false

  try {
    await requestJSON<PresenceLeaseResponse>(transport, "/presence/lease", {
      method: "POST",
      body: JSON.stringify({ context_key: contextKey }),
    })
    return true
  } catch {
    return false
  }
}
