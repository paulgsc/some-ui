/**
 * What Practice Home offers, in the vocabulary of use (ENGAGE, #2533;
 * `@some-ui/engagement`'s registry). Pure: the page's visit shows these and
 * takes the one pressed.
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
}): Array<Offer> {
  return [
    card.open ? HOME_OFFERS.resume : HOME_OFFERS.start,
    ...(card.lessons ? [HOME_OFFERS.nextLesson, HOME_OFFERS.hungry] : []),
  ]
}
