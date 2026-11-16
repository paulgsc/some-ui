/**
 * The interview week's screen (IW5, #2936), for `../interview-fit.spec.ts`:
 * the week as the routine writes one, on the simulated microphone and a clock
 * that holds still inside the week, so it never reads back as closed.
 */
import type { JSX } from "react"
import { useState } from "react"
import { inMemoryStorage } from "@some-ui/core-utils"
import { ONE_TAKE } from "@some-ui/voice-capture"
import { simulatedPattern } from "@some-ui/voice-capture/testing"

import { WEEK } from "@/lib/interview-week/__tests__/fixture"
import type { InterviewWeekPorts } from "@/lib/interview-week/runtime"
import { InterviewWeekScreen } from "@/components/jobs/interview"

const NOW = Date.parse("2026-11-17T18:00:00Z")

function fixturePorts(): InterviewWeekPorts {
  const { pattern, store } = simulatedPattern({
    options: { ...ONE_TAKE, send: "on-confirm" },
  })
  return {
    week: { week: WEEK, sha256: "fit" },
    takes: {
      pattern,
      takes: { getSnapshot: store.getSnapshot, subscribe: store.subscribe },
      discard: store.discard,
      release: store.release,
    },
    storage: inMemoryStorage(),
    home: { reach: () => "near", subscribe: () => (): void => undefined },
    homeHolds: () => false,
    onHomeHolds: () => (): void => undefined,
    now: () => NOW,
    newId: () => "fit",
    onVisibility: () => (): void => undefined,
    // The cue holds at its first second, so the fit is measured while it counts.
    every: () => (): void => undefined,
  }
}

const Interview = (): JSX.Element => {
  const [ports] = useState(fixturePorts)
  return <InterviewWeekScreen ports={ports} />
}

export const INTERVIEW_FIXTURES = {
  interview: Interview,
} satisfies Record<string, () => JSX.Element>
