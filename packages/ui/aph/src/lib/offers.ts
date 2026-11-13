/**
 * What aph offers, in the vocabulary of use (ENGAGE ENG9, #2542;
 * `@some-ui/engagement`'s registry, pipeline `aph`). Pure: the screen's
 * visit shows these and takes the one pressed.
 *
 * An offer's key names the item on screen (a day, an entry's id) so the
 * visit counts each once; no key leaves the phone, since an event carries
 * only the pipeline, the affordance and the surface.
 */
import type { Offer } from "@some-ui/engagement"

const offer = (affordance: string, item = ""): Offer => ({
  pipeline: "aph",
  affordance,
  surface: "apk",
  key: item === "" ? `aph:${affordance}` : `aph:${affordance}:${item}`,
})

/** The views' own offers: the log aph opens on, and History and Trend on its strip. */
export const APH_OFFERS = {
  logMine: offer("log-mine"),
  history: offer("history"),
  trend: offer("trend"),
} as const

/** History's "not logged" for `day`. */
export const missedDayOffer = (day: string): Offer => offer("missed-day", day)

/** "Enter their figure" for the entry `entryId`. */
export const theirFigureOffer = (entryId: string): Offer =>
  offer("their-figure", entryId)
