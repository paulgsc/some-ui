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
import type { PatternTake } from "@some-ui/voice-capture"
import type { SimulatedPattern } from "@some-ui/voice-capture/testing"
import { simulatedPattern } from "@some-ui/voice-capture/testing"
import { vi } from "vitest"

/**
 * The session's clock and the notes' list's, one second a read from the
 * evening of 2026-10-30: every moment a test stamps is after the last.
 */
let clock = Date.parse("2026-10-30T19:00:00Z")
const tick = (): number => (clock += 1_000)

export type TestNotes = NotesPort & SimulatedPattern

/** A phone's notes on the simulated microphone, holding `seed` to begin with. */
export function testNotes(seed: ReadonlyArray<PatternTake> = []): TestNotes {
  const phone = simulatedPattern({ recordedAt: tick, seed })
  const { store } = phone
  return {
    ...phone,
    takes: { getSnapshot: store.getSnapshot, subscribe: store.subscribe },
    keptOn: store.keptOn,
  }
}

/** A note kept on `line`, long after any test's take began on it. */
export const keptNote = (id: string, line: string): PatternTake => ({
  id,
  answers: line,
  durationMs: 4_000,
  recordedAt: "2099-01-01T00:00:00.000Z",
  standing: "current",
  kept: { place: "phone" },
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
