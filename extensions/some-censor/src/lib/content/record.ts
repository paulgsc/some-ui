/**
 * VideoRecord — pure data record.
 *
 * Invariants:
 *
 *   V1 — No HTMLElement.  This file has zero DOM imports.
 *        The floating-overlay bug and the stale-listener bug are unrepresentable
 *        here because there is no reference to any DOM node to go stale.
 *
 *   V2 — Identity is `videoId` (string, non-null).  Only constructable from
 *        FullyExtracted, which guarantees videoId is present.
 *
 *   V3 — `session` is carried from construction and must match the manager's
 *        current session for any operation to proceed.  The manager enforces
 *        this; the type makes the contract visible.
 */

import type { FullyExtracted } from "./extract"
import type { SessionId } from "./session"

export type VideoRecord = {
  readonly videoId: string
  readonly channelId: string
  readonly session: SessionId
}

/**
 * makeRecord — the ONLY constructor.
 *
 * Accepts FullyExtracted (not Extracted) — the compiler rejects partial input.
 * This is where the k%-resolution invariant is enforced: you cannot make a
 * record until extraction fully succeeded.
 */
export function makeRecord(
  extracted: FullyExtracted,
  session: SessionId
): VideoRecord {
  return {
    videoId: extracted.videoId,
    channelId: extracted.channelId,
    session,
  }
}
