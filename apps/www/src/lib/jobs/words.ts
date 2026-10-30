/**
 * What Jobs' Today, a pick and the scout form say, in the person's terms: what
 * is on this phone, what brings the rest, what is ready, what I have done, how
 * a pick went and what a scout needs, never the machinery
 * behind it (`__tests__/words.test.ts` holds it to the list in
 * `lib/home-link/__tests__/machinery.ts`).
 */
import {
  assertNever,
  counted,
  formatDay,
  formatMonth,
} from "@some-ui/core-utils"
import type { Track } from "@some-ui/job-desk"
import { LAPSE_DAYS } from "@some-ui/job-desk"

import type {
  Course,
  DebriefResult,
  FrictionChip,
  Outcome,
  PassReason,
  ShareKind,
  Standing,
} from "./model"
import type { NoticeState } from "./notice"
import type { Pivot, Sort, Stand } from "./record-view"
import { STANDS } from "./record-view"
import type { NoticeView } from "./runtime"

/** The digest on show is from an earlier day than today's. */
export const notToday = (day: string): string =>
  `These are ${formatDay(day)}’s picks.`

/** The digest on show is older than one this phone holds. */
export const newerHeld = (day: string): string =>
  `These are ${formatDay(day)}’s picks. Newer ones are on this phone too.`

/** The file picker, where Drive is a way in (`lib/jobs/morning`). */
export const openFromDrive = "Open picks from Drive"

/** Each kind of file Jobs sends its run, as its card and the status page name it. */
export const FILE_NAMES = {
  decisions: "Today’s decisions",
  scouts: "My scouts",
} as const satisfies Record<ShareKind, string>

/** What I have done in Jobs today, once there is something: never what is left. */
export const doneToday = (count: number): string =>
  `Today: ${count === 1 ? "one thing" : `${count} things`} done.`

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

export const sendIt = "Send it"

export const notForMe = "Not for me"

/** Browsing every pick, kept behind the one Today opens on. */
export const seeAll = (shown: boolean): string =>
  shown ? "Hide the other picks" : "See all of these picks"

/** The one disclosure of how the picks came to be. */
export const howPicked = "How these were picked"

/**
 * How many postings `day`'s run read, picked and left out. A digest does
 * not list the rest: ones already decided, scouts it answered apart, those
 * below the cut, and any past the list's cap.
 */
export const pickedFrom = (
  day: string,
  today: string,
  seen: number,
  picked: number,
  leftOut: number
): string => {
  const unlisted = seen - picked - leftOut
  const when = day === today ? "This morning" : `On ${formatDay(day)}`
  return `${when} the run read ${counted(seen, "posting")}: ${picked} picked, ${leftOut} left out${unlisted > 0 ? `, and ${unlisted} not listed` : ""}.`
}

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

export const endedAs = (result: DebriefResult): string =>
  `Ended: ${endingLabels[result]}. Add replies and interviews under Record as they come.`

/** What has happened to an application since it was sent, one tap each. */
export const outcomeLabels: Readonly<Record<Outcome, string>> = {
  viewed: "Viewed",
  reply: "Reply",
  screen: "Screen",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  "no-reply-30d": "No reply in 30 days",
}

/** An outcome as its card lists it: "Rejected Oct 30". */
export const outcomeOn = (event: Outcome, on: string): string =>
  `${outcomeLabels[event]} ${formatDay(on)}`

/** The outcomes a card lists, each tappable to take back. */
export const recordedOutcomes = "What I recorded"

/** Asked before taking back an outcome, named as `outcomeOn` says it. */
export const takeBackAsk = (outcome: string): string =>
  `Take back “${outcome}”?`

export const takeBackWhy =
  "Do this if it was a mistake or no longer holds. It stays in the record and no longer counts."

export const takeBack = "Take it back"

/** The badge on an application's card under Record: where it stands. */
export function courseBadge(course: Course): string {
  switch (course.kind) {
    case "applying": {
      return "In progress"
    }
    case "unsent": {
      return course.result === "gave-up"
        ? endingLabels["gave-up"]
        : "Posting closed"
    }
    case "waiting": {
      return course.reached ? outcomeLabels[course.reached] : "Waiting"
    }
    case "ended": {
      return outcomeLabels[course.by]
    }
    default: {
      return assertNever(course)
    }
  }
}

