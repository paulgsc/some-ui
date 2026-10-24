/**
 * What Jobs' Today says, in the person's terms: what is on this phone, what
 * brings the rest, what is ready and what I have done, never the machinery
 * behind it (`__tests__/words.test.ts` holds it to the list in
 * `lib/home-link/__tests__/machinery.ts`).
 */
import { assertNever, counted } from "@some-ui/core-utils"
import type { Track } from "@some-ui/job-desk"

import type { Progress } from "./model"

/** The digest on show is from an earlier day than today's. */
export const notToday = (day: string): string =>
  `These are ${day}’s picks. Today’s aren’t on this phone yet.`

/** The digest on show is older than one this phone holds. */
export const newerHeld = (day: string): string =>
  `These are ${day}’s picks. Newer ones are on this phone too.`

/** Where today's picks come from when the phone is kept on home. */
export const arriveOnTheirOwn =
  "On the home Wi-Fi, today’s picks arrive by themselves: tap the home mark at the top and keep Jobs on home."

/** The picker, as the way in. */
export const openFromStorage = "Open today’s picks from storage"

/** The picker, once it is not the way in. */
export const orOpenFile = "Or open them from Drive"

/** What I have done in Jobs today, once there is something: never what is left. */
export const doneToday = (count: number): string =>
  `Today: ${count === 1 ? "one thing" : `${count} things`} done.`

/** Today with no pick left open. */
export const allDone = "That’s every pick for now."

export const pickedForYou = "Picked for you"

/** How well a pick fits, in words, from its fit score (0 to 1). */
export const fitWord = (fit: number): string =>
  fit >= 0.75 ? "Strong fit" : fit >= 0.5 ? "Good fit" : "A stretch"

/** What is ready before their form opens. */
export const readyHeading = "Ready for their form"

/** The résumé, once I said I have its PDF. */
export const resumeInHand = (variant: string): string =>
  `Résumé PDF in hand: ${variant}`

/** The résumé, before I have its PDF: built from the pick. */
export const resumeToBuild = (variant: string): string =>
  `Résumé to build from the pick: ${variant}`

export const coverLetterDrafted = "Cover letter drafted"

export const answersDrafted = (count: number): string =>
  count === 1 ? "One answer drafted" : `${count} answers drafted`

export const detailsToPaste = (count: number): string =>
  count === 1 ? "One detail to paste" : `${count} details to paste`

export const openIt = "Open it"

/** Browsing every pick, kept behind the one Today opens on. */
export const seeAll = (shown: boolean): string =>
  shown ? "Hide the other picks" : "See all of these picks"

/** The one disclosure of how the picks came to be. */
export const howPicked = "How these were picked"

/** How many postings were looked at, picked and left out on `day`. */
export const pickedFrom = (
  day: string,
  seen: number,
  picked: number,
  leftOut: number
): string =>
  `On ${day}, ${picked} picked from ${seen} postings looked at, and ${leftOut} left out.`

/** What a pick left unfinished holds, and until when. */
export const holdsPlace =
  "A pick holds its place until you pass on it, let it go, or send it and say how it went, and the morning’s picking has heard so. New picks fill only the places that are free."

const TRACK_ROLES: Readonly<Record<Track, string>> = {
  software: "software roles",
  adjacent: "software-adjacent roles",
}

/** How many of a track's places open picks hold. */
export const openOfTrack = (
  track: Track,
  open: number,
  places: number
): string => `${open} of ${places} ${TRACK_ROLES[track]}`

/** The places open picks hold, track by track. */
export const stillOpen = (parts: ReadonlyArray<string>): string =>
  `Still open on this phone: ${parts.join(" · ")}.`

/** The postings left out, behind their own toggle. */
export const leftOut = (shown: boolean, count: number): string =>
  `${shown ? "Hide" : "Show"} the postings left out (${count})`

export const noPicksYet = "No picks open yet"

/** What the mornings bring, before the first ones have come. */
export const whatMorningsBring = (software: number, adjacent: number): string =>
  `Each morning brings up to ${software} software roles and ${adjacent} software-adjacent ones, each matched against my résumé.`

export const trackHeading: Readonly<Record<Track, string>> = {
  software: "Software engineering",
  adjacent: "Software-adjacent",
}

/** Where a pick stands, in a word or two. */
export function pickState(progress: Progress): string {
  switch (progress.kind) {
    case "passed": {
      return "Passed"
    }
    case "archived": {
      return "Let go"
    }
    case "done": {
      return progress.result === "submitted" ? "Applied" : "Done"
    }
    case "open": {
      return progress.step === 0 ? "New" : "In progress"
    }
    default: {
      return assertNever(progress)
    }
  }
}

/** The list on show breaks some of the rules its picks are chosen by. */
export const breaksRules = (count: number, first: string): string =>
  `This list breaks ${count === 1 ? "one" : count} of the rules its picks are chosen by (first: ${first}). Its picks still open.`

/** Earlier days' picks still open when these were chosen. */
export const heldOver = (count: number, full: boolean): string =>
  `${counted(count, "pick")} from earlier days ${count === 1 ? "was" : "were"} still open${full ? ", so no new ones came" : ""}.`

/** Letting a day's undecided picks go, unread. */
export const letGoLabel = (count: number, day: string | null): string =>
  `Let ${day === null ? "" : `${day}’s `}${counted(count, "undecided pick")} go`

export const letGoAsk = (count: number): string =>
  `Let ${count === 1 ? "this pick" : `these ${count} picks`} go?`

export const letGoWhat =
  "Once the morning’s picking hears it, they stop holding their places, unread. You can still open one and decide it."

export const letGoConfirm = "Let them go"

export const letGoKeep = "Keep them"

/** The picks let go last, and when: the card that says where they went. */
export const letGoneAt = (count: number, time: string): string =>
  `${count === 1 ? "One pick" : `${count} picks`} let go at ${time}`

/** A posting left out that I would have picked. */
export const wouldHavePicked = "I’d have picked this"

export const saidWouldHavePicked =
  "You’d have picked this. Tomorrow’s picks take it into account."

export const whyItFits = "Why it fits"

export const keepWhy = "Keep it"
