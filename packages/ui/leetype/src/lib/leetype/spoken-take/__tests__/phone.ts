/**
 * The phone's microphone for LeetType's tests, as every screen's tests have
 * it: `@some-ui/voice-capture/testing`'s simulated pattern, the answers'
 * notes taken by a spy. It answers on the timers a test fakes
 * (`vi.useFakeTimers`).
 */
import type {
  SpokenTakes,
  SpokenTakeSnapshot,
} from "@leetype/lib/leetype/spoken-take"
import type { SimulatedPattern } from "@some-ui/voice-capture/testing"
import { simulatedPattern } from "@some-ui/voice-capture/testing"
import type { Mock } from "vitest"
import { vi } from "vitest"

export type PhoneTakes = SpokenTakes &
  Omit<SimulatedPattern, "keeping"> & {
    readonly note: Mock<SpokenTakes["note"]>
  }

export function phoneTakes(
  room: { readonly full: boolean; readonly notesFull: boolean } = {
    full: false,
    notesFull: false,
  }
): PhoneTakes {
  const { pattern, mic, player, store } = simulatedPattern()
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
