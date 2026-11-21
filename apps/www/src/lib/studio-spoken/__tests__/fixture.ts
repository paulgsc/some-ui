import { inMemoryStorage } from "@some-ui/core-utils"
import type { HeardAnswer } from "@some-ui/voice-capture"
import type { SimulatedPattern } from "@some-ui/voice-capture/testing"
import { simulatedPattern } from "@some-ui/voice-capture/testing"

import { bandPace } from "@/lib/interview-week/store"
import { LIBRARY_TAKES_MAX } from "@/lib/library-takes"
import type { SpokenPorts, SpokenRuntime } from "@/lib/studio-spoken/runtime"
import { createSpokenRuntime } from "@/lib/studio-spoken/runtime"
import { spokenStore } from "@/lib/studio-spoken/store"
import { deskPatternOptions } from "@/lib/takes-desk/pattern"

/**
 * Spoken's runtime over the real take pattern on a simulated microphone,
 * shaped as the Takes desk it records on; `overrides` replace its ports.
 */
export function spokenPhone(overrides: Partial<SpokenPorts> = {}): {
  readonly sim: SimulatedPattern
  readonly storage: ReturnType<typeof inMemoryStorage>
  readonly runtime: SpokenRuntime
} {
  const sim = simulatedPattern({
    options: deskPatternOptions(
      // The Takes desk's three minutes a take.
      { max: LIBRARY_TAKES_MAX, maxMs: 180_000 },
      {
        takes: { per: "many", max: LIBRARY_TAKES_MAX, full: "make-room" },
        play: "each",
      }
    ),
  })
  const storage = inMemoryStorage()
  const runtime = createSpokenRuntime({
    store: spokenStore(storage),
    pace: bandPace(storage),
    takes: sim.store,
    pattern: sim.pattern,
    audioHere: () => Promise.resolve(null),
    audioFromHome: () =>
      Promise.resolve(new Blob(["x"], { type: "audio/webm" })),
    heard: (): Promise<HeardAnswer> =>
      Promise.resolve({ kind: "heard", text: "It is a week" }),
    player: sim.player,
    now: Date.now,
    random: () => 0.25,
    ...overrides,
  })
  return { sim, storage, runtime }
}
