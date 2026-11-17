/**
 * The interview week's pages (IW5, IW8; #2936, #3175), for
 * `../interview-fit.spec.ts`: the week as the routine writes one, with ready
 * answers, under a router of its own, on the simulated microphone and a
 * clock that holds still inside the week, so it never reads back as closed.
 */
import type { JSX } from "react"

import { fakePorts, WEEK_2 } from "@/lib/interview-week/__tests__/fixture"
import type { InterviewWeekPorts } from "@/lib/interview-week/runtime"
import { RoutedInterview } from "@/components/jobs/interview/__tests__/routed"

const NOW = Date.parse("2026-11-17T18:00:00Z")

const ports = (): InterviewWeekPorts =>
  fakePorts({
    week: { week: WEEK_2, sha256: "a".repeat(64) },
    now: () => NOW,
    onVisibility: () => (): void => undefined,
    // The cue holds at its first second, so the fit is measured while it counts.
    every: () => (): void => undefined,
  }).ports

const Interview = (): JSX.Element => <RoutedInterview ports={ports} />

export const INTERVIEW_FIXTURES = {
  interview: Interview,
} satisfies Record<string, () => JSX.Element>
