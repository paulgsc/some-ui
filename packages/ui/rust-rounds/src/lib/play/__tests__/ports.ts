/**
 * Ports for the session's tests: the phone's microphone as every screen's
 * tests have it (`@some-ui/voice-capture/testing`'s simulated microphone,
 * under the real take pattern, take kit and one-microphone owner), its notes
 * in memory, a clock, ids, a page that is never hidden, and a clipboard that
 * takes whatever is copied. The microphone answers on the timers a test
 * fakes (`vi.useFakeTimers`).
 */
import type { NotesPort, RustRoundsPorts } from "@rust-rounds/lib/play/runtime"
import { keptRounds, LOG_KEY } from "@rust-rounds/lib/play/store"
import { inMemoryStorage } from "@some-ui/core-utils"
import type {
  KeepResult,
  PatternTake,
  TakePatternOptions,
} from "@some-ui/voice-capture"
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
import { vi } from "vitest"

/** The phone's: one note per card, each at least a second and at most a minute. */
const NOTE_OPTIONS: TakePatternOptions = {
  takes: { per: "one" },
  limits: { minMs: 1_000, maxMs: 60_000 },
  redo: "supersede",
  letGo: "set-aside",
  play: "each",
}

/**
 * The session's clock and the notes' list's, one second a read from the
 * evening of 2026-10-30: every moment a test stamps is after the last.
 */
let clock = Date.parse("2026-10-30T19:00:00Z")
const tick = (): number => (clock += 1_000)

export type TestNotes = NotesPort & {
  readonly mic: SimulatedMicrophone
  readonly player: SimulatedPlayer
  readonly store: MemoryTakes
  /** How the phone answers each note it is asked to keep from now on. */
  readonly keeping: (how: KeepResult["outcome"]) => void
}

/** A phone's notes on the simulated microphone, holding `seed` to begin with. */
export function testNotes(seed: ReadonlyArray<PatternTake> = []): TestNotes {
  const mic = simulatedMicrophone({ now: Date.now })
  const player = simulatedPlayer()
  const store = memoryTakes({ now: tick, seed })
  let how: KeepResult["outcome"] = "kept"
  const pattern = takePattern(
    {
      startRecording: mic.startRecording,
      now: Date.now,
      // Each phone's own: a take one test leaves holds no other's microphone.
      owner: microphoneOwner(),
      player,
      ...store.ports,
      keep: (take, answers, supersedes, done) => {
        if (how === "kept") store.ports.keep(take, answers, supersedes, done)
        else done({ outcome: how })
      },
    },
    NOTE_OPTIONS
  )
  return {
    pattern,
    takes: { getSnapshot: store.getSnapshot, subscribe: store.subscribe },
    keptOn: (line, since): string | null =>
      store
        .getSnapshot()
        .filter(
          (take) =>
            take.answers === line && Date.parse(take.recordedAt) >= since
        )
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))[0]?.id ??
      null,
    mic,
    player,
    store,
    keeping: (next): void => {
      how = next
    },
  }
}

/** A note kept on `line`, long after any test's take began on it. */
export const keptNote = (id: string, line: string): PatternTake => ({
  id,
  answers: line,
  durationMs: 4_000,
  recordedAt: "2099-01-01T00:00:00.000Z",
  standing: "current",
  place: "phone",
})

/** Storage whose log refuses every write while it is full, as a phone out of room does. */
export function fullLog(): {
  readonly storage: Storage
  readonly full: (on: boolean) => void
} {
  const storage = inMemoryStorage()
  const setItem = storage.setItem.bind(storage)
  let isFull = true
  storage.setItem = (key, value): void => {
    if (isFull && key === LOG_KEY) throw new Error("QuotaExceededError")
    setItem(key, value)
  }
  return {
    storage,
    full: (on): void => {
      isFull = on
    },
  }
}

export type TestPorts = RustRoundsPorts & {
  readonly notes: TestNotes
  readonly storage: Storage
  readonly copied: Array<string>
}

/** Ids unique across every opening in a test file, as `crypto.randomUUID` makes them. */
let ids = 0

/** The phone's ports over `storage` and `notes`. */
export function testPorts(
  storage: Storage = inMemoryStorage(),
  notes: TestNotes = testNotes()
): TestPorts {
  const copied: Array<string> = []
  return {
    storage,
    notes,
    copied,
    store: keptRounds(storage),
    copy: vi.fn((text: string) => {
      copied.push(text)
      return Promise.resolve()
    }),
    now: tick,
    newId: (): string => {
      ids += 1
      return `session-${ids}`
    },
    onVisibility: () => () => undefined,
  }
}
