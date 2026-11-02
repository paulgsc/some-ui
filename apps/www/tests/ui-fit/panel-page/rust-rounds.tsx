import type { JSX } from "react"
import { useState } from "react"
import { inMemoryStorage } from "@some-ui/core-utils"
import type { NotesPort, RustRoundsPorts } from "@some-ui/rust-rounds"
import { keptRounds, RustRounds } from "@some-ui/rust-rounds"
import { simulatedPattern } from "@some-ui/voice-capture/testing"

/**
 * The phone's take pattern over the simulated microphone, with the notes in
 * memory: the fit is measured with the take button at rest.
 */
function quietNotes(): NotesPort {
  const { pattern, store } = simulatedPattern()
  return {
    pattern,
    takes: { getSnapshot: store.getSnapshot, subscribe: store.subscribe },
    keptOn: () => null,
  }
}

function fixturePorts(): RustRoundsPorts {
  return {
    store: keptRounds(inMemoryStorage()),
    notes: quietNotes(),
    copy: () => Promise.resolve(),
    now: () => Date.now(),
    newId: () => "fit",
    onVisibility: () => () => undefined,
  }
}

/**
 * Rust Rounds (RR4, #2235) as the phone shows it, from its menu, playing
 * the worked example from storage of its own (`../rust-rounds-fit.spec.ts`
 * walks it). The page scrolls as the app's shell does; the spec measures
 * that nothing in it is wider than the phone.
 */
export const RustRoundsFixture = (): JSX.Element => {
  const [ports] = useState(fixturePorts)
  return (
    <div
      data-rust-rounds-page=""
      data-scroll-intent="long-form"
      style={{
        boxSizing: "border-box",
        height: "100%",
        overflowY: "auto",
        padding: 16,
      }}
    >
      <RustRounds ports={ports} />
    </div>
  )
}
