/**
 * What Practice Home offers, in the vocabulary of use (ENGAGE, #2533;
 * `@some-ui/engagement`'s registry): the study card's Start or Resume,
 * TOPIK's Next lesson and "What are you hungry for?" beside it, "Not today?
 * Say why", and Rust Rounds' card. Pure: the page's visit (`createVisit`)
 * shows these and takes the one pressed.
 */
import type { Offer } from "@some-ui/engagement"

const offer = (pipeline: string, affordance: string): Offer => ({
  pipeline,
  affordance,
  surface: "apk",
  key: `${pipeline}:${affordance}`,
})

export const HOME_OFFERS = {
  start: offer("study", "start"),
  resume: offer("study", "resume"),
  nextLesson: offer("topik", "next-lesson"),
  hungry: offer("topik", "hungry"),
  sayWhy: offer("bites", "say-why"),
  rustRounds: offer("rust-rounds", "home-card"),
} as const

/** What the study card shows of them, once its sessions are read. */
export function studyCardOffers(card: {
  /** A session is open: Resume (or Pick up) stands where Start would. */
  readonly open: boolean
  /** TOPIK's two buttons are on the card. */
  readonly lessons: boolean
  /** Studied today: "Not today? Say why" is gone. */
  readonly done: boolean
}): Array<Offer> {
  return [
    card.open ? HOME_OFFERS.resume : HOME_OFFERS.start,
    ...(card.lessons ? [HOME_OFFERS.nextLesson, HOME_OFFERS.hungry] : []),
    ...(card.done ? [] : [HOME_OFFERS.sayWhy]),
  ]
}