/** The line on an application's card: what it still waits on, if anything. */
export function courseSays(course: Course): string | null {
  switch (course.kind) {
    case "applying": {
      return null
    }
    case "unsent": {
      return "Never sent, so nothing to wait for."
    }
    case "waiting": {
      return course.reached === null || course.reached === "viewed"
        ? `Sent ${formatDay(course.since)}. Waiting to hear.`
        : `Sent ${formatDay(course.since)}. Heard back; waiting on the next step.`
    }
    case "ended": {
      return "Nothing more to wait for."
    }
    default: {
      return assertNever(course)
    }
  }
}

/** Opens, or closes, what an ended application can still record. */
export const heardSince = (open: boolean): string =>
  open ? "Leave it as it is" : "Heard something since?"

/** How an application stands, as Record's filter, chart and table name it. */
export const standLabels: Readonly<Record<Stand, string>> = {
  waiting: "Waiting",
  heard: "Heard back",
  offer: "Offer",
  rejected: "Rejected",
  silent: "No reply",
  applying: "In progress",
  unsent: "Not sent",
}

/** The filter chip that shows every application. */
export const allStands = "All"

export const standFilter = "Show"

export const sortHeading = "Sort"

export const sortLabels: Readonly<Record<Sort, string>> = {
  newest: "Newest",
  oldest: "Oldest",
  waiting: "Waiting longest",
  company: "Company",
}

export const pivotHeading = "How they stand"

export const pivotLabels: Readonly<Record<Pivot, string>> = {
  week: "By week",
  month: "By month",
  company: "By company",
}

/** A pivot group's name: a week by its Monday, a month, a company, or the rest. */
export function pivotKey(pivot: Pivot, key: string | null): string {
  if (key === null) {
    return pivot === "company"
      ? "Other companies"
      : pivot === "week"
        ? "Earlier weeks"
        : "Earlier months"
  }
  switch (pivot) {
    case "week": {
      return `Week of ${formatDay(key)}`
    }
    case "month": {
      return formatMonth(key)
    }
    case "company": {
      return key
    }
    default: {
      return assertNever(pivot)
    }
  }
}

/** What one bar of the chart holds, said when it is tapped. */
export const pivotSays = (
  group: string,
  counts: Readonly<Record<Stand, number>>
): string =>
  `${group}: ${STANDS.filter((s) => counts[s] > 0)
    .map((s) => `${standLabels[s]} ${counts[s]}`)
    .join(" · ")}`

/** The outcomes a card still offers. */
export const whatHappenedSince = "What happened since"

export const showAs = (table: boolean): string =>
  table ? "Show as chart" : "Show as table"

export const findApplication = "Find a company or role"

export const noneMatch = "No application matches."

/** Under a scout's link whose host the morning run can't open (`linkReach`). */
export const cantOpenLink =
  "The run can’t open this link: paste the posting itself"

/** The posting text's label: needed for a link the run can't open. */
export const postingTextLabel = (needed: boolean): string =>
  needed ? "Posting text" : "Posting text, optional"

/** The posting text's placeholder. */
export const postingTextHint =
  "Paste the posting itself, its description word for word"

/** The arrival notice's control (`./notice`, Settings' Jobs row). */
export const NOTICE_WORDS = {
  label: "Tell me when the morning run is in",
  off: "Home sends this phone a notification when the morning run has picked, picked nothing or couldn’t finish. Google carries it, so it says only that.",
  asking: "Asking Android…",
  onFiled: "On. Home tells this phone when the morning run is in.",
  onWaiting:
    "On. Home starts telling this phone the next time Jobs reaches it on the home Wi‑Fi.",
  notAllowed:
    "Android won’t let Jobs show notifications. Turn them on in the app’s settings, then try again.",
  failed: "That didn’t work. Try again.",
} as const

/** What the control says under it, from what the record and the ask hold. */
export function noticeSaid(
  notice: NoticeState,
  view: Pick<NoticeView, "asking" | "why">
): string {
  if (view.asking) return NOTICE_WORDS.asking
  if (view.why === "not-allowed") return NOTICE_WORDS.notAllowed
  if (view.why === "failed") return NOTICE_WORDS.failed
  if (!notice.wanted) return NOTICE_WORDS.off
  return notice.token !== null && notice.filed === notice.token
    ? NOTICE_WORDS.onFiled
    : NOTICE_WORDS.onWaiting
}
