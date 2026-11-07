/**
 * A visit to a pipeline's screen, as the vocabulary sees it (ENGAGE ENG3,
 * #2536; the pattern every pipeline story reuses): what was offered, what
 * was taken, and, when the visit ends, each offer left untaken as
 * `passed-over` with how the visit ended.
 *
 * - **An offer is counted once a visit.** A list that re-renders, or names
 *   the same card again, offers nothing new; a new visit (after the app
 *   comes back to the front) offers again what is still listed.
 * - **How an untaken offer ended** is `endingOf` over what was true: the
 *   visit's own ending, and `took-another` when something else was taken.
 * - **Pure.** `stepVisit` returns the events and the next state; this module's
 *   `createVisit` is the runtime a screen holds, and `engage`s each event.
 */
import type {
  EngagementEvent,
  Surface,
  VisitEnding,
} from "@engagement/lib/events"
import { endingOf } from "@engagement/lib/events"
import { engage } from "@engagement/lib/sink"

/** One thing on screen: its affordance, and the item it is (`key`). */
export type Offer = {
  readonly pipeline: string
  readonly affordance: string
  readonly surface: Surface
  /** Unique on the screen: the affordance and the item it offers. */
  readonly key: string
}

export type VisitState = {
  /** Offered this visit, by key, with when. */
  readonly offered: ReadonlyMap<string, { offer: Offer; at: string }>
  readonly taken: ReadonlySet<string>
}

export const NEW_VISIT: VisitState = { offered: new Map(), taken: new Set() }

export type VisitStep =
  | { readonly type: "offer"; readonly offer: Offer; readonly at: string }
  | { readonly type: "take"; readonly offer: Offer; readonly at: string }
  | { readonly type: "end"; readonly ending: VisitEnding; readonly at: string }

const stamp = (
  { pipeline, affordance, surface }: Offer,
  at: string
): { pipeline: string; affordance: string; surface: Surface; at: string } => ({
  pipeline,
  affordance,
  surface,
  at,
})

export function stepVisit(
  state: VisitState,
  step: VisitStep
): { state: VisitState; events: ReadonlyArray<EngagementEvent> } {
  switch (step.type) {
    case "offer": {
      if (state.offered.has(step.offer.key)) return { state, events: [] }
      const offered = new Map(state.offered)
      offered.set(step.offer.key, { offer: step.offer, at: step.at })
      return {
        state: { ...state, offered },
        events: [{ ...stamp(step.offer, step.at), kind: "offered" }],
      }
    }
    case "take": {
      const taken = new Set(state.taken)
      taken.add(step.offer.key)
      return {
        state: { ...state, taken },
        events: [{ ...stamp(step.offer, step.at), kind: "taken" }],
      }
    }
    case "end": {
      const seen = new Set<VisitEnding>([step.ending])
      if (state.taken.size > 0) seen.add("took-another")
      const ending = endingOf(seen) ?? step.ending
      const events: Array<EngagementEvent> = []
      for (const [key, { offer, at }] of state.offered) {
        if (state.taken.has(key)) continue
        events.push({
          ...stamp(offer, step.at),
          kind: "passed-over",
          offeredAt: at,
          ending,
        })
      }
      return { state: NEW_VISIT, events }
    }
    default: {
      const none: never = step
      throw new Error(`no such visit step: ${JSON.stringify(none)}`)
    }
  }
}

/** The runtime a screen holds for one visit after another. */
export type Visit = {
  /** What the screen lists now: each not yet offered this visit is offered. */
  readonly list: (offers: ReadonlyArray<Offer>) => void
  readonly take: (offer: Offer) => void
  /** Ends the visit: each untaken offer is passed over. */
  readonly end: (ending: VisitEnding) => void
  /** A new visit, offering again what the screen last listed. */
  readonly resume: () => void
}

export function createVisit(
  clock: () => Date = () => new Date(),
  send: (event: EngagementEvent) => void = engage
): Visit {
  let state = NEW_VISIT
  let listed: ReadonlyArray<Offer> = []
  const run = (step: VisitStep): void => {
    const next = stepVisit(state, step)
    state = next.state
    for (const event of next.events) send(event)
  }
  const at = (): string => clock().toISOString()
  const list = (offers: ReadonlyArray<Offer>): void => {
    listed = offers
    for (const offer of offers) run({ type: "offer", offer, at: at() })
  }
  return {
    list,
    take: (offer) => run({ type: "take", offer, at: at() }),
    end: (ending) => run({ type: "end", ending, at: at() }),
    resume: () => list(listed),
  }
}
