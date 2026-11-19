/**
 * The interview week's pages (IW5, IW8; #2936, #3175), for
 * `../interview-fit.spec.ts`: the week as the routine writes one, with ready
 * answers, under a router of its own, on the simulated microphone and a
 * clock that holds still inside the week, so it never reads back as closed.
 */
import type { JSX } from "react"
import type { InterviewWeek } from "@some-ui/interview-week"

import { fakePorts, WEEK_2 } from "@/lib/interview-week/__tests__/fixture"
import type { InterviewWeekPorts } from "@/lib/interview-week/runtime"
import type { InterviewSent } from "@/lib/interview-week/spec"
import { RoutedInterview } from "@/components/jobs/interview/__tests__/routed"
import type { PastWeeksProps } from "@/components/jobs/interview/past"

const NOW = Date.parse("2026-11-17T18:00:00Z")

const ports = (): InterviewWeekPorts =>
  fakePorts({
    week: { week: WEEK_2, sha256: "a".repeat(64) },
    now: () => NOW,
    onVisibility: () => (): void => undefined,
    // The cue holds at its first second, so the fit is measured while it counts.
    every: () => (): void => undefined,
  }).ports

const sentOn = (week: string, at: string): InterviewSent => ({
  week,
  at,
  answers: WEEK_2.questions.map(({ id }) => ({
    question: id,
    take: `${week}-${id}`,
    recordedAt: at,
  })),
  reads: [],
  passed: [],
  passedReads: [],
})

const weekOf = (n: number): InterviewWeek => ({ ...WEEK_2, id: `2026-w${n}` })

/** Past weeks in each state an essay can stand in, as the route would read them. */
const PAST: PastWeeksProps = {
  weeks: [
    {
      week: weekOf(46),
      sent: sentOn("2026-w46", "2026-11-15T21:04:00Z"),
      essay: { kind: "making" },
    },
    {
      week: weekOf(45),
      sent: sentOn("2026-w45", "2026-11-08T19:30:00Z"),
      essay: { kind: "ready", key: "2026-w45" },
    },
    { week: weekOf(44), sent: null, essay: { kind: "failed" } },
    { week: weekOf(43), sent: null, essay: { kind: "expected" } },
  ],
  askAgain: null,
}

const Interview = (): JSX.Element => (
  <RoutedInterview ports={ports} past={PAST} />
)

export const INTERVIEW_FIXTURES = {
  interview: Interview,
} satisfies Record<string, () => JSX.Element>
