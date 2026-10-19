/**
 * What this phone's person chose to keep sending to their paired home, as a
 * log that only grows (LA11, docs/learner-data-authority.md): each choice is
 * one event, in the order made (`seq`), and nothing written is rewritten.
 * What is shared at any moment is a fold over it (`sharedAt`), so "now" and
 * any earlier time are answered from the same events. Pure;
 * `./consent-runtime` keeps the log on this phone.
 *
 * Sharing is one way: home keeps what it received, so `stopped` means only
 * that nothing new goes.
 *
 * Today only Practice's records are chosen here; aph (LA9) and the Jobs
 * record (LA10) keep their own flag until their way to stop lands.
 */
import { isRecord } from "@/lib/device-backend/common"

/** What a person can keep sending home. Closed: a new one is a reviewed diff. */
export const SCOPES = ["sessions", "shelf"] as const
export type Scope = (typeof SCOPES)[number]

/** One choice, as made: when (this phone's clock) and what it covered. */
type ConsentEvent =
  | {
      readonly seq: number
      readonly at: number
      readonly kind: "kept"
      readonly scopes: ReadonlyArray<Scope>
      /** The words the person agreed to, exactly as they were shown. */
      readonly said: string
    }
  | {
      readonly seq: number
      readonly at: number
      readonly kind: "stopped"
      readonly scopes: ReadonlyArray<Scope>
    }

export type ConsentLog = ReadonlyArray<ConsentEvent>

/** A choice before it has a place in the log. */
export type Choice =
  | {
      readonly kind: "kept"
      readonly scopes: ReadonlyArray<Scope>
      readonly said: string
    }
  | { readonly kind: "stopped"; readonly scopes: ReadonlyArray<Scope> }

/** Since when each scope has been kept on home, at time `t`. */
export type Shared = ReadonlyMap<Scope, { readonly since: number }>

/**
 * What is kept on home at `t`: the log's events made by then, in `seq` order.
 * `at` is this phone's clock, so it says when, and `seq` says in what order.
 */
export function sharedAt(log: ConsentLog, t: number): Shared {
  const shared = new Map<Scope, { since: number }>()
  for (const event of log) {
    if (event.at > t) continue
    for (const scope of event.scopes) {
      if (event.kind === "stopped") shared.delete(scope)
      else if (!shared.has(scope)) shared.set(scope, { since: event.at })
    }
  }
  return shared
}

/** What is kept on home now: every event, whatever the clock says. */
export function sharedNow(log: ConsentLog): Shared {
  return sharedAt(log, Number.POSITIVE_INFINITY)
}

/**
 * `log` with `choice` made at `at`, or `log` itself when the choice changes
 * nothing (keeping what is kept, stopping what is not). Never edits an event.
 */
export function appended(
  log: ConsentLog,
  choice: Choice,
  at: number
): ConsentLog {
  const now = sharedNow(log)
  const scopes = choice.scopes.filter((scope) =>
    choice.kind === "kept" ? !now.has(scope) : now.has(scope)
  )
  if (scopes.length === 0) return log
  const seq = (log.at(-1)?.seq ?? 0) + 1
  const event: ConsentEvent =
    choice.kind === "kept"
      ? { seq, at, kind: "kept", scopes, said: choice.said }
      : { seq, at, kind: "stopped", scopes }
  return [...log, event]
}

function isScope(value: unknown): value is Scope {
  return SCOPES.some((scope) => scope === value)
}

function eventOf(value: unknown): ConsentEvent | null {
  if (!isRecord(value)) return null
  const { seq, at, kind, scopes, said } = value
  if (typeof seq !== "number" || typeof at !== "number") return null
  if (!Array.isArray(scopes) || !scopes.every(isScope)) return null
  if (kind === "kept" && typeof said === "string") {
    return { seq, at, kind, scopes, said }
  }
  if (kind === "stopped") return { seq, at, kind, scopes }
  return null
}

/** The log stored as `text`, or `null` when it cannot be read as one. */
export function parseLog(text: string): ConsentLog | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const log: Array<ConsentEvent> = []
  for (const value of parsed) {
    const event = eventOf(value)
    if (event === null) return null
    if (event.seq <= (log.at(-1)?.seq ?? 0)) return null
    log.push(event)
  }
  return log
}
