/**
 * The work tracker's spans (RR26, paulgsc/some-ui#3250; paulgsc/server#1008),
 * in the Rust Rounds lane after what it keeps for good (`./rust-kept`): each
 * start and close this phone kept (`@some-ui/rust-rounds`' `workSpans`, the
 * outbox) that home doesn't hold goes as kept, then the weeks the tracker
 * draws are read back (`exchangeWorkSpans`, the one reading of home's
 * answers about spans).
 *
 * What home said of each event is remembered under the pairing (`./sent`'s
 * `rustSpans`): `held`, or `refused` for good, which is never sent again.
 * Lost, it only means sending again, which home answers as unchanged, or
 * refuses the same way. The phone lets go of nothing here.
 *
 * What home last said of the weeks and of the span open now lives for the
 * page load: the tracker reads it (`spansOpenAtHome`, undefined until a run
 * has heard it with nothing of this phone's waiting) and so does the week's
 * time (`homeWeekSpans`).
 */
import type { HomeCall, HomeExchanged, KeyedStorage } from "@some-ui/core-utils"
import type {
  EventAtHome,
  HomeSpan,
  OpenSpan,
  SpanEvent,
} from "@some-ui/rust-rounds"
import { eventKey, exchangeWorkSpans, workSpans } from "@some-ui/rust-rounds"

import { browserLocalStorage } from "@/lib/tenant/storage"

import { pairing } from "./index"
import type { Sent } from "./sent"
import { readSent, rememberSent, sentUnder } from "./sent"

/** The most weeks one run reads back. */
const WEEK_READS = 3

let heardWeeks: Readonly<Record<string, ReadonlyArray<HomeSpan>>> = {}
let heardOpen: OpenSpan | null | undefined
const listeners = new Set<() => void>()

/** The span home holds open, once a run heard it with nothing waiting. */
export const spansOpenAtHome = (): OpenSpan | null | undefined => heardOpen

/** Week `week`'s spans as home last said, this page load. */
export const homeWeekSpans = (week: string): ReadonlyArray<HomeSpan> =>
  heardWeeks[week] ?? []

/** Calls `listener` each time a run hears home on spans. Returns the stop. */
export function onSpansHeard(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * What `memory` says home holds of each event, by `eventKey`: a close is
 * refused with its start, since home holds no start for it to close.
 */
export function spanAtHome(memory: Sent | null): (key: string) => EventAtHome {
  const said = (key: string): EventAtHome => {
    const word = memory?.rustSpans[key]
    return word === "held" || word === "refused" ? word : "waiting"
  }
  return (key) => {
    const [id = "", kind] = key.split("/")
    if (kind === "close" && said(`${id}/start`) === "refused") {
      return "refused"
    }
    return said(key)
  }
}

/** Whether home refused the event for good, under the pairing held now. */
export const spanRefused = (key: string): boolean =>
  spanAtHome(sentUnder(browserLocalStorage, pairing()))(key) === "refused"

/** Each event's key and what home holds of it: the lane's revision. */
export const spansRevision = (): string => {
  const atHome = spanAtHome(sentUnder(browserLocalStorage, pairing()))
  return (workSpans(browserLocalStorage).list() ?? [])
    .map((event) => `${eventKey(event)}@${atHome(eventKey(event))}`)
    .join("|")
}

/** The weeks a run reads: `current`, then those with an event waiting. */
function weeksToRead(
  events: ReadonlyArray<SpanEvent>,
  atHome: (key: string) => EventAtHome,
  current: string | null
): Array<string> {
  const startWeek = new Map(
    events.flatMap((each) =>
      each.kind === "start" ? [[each.id, each.week] as const] : []
    )
  )
  const waiting = events.flatMap((event) => {
    if (atHome(eventKey(event)) !== "waiting") return []
    const week = startWeek.get(event.id)
    return week === undefined ? [] : [week]
  })
  return [
    ...new Set([...(current === null ? [] : [current]), ...waiting]),
  ].slice(0, WEEK_READS)
}

/**
 * Sends each event home doesn't hold, then reads back `current` and the
 * weeks of what was waiting, under `pairing`. Throws what `send` throws when
 * home doesn't answer.
 */
export async function sendRustSpans(
  send: HomeCall,
  storage: KeyedStorage | null,
  pairing: string,
  current: string | null
): Promise<HomeExchanged> {
  const memory = readSent(storage, pairing)
  const atHome = spanAtHome(memory)
  const events = workSpans(storage).list() ?? []
  const done = await exchangeWorkSpans(
    send,
    events,
    atHome,
    weeksToRead(events, atHome, current)
  )
  const said = Object.fromEntries(
    Object.entries(done.said).filter(([, word]) => word !== "again")
  )
  if (Object.keys(said).length > 0) {
    rememberSent(storage, memory, { rustSpans: said })
  }
  heardWeeks = { ...heardWeeks, ...done.weeks }
  heardOpen = done.open
  for (const listener of listeners) listener()
  return done.exchanged
}
