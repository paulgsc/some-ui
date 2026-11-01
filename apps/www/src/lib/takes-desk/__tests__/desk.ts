/**
 * A pattern desk as `patternDesk` makes the phone's (`../pattern`), on the
 * desk's own list (`deskList`, in the test's `localStorage`), its shelf in
 * memory, the microphone the simulated one every screen's tests share, and
 * where each take is kept read from a voice lane's record (`lib/voice-home`)
 * as the phone's is: what Rust Rounds' and LeetType's tests run on.
 */
import type { MicOwner, TakeKept } from "@some-ui/voice-capture"
import type { SimulatedMicrophone } from "@some-ui/voice-capture/testing"
import { memoryShelf, simulatedPlayer } from "@some-ui/voice-capture/testing"

import { deskList, keptOn } from "@/lib/takes-desk"
import type { PatternPhone } from "@/lib/takes-desk/pattern"
import { createPatternTakes } from "@/lib/takes-desk/pattern"
import type { Take, TakeLimits } from "@/lib/takes-desk/runtime"
import {
  INITIAL_VOICE_HOME,
  keptIn,
  stepVoiceHome,
} from "@/lib/voice-home/model"
import type { MarkOwing } from "@/lib/voice-marks"

export type TestDesk = {
  readonly phone: PatternPhone
  /** The list as kept, newest first. */
  readonly listed: () => Array<Take>
  readonly shelf: ReturnType<typeof memoryShelf>
  /**
   * What home has told this phone of the takes, kept as the voice lane keeps
   * it (`lib/voice-home`): nothing until a test says. Tell the desk with
   * `phone.recount()`, as the lane does.
   */
  readonly home: {
    /** A take's copy waits to go home. */
    readonly copied: (id: string) => void
    /** Home holds a take, as this phone heard at `at`. */
    readonly held: (id: string, at?: string) => void
  }
  readonly keptOn: (line: string, since: number) => string | null
}

/** Each desk's list under a key of its own. */
let desks = 0

export function testDesk(
  mic: SimulatedMicrophone,
  owner: MicOwner,
  limits: TakeLimits,
  marks?: MarkOwing
): TestDesk {
  desks += 1
  const takes = deskList(`test-desk-${String(desks)}`, limits.max)
  const shelf = memoryShelf()
  let lane = INITIAL_VOICE_HOME
  const copied = (id: string): void => {
    lane = stepVoiceHome(lane, {
      kind: "copied",
      note: {
        id,
        of: "leetype",
        ref: "-",
        at: new Date(0).toISOString(),
        contentType: "audio/webm",
      },
    })
  }
  const kept = (id: string): TakeKept => keptIn(lane)(id)
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
      kept,
      marks,
      from: "leetype",
    },
    limits
  )
  return {
    phone,
    listed: takes.read,
    shelf,
    home: {
      copied,
      held: (id, at = new Date(Date.now()).toISOString()): void => {
        copied(id)
        lane = stepVoiceHome(lane, { kind: "held", id, at })
      },
    },
    keptOn: (line, since) => keptOn(takes.read(), line, since),
  }
}
