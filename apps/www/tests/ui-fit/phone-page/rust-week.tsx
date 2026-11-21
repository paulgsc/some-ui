/**
 * A week of Rust Rounds as the phone shows it (RR13), on the `/2` sample
 * week (Tallowbrook) with a take per point (RR24): its brief, then each
 * ticket's flow, read, academy, an exercise and voice (RR25, RR29), for
 * `../rust-week-fit.spec.ts`, which walks it by its own buttons. What it
 * keeps is in memory, so each load opens the week afresh; the microphone
 * is the simulated one, at rest, and home is near.
 */
import type { JSX } from "react"
import { useState } from "react"
import { inMemoryStorage } from "@some-ui/core-utils"
import type { RustWeekPorts } from "@some-ui/rust-rounds"
import { RustWeek, TALLOWBROOK_HELD } from "@some-ui/rust-rounds"
import { ONE_TAKE } from "@some-ui/voice-capture"
import { simulatedPattern } from "@some-ui/voice-capture/testing"

/** Midweek, while the sample week is open. */
const NOW = Date.parse("2026-11-19T18:00:00Z")

function fixturePorts(): RustWeekPorts {
  const { pattern, store } = simulatedPattern({
    options: { ...ONE_TAKE, send: "on-confirm" },
  })
  return {
    week: TALLOWBROOK_HELD,
    takes: {
      pattern,
      takes: { getSnapshot: store.getSnapshot, subscribe: store.subscribe },
      discard: store.discard,
      release: store.release,
    },
    storage: inMemoryStorage(),
    home: { reach: () => "near", subscribe: () => (): void => undefined },
    heard: () => Promise.resolve({ kind: "notYet" }),
    homeHolds: () => false,
    onHomeHolds: () => (): void => undefined,
    now: () => NOW,
    newId: () => "fit",
    onVisibility: (listener) => {
      listener(false)
      return (): void => undefined
    },
    engage: () => undefined,
    perPoint: true,
    verdicts: false,
  }
}

export const RustWeekFixture = (): JSX.Element => {
  const [ports] = useState(fixturePorts)
  return <RustWeek ports={ports} />
}
