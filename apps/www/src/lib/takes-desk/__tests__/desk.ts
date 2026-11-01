/**
 * A pattern desk as `patternDesk` makes the phone's (`../pattern`), with its
 * list and its shelf in memory and the microphone the simulated one every
 * screen's tests share: what Rust Rounds' and LeetType's tests run on.
 */
import type { MicOwner } from "@some-ui/voice-capture"
import type {
  MemoryShelf,
  SimulatedMicrophone,
  SimulatedPlayer,
} from "@some-ui/voice-capture/testing"
import { memoryShelf, simulatedPlayer } from "@some-ui/voice-capture/testing"

import type { PatternPhone, PatternTakesPorts } from "@/lib/takes-desk/pattern"
import { createPatternTakes } from "@/lib/takes-desk/pattern"
import type { Take, TakeLimits } from "@/lib/takes-desk/runtime"

export type TestDesk = {
  readonly phone: PatternPhone
  /** The list as kept, newest first. */
  readonly listed: Array<Take>
  readonly shelf: MemoryShelf
  readonly player: SimulatedPlayer
  /** What home holds; empty until a test says. */
  readonly home: Set<string>
  readonly keptOn: (line: string, since: number) => string | null
}

export function testDesk(
  mic: SimulatedMicrophone,
  owner: MicOwner,
  limits: TakeLimits
): TestDesk {
  const listed: Array<Take> = []
  const shelf = memoryShelf()
  const player = simulatedPlayer()
  const home = new Set<string>()
  const takes: PatternTakesPorts["takes"] = {
    read: () => [...listed],
    add: (take, supersedes): boolean => {
      listed.splice(
        0,
        listed.length,
        take,
        ...listed.map(
          (other): Take =>
            other.id === supersedes ? { ...other, standing: "earlier" } : other
        )
      )
      return true
    },
    remove: (ids): boolean => {
      listed.splice(
        0,
        listed.length,
        ...listed.filter(({ id }) => !ids.includes(id))
      )
      return true
    },
    setAside: (id): boolean => {
      listed.splice(
        0,
        listed.length,
        ...listed.map(
          (take): Take =>
            take.id === id ? { ...take, standing: "set-aside" } : take
        )
      )
      return true
    },
  }
  let next = 0
  const phone = createPatternTakes(
    {
      startRecording: mic.startRecording,
      owner,
      audio: shelf,
      takes,
      saving: () => undefined,
      player,
      now: Date.now,
      newId: () => `n${(next += 1)}`,
      held: (id) => home.has(id),
    },
    limits
  )
  return {
    phone,
    listed,
    shelf,
    player,
    home,
    keptOn: (line, since) =>
      listed
        .filter((take) => take.line === line && take.takenAt >= since)
        .sort((a, b) => a.takenAt - b.takenAt)[0]?.id ?? null,
  }
}
