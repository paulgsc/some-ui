/**
 * Telling `file_host` what session is on screen: `POST /presence/lease` with
 * the session id in view (`paulgsc/server` nudge::presence). Every post just
 * says "I am looking at this, now", so there is one entry point and no
 * lifecycle.
 *
 * `context_key` must be the literal string the server compares with
 * `StudyAction::session_id()`: the `/sessions/:id` route param.
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
 * Assert presence on one session, swallowing every failure: a missed write
 * reads as absent, the server's safe default. Returns whether it landed, for
 * tests.
 */
export async function reportPresence(
  contextKey: string,
  deps: PresenceDeps = {}
): Promise<boolean> {
  // The Pages build has no backend and no presence ledger to write to.
  if ((deps.mode ?? DATA_MODE) === "static") return false
  if (!contextKey) return false

  const transport =
    deps.transport === undefined
      ? createFileHostTransport("reporting")
      : deps.transport
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
