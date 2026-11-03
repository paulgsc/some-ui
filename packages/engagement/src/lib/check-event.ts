/**
 * The payload limit, held (CK's C3): an event is one of the five kinds, with
 * exactly its kind's fields, naming an affordance the registry lists on
 * that surface, of a kind that affordance emits, and any place, answer or
 * ending one of the declared ids. A field outside its kind's own is
 * refused, so words, audio and item content have nowhere to ride.
 *
 * Pure, over `unknown`: what the pipe (ENG2) runs on each event before it is
 * kept, and on each one read back.
 */
import type {
  EngagementEvent,
  EventKind,
  Surface,
} from "@engagement/lib/events"
import {
  EVENT_FIELDS,
  EVENT_KINDS,
  SURFACES,
  VISIT_ENDINGS,
} from "@engagement/lib/events"
import type { Pipeline } from "@engagement/lib/registry"
import { findAffordance } from "@engagement/lib/registry"

export type EventCheck =
  | { readonly ok: true; readonly event: EngagementEvent }
  | { readonly ok: false; readonly problems: ReadonlyArray<string> }

const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/

function isStamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    STAMP.test(value) &&
    !Number.isNaN(Date.parse(value))
  )
}

function isKind(value: unknown): value is EventKind {
  return EVENT_KINDS.some((kind) => kind === value)
}

export function checkEvent(
  value: unknown,
  pipelines: ReadonlyArray<Pipeline>
): EventCheck {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return { ok: false, problems: ["an event is an object"] }
  const record: Readonly<Record<string, unknown>> = Object.fromEntries(
    Object.entries(value)
  )
  const kind = record["kind"]
  if (!isKind(kind)) return { ok: false, problems: ["no such kind of event"] }

  const problems: Array<string> = []
  const fields: ReadonlyArray<string> = EVENT_FIELDS[kind]
  for (const key of Object.keys(record))
    if (!fields.includes(key))
      problems.push(`${key}: ${kind} carries no such field`)
  for (const key of fields)
    if (!(key in record)) problems.push(`${key}: ${kind} carries it`)

  const { pipeline, affordance } = record
  const surface = SURFACES.find((s) => s === record["surface"])
  if (surface === undefined) problems.push("surface: apk or web")
  if (!isStamp(record["at"])) problems.push("at: an ISO 8601 time in UTC")

  const found =
    typeof pipeline === "string" &&
    typeof affordance === "string" &&
    surface !== undefined
      ? findAffordance(pipelines, pipeline, affordance, surface)
      : undefined
  if (!found) {
    problems.push("affordance: the registry lists none by that name there")
  } else if (!found.emits.includes(kind)) {
    problems.push(`kind: ${found.id} does not emit ${kind}`)
  }

  const before = (key: "offeredAt" | "startedAt"): void => {
    const earlier = record[key]
    if (!isStamp(earlier)) problems.push(`${key}: an ISO 8601 time in UTC`)
    else if (
      isStamp(record["at"]) &&
      Date.parse(earlier) > Date.parse(record["at"])
    )
      problems.push(`${key}: comes before at`)
  }
  if (kind === "passed-over") {
    before("offeredAt")
    if (!VISIT_ENDINGS.some((e) => e.id === record["ending"]))
      problems.push("ending: one of the visit endings")
  }
  if (kind === "left") {
    before("startedAt")
    if (found && !(found.places ?? []).some((p) => p.id === record["place"]))
      problems.push(`place: one of ${found.id}'s places`)
  }
  if (kind === "said" && found) {
    if (!(found.answers ?? []).some((a) => a.id === record["answer"]))
      problems.push(`answer: one of ${found.id}'s answers`)
  }

  if (problems.length > 0 || !found || surface === undefined)
    return { ok: false, problems }
  return { ok: true, event: rebuilt(kind, record, found.id, surface) }
}

/**
 * The event again, from the fields checked above: built field by field, so
 * what is kept is exactly the kind's own and nothing the value carried
 * besides.
 */
function rebuilt(
  kind: EventKind,
  record: Readonly<Record<string, unknown>>,
  affordance: string,
  surface: Surface
): EngagementEvent {
  const stamp = {
    pipeline: String(record["pipeline"]),
    affordance,
    surface,
    at: String(record["at"]),
  }
  switch (kind) {
    case "offered":
    case "taken": {
      return { ...stamp, kind }
    }
    case "passed-over": {
      const ending = VISIT_ENDINGS.find((e) => e.id === record["ending"])?.id
      // checkEvent refused any other ending before this.
      if (ending === undefined) throw new Error("no such visit ending")
      return {
        ...stamp,
        kind,
        offeredAt: String(record["offeredAt"]),
        ending,
      }
    }
    case "left": {
      return {
        ...stamp,
        kind,
        startedAt: String(record["startedAt"]),
        place: String(record["place"]),
      }
    }
    case "said": {
      return { ...stamp, kind, answer: String(record["answer"]) }
    }
    default: {
      const none: never = kind
      throw new Error(`no such kind of event: ${String(none)}`)
    }
  }
}
