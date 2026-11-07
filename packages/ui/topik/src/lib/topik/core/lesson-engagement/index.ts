/**
 * What the phone's lesson list offers, in the vocabulary of use (ENGAGE
 * ENG3, #2536; `@some-ui/engagement`'s registry, pipeline `topik`): each
 * "From the routine" card the list shows (its first few, or what a search
 * or a level finds), as its read-aloud set, its grammar-lens set or its
 * drama, and each word set "Ready for you" it shows. Pure: the list shows
 * these on the lesson's visit (`createVisit`), and the lesson takes the one
 * pressed.
 *
 * A scene's two sets are two offers, so home can tell read-aloud from the
 * lens: opening one is taking it, and the other is passed over.
 */
import type { Offer } from "@some-ui/engagement"
import type { LessonItem } from "@topik/lib/topik/core/lesson-feed"
import type { SetPractice } from "@topik/lib/topik/read-aloud/content"

const AFFORDANCE_OF: Record<SetPractice, string> = {
  "read-aloud": "routine-read-aloud",
  lens: "routine-lens",
}

const offer = (affordance: string, item: string): Offer => ({
  pipeline: "topik",
  affordance,
  surface: "apk",
  key: `${affordance}:${item}`,
})

/** A routine card's offer for one set, or for its drama. */
export function routineOffer(
  item: Pick<LessonItem, "key" | "kind">,
  practice: SetPractice | undefined
): Offer {
  return item.kind === "drama"
    ? offer("routine-drama", item.key)
    : offer(AFFORDANCE_OF[practice ?? "read-aloud"], item.key)
}

/** A word set "Ready for you", by its id. */
export const readySetOffer = (id: string): Offer => offer("ready-set", id)

/**
 * What an added set `id` is offered as: its routine card's set when a card
 * holds it (a scene's other set, once one was opened), else a set "Ready
 * for you".
 */
export function offerOfSet(
  items: ReadonlyArray<LessonItem>,
  id: string
): Offer {
  for (const item of items) {
    const session = item.sessions.find((one) => one.id === id)
    if (session !== undefined) return routineOffer(item, session.practice)
  }
  return readySetOffer(id)
}

/** What the "From the routine" cards shown offer. */
export function routineOffers(items: ReadonlyArray<LessonItem>): Array<Offer> {
  return items.flatMap((item) =>
    item.kind === "drama"
      ? [routineOffer(item, undefined)]
      : item.sessions.map((session) => routineOffer(item, session.practice))
  )
}
