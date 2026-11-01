/**
 * A pattern desk as `patternDesk` makes the phone's (`../pattern`), on the
 * desk's own list (`deskList`, in the test's `localStorage`), its shelf in
 * memory and the microphone the simulated one every screen's tests share:
 * what Rust Rounds' and LeetType's tests run on.
 */
import type { MicOwner } from "@some-ui/voice-capture"
import type { SimulatedMicrophone } from "@some-ui/voice-capture/testing"
import { memoryShelf, simulatedPlayer } from "@some-ui/voice-capture/testing"

import { deskList, keptOn } from "@/lib/takes-desk"
import type { PatternPhone } from "@/lib/takes-desk/pattern"
import { createPatternTakes } from "@/lib/takes-desk/pattern"
import type { Take, TakeLimits } from "@/lib/takes-desk/runtime"

export type TestDesk = {
  readonly phone: PatternPhone
  /** The list as kept, newest first. */
  readonly listed: () => Array<Take>
  readonly shelf: ReturnType<typeof memoryShelf>
  /** What home holds; empty until a test says. */
  readonly home: Set<string>
  readonly keptOn: (line: string, since: number) => string | null
}

/** Each desk's list under a key of its own. */
let desks = 0

export function testDesk(
  mic: SimulatedMicrophone,
  owner: MicOwner,
  limits: TakeLimits
): TestDesk {
  desks += 1
  const takes = deskList(`test-desk-${String(desks)}`, limits.max)
  const shelf = memoryShelf()
  const home = new Set<string>()
  let next = 0
  const phone = createPatternTakes(
    {
      startRecording: mic.startRecording,
      owner,
      audio: shelf,
      takes,
      saving: () => undefined,
      player: simulatedPlayer(),
      now: Date.now,
      newId: () => `n${(next += 1)}`,
      held: (id) => home.has(id),
    },
    limits
  )
  return {
    phone,
    listed: takes.read,
    shelf,
    home,
    keptOn: (line, since) => keptOn(takes.read(), line, since),
  }
}
