/**
 * Pasting an error from the desk (RR4c, #2348): from any card, the text as
 * pasted and an optional voice note go to the log's `fromMyDesk`, once, on
 * Back to the card; a note still being kept is waited for without anything
 * on the step waiting; and a paste under way survives the screen going.
 */
import { RoundLogSchema } from "@rust-rounds/lib/formats"
import { appendToLog, EMPTY_LOG, holdsAdd } from "@rust-rounds/lib/play/log"
import type { RustRoundsRuntime } from "@rust-rounds/lib/play/runtime"
import { createRustRounds } from "@rust-rounds/lib/play/runtime"
import { keptRounds } from "@rust-rounds/lib/play/store"
import { inMemoryStorage } from "@some-ui/core-utils"
import { SPEAKING } from "@some-ui/voice-capture/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { TestPorts } from "./ports"
import { testNotes, testPorts } from "./ports"

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const ERROR = [
  "error[E0277]: the type `str` cannot be indexed by `usize`",
  " --> src/main.rs:4:15",
].join("\n")

const NOTE = expect.stringMatching(/^take-/)

function opened(ports: TestPorts): RustRoundsRuntime {
  const runtime = createRustRounds(ports)
  runtime.attach()
  return runtime
}

/** The first card on screen, and the desk step opened from it. */
function atDesk(runtime: RustRoundsRuntime): void {
  runtime.dispatch({ type: "continue" })
  runtime.dispatch({ type: "desk" })
}

const pastes = (storage: Storage): Array<unknown> =>
  keptRounds(storage)
    .open()
    .log.sessions.flatMap((session) => session.fromMyDesk)

describe("the desk step", () => {
  it("opens from a card, and Back logs what was pasted and returns to that card", () => {
    const ports = testPorts()
    const runtime = opened(ports)
    atDesk(runtime)
    expect(runtime.getSnapshot().screen.kind).toBe("desk")
    runtime.dispatch({ type: "deskText", text: ERROR })
    runtime.dispatch({ type: "deskBack" })

    const state = runtime.getSnapshot()
    expect(state.screen.kind).toBe("card")
    expect(state.place?.visit.card).toBe("a")
    expect(pastes(ports.storage)).toEqual([
      { at: expect.any(String), pasted: ERROR, note: null },
    ])
    const { log } = keptRounds(ports.storage).open()
    expect(RoundLogSchema.safeParse(log).success).toBe(true)
    // The card itself is not left: nothing of it is logged yet.
    expect(log.sessions.flatMap((session) => session.cards)).toEqual([])
  })

  it("logs nothing when nothing was pasted", () => {
    const ports = testPorts()
    const runtime = opened(ports)
    atDesk(runtime)
    runtime.dispatch({ type: "deskText", text: "   " })
    runtime.dispatch({ type: "deskBack" })
    expect(runtime.getSnapshot().screen.kind).toBe("card")
    expect(pastes(ports.storage)).toEqual([])
  })

  it("opens only from a card", () => {
    const runtime = opened(testPorts())
    runtime.dispatch({ type: "desk" })
    expect(runtime.getSnapshot().screen.kind).toBe("menu")
  })

  it("logs the paste with the note said on it", async () => {
    const ports = testPorts()
    const runtime = opened(ports)
    atDesk(runtime)
    runtime.dispatch({ type: "deskText", text: ERROR })
    runtime.dispatch({ type: "deskTapNote" })
    await vi.advanceTimersByTimeAsync(2_000)
    runtime.dispatch({ type: "deskTapNote" })
    await vi.advanceTimersByTimeAsync(0)
    expect(runtime.getSnapshot().desk?.note).toEqual(NOTE)
    runtime.dispatch({ type: "deskBack" })
    expect(pastes(ports.storage)).toEqual([
      { at: expect.any(String), pasted: ERROR, note: NOTE },
    ])
  })

  it("goes Back while its note is still being kept, and logs the paste once the note lands", async () => {
    const notes = testNotes()
    notes.mic.script({ ...SPEAKING, finish: { kind: "after", ms: 1_000 } })
    const ports = testPorts(inMemoryStorage(), notes)
    const runtime = opened(ports)
    atDesk(runtime)
    runtime.dispatch({ type: "deskText", text: ERROR })
    runtime.dispatch({ type: "deskTapNote" })
    await vi.advanceTimersByTimeAsync(2_000)
    // Back is never held up by the note.
    runtime.dispatch({ type: "deskBack" })
    expect(runtime.getSnapshot().screen.kind).toBe("card")
    expect(pastes(ports.storage)).toEqual([])
    expect(keptRounds(ports.storage).open().deskPending).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(pastes(ports.storage)).toEqual([
      { at: expect.any(String), pasted: ERROR, note: NOTE },
    ])
    expect(keptRounds(ports.storage).open().deskPending).toEqual([])
  })

  it("is open again, as typed, at the next opening, and a paste waiting on its note is logged then", async () => {
    const storage = inMemoryStorage()
    const notes = testNotes()
    const first = createRustRounds(testPorts(storage, notes))
    const detach = first.attach()
    atDesk(first)
    first.dispatch({ type: "deskText", text: ERROR })
    detach()

    const second = createRustRounds(testPorts(storage, notes))
    const away = second.attach()
    expect(second.getSnapshot().screen.kind).toBe("desk")
    expect(second.getSnapshot().desk?.pasted).toBe(ERROR)
    away()

    // Back while a note is being kept, and the screen gone before it lands.
    notes.mic.script({ ...SPEAKING, finish: { kind: "after", ms: 1_000 } })
    const third = createRustRounds(testPorts(storage, notes))
    const gone = third.attach()
    third.dispatch({ type: "deskTapNote" })
    await vi.advanceTimersByTimeAsync(2_000)
    third.dispatch({ type: "deskBack" })
    gone()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(pastes(storage)).toEqual([])

    opened(testPorts(storage, notes))
    expect(pastes(storage)).toEqual([
      { at: expect.any(String), pasted: ERROR, note: NOTE },
    ])
  })

  it("reaches the tutor's copy", () => {
    const ports = testPorts()
    const runtime = opened(ports)
    atDesk(runtime)
    runtime.dispatch({ type: "deskText", text: ERROR })
    runtime.dispatch({ type: "deskBack" })
    runtime.dispatch({ type: "menu" })
    runtime.dispatch({ type: "tutor" })
    runtime.dispatch({ type: "copyLog" })
    expect(ports.copied.at(-1)).toContain("From the owner's desk")
    expect(ports.copied.at(-1)).toContain(ERROR)
  })
})

describe("a paste in the log", () => {
  it("is held once, by when it was made", () => {
    const head = { id: "s", startedAt: "2026-11-02T19:00:00Z" }
    const paste = { at: "2026-11-02T19:04:11Z", pasted: ERROR, note: null }
    const log = appendToLog(EMPTY_LOG, head, { kind: "desk", paste })
    expect(holdsAdd(log, { kind: "desk", paste })).toBe(true)
    expect(
      holdsAdd(log, {
        kind: "desk",
        paste: { ...paste, at: "2026-11-02T19:05:00Z" },
      })
    ).toBe(false)
  })
})
