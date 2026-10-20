/**
 * What this phone's person chose to keep sending to their paired home, as a
 * log that only grows (LA9 to LA11, docs/learner-data-authority.md): each choice is
 * one event, in the order made (`seq`), and nothing written is rewritten.
 * What is shared at any moment is a fold over it (`sharedAt`), so "now" and
 * any earlier time are answered from the same events. Pure;
 * `./consent-runtime` keeps the log on this phone.
 *
 * Sharing is one way: home keeps what it received, so `stopped` means only
 * that nothing new goes. Each choice is for the pairing it was made under
 * (`pairing`, the link's id for it), and counts for that pairing alone: a
 * new pairing, even to the same address, starts with nothing kept.
 */
import { isRecord } from "@/lib/device-backend/common"

/** What a person can keep sending home. Closed: a new one is a reviewed diff. */
const SCOPES = ["sessions", "shelf", "aph", "jobs"] as const
export type Scope = (typeof SCOPES)[number]

/** One choice, as made: when (this phone's clock), under which pairing, and what it covered. */
type ConsentEvent =
  | {
      readonly seq: number
      readonly at: number
      readonly pairing: string
      readonly kind: "kept"
      readonly scopes: ReadonlyArray<Scope>
      /**
       * The words the person agreed to, exactly as they were shown; null for
       * a choice found in its record's own switch (aph's, the Jobs
       * record's), made some time before it entered the log and with words
       * never kept.
       */
      readonly said: string | null
    }
  | {
      readonly seq: number
      readonly at: number
      readonly pairing: string
      readonly kind: "stopped"
      readonly scopes: ReadonlyArray<Scope>
    }

export type ConsentLog = ReadonlyArray<ConsentEvent>

/** A choice before it has a place in the log. */
export type Choice =
  | {
      readonly kind: "kept"
      readonly pairing: string
      readonly scopes: ReadonlyArray<Scope>
      readonly said: string | null
    }
  | {
      readonly kind: "stopped"
      readonly pairing: string
      readonly scopes: ReadonlyArray<Scope>
    }

/**
 * Since when each scope has been kept on home, at time `t`: from `since`, or,
 * when `earlier`, from some time before it (a choice found, `said: null`).
 */
export type Shared = ReadonlyMap<
  Scope,
  { readonly since: number; readonly earlier: boolean }
>

/**
 * What is kept under `pairing` at `t`: its events made by then, in
 * `seq` order. `at` is this phone's clock, so it says when, and `seq` says
 * in what order.
 */
export function sharedAt(log: ConsentLog, t: number, pairing: string): Shared {
  const shared = new Map<Scope, { since: number; earlier: boolean }>()
  for (const event of log) {
    if (event.pairing !== pairing || event.at > t) continue
    for (const scope of event.scopes) {
      if (event.kind === "stopped") shared.delete(scope)
      else if (!shared.has(scope)) {
        shared.set(scope, { since: event.at, earlier: event.said === null })
      }
    }
  }
  return shared
}

/**
 * What was kept under `pairing` and is stopped now, and since when: home
 * keeps what it was sent until then.
 */
export function stoppedNow(
  log: ConsentLog,
  pairing: string | null
): ReadonlyMap<Scope, number> {
  const stopped = new Map<Scope, number>()
  for (const event of log) {
    if (event.pairing !== pairing) continue
    for (const scope of event.scopes) {
      if (event.kind === "stopped") stopped.set(scope, event.at)
      else stopped.delete(scope)
    }
  }
  return stopped
}

/** Whether any choice, under any pairing, ever named `scope`. */
export function everChosen(log: ConsentLog, scope: Scope): boolean {
  return log.some((event) => event.scopes.includes(scope))
}

/** What is kept under `pairing` now: its every event, whatever the clock says. */
export function sharedNow(log: ConsentLog, pairing: string | null): Shared {
  if (pairing === null) return new Map()
  return sharedAt(log, Number.POSITIVE_INFINITY, pairing)
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
  const now = sharedNow(log, choice.pairing)
  const scopes = choice.scopes.filter((scope) =>
    choice.kind === "kept" ? !now.has(scope) : now.has(scope)
  )
  if (scopes.length === 0) return log
  const seq = (log.at(-1)?.seq ?? 0) + 1
  const event: ConsentEvent =
    choice.kind === "kept"
      ? {
          seq,
          at,
          pairing: choice.pairing,
          kind: "kept",
          scopes,
          said: choice.said,
        }
      : { seq, at, pairing: choice.pairing, kind: "stopped", scopes }
  return [...log, event]
}

function isScope(value: unknown): value is Scope {
  return SCOPES.some((scope) => scope === value)
}

function eventOf(value: unknown): ConsentEvent | null {
  if (!isRecord(value)) return null
  const { seq, at, pairing, kind, scopes, said } = value
  if (typeof seq !== "number" || typeof at !== "number") return null
  if (typeof pairing !== "string") return null
  if (!Array.isArray(scopes) || !scopes.every(isScope)) return null
  if (kind === "kept" && (typeof said === "string" || said === null)) {
    return { seq, at, pairing, kind, scopes, said }
  }
  if (kind === "stopped") return { seq, at, pairing, kind, scopes }
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
