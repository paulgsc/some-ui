/**
 * @vitest-environment jsdom
 *
 * Rust Rounds on the phone's own stack: the pattern desk (`patternDesk`'s
 * runtime) and the real take pattern and take kit, over the one simulated
 * microphone every screen's tests share, so what the screen says is what the
 * phone's own stack says.
 */
import { inMemoryStorage } from "@some-ui/core-utils"
import { keptRounds, RustRounds } from "@some-ui/rust-rounds"
import type { MicOwner } from "@some-ui/voice-capture"
import {
  microphoneOwner,
  RECORDING_FAILURE_COPY,
  TAKE_WORDS,
} from "@some-ui/voice-capture"
import type { SimulatedMicrophone } from "@some-ui/voice-capture/testing"
import {
  simulatedMicrophone,
  SPEAKING,
  takeButton as take,
} from "@some-ui/voice-capture/testing"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { notesPort } from "@/lib/rust-rounds"
import type { TestDesk } from "@/lib/takes-desk/__tests__/desk"
import { testDesk } from "@/lib/takes-desk/__tests__/desk"

vi.mock("@/lib/takes-desk", async (original) => ({
  ...(await original<object>()),
  patternDesk: (): object => ({ phone: vi.fn(), sweep: vi.fn() }),
}))

const LIMITS = { max: Number.POSITIVE_INFINITY, maxMs: 60_000 }

describe("Rust Rounds on the simulated microphone", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  const tap = (): void => {
    fireEvent.click(take())
  }

  /** The session on a desk of its own, at the speak step of the first card. */
  function speakStep(owner: MicOwner = microphoneOwner()): {
    mic: SimulatedMicrophone
    desk: TestDesk
  } {
    const mic = simulatedMicrophone({ now: Date.now })
    const desk = testDesk(mic, owner, LIMITS)
    let ids = 0
    render(
      <RustRounds
        ports={{
          store: keptRounds(inMemoryStorage()),
          notes: notesPort({ phone: () => desk.phone, keptOn: desk.keptOn }),
          copy: () => Promise.resolve(),
          now: Date.now,
          newId: () => `session-${(ids += 1)}`,
          onVisibility: () => (): void => undefined,
        }}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Start" }))
    fireEvent.click(screen.getByRole("button", { name: "Not sure" }))
    return { mic, desk }
  }

  const flush = async (ms = 0): Promise<void> => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  it("keeps a note tapped on, said and tapped off, with the time against the cap, and says it is kept on this phone", async () => {
    const { mic, desk } = speakStep()
    mic.script({ ...SPEAKING, open: { kind: "after", ms: 300 } })
    tap()
    expect(take().textContent).toContain(TAKE_WORDS.button.opening)
    await flush(300)
    await flush(3_000)
    expect(take().textContent).toContain("0:03 / 1:00")
    tap()
    await flush()
    // Kept: the card offers it again, and its row says where it is.
    expect(screen.getByText(TAKE_WORDS.ended.kept)).toBeTruthy()
    expect(take().getAttribute("aria-label")).toBe(TAKE_WORDS.buttonLabel.again)
    // No lane takes Rust Rounds' notes home yet (RR6, #2237): kept here.
    expect(screen.getByText(new RegExp(TAKE_WORDS.place.phone))).toBeTruthy()
    expect(mic.open()).toBe(0)
    expect(desk.listed()).toEqual([
      expect.objectContaining({ line: "rust-rounds:indexing-01/a" }),
    ])
  })

  it("says a tap that stops it before the microphone opened, and lets the microphone go when it does (MIC0)", async () => {
    const { mic } = speakStep()
    mic.script({ ...SPEAKING, open: { kind: "cue" } })
    tap()
    tap()
    await flush()
    expect(screen.getByText(TAKE_WORDS.ended.early)).toBeTruthy()
    mic.answer("open")
    await flush()
    expect(mic.open()).toBe(0)
    expect(mic.discarded()).toBe(1)
  })

  it("says so when another screen is recording", async () => {
    const owner = microphoneOwner()
    const other = testDesk(simulatedMicrophone({ now: Date.now }), owner, {
      max: 40,
      maxMs: 60_000,
    })
    other.phone.pattern.tap("lens:line-1")
    await flush()
    const { mic } = speakStep(owner)
    tap()
    await flush()
    expect(
      screen.getByText(RECORDING_FAILURE_COPY.elsewhere, { exact: false })
    ).toBeTruthy()
    expect(mic.asked()).toBe(0)
  })

  it("keeps a note run to the cap, which ends it", async () => {
    const { mic } = speakStep()
    tap()
    await flush(61_000)
    expect(screen.getByText(TAKE_WORDS.ended.kept)).toBeTruthy()
    expect(take().getAttribute("aria-label")).toBe(TAKE_WORDS.buttonLabel.again)
    expect(mic.open()).toBe(0)
  })

  it("says a note it didn't hear, with Redo beside it (D4)", async () => {
    const { mic } = speakStep()
    mic.script({ ...SPEAKING, level: 0.03 })
    tap()
    await flush(3_000)
    tap()
    await flush()
    expect(screen.getByText(TAKE_WORDS.ended.unheard)).toBeTruthy()
    expect(
      screen.getByRole("button", {
        name: TAKE_WORDS.rowLabel(TAKE_WORDS.redo, 3_000),
      })
    ).toBeTruthy()
  })
})
