/**
 * What Jobs' Today and a pick say, in the person's terms: what is on this
 * phone, what brings the rest, what is ready, what I have done and how a pick
 * went, never the machinery
 * behind it (`__tests__/words.test.ts` holds it to the list in
 * `lib/home-link/__tests__/machinery.ts`).
 */
import { assertNever, counted, formatDay } from "@some-ui/core-utils"
import type { Track } from "@some-ui/job-desk"
import { LAPSE_DAYS } from "@some-ui/job-desk"

import type { DebriefResult, FrictionChip, PassReason, Standing } from "./model"

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

/** Opens a pick on its reading: what they want and where I fit. */
export const readIt = "Read it"

/** Takes a pick and goes on to its résumé. */
export const sendIt = "Send it"

/** Passes on a pick, no reason needed. */
export const notForMe = "Not for me"

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
export const holdsPlace = `A pick holds its place until you pass on it, or send it and say how it went, and the morning’s picking has heard so. One left untouched for ${LAPSE_DAYS} days lapses and frees its place. New picks fill only the places that are free.`

/** Earlier days' picks the morning's picking found had lapsed. */
export const lapsedEarlier = (count: number): string =>
  `${counted(count, "pick")} from earlier days lapsed, untouched for ${LAPSE_DAYS} days, so ${count === 1 ? "its place is" : "their places are"} free.`

/**
 * Picks I took here that the morning's picking lapsed anyway, since my
 * decision had not reached it yet.
 */
export const lapsedBeforeHeard = (count: number): string =>
  `${counted(count, "pick")} you took lapsed before the morning’s picking heard so; ${count === 1 ? "it holds its" : "they hold their"} place again once it does.`

/** Earlier days' lapsed picks, behind their own toggle. */
export const lapsedList = (shown: boolean, count: number): string =>
  `${shown ? "Hide" : "Show"} the picks that lapsed (${count})`

/** A pick that lapsed: since when, and that deciding it still counts. */
export const lapsedOn = (on: string): string =>
  `Lapsed on ${formatDay(on)}, untouched for ${LAPSE_DAYS} days, so it no longer holds a place. Taking or passing it now replaces that.`

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
export function pickState(progress: Standing): string {
  switch (progress.kind) {
    case "passed": {
      return "Passed"
    }
    case "archived": {
      return "Let go"
    }
    case "lapsed": {
      return "Lapsed"
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

/** A share the sheet made, said to have arrived in Drive. */
export const itArrived = "It arrived"

/** The share sheet again, for a share not yet said to have arrived. */
export const shareAgain = "Share again"

/** A posting left out that I would have picked. */
export const wouldHavePicked = "I’d have picked this"

export const saidWouldHavePicked =
  "You’d have picked this. Tomorrow’s picks take it into account."

export const whyItFits = "Why it fits"

export const keepWhy = "Keep it"

/** A pick's steps, as its step bar names them. */
export const steps = ["Read", "Decide", "Résumé", "Apply", "Ending"] as const

export const whatTheyWant = "What they want"

export const whereIFit = "Where I fit"

export const dontClaim = "Don’t claim"

/** Leaves the reading for the decision; it records nothing. */
export const onToDecide = "On to deciding"

/** Why I passed, from the run's list. */
export const passLabels: Readonly<Record<PassReason, string>> = {
  role: "Role",
  "customer-facing": "Customer-facing",
  seniority: "Seniority",
  pay: "Pay",
  location: "Location",
  company: "Company",
  closed: "Posting closed",
  other: "Other",
}

/** A pick I passed on. */
export const passedIt =
  "Not for you. That goes out with today’s decisions, with any reason you gave."

export const sendAfterAll = "Send it after all"

/** A pick let go with its digest before picks lapsed. */
export const archivedIt =
  "Let go with its digest, unread. Sending it or passing on it now replaces that."

/** What the two choices do, before either is made. */
export const decideHint =
  "Sending it moves on to the résumé. Not for me tells tomorrow’s picking, so it sends fewer like it. A reason helps but isn’t needed."

/** Opens the reasons behind "Not for me". */
export const sayWhyNot = "Not for me, and say why"

export const whyNot = "Why not?"

export const inAFewWords = "In a few words"

export const sayWhyAloud = "Or say why, up to a minute"

/** Passes on a pick with the reasons given. */
export const notForMeWithWhy = "Not for me, with this"

/** How applying ended, one tap each. */
export const endingLabels: Readonly<Record<DebriefResult, string>> = {
  submitted: "Sent",
  "gave-up": "Stopped partway",
  closed: "Couldn’t: posting closed",
}

export const howDidItEnd = "How did it end?"

/** Opens what else I can say about applying; none of it is needed. */
export const addHowItWent = "Add how it went"

/** The extras, once opened. */
export const howItWentHint =
  "All of this is optional, and goes with the ending you tap above."

export const howLong = "How long it took, in minutes"

/** The minutes typed don't fit; `most` is the longest, in minutes. */
export const minutesRange = (most: number): string =>
  `Whole minutes, up to ${most / 60} hours, or leave it empty.`

export const frictionHeading = "Friction"

export const frictionScale = "1 smooth · 5 nearly gave up"

export const whatGotInTheWay = "What got in the way"

/** What got in the way, from the run's list. */
export const frictionLabels: Readonly<Record<FrictionChip, string>> = {
  "account-wall": "Account wall",
  "company-ats": "Sent to company ATS",
  "retyped-resume": "Re-typed my résumé",
  assessment: "Assessment",
  "cover-letter": "Cover letter",
  "long-questionnaire": "Long questionnaire",
  "form-broke": "Form broke",
}

export const whatHappened = "What happened"

export const sayItAloud = "Or say it, up to a minute"

/** A pick whose ending I gave. */
export const endedAs = (result: DebriefResult): string =>
  `Ended: ${endingLabels[result]}. Add replies and interviews under Record as they come.`
