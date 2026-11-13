/**
 * The session log in ENGAGE's vocabulary (ENG5, #2538; `@some-ui/engagement`,
 * pipeline `leetype`, surface `apk`): a pure projection of each event the log
 * keeps, never a second record. The log stays the source; home hears the
 * projection through the app's engagement sink.
 *
 * - `started` takes a session file; `ended` the way it was left leaves it,
 *   in a reading when its screen is one the session placed, else in a round.
 * - `placed` offers a reading (a placement) or a pointer. The first of
 *   opening its source or reading it takes it; saving or skipping it before
 *   then passes it over as put away. One still neither taken nor put away
 *   when the session ends is passed over as moved on.
 * - `returned` takes a parked round.
 *
 * A reading's action answers the latest placement of that reading in that
 * file before it. What a reading or round is never leaves the phone: an
 * event names only the affordance.
 */
import { assertNever } from "@some-ui/core-utils"
import type { EngagementEvent } from "@some-ui/engagement"

import type { SessionEvent, SessionLog } from "./model"
import { byTime } from "./model"

type Kept<T extends SessionEvent["type"]> = Extract<SessionEvent, { type: T }>

const stamp = (affordance: string, at: string) =>
  ({ pipeline: "leetype", affordance, surface: "apk", at }) as const

const AFFORDANCE = { placement: "reading", pointer: "pointer" } as const

type Placement = {
  readonly placed: Kept<"placed">
  taken: boolean
  /** Read, saved or skipped: nothing later answers it. */
  settled: boolean
}

/** The placements of `session` in `log`, in order, each as its actions left it. */
function placementsOf(log: SessionLog, session: string): Array<Placement> {
  const placements: Array<Placement> = []
  for (const event of byTime(log)) {
    if (event.session !== session) continue
    if (event.type === "placed")
      placements.push({ placed: event, taken: false, settled: false })
    if (event.type === "reading") {
      const placement = answered(placements, event)
      if (placement === undefined) continue
      placement.taken ||= event.action === "opened" || event.action === "read"
      placement.settled ||= event.action !== "opened"
    }
  }
  return placements
}

/** The latest placement still open of the reading `event` acts on. */
const answered = (
  placements: ReadonlyArray<Placement>,
  event: Kept<"reading">
): Placement | undefined =>
  [...placements]
    .reverse()
    .find(
      (p) =>
        !p.settled &&
        p.placed.file === event.file &&
        p.placed.reading === event.reading
    )

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
      const placement = answered(placementsOf(before, event.session), event)
      if (placement === undefined || placement.taken) return []
      const affordance = AFFORDANCE[placement.placed.as]
      if (event.action === "opened" || event.action === "read")
        return [{ ...stamp(affordance, event.at), kind: "taken" }]
      return [
        {
          ...stamp(affordance, event.at),
          kind: "passed-over",
          offeredAt: placement.placed.at,
          ending: "put-away",
        },
      ]
    }
    case "returned": {
      return [{ ...stamp("parked-round", event.at), kind: "taken" }]
    }
    case "ended": {
      const placements = placementsOf(before, event.session)
      const unanswered = placements
        .filter((p) => !p.taken && !p.settled)
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
      if (event.how !== "left" || started === undefined) return unanswered
      const inReading = placements.some(
        (p) => p.placed.file === event.file && p.placed.reading === event.screen
      )
      return [
        ...unanswered,
        {
          ...stamp("session-file", event.at),
          kind: "left",
          startedAt: started.at,
          place: inReading ? "reading" : "round",
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
      return assertNever(event)
    }
  }
}
