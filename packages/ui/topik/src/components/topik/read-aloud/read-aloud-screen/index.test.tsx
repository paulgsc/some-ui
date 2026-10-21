import type { Speaker, SpeechOutcome } from "@some-ui/speech"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ReadAloudScreen } from "@topik/components/topik/read-aloud/read-aloud-screen"
import type { ReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import {
  createReadAloudStore,
  READ_ALOUD_STORAGE_KEYS,
} from "@topik/lib/topik/adapter/read-aloud-store"
import type { StorageLike } from "@topik/lib/topik/adapter/storage"
import {
  REPO_SETS as DECK,
  LEVEL_ONE_LENS_SET,
  LEVEL_ONE_SET,
  REPO_LENS,
} from "@topik/lib/topik/read-aloud/repo-sets"
import { buildSet } from "@topik/lib/topik/read-aloud/set-builder"
import type { Tally } from "@topik/lib/topik/read-aloud/tally"
import { SITTING_MS } from "@topik/lib/topik/read-aloud/timing"
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

describe("ReadAloudScreen, at the end of a sitting", () => {
  /** Reaches the end of a sitting, with the screen mounted on `store`. */
  async function sittingOver(store: ReadAloudStore): Promise<void> {
    render(
      <ReadAloudScreen
        topikLevel={1}
        speech={fakeSpeech()}
        deck={DECK}
        store={store}
        onExit={() => undefined}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /^read aloud$/i }))
    expect(screen.queryByRole("group", { name: ANSWERS })).toBeNull()
    // Every screen ends within two minutes (Rem. 4.10): the sitting is over
    // soon after its thirty.
    await advance(SITTING_MS + 3 * 60_000)
    expect(screen.getByRole("group", { name: ANSWERS })).toBeTruthy()
  }
  const ANSWERS = "About the sentences"
  const saved = (): string | null =>
    document.querySelector('[data-slot="read-aloud-feedback-saved"]')
      ?.textContent || null

  it("asks for the two answers, keeps each on the phone with its own date, and takes one back", async () => {
    const store = createReadAloudStore(memoryStorage())
    await sittingOver(store)
    const easy = screen.getByRole("button", { name: "Too easy" })
    const repeats = screen.getByRole("button", { name: "Too many repeats" })
    expect(easy.getAttribute("aria-pressed")).toBe("false")
    expect(saved()).toBeNull()

    fireEvent.click(easy)
    const first = new Date(Date.now()).toISOString()
    expect(easy.getAttribute("aria-pressed")).toBe("true")
    expect(saved()).toMatch(/^Saved on this phone: Too easy\./)
    expect(store.feedback()).toEqual({
      tooEasy: { at: first },
      tooManyRepeats: null,
    })

    await advance(60_000)
    fireEvent.click(repeats)
    const second = new Date(Date.now()).toISOString()
    expect(saved()).toMatch(/Too easy and Too many repeats/)
    expect(store.feedback()).toEqual({
      tooEasy: { at: first },
      tooManyRepeats: { at: second },
    })

    fireEvent.click(easy)
    fireEvent.click(repeats)
    expect(saved()).toBeNull()
    expect(store.feedback()).toBeNull()
  })

  it("shows an answer given at an earlier sitting, still pressed", async () => {
    const store = createReadAloudStore(memoryStorage())
    store.saveFeedback({
      tooEasy: null,
      tooManyRepeats: { at: new Date(NOON).toISOString() },
    })
    await sittingOver(store)
    expect(
      screen
        .getByRole("button", { name: "Too many repeats" })
        .getAttribute("aria-pressed")
    ).toBe("true")
    expect(
      screen
        .getByRole("button", { name: "Too easy" })
        .getAttribute("aria-pressed")
    ).toBe("false")
  })

  it("says so when the phone cannot keep an answer, and shows what it holds", async () => {
    const base = memoryStorage()
    const held = createReadAloudStore(base)
    held.saveFeedback({
      tooEasy: { at: new Date(NOON).toISOString() },
      tooManyRepeats: null,
    })
    const storage: StorageLike = {
      getItem: (key) => base.getItem(key),
      setItem: (key, value) => {
        if (key === READ_ALOUD_STORAGE_KEYS.feedback) throw new Error("quota")
        base.setItem(key, value)
      },
    }
    await sittingOver(createReadAloudStore(storage))
    const pressed = (name: string): string | null =>
      screen.getByRole("button", { name }).getAttribute("aria-pressed")
    expect(pressed("Too easy")).toBe("true")

    fireEvent.click(screen.getByRole("button", { name: "Too many repeats" }))
    expect(saved()).toBe("This phone couldn't keep that.")
    // The buttons show the answer the phone still holds, not the one tapped.
    expect(pressed("Too many repeats")).toBe("false")
    expect(pressed("Too easy")).toBe("true")
    expect(held.feedback()).toMatchObject({ tooManyRepeats: null })
  })
})

