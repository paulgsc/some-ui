/**
 * @vitest-environment jsdom
 *
 * The takes desk as Rust Rounds' microphone: how each take ended reaches
 * the session as the desk's own end, and why the microphone refused in the
 * person's words, never as a sentence read back. Then Rust Rounds itself,
 * on the real desk and the real take kit over the one simulated microphone
 * every screen's tests share (MIC1, #2371), so what the screen says is what
 * the phone's own stack says.
 */
import { inMemoryStorage } from "@some-ui/core-utils"
import { keptRounds, RustRounds } from "@some-ui/rust-rounds"
import type { BlobShelf, MicOwner, Playback } from "@some-ui/voice-capture"
import { microphoneOwner, RECORDING_FAILURE_COPY } from "@some-ui/voice-capture"
import type { SimulatedMicrophone } from "@some-ui/voice-capture/testing"
import { simulatedMicrophone, SPEAKING } from "@some-ui/voice-capture/testing"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { notesPort, noteView } from "@/lib/rust-rounds"
import type { DeskSnapshot, Take } from "@/lib/takes-desk"
import type { PhoneTakes } from "@/lib/takes-desk/runtime"
import { createTakes } from "@/lib/takes-desk/runtime"

vi.mock("@/lib/takes-desk", () => ({
  takesDesk: (): object => ({ phone: vi.fn(), sweep: vi.fn() }),
}))

const AT_REST: DeskSnapshot = {
  take: { kind: "idle" },
  said: null,
  last: null,
  kept: null,
  playing: false,
  full: false,
  ended: null,
  blocked: null,
}

describe("noteView", () => {
  it("passes each take's end on, with the note it kept", () => {
    expect(
      noteView({
        ...AT_REST,
        said: null,
        ended: { seq: 3, line: "rust-rounds:a/b", end: "kept", id: "n1" },
      })
    ).toEqual({
      take: { kind: "idle" },
      ended: { seq: 3, line: "rust-rounds:a/b", end: "kept", note: "n1" },
      blocked: null,
    })
  })

  it("says why the microphone refused, in the person's words", () => {
    expect(noteView({ ...AT_REST, blocked: "denied" }).blocked).toBe(
      RECORDING_FAILURE_COPY.denied
    )
  })

  it("shows a take under way without how long it has run", () => {
    expect(
      noteView({ ...AT_REST, take: { kind: "recording", elapsedMs: 4_000 } })
        .take
    ).toEqual({ kind: "recording" })
  })
})

/** A desk on the simulated microphone, as `takesDesk` makes the phone's. */
function deskOn(
  mic: SimulatedMicrophone,
  owner: MicOwner
): {
  takes: PhoneTakes
  keptOn: (line: string, since: number) => string | null
} {
  const listed: Array<Take> = []
  const audio = new Map<string, Blob>()
  const shelf: BlobShelf = {
    put: (id, blob) => {
      audio.set(id, blob)
      return Promise.resolve()
    },
    get: (id) => Promise.resolve(audio.get(id) ?? null),
    remove: (ids) => {
      for (const id of ids) audio.delete(id)
      return Promise.resolve()
    },
    ids: () => Promise.resolve([...audio.keys()]),
  }
  let next = 0
  const takes = createTakes(
    {
      startRecording: mic.startRecording,
      owner,
      audio: shelf,
      takes: {
        read: () => [...listed],
        add: (take): boolean => {
          listed.unshift(take)
          return true
        },
        remove: (): boolean => true,
      },
      saving: () => undefined,
      player: {
        play: (): Playback => ({
          ended: Promise.resolve(),
          stop: () => undefined,
        }),
      },
      now: Date.now,
      newId: () => `n${(next += 1)}`,
    },
    { max: Number.POSITIVE_INFINITY, maxMs: 60_000 }
  )
  return {
    takes,
    keptOn: (line, since) =>
      listed.find((take) => take.line === line && take.takenAt >= since)?.id ??
      null,
  }
}

describe("Rust Rounds on the simulated microphone", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  const status = (): string => screen.getByRole("status").textContent

  /** The session on a desk of its own, at the speak step of the first card. */
  function speakStep(owner: MicOwner = microphoneOwner()): {
    mic: SimulatedMicrophone
    hold: HTMLElement
  } {
    const mic = simulatedMicrophone({ now: Date.now })
    const desk = deskOn(mic, owner)
    let ids = 0
    render(
      <RustRounds
        ports={{
          store: keptRounds(inMemoryStorage()),
          notes: notesPort({ phone: () => desk.takes, keptOn: desk.keptOn }),
          copy: () => Promise.resolve(),
          now: Date.now,
          newId: () => `session-${(ids += 1)}`,
          onVisibility: () => (): void => undefined,
        }}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Start" }))
    fireEvent.click(screen.getByRole("button", { name: "Not sure" }))
    return { mic, hold: screen.getByRole("button", { name: "Hold to speak" }) }
  }

  const flush = async (ms = 0): Promise<void> => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  it("keeps a note held, said and let go", async () => {
    const { mic, hold } = speakStep()
    mic.script({ ...SPEAKING, open: { kind: "after", ms: 300 } })
    fireEvent.pointerDown(hold)
    expect(hold.textContent).toContain("Opening the microphone")
    await flush(300)
    expect(hold.textContent).toContain("Listening")
    await flush(3_000)
    fireEvent.pointerUp(hold)
    await flush()
    // Kept: the card withdraws the button and says where the note is.
    expect(screen.getByText("Kept on this phone.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Hold to speak" })).toBeNull()
    expect(mic.open()).toBe(0)
  })

  it("says a press let go before the microphone opened, and lets the microphone go when it does (MIC0)", async () => {
    const { mic, hold } = speakStep()
    mic.script({ ...SPEAKING, open: { kind: "cue" } })
    fireEvent.pointerDown(hold)
    fireEvent.pointerUp(hold)
    await flush()
    expect(status()).toContain("That ended before the microphone was listening")
    mic.answer("open")
    await flush()
    expect(mic.open()).toBe(0)
    expect(mic.discarded()).toBe(1)
  })

  it("says so when another screen is recording", async () => {
    const owner = microphoneOwner()
    const other = deskOn(simulatedMicrophone({ now: Date.now }), owner)
    other.takes.start("lens:line-1")
    await flush()
    const { mic, hold } = speakStep(owner)
    fireEvent.pointerDown(hold)
    await flush()
    expect(status()).toContain(RECORDING_FAILURE_COPY.elsewhere)
    expect(mic.asked()).toBe(0)
  })

  it("keeps a note held past the cap, which ends it", async () => {
    const { mic, hold } = speakStep()
    fireEvent.pointerDown(hold)
    await flush(61_000)
    // Kept: the card withdraws the button and says where the note is.
    expect(screen.getByText("Kept on this phone.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Hold to speak" })).toBeNull()
    expect(mic.open()).toBe(0)
  })
})
