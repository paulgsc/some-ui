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
import { readWeek, RustWeek, TALLOWBROOK_WEEK_FILE } from "@some-ui/rust-rounds"
import { ONE_TAKE } from "@some-ui/voice-capture"
import { simulatedPattern } from "@some-ui/voice-capture/testing"

/** Midweek, while the sample week is open. */
const NOW = Date.parse("2026-11-19T18:00:00Z")

/** rustc 1.97.0 on TB-101's program, as the prototype printed it. */
const E0507 = [
  "error[E0507]: cannot move out of index of `Vec<Label>`",
  "  --> main.rs:16:18",
  "   |",
  "16 |         let to = queue[i].address;",
  "   |                  ^^^^^^^^^^^^^^^^ move occurs because value has type `String`, which does not implement the `Copy` trait",
  "",
  "error: aborting due to 1 previous error",
  "",
  "For more information about this error, try `rustc --explain E0507`.",
  "",
].join("\n")

function fixturePorts(): RustWeekPorts {
  const read = readWeek(TALLOWBROOK_WEEK_FILE)
  if (!read.ok) throw new Error("The /2 sample week doesn't read.")
  const { pattern, store } = simulatedPattern({
    options: { ...ONE_TAKE, send: "on-confirm" },
  })
  return {
    week: {
      week: read.week,
      sha256: "f".repeat(64),
      runs: {
        "TB-101": {
          outcome: "compile-error",
          toolchain: "1.97.0",
          code: "E0507",
          stderr: E0507,
          span: { lineStart: 16, columnStart: 18, lineEnd: 16, columnEnd: 34 },
        },
      },
      ended: [],
    },
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
  }
}

export const RustWeekFixture = (): JSX.Element => {
  const [ports] = useState(fixturePorts)
  return <RustWeek ports={ports} />
}