describe("ReadAloudScreen", () => {
  it("starts the grammar lens beside read-aloud, and comes back from it", () => {
    render(
      <ReadAloudScreen
        topikLevel={1}
        speech={fakeSpeech()}
        deck={DECK}
        lensDeck={REPO_LENS}
        store={createReadAloudStore(memoryStorage())}
        onExit={() => undefined}
      />
    )
    expect(screen.getByRole("button", { name: /^read aloud$/i })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /grammar lens/i }))
    expect(document.querySelector('[data-slot="lens-card"]')).not.toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /back to read-aloud/i }))
    expect(screen.getByRole("button", { name: /^read aloud$/i })).toBeTruthy()
  })

  it("says on its start screen when the lens record keeps no new answers (Rem. 4.18)", () => {
    const full = vi.fn(() => false)
    render(
      <ReadAloudScreen
        topikLevel={1}
        speech={null}
        deck={DECK}
        lensDeck={REPO_LENS}
        store={createReadAloudStore(memoryStorage())}
        lensRecord={{ add: () => undefined, full }}
        onExit={() => undefined}
      />
    )
    expect(screen.queryByText(/record is full/i)).toBeNull()
    full.mockReturnValue(true)
    fireEvent.click(screen.getByRole("button", { name: /grammar lens/i }))
    fireEvent.click(screen.getByRole("button", { name: /back to read-aloud/i }))
    expect(screen.getByText(/record is full/i)).toBeTruthy()
  })

  it("offers the grammar lens where nothing can speak (Cor. 4.8)", () => {
    render(
      <ReadAloudScreen
        topikLevel={1}
        speech={null}
        deck={DECK}
        lensDeck={REPO_LENS}
        store={createReadAloudStore(memoryStorage())}
        onExit={() => undefined}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /grammar lens/i }))
    expect(document.querySelector('[data-slot="lens-card"]')).not.toBeNull()
  })

  it("opens a lens set on the grammar lens, and leaves to where it came from", () => {
    const onExit = vi.fn()
    render(
      <ReadAloudScreen
        topikLevel={1}
        speech={fakeSpeech()}
        deck={LEVEL_ONE_LENS_SET}
        store={createReadAloudStore(memoryStorage())}
        onExit={onExit}
      />
    )
    expect(document.querySelector('[data-slot="lens-card"]')).not.toBeNull()
    expect(screen.queryByRole("button", { name: /^read aloud$/i })).toBeNull()
    fireEvent.click(
      screen.getByRole("button", { name: /stop the grammar lens/i })
    )
    expect(onExit).toHaveBeenCalledOnce()
  })

  it("offers a read-aloud set no grammar lens", () => {
    render(
      <ReadAloudScreen
        topikLevel={1}
        speech={fakeSpeech()}
        deck={LEVEL_ONE_SET}
        lensDeck={REPO_LENS}
        store={createReadAloudStore(memoryStorage())}
        onExit={() => undefined}
      />
    )
    expect(screen.getByRole("button", { name: /^read aloud$/i })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /grammar lens/i })).toBeNull()
    expect(
      document.querySelector('[data-slot="read-aloud-lens-about"]')
    ).toBeNull()
  })

  it("records what ran and keeps each word's pace", async () => {
    const storage = memoryStorage()
    const store = createReadAloudStore(storage)
    render(
      <ReadAloudScreen
        topikLevel={1}
        speech={fakeSpeech()}
        deck={DECK}
        store={store}
        onExit={() => undefined}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /^read aloud$/i }))
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
    expect(saved.progress(1, DECK.id)).toBeNull()
  })

  it("shows the record on its start screen", () => {
    const store = createReadAloudStore(memoryStorage())
    store.count({ type: "rep", creditMs: 90_000 }, "2026-09-28")
    store.count({ type: "set" }, "2026-09-20")
    render(
      <ReadAloudScreen
        topikLevel={5}
        speech={fakeSpeech()}
        deck={DECK}
        store={store}
        onExit={() => undefined}
      />
    )
    expect(
      document.querySelector('[data-slot="read-aloud-level"]')?.textContent
    ).toBe("TOPIK 3")
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
        deck={DECK}
        store={createReadAloudStore(storage)}
        onExit={() => undefined}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /^read aloud$/i }))
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
        deck={DECK}
        store={createReadAloudStore(storage)}
        onExit={() => undefined}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /continue/i }))
    expect(glyphs()).toBe(secondItem)
  })

  it("starts afresh when the unfinished set was drawn from an earlier copy of the deck", () => {
    const store = createReadAloudStore(memoryStorage())
    store.saveProgress(2, DECK.id, {
      queue: [
        {
          role: "rep",
          item: {
            kind: "word",
            key: "w:gone:없어요",
            wordId: "gone",
            text: "없어요",
            lineId: "a-line-since-replaced",
            syllables: 3,
          },
        },
      ],
      returns: {},
      counted: 1,
      reported: false,
    })
    render(
      <ReadAloudScreen
        topikLevel={2}
        speech={fakeSpeech()}
        deck={DECK}
        store={store}
        onExit={() => undefined}
      />
    )
    expect(screen.queryByRole("button", { name: /continue/i })).toBeNull()
    expect(screen.getByRole("button", { name: /^read aloud$/i })).toBeTruthy()
  })
})

