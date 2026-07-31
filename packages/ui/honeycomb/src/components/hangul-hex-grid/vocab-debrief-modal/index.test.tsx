import { VocabDebriefModal } from "@honeycomb/components/hangul-hex-grid/vocab-debrief-modal"
import { HANGUL_WORDS } from "@honeycomb/data"
import type { WordEntry } from "@honeycomb/data"
import type { MissedWord } from "@honeycomb/types/hangul-types"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/** 사과 - ㅅ ㅏ ㄱ ㅘ, abandoned after the first two jamo. */
const MISSED: MissedWord = {
  cellIds: ["hex_0_0_0", "hex_1_-1_0", "hex_-1_1_0", "hex_1_0_-1"],
  answerGlyphs: ["ㅅ", "ㅏ", "ㄱ", "ㅘ"],
  cursor: 2,
}

const APPLE = HANGUL_WORDS.find((word) => word.id === "apple")!

function renderModal(
  onDismiss: () => void,
  overrides: { missed?: MissedWord | null; entry?: WordEntry } = {}
): void {
  render(
    <VocabDebriefModal
      missed={overrides.missed === undefined ? MISSED : overrides.missed}
      entry={"entry" in overrides ? overrides.entry : APPLE}
      onDismiss={onDismiss}
    />
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("VocabDebriefModal", () => {
  it("renders nothing when there is no missed word", () => {
    renderModal(vi.fn(), { missed: null })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("reveals every jamo of the word, missed ones included", () => {
    renderModal(vi.fn())

    // ㄱ and ㅘ were never reached on the board; the debrief shows them anyway.
    for (const glyph of MISSED.answerGlyphs) {
      expect(screen.getByText(glyph)).toBeInTheDocument()
    }
    expect(screen.getByText("2 of 4 jamo typed")).toBeInTheDocument()
  })

  it("presents the word and its pedagogy", () => {
    renderModal(vi.fn())

    expect(screen.getByText(APPLE.word)).toBeInTheDocument()
    expect(screen.getByText(APPLE.pedagogy!.note)).toBeInTheDocument()
    expect(screen.getByText(APPLE.pedagogy!.example.korean)).toBeInTheDocument()
    expect(
      screen.getByText(APPLE.pedagogy!.example.english)
    ).toBeInTheDocument()
  })

  it("falls back to the jamo stream when the word has no seed entry", () => {
    renderModal(vi.fn(), { entry: undefined })

    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      `Missed word: ${MISSED.answerGlyphs.join("")}`
    )
  })

  it("dismisses on Escape", () => {
    const onDismiss = vi.fn()
    renderModal(onDismiss)

    fireEvent.keyDown(window, { key: "Escape" })

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("ignores Escape once there is nothing to debrief", () => {
    const onDismiss = vi.fn()
    renderModal(onDismiss, { missed: null })

    fireEvent.keyDown(window, { key: "Escape" })

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it("dismisses itself once the countdown runs out", () => {
    const onDismiss = vi.fn()
    renderModal(onDismiss)

    expect(onDismiss).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(9000))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("freezes the countdown while the pointer is over it", () => {
    const onDismiss = vi.fn()
    renderModal(onDismiss)

    act(() => vi.advanceTimersByTime(2000))
    fireEvent.pointerEnter(screen.getByRole("dialog"))

    act(() => vi.advanceTimersByTime(60_000))
    expect(onDismiss).not.toHaveBeenCalled()
    expect(screen.getByText(/paused while you read/i)).toBeInTheDocument()

    fireEvent.pointerLeave(screen.getByRole("dialog"))
    act(() => vi.advanceTimersByTime(7000))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("freezes the countdown while focus is inside it", () => {
    const onDismiss = vi.fn()
    renderModal(onDismiss)

    fireEvent.focus(screen.getByRole("button", { name: /next word/i }))
    act(() => vi.advanceTimersByTime(60_000))

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it("keeps the countdown frozen when the pointer leaves but focus is still inside", () => {
    const onDismiss = vi.fn()
    renderModal(onDismiss)
    const dialog = screen.getByRole("dialog")

    fireEvent.pointerEnter(dialog)
    fireEvent.focus(screen.getByRole("button", { name: /next word/i }))
    fireEvent.pointerLeave(dialog)

    act(() => vi.advanceTimersByTime(60_000))

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it("dismisses on the explicit control", () => {
    const onDismiss = vi.fn()
    renderModal(onDismiss)

    fireEvent.click(screen.getByRole("button", { name: /next word/i }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
