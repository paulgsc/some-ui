import type { Speaker, SpeechOutcome } from "@some-ui/speech"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import {
  readAloudLevelFor,
  ReadAloudScreen,
} from "@topik/components/topik/read-aloud/read-aloud-screen"
import { createReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import { memoryStorage } from "@topik/testing/memory-storage"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

function fakeSpeech(): Speaker {
  return {
    available: true,
    say: (_text, options): Promise<SpeechOutcome> => {
      options.onStart?.()
      return new Promise<SpeechOutcome>((resolve) => {
        const timer = setTimeout(() => resolve({ kind: "heard" }), 600)
        options.signal?.addEventListener("abort", () => {
          clearTimeout(timer)
          resolve({ kind: "cancelled" })
        })
      })
    },
    stop: () => undefined,
    muted: false,
    subscribe: () => () => undefined,
    describe: () => ({
      platform: "browser",
      voice: null,
      availability: "available",
    }),
  }
}

/** 28 September 2026, midday, local time. */
const NOON = new Date(2026, 8, 28, 12).getTime()

const advance = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const glyphs = (): string | null =>
  document
    .querySelector('[data-slot="read-aloud-glyphs"]')
    ?.getAttribute("aria-label") ?? null

beforeEach(() => {
  vi.useFakeTimers({ now: NOON })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("readAloudLevelFor", () => {
  it("follows the TOPIK level up to the drill's highest", () => {
    expect([1, 2, 3, 4, 6].map(readAloudLevelFor)).toEqual([1, 2, 3, 3, 3])
  })
})

describe("ReadAloudScreen", () => {
  it("records what ran and keeps each word's pace", async () => {
    const storage = memoryStorage()
    const store = createReadAloudStore(storage)
    render(
      <ReadAloudScreen
        topikLevel={1}
        speech={fakeSpeech()}
        store={store}
        onExit={() => undefined}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /start/i }))
    for (let tick = 0; tick < 2000; tick += 1) {
      if (document.querySelector('[data-slot="read-aloud-summary"]')) break
      await advance(200)
    }
    const saved = createReadAloudStore(storage)
    expect(saved.record().totals.reps).toBe(10)
    expect(saved.record().totals.sets).toBe(1)
    expect(saved.record().days.map((day) => day.day)).toEqual(["2026-09-28"])
    expect(Object.keys(saved.paces()).length).toBeGreaterThan(0)
    // The set finished, so there is nothing to resume.
    expect(saved.progress(1)).toBeNull()
  })

  it("shows the record on its start screen", () => {
    const store = createReadAloudStore(memoryStorage())
    store.count({ type: "rep", creditMs: 90_000 }, "2026-09-28")
    store.count({ type: "set" }, "2026-09-20")
    render(
      <ReadAloudScreen
        topikLevel={5}
        speech={fakeSpeech()}
        store={store}
        onExit={() => undefined}
      />
    )
    expect(screen.getByText("Level 3")).toBeTruthy()
    const record = screen.getByLabelText("Your reading aloud")
    expect(record.textContent).toContain("Today1 read · 0 sets · 2 min")
    expect(record.textContent).toContain("In all1 read · 1 set · 2 min")
  })

  it("picks an unfinished set up at its next rep in a later sitting", async () => {
    const storage = memoryStorage()
    const first = render(
      <ReadAloudScreen
        topikLevel={2}
        speech={fakeSpeech()}
        store={createReadAloudStore(storage)}
        onExit={() => undefined}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /start/i }))
    const firstItem = glyphs()
    // Let the first rep run to the end, then leave.
    for (let tick = 0; tick < 500 && glyphs() === firstItem; tick += 1) {
      await advance(200)
    }
    const secondItem = glyphs()
    expect(secondItem).not.toBe(firstItem)
    first.unmount()

    render(
      <ReadAloudScreen
        topikLevel={2}
        speech={fakeSpeech()}
        store={createReadAloudStore(storage)}
        onExit={() => undefined}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /continue/i }))
    expect(glyphs()).toBe(secondItem)
  })
})