describe("ReadAloudScreen's tally (Rem. 7.5)", () => {
  const YESTERDAY = new Date(2026, 8, 27, 12).toISOString()
  /** Every sentence of the deck shown once, read to the end, yesterday. */
  const SEEN_YESTERDAY: Tally = Object.fromEntries(
    DECK.lines.map((line) => [
      line.id,
      { first: YESTERDAY, last: YESTERDAY, shown: 1, read: 1 },
    ])
  )

  const show = (store: ReadAloudStore): ReturnType<typeof render> =>
    render(
      <ReadAloudScreen
        topikLevel={1}
        speech={fakeSpeech()}
        deck={DECK}
        store={store}
        onExit={() => undefined}
      />
    )
  const rep = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('[data-slot="read-aloud-rep"]')
  const chip = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('[data-slot="read-aloud-mark"]')

  /** Run until a sentence's rep is on its first step; the line it shows. */
  async function toSentence(): Promise<void> {
    fireEvent.click(screen.getByRole("button", { name: /^read aloud$/i }))
    for (let tick = 0; tick < 3000; tick += 1) {
      if (rep()?.dataset["kind"] === "sentence") return
      await advance(100)
    }
    throw new Error("no sentence came")
  }

  it("keeps a sentence's first showing and its reading to the end on the phone, as the rep runs", async () => {
    const storage = memoryStorage()
    const store = createReadAloudStore(storage)
    show(store)
    await toSentence()
    expect(chip()?.textContent).toBe("New")
    const shown = store.tally()
    const [lineId] = Object.keys(shown)
    expect(Object.keys(shown)).toHaveLength(1)
    expect(shown[lineId ?? ""]).toEqual({
      first: new Date(NOON).toISOString(),
      last: new Date(NOON).toISOString(),
      shown: 1,
      read: 0,
    })
    // The rep runs to the end: it is read once, and shown no more.
    for (let tick = 0; tick < 3000; tick += 1) {
      if ((store.tally()[lineId ?? ""]?.read ?? 0) > 0) break
      await advance(100)
    }
    expect(store.tally()[lineId ?? ""]).toMatchObject({ shown: 1, read: 1 })
  })

  it("calls a sentence Seen before in a later sitting, from what the phone kept, across a restart", async () => {
    const storage = memoryStorage()
    createReadAloudStore(storage).saveTally(SEEN_YESTERDAY)
    show(createReadAloudStore(storage))
    await toSentence()
    expect(chip()?.textContent).toBe("Seen before")
    const rows = createReadAloudStore(storage).tally()
    const counts = Object.values(rows).map((row) => row.shown)
    expect(counts.filter((n) => n === 2)).toHaveLength(1)
    expect(counts.filter((n) => n === 1)).toHaveLength(DECK.lines.length - 1)
  })

  it("shows what is kept in the sheet, and holds the drill while it is open", async () => {
    const storage = memoryStorage()
    createReadAloudStore(storage).saveTally(SEEN_YESTERDAY)
    show(createReadAloudStore(storage))
    await toSentence()
    fireEvent.click(screen.getByRole("button", { name: /^seen before/i }))
    const sheet = screen.getByRole("dialog").textContent
    expect(sheet).toContain("Shown2 times")
    expect(sheet).toContain("First shownyesterday")
    expect(sheet).toContain("Last showntoday")
    expect(sheet).toContain("Kept on this phone, since yesterday.")
    expect(rep()?.dataset["step"]).toBe("paused")
  })

  it("runs the drill on when the phone cannot keep the tally, and says so in the sheet", async () => {
    const base = memoryStorage()
    const storage: StorageLike = {
      getItem: (key) => base.getItem(key),
      setItem: (key, value) => {
        if (key === READ_ALOUD_STORAGE_KEYS.tally) throw new Error("quota")
        base.setItem(key, value)
      },
    }
    show(createReadAloudStore(storage))
    await toSentence()
    // The mark and the sheet still work from what the screen holds.
    expect(chip()?.textContent).toBe("New")
    fireEvent.click(screen.getByRole("button", { name: /^new/i }))
    expect(screen.getByRole("dialog").textContent).toContain(
      "This phone couldn't keep this, so it lasts only until you close it."
    )
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    for (let tick = 0; tick < 3000; tick += 1) {
      if (document.querySelector('[data-slot="read-aloud-summary"]')) break
      await advance(200)
    }
    expect(
      document.querySelector('[data-slot="read-aloud-summary"]')
    ).not.toBeNull()
    expect(createReadAloudStore(base).tally()).toEqual({})
    expect(createReadAloudStore(base).record().totals.reps).toBe(10)
  })

  it("clears the tally on a second press and leaves the practice record alone", () => {
    const storage = memoryStorage()
    const store = createReadAloudStore(storage)
    store.saveTally(SEEN_YESTERDAY)
    store.count({ type: "rep", creditMs: 90_000 }, "2026-09-28")
    show(store)
    fireEvent.click(
      screen.getByRole("button", { name: "Clear what is kept about sentences" })
    )
    expect(Object.keys(store.tally())).toHaveLength(DECK.lines.length)
    fireEvent.click(screen.getByRole("button", { name: "Clear it" }))
    expect(store.tally()).toEqual({})
    expect(createReadAloudStore(storage).tally()).toEqual({})
    expect(store.record().totals.reps).toBe(1)
    expect(
      document.querySelector('[data-slot="read-aloud-tally"]')?.textContent
    ).toContain("Cleared.")
  })

  it("keeps what it holds, and says so, when the phone cannot clear it", () => {
    const base = memoryStorage()
    createReadAloudStore(base).saveTally(SEEN_YESTERDAY)
    const storage: StorageLike = {
      getItem: (key) => base.getItem(key),
      setItem: (key, value) => {
        if (key === READ_ALOUD_STORAGE_KEYS.tally) throw new Error("quota")
        base.setItem(key, value)
      },
    }
    show(createReadAloudStore(storage))
    fireEvent.click(
      screen.getByRole("button", { name: "Clear what is kept about sentences" })
    )
    fireEvent.click(screen.getByRole("button", { name: "Clear it" }))
    expect(
      document.querySelector('[data-slot="read-aloud-tally"]')?.textContent
    ).toContain("This phone couldn't clear it.")
    expect(Object.keys(createReadAloudStore(base).tally())).toHaveLength(
      DECK.lines.length
    )
  })

  it("keeps a reading and the next showing, though both come in one step before the screen renders", async () => {
    const storage = memoryStorage()
    const store = createReadAloudStore(storage)
    // Two sentences side by side: the first ends and the second begins in one step.
    const [one, two] = buildSet(DECK, { level: 1, seedKey: "tally" }).filter(
      (item) => item.kind === "sentence"
    )
    if (!one || !two) throw new Error("the deck has too few sentences")
    store.saveProgress(1, DECK.id, {
      queue: [one, two].map((item) => ({ item, role: "rep" as const })),
      returns: {},
      counted: 0,
      reported: false,
    })
    show(store)
    fireEvent.click(screen.getByRole("button", { name: /continue/i }))
    for (let tick = 0; tick < 3000; tick += 1) {
      if (document.querySelector('[data-slot="read-aloud-summary"]')) break
      await advance(100)
    }
    const rows = store.tally()
    expect(Object.keys(rows).sort()).toEqual([one.lineId, two.lineId].sort())
    for (const row of Object.values(rows)) {
      expect(row).toMatchObject({ shown: 1, read: 1 })
    }
  })
})
