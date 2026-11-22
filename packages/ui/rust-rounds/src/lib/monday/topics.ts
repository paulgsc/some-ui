/**
 * What next week comes back to (RR18, paulgsc/some-ui#2693): chosen by code,
 * so two runs over the same mailbox choose the same.
 *
 * In order:
 *
 * 1. **Your own errors.** Each error pasted in a week that ended seeds a
 *    ticket (the owner's answer on #2685), at most `SEEDS_MOST`.
 * 2. **What the decay record marks due** (RR19, #2695,
 *    `@rust-rounds/lib/decay`): concepts that decayed, may have faded, or are
 *    met and not yet known, each past its Leitner recheck, in its order.
 * 3. **The references' areas** (`AREAS`): the area no week touched longest
 *    ago first, one never touched before any, ties in the table's order.
 *
 * A topic is a concept id: next week's tickets must name each one in their
 * `concepts`, so the decay record later counts it under the same row.
 */
import type { DueConcept } from "@rust-rounds/lib/decay"
import type { Reference, Week } from "@rust-rounds/lib/formats/week"

/** An area of a reference a ticket can press on: a concept, by its stable id. */
export type Area = {
  readonly id: string
  readonly name: string
  readonly reference: Reference
}

/**
 * The areas of the named references a week can be about. Every program uses
 * only `std`, so the Async Book's areas are ones a small hand-written
 * executor or a `Send` bound can show.
 */
export const AREAS: ReadonlyArray<Area> = [
  {
    id: "borrows-into-a-reused-buffer",
    name: "Borrows into a reused buffer",
    reference: "ownership-inventory",
  },
  {
    id: "moves-out-of-collections",
    name: "Moves out of collections",
    reference: "ownership-inventory",
  },
  {
    id: "aliasing-and-mutation",
    name: "Aliasing and mutation",
    reference: "ownership-inventory",
  },
  {
    id: "lifetime-elision",
    name: "Lifetime elision",
    reference: "rust-reference",
  },
  {
    id: "closures-and-captures",
    name: "Closures and what they capture",
    reference: "rust-reference",
  },
  {
    id: "trait-objects-and-dispatch",
    name: "Trait objects and dynamic dispatch",
    reference: "rust-reference",
  },
  {
    id: "drop-order",
    name: "Drop order and destructors",
    reference: "rust-reference",
  },
  {
    id: "integer-overflow",
    name: "Integer overflow and arithmetic",
    reference: "rust-reference",
  },
  {
    id: "static-and-threads",
    name: "'static and threads",
    reference: "rustonomicon",
  },
  { id: "send-and-sync", name: "Send and Sync", reference: "rustonomicon" },
  {
    id: "interior-mutability",
    name: "Interior mutability",
    reference: "rustonomicon",
  },
  {
    id: "allocation-on-the-hot-path",
    name: "Allocation on the hot path",
    reference: "rustonomicon",
  },
  {
    id: "futures-held-across-await",
    name: "What a future holds across an await",
    reference: "async-book",
  },
  {
    id: "cancellation-safety",
    name: "Cancellation safety",
    reference: "async-book",
  },
]

/** The most pasted errors one week is built from; a week has at most 4 tickets. */
export const SEEDS_MOST = 3

/** One error pasted in a week that ended, and what the owner said about it. */
export type Seed = {
  /** The week it was pasted in. */
  readonly week: string
  /** When it was pasted: names it. */
  readonly at: string
  readonly text: string
  /** What home heard in the note said on it, or null. */
  readonly said: string | null
}

export type Topic = {
  readonly id: string
  readonly name: string
  /** The reference it is judged against; null for a decay-record concept outside `AREAS`. */
  readonly reference: Reference | null
  readonly why: "due" | "area"
}

export type TopicChoice = {
  readonly seeds: ReadonlyArray<Seed>
  /** Pasted errors past `SEEDS_MOST`, oldest last, for the run's summary. */
  readonly notSeeded: ReadonlyArray<Seed>
  readonly topics: ReadonlyArray<Topic>
}

/** The week id each area was last touched in, by the weeks' tickets' concepts. */
function lastTouched(weeks: ReadonlyArray<Week>): Map<string, string> {
  const last = new Map<string, string>()
  for (const week of weeks) {
    for (const ticket of week.tickets) {
      for (const concept of ticket.concepts) {
        const held = last.get(concept.id)
        if (held === undefined || week.id > held) last.set(concept.id, week.id)
      }
    }
  }
  return last
}

/**
 * Next week's seeds and topics. With three seeds there is room for one topic,
 * otherwise two, so a week stays within four tickets.
 */
export function chooseTopics({
  weeks,
  seeds,
  due,
}: {
  /** Every week the mailbox holds, ended or not. */
  readonly weeks: ReadonlyArray<Week>
  readonly seeds: ReadonlyArray<Seed>
  /** The decay record's concepts due, in its order (RR19). */
  readonly due: ReadonlyArray<DueConcept>
}): TopicChoice {
  const ordered = [...seeds].sort((a, b) =>
    a.at === b.at ? 0 : Date.parse(a.at) < Date.parse(b.at) ? -1 : 1
  )
  const taken = ordered.slice(0, SEEDS_MOST)
  const room = taken.length >= SEEDS_MOST ? 1 : 2
  const topics: Array<Topic> = []
  const chosen = new Set<string>()
  for (const concept of due) {
    if (topics.length >= room || chosen.has(concept.id)) continue
    const area = AREAS.find((a) => a.id === concept.id)
    topics.push({
      id: concept.id,
      name: concept.name,
      reference: area?.reference ?? null,
      why: "due",
    })
    chosen.add(concept.id)
  }
  const last = lastTouched(weeks)
  const byAge = AREAS.map((area, order) => ({ area, order }))
    .filter(({ area }) => !chosen.has(area.id))
    .sort((a, b) => {
      const at = last.get(a.area.id) ?? ""
      const bt = last.get(b.area.id) ?? ""
      return at === bt ? a.order - b.order : at < bt ? -1 : 1
    })
  for (const { area } of byAge) {
    if (topics.length >= room) break
    topics.push({ ...area, why: "area" })
  }
  return { seeds: taken, notSeeded: ordered.slice(SEEDS_MOST), topics }
}
