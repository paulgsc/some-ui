/**
 * The vocabulary every pipeline uses to say whether it gets used (ENGAGE
 * ENG1, epic #2533): five events, one closed union, so no wing invents its
 * own (LeetType's session log and Studio's sitting report each did, for
 * itself alone).
 *
 * - `offered`: an affordance was put in front of the owner, on a surface.
 *   What counts as the offer is the registry's, per affordance
 *   (`Affordance.offer`): shown on a list, served by a menu, or sent as a
 *   notification.
 * - `taken`: it was started.
 * - `passed-over`: it was offered, and the visit ended or moved on without
 *   it. How the visit ended is one of `VISIT_ENDINGS`, so no pipeline has to
 *   guess.
 * - `left`: it was started and stopped: where (one of the affordance's own
 *   places) and after how long (`at` less `startedAt`).
 * - `said`: a friction answer the owner gave, one of the affordance's own
 *   answers.
 *
 * "Came back" is not an event. The reading computes it from the stamps when
 * it is read (canon Prop. 3.2, "Absence is an observation"): the time since
 * a domain or an affordance was last taken is a fact about now, and a timer
 * that wrote rows for it would record the timer, not the owner.
 *
 * **What an event may carry** (CK's C3, the epic's default (a)): which
 * pipeline and affordance, which surface, timings, and how it ended. No
 * words, no audio, no item content. `checkEvent` holds that mechanically: it
 * refuses any field outside each kind's own, and any place, answer or
 * ending that is not a declared id, so free text has nowhere to go.
 */

/** Where an affordance is: the Android app, or the desktop web. */
export type Surface = "apk" | "web"

export const SURFACES: ReadonlyArray<Surface> = ["apk", "web"]

/** The five events, and nothing else: "came back" is computed (above). */
export const EVENT_KINDS = [
  "offered",
  "taken",
  "passed-over",
  "left",
  "said",
] as const

export type EventKind = (typeof EVENT_KINDS)[number]

/**
 * How a visit ends, for an offer it did not take: a closed list, in the
 * order `endingOf` prefers them when more than one is true at once.
 */
export const VISIT_ENDINGS = [
  {
    id: "put-away",
    name: "You put it away",
    when: "The owner dismissed the offer itself: swiped the notification away, closed the menu, or said not now.",
  },
  {
    id: "took-another",
    name: "You took something else",
    when: "Another affordance offered alongside it was taken instead.",
  },
  {
    id: "offer-changed",
    name: "It was replaced",
    when: "The app took the offer back: a newer one stood in its place, or the list it was on changed.",
  },
  {
    id: "moved-on",
    name: "You went elsewhere in the app",
    when: "The owner went to another screen, room or wing without taking it.",
  },
  {
    id: "left-the-app",
    name: "You put the app away",
    when: "The app went to the background, the tab was hidden, or the app or tab closed.",
  },
] as const

export type VisitEnding = (typeof VISIT_ENDINGS)[number]["id"]

/**
 * The one ending a passed-over offer records when several are true at once
 * (the owner swiped a reminder away and then left the app, say): the first
 * of `VISIT_ENDINGS` among them. Undefined when none is, which means the
 * visit has not ended for this offer yet.
 */
export function endingOf(
  seen: ReadonlySet<VisitEnding>
): VisitEnding | undefined {
  return VISIT_ENDINGS.find((ending) => seen.has(ending.id))?.id
}

/** What every event names: the affordance, where, and when (ISO 8601, UTC). */
type Stamp = {
  readonly pipeline: string
  readonly affordance: string
  readonly surface: Surface
  readonly at: string
}

export type EngagementEvent =
  | (Stamp & { readonly kind: "offered" })
  | (Stamp & { readonly kind: "taken" })
  | (Stamp & {
      readonly kind: "passed-over"
      /** When it was offered: the visit's start, for this offer. */
      readonly offeredAt: string
      readonly ending: VisitEnding
    })
  | (Stamp & {
      readonly kind: "left"
      /** When it was taken; `at` less this is how long it lasted. */
      readonly startedAt: string
      /** One of the affordance's places: where it stopped. */
      readonly place: string
    })
  | (Stamp & {
      readonly kind: "said"
      /** One of the affordance's answers. */
      readonly answer: string
    })

/** Every field each kind may carry, and no other (the payload limit). */
export const EVENT_FIELDS: {
  readonly [K in EventKind]: ReadonlyArray<
    keyof Extract<EngagementEvent, { kind: K }>
  >
} = {
  offered: ["kind", "pipeline", "affordance", "surface", "at"],
  taken: ["kind", "pipeline", "affordance", "surface", "at"],
  "passed-over": [
    "kind",
    "pipeline",
    "affordance",
    "surface",
    "at",
    "offeredAt",
    "ending",
  ],
  left: [
    "kind",
    "pipeline",
    "affordance",
    "surface",
    "at",
    "startedAt",
    "place",
  ],
  said: ["kind", "pipeline", "affordance", "surface", "at", "answer"],
}
