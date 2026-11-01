/**
 * The phone's microphone for LeetType's tests, as every screen's tests have
 * it: `@some-ui/voice-capture/testing`'s simulated microphone under the real
 * take pattern, take kit and one-microphone owner, with the takes in memory
 * and the answers' notes taken by a spy. It answers on the timers a test
 * fakes (`vi.useFakeTimers`).
 */
import type {
  SpokenTakes,
  SpokenTakeSnapshot,
} from "@leetype/lib/leetype/spoken-take"
import type { TakePatternOptions } from "@some-ui/voice-capture"
import { microphoneOwner, takePattern } from "@some-ui/voice-capture"
import type {
  MemoryTakes,
  SimulatedMicrophone,
  SimulatedPlayer,
} from "@some-ui/voice-capture/testing"
import {
  memoryTakes,
  simulatedMicrophone,
  simulatedPlayer,
} from "@some-ui/voice-capture/testing"
import type { Mock } from "vitest"
import { vi } from "vitest"

/** The phone's: one take an answer, each at least a second and at most a minute. */
const OPTIONS: TakePatternOptions = {
  takes: { per: "one" },
  limits: { minMs: 1_000, maxMs: 60_000 },
  redo: "supersede",
  letGo: "set-aside",
  play: "each",
}

export type PhoneTakes = SpokenTakes & {
  readonly mic: SimulatedMicrophone
  readonly player: SimulatedPlayer
  readonly store: MemoryTakes
  readonly note: Mock<SpokenTakes["note"]>
}

export function phoneTakes(
  room: { readonly full: boolean; readonly notesFull: boolean } = {
    full: false,
    notesFull: false,
  }
): PhoneTakes {
  const mic = simulatedMicrophone({ now: Date.now })
  const player = simulatedPlayer()
  const store = memoryTakes({ now: Date.now })
  const pattern = takePattern(
    {
      startRecording: mic.startRecording,
      now: Date.now,
      // Each phone's own: a take one test leaves holds no other's microphone.
      owner: microphoneOwner(),
      player,
      ...store.ports,
    },
    OPTIONS
  )
  let snapshot: SpokenTakeSnapshot = { takes: store.getSnapshot(), ...room }
  return {
    pattern,
    getSnapshot: (): SpokenTakeSnapshot => {
      const takes = store.getSnapshot()
      if (takes !== snapshot.takes) snapshot = { ...snapshot, takes }
      return snapshot
    },
    subscribe: store.subscribe,
    note: vi.fn<SpokenTakes["note"]>(() => true),
    mic,
    player,
    store,
  }
}
