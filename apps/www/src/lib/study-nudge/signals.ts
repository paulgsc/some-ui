/**
 * Telling `file_host` what just happened.
 *
 * The backend has no cron and no copy of `decideNudge`: it keeps an
 * engagement level per subject that decays with time and is restored by
 * **signals**, and stores the instant it will cross its threshold
 * (`WHERE eligible_at <= now`). A subject that never sent a signal is never
 * notified, so this is where the work originates.
 *
 * Emitted from the tenant mutation hooks, not the repository: only they see
 * the record before and after, which separates "they sat down" from "they
 * renamed an active session".
 *
 * Fire-and-forget: a lost signal costs accuracy; one that blocked a mutation
 * would stop someone starting a session because a LAN box is down.
 */

import { DATA_MODE } from "@/lib/data-mode"
import type { FileHostTransport } from "@/lib/file-host-config/client"
import {
  createFileHostTransport,
  requestJSON,
} from "@/lib/file-host-config/client"
import type { SessionRecord } from "@/lib/tenant/types"

/**
 * The four `StudySignal` variants a session record can justify. The other
 * three (`scored-below-target`, `curriculum-updated`, `app-updated`) belong
 * to grading and the content pipeline; inventing them would be a guess the
 * server trusts.
 */
export type StudySignal =
  | { kind: "session-provisioned"; session_id: string }
  | { kind: "session-started"; session_id: string }
  | { kind: "session-completed"; session_id: string; score: number }
  | { kind: "session-abandoned"; session_id: string; elapsed_ms: number }

/**
 * How much of the session they got through, in `[0, 1]`: the server restores
 * momentum in proportion, and completion is all this app can say (it has no
 * grading). No duration reads as full completion, not zero.
 */
function completionScore(session: SessionRecord): number {
  if (session.totalDurationMs <= 0) return 1
  const elapsed = session.finalElapsedMs ?? session.totalDurationMs
  return Math.min(1, Math.max(0, elapsed / session.totalDurationMs))
}

/**
 * What changed, as the domain would put it, or `null` when the transition
 * says nothing about engagement. `previous` is `undefined` for a create; only
 * a *transition* into a status is a behaviour.
 */
export function signalForTransition(
  next: SessionRecord,
  previous?: SessionRecord
): StudySignal | null {
  if (previous === undefined) {
    // The opportunity, not the behaviour: a zero delta server-side, so a
    // reminder has a session to point at.
    return { kind: "session-provisioned", session_id: next.id }
  }

  if (next.status === previous.status) return null

  // Every status named, so a sixth stops the type checker here, where
  // "behaviour or edit?" must be answered.
  switch (next.status) {
    case "active": {
      return { kind: "session-started", session_id: next.id }
    }
    case "completed": {
      return {
        kind: "session-completed",
        session_id: next.id,
        score: completionScore(next),
      }
    }
    case "paused": {
      // Started and not finished. Elapsed time goes with it: abandoning late
      // drains momentum harder than abandoning early.
      return {
        kind: "session-abandoned",
        session_id: next.id,
        elapsed_ms: next.finalElapsedMs ?? 0,
      }
    }
    case "draft":
    case "scheduled": {
      // Edits, not behaviour.
      return null
    }
    default: {
      return assertNever(next.status)
    }
  }
}

/**
 * Runtime backstop: an unknown status was written by something that is not
 * this schema, and guessing would put invented behaviour into the ledger.
 */
function assertNever(value: never): never {
  throw new Error(`unhandled session status: ${String(value)}`)
}

type ReportDeps = {
  transport?: FileHostTransport | null
  mode?: typeof DATA_MODE
}

/**
 * Post one signal, swallowing every failure. Returns whether it was accepted,
 * for tests; no production path branches on it.
 */
export async function reportSignal(
  signal: StudySignal,
  deps: ReportDeps = {}
): Promise<boolean> {
  // The Pages build has no backend and no engagement ledger; its policy is
  // the client one, which reads sessions directly.
  if ((deps.mode ?? DATA_MODE) === "static") return false

  const transport =
    deps.transport === undefined
      ? createFileHostTransport("reporting")
      : deps.transport
  if (!transport) return false

  try {
    await requestJSON<{ kind: string; eligible_at: string }>(
      transport,
      "/signals",
      { method: "POST", body: JSON.stringify(signal) }
    )
    return true
  } catch {
    return false
  }
}

/** `signalForTransition` and `reportSignal`, for the mutation hooks. */
export function reportSessionTransition(
  next: SessionRecord,
  previous?: SessionRecord,
  deps: ReportDeps = {}
): void {
  const signal = signalForTransition(next, previous)
  if (signal) void reportSignal(signal, deps)
}
