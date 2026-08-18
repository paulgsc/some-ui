/**
 * Telling `file_host` what just happened.
 *
 * This is the piece without which the rest of the server half is inert, and
 * the inversion is worth stating plainly because it changed under this
 * branch: the backend no longer wakes up and inspects the world. It has no
 * cron and no ported copy of `decideNudge`. It keeps an engagement level per
 * subject that decays with time and is restored by **signals**, solves the
 * instant that level will cross its threshold, and writes that instant to an
 * indexed column. Its waker's entire query is `WHERE eligible_at <= now`.
 *
 * A subject that has never sent a signal has no row, is never returned by
 * that query, and is never notified. Not "notified late" — never. So this
 * module is not an optimisation or an analytics side-channel; it is where
 * the work originates.
 *
 * ## Why the tenant hooks and not the repository
 *
 * A signal is a statement about a person's behaviour, and only the mutation
 * layer knows which transition just happened. `SessionsRepository.update`
 * sees a patch; `useUpdateSession` sees the record before and after, which
 * is what separates "they sat down" from "they renamed a session they were
 * already in". Emitting from the repository would send `session-started`
 * every time an active session was touched, quietly inflating presence and
 * suppressing the reminders this exists to produce.
 *
 * ## Fire-and-forget, deliberately
 *
 * Nothing awaits these. A signal that does not arrive costs some accuracy in
 * when a nudge lands; a signal that *blocks a mutation* costs someone the
 * ability to start a study session because a LAN box is down. The first is a
 * degraded reminder, the second is a broken app, and they are not close.
 */

import { DATA_MODE } from "@/lib/data-mode"
import type { FileHostTransport } from "@/lib/file-host-config/client"
import {
  createFileHostTransport,
  requestJSON,
} from "@/lib/file-host-config/client"
import type { SessionRecord } from "@/lib/tenant/types"

/**
 * The four `StudySignal` variants a session record can justify.
 *
 * The domain has seven. `scored-below-target`, `curriculum-updated` and
 * `app-updated` are not things the sessions layer knows — they belong to
 * grading and to the content pipeline — and inventing them from session
 * data would be putting a number the server trusts on a guess. Left to
 * whoever owns those events.
 */
export type StudySignal =
  | { kind: "session-provisioned"; session_id: string }
  | { kind: "session-started"; session_id: string }
  | { kind: "session-completed"; session_id: string; score: number }
  | { kind: "session-abandoned"; session_id: string; elapsed_ms: number }

/**
 * How much of the session they actually got through, in `[0, 1]`.
 *
 * The server reads this as "how it went" and restores momentum in
 * proportion, so a wrong answer here does not fail loudly — it shifts when
 * the next reminder lands. Completion ratio is the only honest thing this
 * app can say: it has no grading. A session with no duration reads as a
 * full completion rather than a zero, because dividing by nothing is not
 * evidence that it went badly.
 */
function completionScore(session: SessionRecord): number {
  if (session.totalDurationMs <= 0) return 1
  const elapsed = session.finalElapsedMs ?? session.totalDurationMs
  return Math.min(1, Math.max(0, elapsed / session.totalDurationMs))
}

/**
 * What changed, as the domain would put it — or `null` when the transition
 * says nothing about engagement.
 *
 * `previous` is `undefined` for a create. Every other case compares, and
 * that comparison is the point: only a *transition* into a status is a
 * behaviour. Staying in one is not.
 */
export function signalForTransition(
  next: SessionRecord,
  previous?: SessionRecord
): StudySignal | null {
  if (previous === undefined) {
    // The opportunity, not the behaviour. It carries a zero delta
    // server-side and exists so that a reminder has a session to point at —
    // without one the selector returns nothing rather than inventing a
    // reminder that opens nothing.
    return { kind: "session-provisioned", session_id: next.id }
  }

  if (next.status === previous.status) return null

  // Every status is named rather than falling into a default, so that
  // adding a sixth stops the type checker here — where the question "is
  // this a behaviour or an edit?" has to be answered — instead of being
  // silently absorbed as "not a behaviour".
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
      // Paused is abandonment as the domain means it: started and not
      // finished. Abandoning late drains momentum harder than abandoning
      // early, which is why the elapsed time goes with it rather than a
      // bare flag.
      return {
        kind: "session-abandoned",
        session_id: next.id,
        elapsed_ms: next.finalElapsedMs ?? 0,
      }
    }
    case "draft":
    case "scheduled": {
      // Edits, not behaviour. Moving a session back to draft says nothing
      // about whether the person is studying.
      return null
    }
    default: {
      return assertNever(next.status)
    }
  }
}

/**
 * Compile-time exhaustiveness with a runtime backstop: a status this build
 * does not know is a row written by something that is not this schema, and
 * guessing what it means would put invented behaviour into the ledger.
 */
function assertNever(value: never): never {
  throw new Error(`unhandled session status: ${String(value)}`)
}

type ReportDeps = {
  transport?: FileHostTransport | null
  mode?: typeof DATA_MODE
}

/**
 * Post one signal, swallowing every failure.
 *
 * Returns whether it was accepted, which is for tests and for a caller that
 * wants to log — no production path branches on it, because there is
 * nothing useful to do about a signal that did not land.
 */
export async function reportSignal(
  signal: StudySignal,
  deps: ReportDeps = {}
): Promise<boolean> {
  // The Pages build has no backend and no engagement ledger; its policy is
  // the client one, which reads sessions directly.
  if ((deps.mode ?? DATA_MODE) === "static") return false

  const transport =
    deps.transport === undefined ? createFileHostTransport() : deps.transport
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
