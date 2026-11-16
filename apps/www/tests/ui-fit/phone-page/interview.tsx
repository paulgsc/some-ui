/**
 * The interview week's screen (IW5, #2936), for `../interview-fit.spec.ts`:
 * the week as the routine writes one, on the simulated microphone and a clock
 * that holds still inside the week, so it never reads back as closed.
 */
import type { JSX } from "react"
import { useState } from "react"

import { fakePorts } from "@/lib/interview-week/__tests__/fixture"
import { InterviewWeekScreen } from "@/components/jobs/interview"

const NOW = Date.parse("2026-11-17T18:00:00Z")

const Interview = (): JSX.Element => {
  const [{ ports }] = useState(() =>
    fakePorts({
      now: () => NOW,
      onVisibility: () => (): void => undefined,
      // The cue holds at its first second, so the fit is measured while it counts.
      every: () => (): void => undefined,
    })
  )
  return <InterviewWeekScreen ports={ports} />
}

export const INTERVIEW_FIXTURES = {
  interview: Interview,
} satisfies Record<string, () => JSX.Element>
