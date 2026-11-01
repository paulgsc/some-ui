/**
 * The grammar lens's takes for topik's tests, as every screen's tests have
 * the microphone: `@some-ui/voice-capture/testing`'s simulated pattern, with
 * the lens's options (many takes a line, the newest played), its takes in
 * memory. It answers on the timers a test fakes (`vi.useFakeTimers`).
 */
import type { TakePatternOptions } from "@some-ui/voice-capture"
import { ONE_TAKE } from "@some-ui/voice-capture"
import type { SimulatedPattern } from "@some-ui/voice-capture/testing"
import { simulatedPattern } from "@some-ui/voice-capture/testing"
import type {
  LensTakes,
  LensTakeSnapshot,
} from "@topik/lib/topik/adapter/lens-takes"

/** The phone's choice for the lens (www's `lib/lens-takes`). */
export const LENS_OPTIONS: TakePatternOptions = {
  ...ONE_TAKE,
  takes: { per: "many", max: 40 },
  limits: { minMs: 1_000, maxMs: 30_000 },
  play: "latest",
}

export type TestLensTakes = LensTakes & SimulatedPattern

export function lensTakes(
  room: { readonly full: boolean } = { full: false }
): TestLensTakes {
  const simulated = simulatedPattern({ options: LENS_OPTIONS })
  const { store } = simulated
  let snapshot: LensTakeSnapshot = { takes: store.getSnapshot(), ...room }
  return {
    ...simulated,
    getSnapshot: (): LensTakeSnapshot => {
      const takes = store.getSnapshot()
      if (takes !== snapshot.takes) snapshot = { ...snapshot, takes }
      return snapshot
    },
    subscribe: store.subscribe,
  }
}
