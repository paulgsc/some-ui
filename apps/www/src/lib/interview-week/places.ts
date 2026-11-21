/**
 * Which of the interview week's places a route is (`@some-ui/engagement`'s
 * registry: pipeline `jobs`, affordance `interview-week`), for the
 * walkthrough's honest friction (WALK5, C861). Pure; a route of the week
 * this does not know is no place, so nothing it sends names one the
 * registry lacks.
 */

/** The week's places, as the registry names them. */
export type InterviewPlace =
  | "way-in"
  | "questions"
  | "question"
  | "study"
  | "aloud"
  | "say"
  | "reads"
  | "read"
  | "how"
  | "past"

/** The week's own lists and pages, by their route's last part. */
const PAGES: Readonly<Record<string, InterviewPlace>> = {
  questions: "questions",
  reads: "reads",
  how: "how",
  past: "past",
}

/** A question's rungs, by their route's last part. */
const RUNGS: Readonly<Record<string, InterviewPlace>> = {
  study: "study",
  aloud: "aloud",
  say: "say",
}

/** The place `pathname` is, under the week's own route, or null. */
export function interviewPlaceOf(pathname: string): InterviewPlace | null {
  const parts = pathname.split("/").filter(Boolean)
  if (parts[0] !== "jobs" || parts[1] !== "interview") return null
  if (parts.length === 2) return "way-in"
  const page = parts[2] ?? ""
  if (parts.length === 3) {
    return Object.hasOwn(PAGES, page) ? (PAGES[page] ?? null) : null
  }
  if (page === "reads" && parts.length === 4) return "read"
  if (page !== "q") return null
  if (parts.length === 4) return "question"
  const rung = parts[4] ?? ""
  return parts.length === 5 && Object.hasOwn(RUNGS, rung)
    ? (RUNGS[rung] ?? null)
    : null
}
