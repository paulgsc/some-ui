/**
 * The interview week's ports on the phone (IW5, paulgsc/some-ui#2936): the
 * weeks home holds and what was sent, in this device's storage (`./store`),
 * the week's takes on a desk of their own (`lib/takes-desk`), the clock and
 * the page. Nothing here reaches the network: the week plays from what is on
 * the phone. Phone-only (`build.paths.ts`).
 *
 * A take waits on this phone until the week is sent (`send: "on-confirm"`),
 * then goes home as a voice note said `of=interview`, named by its line,
 * `<week>:<question>` or `<week>:read:<card>` (IW1;
 * `lib/home-link/voice-copy`). A take runs up to 2 minutes (owner,
 * 2026-11-13). No count of its own: only the device's room refuses a take.
 * No set-aside marks: a take here is let go only by the week's Delete, Redo
 * or clean-up before Send, for good, and only while it waits.
 */
import { onPageVisibility } from "@some-ui/voice-capture"

import { patternDesk } from "@/lib/takes-desk"
import { browserLocalStorage } from "@/lib/tenant/storage"

import type { InterviewWeekPorts } from "./runtime"
import { currentInterview } from "./runtime"
import type { InterviewsStore } from "./store"
import { heldWeeks, TAKES_KEY } from "./store"
import { INTERVIEW_TAKE_LIMITS, INTERVIEW_TAKE_SHAPE } from "./take"

const desk = patternDesk({
  key: TAKES_KEY,
  screen: "interview-week",
  from: null,
  dbName: "some-ui.interview-week-takes",
  limits: INTERVIEW_TAKE_LIMITS,
  shape: INTERVIEW_TAKE_SHAPE,
})

/** The week's desk, for the copy home (`lib/home-link/voice-copy`). */
export const interviewDesk = desk

/** Audio no take names, and one whose audio never landed. */
export function sweepInterviewTakes(): void {
  desk.sweep()
}

let weeks: InterviewsStore | null = null

/** The weeks this phone holds, which the interview lane fills from home: one per page load. */
export function phoneInterviews(): InterviewsStore {
  weeks ??= heldWeeks(browserLocalStorage)
  return weeks
}

/**
 * The week's ports, with the week open now among those this phone holds, or
 * null while it holds none; how home is reached is handed in by the route.
 */
export function phoneInterviewPorts(
  reach: Pick<InterviewWeekPorts, "home" | "homeHolds" | "onHomeHolds">
): InterviewWeekPorts | null {
  const week = currentInterview(phoneInterviews().held().weeks, Date.now())
  return week === null
    ? null
    : {
        ...reach,
        week,
        takes: desk.phone(),
        storage: browserLocalStorage,
        now: () => Date.now(),
        newId: () => crypto.randomUUID(),
        onVisibility: onPageVisibility,
        every: (ms, tick) => {
          const timer = setInterval(tick, ms)
          return (): void => clearInterval(timer)
        },
      }
}
