/**
 * The session log in ENGAGE's vocabulary (ENG5, #2538; `@some-ui/engagement`,
 * pipeline `leetype`, surface `apk`): a pure projection of each event the log
 * keeps, never a second record. The log stays the source; home hears the
 * projection through the app's engagement sink.
 *
 * - `started` takes a session file; `ended` the way it was left leaves it,
 *   in a reading when one was open and not yet finished, else in a round.
 * - `placed` offers a reading (a placement) or a pointer; `reading opened`
 *   takes it, and `reading skipped` passes it over as put away. One never
 *   opened or skipped by the session's end is passed over as moved on.
 * - `returned` takes a parked round.
 *
 * What a reading or round is never leaves the phone: an event names only
 * the affordance.
 */
import type { EngagementEvent } from "@some-ui/engagement"

import type { SessionEvent, SessionLog } from "./model"

type Kept<T extends SessionEvent["type"]> = Extract<SessionEvent, { type: T }>

const stamp = (
  affordance: string,
  at: string
): Pick<EngagementEvent, "pipeline" | "affordance" | "surface" | "at"> => ({
  pipeline: "leetype",
  affordance,
  surface: "apk",
  at,
})

const AFFORDANCE = { placement: "reading", pointer: "pointer" } as const

/** The placements of `session` in `log`, each with whether it was settled (opened or skipped). */
function placements(
  log: SessionLog,
  session: string
): ReadonlyArray<{ placed: Kept<"placed">; settled: boolean }> {
  const ours = log.filter((e) => e.session === session)
  return ours.flatMap((e) =>
    e.type === "placed"
      ? [
          {
            placed: e,
            settled: ours.some(
              (r) =>
                r.type === "reading" &&
                r.reading === e.reading &&
                (r.action === "opened" || r.action === "skipped")
            ),
          },
        ]
      : []
  )
}

/** Where `session` was when it stopped: in a reading opened and not yet read, saved or skipped. */
function placeOf(log: SessionLog, session: string): "reading" | "round" {
  let open: string | null = null
  for (const e of log) {
    if (e.session !== session || e.type !== "reading") continue
    if (e.action === "opened") open = e.reading
    else if (e.reading === open) open = null
  }
  return open === null ? "round" : "reading"
}

/**
 * The engagement events `event` says, given the log kept before it. Empty
 * for an event the log already keeps.
 */
export function engagedOf(
  before: SessionLog,
  event: SessionEvent
): ReadonlyArray<EngagementEvent> {
  if (before.some((kept) => kept.id === event.id)) return []
  switch (event.type) {
    case "started": {
      return [{ ...stamp("session-file", event.at), kind: "taken" }]
    }
    case "placed": {
      return [{ ...stamp(AFFORDANCE[event.as], event.at), kind: "offered" }]
    }
    case "reading": {
      if (event.action !== "opened" && event.action !== "skipped") return []
      const placed = placements(before, event.session).find(
        (p) => p.placed.reading === event.reading && !p.settled
      )
      if (placed === undefined) return []
      const affordance = AFFORDANCE[placed.placed.as]
      return event.action === "opened"
        ? [{ ...stamp(affordance, event.at), kind: "taken" }]
        : [
            {
              ...stamp(affordance, event.at),
              kind: "passed-over",
              offeredAt: placed.placed.at,
              ending: "put-away",
            },
          ]
    }
    case "returned": {
      return [{ ...stamp("parked-round", event.at), kind: "taken" }]
    }
    case "ended": {
      const unsettled = placements(before, event.session)
        .filter((p) => !p.settled)
        .map(
          (p): EngagementEvent => ({
            ...stamp(AFFORDANCE[p.placed.as], event.at),
            kind: "passed-over",
            offeredAt: p.placed.at,
            ending: "moved-on",
          })
        )
      const started = before.find(
        (e) => e.session === event.session && e.type === "started"
      )
      if (event.how !== "left" || started === undefined) return unsettled
      return [
        ...unsettled,
        {
          ...stamp("session-file", event.at),
          kind: "left",
          startedAt: started.at,
          place: placeOf(before, event.session),
        },
      ]
    }
    case "picked":
    case "parked":
    case "confirmation-taken":
    case "rubric-shown":
    case "spoken": {
      return []
    }
    default: {
      const none: never = event
      throw new Error(`no such session event: ${JSON.stringify(none)}`)
    }
  }
}
