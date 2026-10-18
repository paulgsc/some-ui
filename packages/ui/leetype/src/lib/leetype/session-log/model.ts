/**
 * The session log (canon v1.2, Prop. 9.4, Prop. 10.2, Rem. 11.7): every
 * phone session of incident rounds, as an append-only list of what
 * happened. It is the owner's record ("Never lose the record", CLAUDE.md):
 * `append` only adds, and a later event says what changed (a round parked,
 * then returned and solved, is solved). Nothing here removes or rewrites an
 * event, and the ledger screen and every report are computed from it.
 *
 * Screen ids are the session file's (`types/session-file.ts`); `file` names
 * the session file a run played.
 */

type Stamp = {
  /** Unique within the log; an event whose id is already kept is not appended twice. */
  readonly id: string
  /** ISO time. */
  readonly at: string
  /** One run of one session file. */
  readonly session: string
}

/** Prop. 9.1's three responses, kept as three (Def. 9.4). */
type Response = "correct" | "incorrect" | "abstained"

export type SessionEvent = Stamp &
  (
    | {
        readonly type: "started"
        readonly file: string
        readonly form: "full" | "short"
        readonly declaredMinutes: number
      }
    | {
        readonly type: "picked"
        readonly screen: string
        readonly option: string
        readonly response: Response
        readonly ms: number
        /** Slower than twice the learner's median (Def. 9.4); a struggle. */
        readonly slow: boolean
      }
    | {
        readonly type: "placed"
        readonly screen: string
        readonly reading: string
      }
    | {
        readonly type: "reading"
        readonly reading: string
        readonly action: "opened" | "saved" | "read" | "skipped"
      }
    | { readonly type: "parked"; readonly screen: string }
    /** The worked confirmation of a parked round, taken (Prop. 9.4 (d)). */
    | { readonly type: "confirmation-taken"; readonly screen: string }
    | {
        readonly type: "returned"
        /** The parked round. */
        readonly screen: string
        /** The return played. */
        readonly variant: string
        readonly response: Response
      }
    | {
        readonly type: "spoken"
        readonly screen: string
        /** Recording length; 0 for a pass. */
        readonly seconds: number
        readonly passed: boolean
        readonly typed: boolean
        /** Rubric points ticked, as the rubric words them. */
        readonly ticks: ReadonlyArray<string>
      }
    | {
        readonly type: "ended"
        readonly screen: string
        readonly how: "declared" | "left"
      }
  )

export type SessionLog = ReadonlyArray<SessionEvent>

/** `log` with `event` added at the end, or `log` itself if its id is kept. */
export function append(log: SessionLog, event: SessionEvent): SessionLog {
  return log.some((kept) => kept.id === event.id) ? log : [...log, event]
}

/**
 * What a session's ledger screen says (Prop. 10.2), computed from the log.
 * `parked` is across every session so far: a round parked earlier and not
 * since returned and solved still waits on its reading. Screen ids are a
 * session file's own, so a parked round is known by its file and screen.
 */
export type SessionLedger = {
  readonly walked: ReadonlyArray<string>
  readonly parked: ReadonlyArray<{
    readonly file: string
    readonly screen: string
    readonly reading: string | null
  }>
  readonly saved: ReadonlyArray<string>
  readonly spoken: ReadonlyArray<{
    readonly screen: string
    readonly passed: boolean
    readonly typed: boolean
  }>
}

function unique(values: Iterable<string>): Array<string> {
  return [...new Set(values)]
}

export function ledgerOf(log: SessionLog, session: string): SessionLedger {
  const mine = log.filter((event) => event.session === session)
  const walked = unique(
    mine.flatMap((event) => (event.type === "picked" ? [event.screen] : []))
  )

  const fileOf = new Map<string, string>()
  for (const event of log) {
    if (event.type === "started") fileOf.set(event.session, event.file)
  }
  const keyOf = (event: SessionEvent & { screen: string }): string =>
    JSON.stringify([fileOf.get(event.session) ?? "", event.screen])

  const waiting = new Map<
    string,
    { file: string; screen: string; reading: string | null }
  >()
  const placedFor = new Map<string, string>()
  for (const event of log) {
    if (event.type === "placed") {
      placedFor.set(keyOf(event), event.reading)
    } else if (event.type === "parked") {
      waiting.set(keyOf(event), {
        file: fileOf.get(event.session) ?? "",
        screen: event.screen,
        reading: placedFor.get(keyOf(event)) ?? null,
      })
    } else if (event.type === "returned" && event.response === "correct") {
      waiting.delete(keyOf(event))
    }
  }

  const lastAction = new Map<string, string>()
  for (const event of log) {
    if (event.type === "reading") lastAction.set(event.reading, event.action)
  }
  const saved = unique(
    mine.flatMap((event) =>
      event.type === "reading" &&
      event.action === "saved" &&
      lastAction.get(event.reading) === "saved"
        ? [event.reading]
        : []
    )
  )

  return {
    walked,
    parked: [...waiting.values()],
    saved,
    spoken: mine.flatMap((event) =>
      event.type === "spoken"
        ? [{ screen: event.screen, passed: event.passed, typed: event.typed }]
        : []
    ),
  }
}
