import type { JSX } from "react"
import { useState, useSyncExternalStore } from "react"
import { TakeList } from "@some-ui/shared"
import type {
  PatternTake,
  TakePattern,
  TakePatternOptions,
} from "@some-ui/voice-capture"
import { microphoneOwner, takePattern } from "@some-ui/voice-capture"
import type { MemoryTakes } from "@some-ui/voice-capture/testing"
import {
  memoryTakes,
  simulatedMicrophone,
  simulatedPlayer,
} from "@some-ui/voice-capture/testing"

const ONE: TakePatternOptions = {
  takes: { per: "one" },
  limits: { minMs: 500, maxMs: 60_000 },
  redo: "supersede",
  letGo: "set-aside",
  play: "each",
}

const MANY: TakePatternOptions = {
  ...ONE,
  takes: { per: "many", max: 3 },
  play: "latest",
}

const take = (
  id: string,
  answers: string,
  minute: number,
  over: Partial<PatternTake> = {}
): PatternTake => ({
  id,
  answers,
  durationMs: 47_000,
  recordedAt: `2026-10-31T09:${String(minute).padStart(2, "0")}:00.000Z`,
  standing: "current",
  place: "phone",
  ...over,
})

/**
 * An item that answers with one take, redone twice (its earlier takes
 * collapsed), and one that keeps many beside each other, at its max. The
 * item words are as long as a screen's get (a lens line, a card's prompt).
 */
const SEED: ReadonlyArray<PatternTake> = [
  take("a1", "card", 1, { standing: "earlier", durationMs: 3_000 }),
  take("a2", "card", 2, { standing: "earlier", place: "home" }),
  take("a3", "card", 3),
  take("b1", "line", 4, { place: "home", durationMs: 59_000 }),
  take("b2", "line", 5),
  take("b3", "line", 6, { durationMs: 600 }),
]

type Screen = {
  readonly one: TakePattern
  readonly many: TakePattern
  readonly store: MemoryTakes
}

function screen(): Screen {
  // The simulated microphone opens at once and hears speech, so a tap in the
  // sweep shows the button recording.
  const mic = simulatedMicrophone({ now: Date.now })
  const owner = microphoneOwner()
  const store = memoryTakes({ now: Date.now, seed: SEED })
  const ports = {
    startRecording: mic.startRecording,
    now: Date.now,
    owner,
    player: simulatedPlayer(),
    ...store.ports,
  }
  return {
    one: takePattern(ports, ONE),
    many: takePattern(ports, MANY),
    store,
  }
}

/**
 * The take pattern's parts (MIC2, #2372) as a phone screen shows them, in a
 * column that scrolls down and never across (`../take-pattern-fit.spec.ts`):
 * the large button with a one-take item, then a compact button with an item
 * at its max.
 */
export const TakePatternFixture = (): JSX.Element => {
  // One screen per mount, as a screen makes its pattern.
  const [{ one, many, store }] = useState(screen)
  const takes = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return (
    <div
      data-scroll-intent="page"
      style={{
        boxSizing: "border-box",
        height: "100%",
        overflowY: "auto",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <TakeList
        pattern={one}
        answers="card"
        takes={takes}
        size="large"
        label="Why does this borrow outlive the function that made it?"
        describe={() =>
          "Your answer to: why does this borrow outlive the function that made it?"
        }
      />
      <TakeList
        pattern={many}
        answers="line"
        takes={takes}
        label="비가 와서 어제는 친구를 만나지 못했지만 오늘은 꼭 만날 거예요."
        describe={() =>
          "비가 와서 어제는 친구를 만나지 못했지만 오늘은 꼭 만날 거예요."
        }
      />
    </div>
  )
}
