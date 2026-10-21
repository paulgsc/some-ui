import type { JSX } from "react"
import { useState } from "react"
import type { Speaker, SpeechOutcome } from "@some-ui/speech"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReadAloudSessionProps } from "@topik/components/topik/read-aloud/read-aloud-session"
import { ReadAloudSession } from "@topik/components/topik/read-aloud/read-aloud-session"
import type { ReadAloudRecordEvent } from "@topik/lib/topik/adapter/hooks/use-read-aloud"
import { STARTER_SET } from "@topik/lib/topik/read-aloud/repo-sets"
import type { Tally } from "@topik/lib/topik/read-aloud/tally"
import { noteRead, noteShown } from "@topik/lib/topik/read-aloud/tally"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const SPOKEN_MS = 800

function fakeSpeech(): Speaker {
  return {
    available: true,
    say: (_text, options): Promise<SpeechOutcome> => {
      options.onStart?.()
      return new Promise<SpeechOutcome>((resolve) => {
        const timer = setTimeout(() => resolve({ kind: "heard" }), SPOKEN_MS)
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

function renderSession(overrides: Partial<ReadAloudSessionProps> = {}): {
  records: Array<ReadAloudRecordEvent>
  onExit: () => void
} {
  const records: Array<ReadAloudRecordEvent> = []
  const onExit = vi.fn()
  render(
    <ReadAloudSession
      deck={STARTER_SET}
      level={1}
      speech={fakeSpeech()}
      seedKey={() => "fixed"}
      onRecord={(event) => records.push(event)}
      onExit={onExit}
      {...overrides}
    />
  )
  return { records, onExit }
}

const advance = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const rep = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-slot="read-aloud-rep"]')

const stepOf = (): string | undefined => rep()?.dataset["step"]

const slotText = (slot: string): string | null =>
  document.querySelector(`[data-slot="${slot}"]`)?.textContent ?? null

const levelChip = (): string | null => slotText("read-aloud-level")

const shortfall = (): string | null => slotText("read-aloud-shortfall")

/** Let the ladder run until `done` holds, in small steps of the clock. */
async function runUntil(done: () => boolean): Promise<void> {
  for (let tick = 0; tick < 2000 && !done(); tick += 1) await advance(100)
  expect(done()).toBe(true)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("ReadAloudSession", () => {
  it("waits on its start screen for the learner's tap", async () => {
    renderSession()
    expect(levelChip()).toBe("TOPIK 1")
    await advance(60_000)
    expect(rep()).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /^read aloud$/i }))
    expect(stepOf()).toBe("glyphs")
  })

  it("keeps the level in sight, and says when lower levels fill its sets", () => {
    renderSession({ level: 2 })
    expect(levelChip()).toBe("TOPIK 2")
    expect(shortfall()).toMatch(/^Only 3 sentences are written for TOPIK 2/)
    fireEvent.click(screen.getByRole("button", { name: /^read aloud$/i }))
    expect(stepOf()).toBe("glyphs")
    expect(levelChip()).toBe("TOPIK 2")
  })

  it("is not offered without a voice (Cor. 4.6)", () => {
    renderSession({ speech: null })
    expect(screen.getByText(/no voice to play it with/i)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^read aloud$/i })).toBeNull()
  })

  it("says so, and offers a way back, when the level has nothing to read", () => {
    const { onExit } = renderSession({
      deck: {
        ...STARTER_SET,
        lines: STARTER_SET.lines.filter((line) => line.level === 3),
      },
    })
    fireEvent.click(screen.getByRole("button", { name: /^read aloud$/i }))
    expect(screen.getByText(/nothing at this level/i)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^read aloud$/i })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /back/i }))
    expect(onExit).toHaveBeenCalledOnce()
  })

  it("offers to continue an unfinished set", () => {
    renderSession({
      resume: {
        queue: [
          {
            role: "rep",
            item: {
              kind: "word",
              key: "w:juda:주세요",
              wordId: "juda",
              text: "주세요",
              lineId: "cafe-order",
              syllables: 3,
            },
          },
        ],
        returns: {},
        counted: 4,
        reported: false,
      },
    })
    fireEvent.click(screen.getByRole("button", { name: /continue/i }))
    expect(screen.getByLabelText("주세요")).toBeTruthy()
  })

  it("runs the ladder by itself, pronouncing the glyphs while the audio plays", async () => {
    renderSession()
    fireEvent.click(screen.getByRole("button", { name: /^read aloud$/i }))
    const steps = new Set<string>()
    let pronounced = false
    await runUntil(() => {
      const step = stepOf()
      if (step) steps.add(step)
      if (step === "audio") {
        pronounced =
          document
            .querySelector('[data-slot="read-aloud-glyphs"]')
            ?.getAttribute("data-mode") === "pronounced"
      }
      return steps.has("gloss")
    })
    expect([...steps]).toEqual(["glyphs", "turn", "audio", "echo", "gloss"])
    expect(pronounced).toBe(true)
  })

  it("plays the audio at once when the learner reports stuck", async () => {
    renderSession()
    fireEvent.click(screen.getByRole("button", { name: /^read aloud$/i }))
    await runUntil(() => stepOf() === "turn")
    fireEvent.click(screen.getByRole("button", { name: /stuck/i }))
    expect(stepOf()).toBe("audio")
    expect(
      screen
        .getByRole("button", { name: /stuck/i })
        .getAttribute("aria-pressed")
    ).toBe("true")
  })

  it("shows a sentence's words at its gloss", async () => {
    renderSession()
    fireEvent.click(screen.getByRole("button", { name: /^read aloud$/i }))
    await runUntil(
      () => stepOf() === "gloss" && rep()?.dataset["kind"] === "sentence"
    )
    const basket = screen.getByRole("list", { name: /words in this sentence/i })
    expect(basket.querySelectorAll("li").length).toBeGreaterThan(0)
  })

  it("starts a paused rep over on resume", async () => {
    renderSession()
    fireEvent.click(screen.getByRole("button", { name: /^read aloud$/i }))
    await runUntil(() => stepOf() === "echo")
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    expect(stepOf()).toBe("paused")
    fireEvent.click(screen.getAllByRole("button", { name: /resume/i })[0]!)
    expect(stepOf()).toBe("glyphs")
  })

  it("offers no Resume while the host's session holds it", async () => {
    const session = (paused: boolean): JSX.Element => (
      <ReadAloudSession
        deck={STARTER_SET}
        level={1}
        speech={fakeSpeech()}
        seedKey={() => "fixed"}
        paused={paused}
        onExit={vi.fn()}
      />
    )
    const { rerender } = render(session(false))
    fireEvent.click(screen.getByRole("button", { name: /^read aloud$/i }))
    await runUntil(() => stepOf() === "echo")

    rerender(session(true))
    expect(stepOf()).toBe("paused")
    // Its Resume would do nothing: the session's own Resume ends the hold.
    expect(screen.queryByRole("button", { name: /resume|pause/i })).toBeNull()
    expect(screen.getByText("Resumes with the session")).toBeDefined()

    rerender(session(false))
    expect(stepOf()).toBe("glyphs")
  })

  it("closes a set with its count, then moves on to the next", async () => {
    const { records } = renderSession()
    fireEvent.click(screen.getByRole("button", { name: /^read aloud$/i }))
    await runUntil(
      () => document.querySelector('[data-slot="read-aloud-summary"]') !== null
    )
    expect(screen.getByText("10 read aloud")).toBeTruthy()
    expect(records.filter((event) => event.type === "rep")).toHaveLength(10)
    fireEvent.click(screen.getByRole("button", { name: /next set/i }))
    expect(stepOf()).toBe("glyphs")
  })

  it("counts the sentences the sitting has shown, on the bar and on each summary, and says so once it has shown every one", async () => {
    renderSession()
    fireEvent.click(screen.getByRole("button", { name: /^read aloud$/i }))
    const bar = (): number =>
      Number(
        screen
          .getByRole("meter", {
            name: /different sentences shown this sitting/i,
          })
          .getAttribute("aria-valuenow")
      )
    expect(bar()).toBe(0)
    const summary = (): boolean => slotText("read-aloud-summary") !== null
    await runUntil(summary)
    // The starter holds seven level-1 sentences and a set draws four.
    expect(slotText("read-aloud-pool-note")).toBe(
      "4 of 7 sentences shown this sitting"
    )
    fireEvent.click(screen.getByRole("button", { name: /next set/i }))
    expect(bar()).toBeGreaterThanOrEqual(4)
    await runUntil(() => !summary() && stepOf() === "glyphs")
    await runUntil(summary)
    expect(slotText("read-aloud-pool-note")).toMatch(
      /^You've seen all 7 sentences/
    )
  })

  it("says why an item is back: a second read, and a return after a stuck report", async () => {
    renderSession()
    fireEvent.click(screen.getByRole("button", { name: /^read aloud$/i }))
    await runUntil(() => stepOf() === "glyphs")
    expect(slotText("read-aloud-reason")).toBeNull()
    await runUntil(() => stepOf() === "echo")
    expect(slotText("read-aloud-reason")).toBe("Second read")
    await runUntil(() => stepOf() === "turn")
    expect(slotText("read-aloud-reason")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /stuck/i }))
    await runUntil(
      () => slotText("read-aloud-reason") === "Back: you marked it stuck"
    )
  })

  it("stops when the learner closes it", () => {
    const { onExit } = renderSession()
    fireEvent.click(screen.getByRole("button", { name: /^read aloud$/i }))
    fireEvent.click(screen.getByRole("button", { name: /stop reading aloud/i }))
    expect(onExit).toHaveBeenCalledOnce()
  })
})

describe("ReadAloudSession's New or Seen before (Rem. 7.5)", () => {
  /** 21 October 2026, midday, local time. */
  const TODAY = new Date(2026, 9, 21, 12)
  const YESTERDAY = new Date(2026, 9, 20, 12).toISOString()

  /** A host that keeps the tally, as the screen does, from `held`. */
  const Kept = ({
    held = {},
    kept = true,
    onClear = (): boolean => true,
  }: {
    held?: Tally
    kept?: boolean
    onClear?: () => boolean
  }): JSX.Element => {
    const [rows, setRows] = useState(held)
    return (
      <ReadAloudSession
        deck={STARTER_SET}
        level={1}
        speech={fakeSpeech()}
        seedKey={() => "fixed"}
        onShown={(lineId, at) =>
          setRows((now) => noteShown(now, lineId, new Date(at).toISOString()))
        }
        onRecord={(event) => {
          if (event.type === "rep" && event.lineId !== undefined) {
            const lineId = event.lineId
            setRows((now) => noteRead(now, lineId))
          }
        }}
        tally={{ rows, today: "2026-10-21", kept, onClear }}
        onExit={vi.fn()}
      />
    )
  }

  /** Every sentence of the deck shown once, yesterday and read to the end. */
  const SEEN_YESTERDAY: Tally = Object.fromEntries(
    STARTER_SET.lines.map((line) => [
      line.id,
      { first: YESTERDAY, last: YESTERDAY, shown: 1, read: 1 },
    ])
  )

  const start = async (kind: "sentence" | "word"): Promise<void> => {
    fireEvent.click(screen.getByRole("button", { name: /^read aloud$/i }))
    await runUntil(
      () => stepOf() === "glyphs" && rep()?.dataset["kind"] === kind
    )
  }
  const chip = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('[data-slot="read-aloud-mark"]')
  const facts = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('[data-slot="read-aloud-facts"]')

  beforeEach(() => {
    vi.setSystemTime(TODAY)
  })

  it("calls a sentence New on its first showing, from the tally that has just heard of it", async () => {
    render(<Kept />)
    await start("sentence")
    expect(chip()?.textContent).toBe("New")
    await runUntil(() => stepOf() === "echo")
    // The mark holds still while the steps change.
    expect(chip()?.textContent).toBe("New")
  })

  it("calls a sentence Seen before once the tally had it already", async () => {
    render(<Kept held={SEEN_YESTERDAY} />)
    await start("sentence")
    expect(chip()?.textContent).toBe("Seen before")
  })

  it("marks a word from the pace book, with no facts behind it", async () => {
    render(<Kept />)
    await start("word")
    expect(chip()?.textContent).toBe("New")
    expect(chip()?.tagName).toBe("SPAN")
  })

  it("holds the drill while the facts are open, and carries on from the start of the rep after", async () => {
    render(<Kept held={SEEN_YESTERDAY} />)
    await start("sentence")
    await runUntil(() => stepOf() === "turn")
    fireEvent.click(
      screen.getByRole("button", {
        name: "Seen before. See what is kept about this sentence",
      })
    )
    expect(stepOf()).toBe("paused")
    expect(screen.getByRole("dialog").textContent).toContain("This sentence")
    const text = facts()?.textContent ?? ""
    expect(text).toContain("Reading is paused while this is open.")
    expect(text).toContain("Shown2 times")
    expect(text).toContain("First shownyesterday")
    expect(text).toContain("Last showntoday")
    expect(text).toContain("Read to the end")
    expect(text).toContain("I hadn't shown it yet this sitting.")
    expect(text).toContain("Kept on this phone, since yesterday.")
    // Nothing about the stuck report is kept as a fact.
    expect(text).not.toMatch(/stuck/i)
    await advance(30_000)
    expect(stepOf()).toBe("paused")

    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(facts()).toBeNull()
    expect(stepOf()).toBe("glyphs")
  })

  it("leaves a rep the learner had paused paused when the facts close", async () => {
    render(<Kept held={SEEN_YESTERDAY} />)
    await start("sentence")
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    fireEvent.click(
      screen.getByRole("button", { name: /^seen before\. see what/i })
    )
    expect(facts()).not.toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(facts()).toBeNull()
    expect(stepOf()).toBe("paused")
  })

  it("says when the phone could not keep it", async () => {
    render(<Kept held={SEEN_YESTERDAY} kept={false} />)
    await start("sentence")
    fireEvent.click(screen.getByRole("button", { name: /^seen before/i }))
    expect(facts()?.textContent).toContain(
      "This phone couldn't keep this, so it lasts only until you close it."
    )
  })

  it("closes the facts when the pause under them ends the sitting, and does not open them again", async () => {
    render(<Kept held={SEEN_YESTERDAY} />)
    await start("sentence")
    fireEvent.click(screen.getByRole("button", { name: /^seen before/i }))
    expect(facts()).not.toBeNull()
    await advance(2 * 60_000 + 1000)
    expect(facts()).toBeNull()
    expect(slotText("read-aloud-sitting-over")).not.toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /keep going/i }))
    expect(stepOf()).toBe("glyphs")
    expect(facts()).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    expect(facts()).toBeNull()
  })

  describe("on the start screen", () => {
    const rows: Tally = {
      ...Object.fromEntries(
        [STARTER_SET.lines[0]?.id ?? "", STARTER_SET.lines[1]?.id ?? ""].map(
          (id) => [
            id,
            {
              first: "2026-10-19T12:00:00.000Z",
              last: YESTERDAY,
              shown: 2,
              read: 1,
            },
          ]
        )
      ),
    }

    it("says what is kept and since when, and clears it only on a second press that says what goes", () => {
      const onClear = vi.fn(() => true)
      render(<Kept held={rows} onClear={onClear} />)
      expect(slotText("read-aloud-tally")).toContain(
        "Kept on this phone: when 2 sentences were shown and read to the end, since 19 Oct."
      )
      fireEvent.click(
        screen.getByRole("button", {
          name: "Clear what is kept about sentences",
        })
      )
      const ask = screen.getByRole("dialog")
      expect(ask.textContent).toContain("Clear what is kept about sentences?")
      expect(ask.textContent).toContain(
        "This clears when 2 sentences were shown and read to the end, since 19 Oct. Your practice record stays."
      )
      expect(onClear).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole("button", { name: "Keep it" }))
      expect(onClear).not.toHaveBeenCalled()

      fireEvent.click(
        screen.getByRole("button", {
          name: "Clear what is kept about sentences",
        })
      )
      fireEvent.click(screen.getByRole("button", { name: "Clear it" }))
      expect(onClear).toHaveBeenCalledOnce()
      expect(slotText("read-aloud-tally")).toContain(
        "Cleared. Every sentence starts as New again."
      )
    })

    it("says so when the phone could not clear it, and keeps offering to", () => {
      render(<Kept held={rows} onClear={() => false} />)
      fireEvent.click(
        screen.getByRole("button", {
          name: "Clear what is kept about sentences",
        })
      )
      fireEvent.click(screen.getByRole("button", { name: "Clear it" }))
      expect(slotText("read-aloud-tally")).toContain(
        "This phone couldn't clear it."
      )
      expect(
        screen.getByRole("button", {
          name: "Clear what is kept about sentences",
        })
      ).toBeTruthy()
    })

    it("offers nothing to clear while nothing is kept", () => {
      render(<Kept />)
      expect(slotText("read-aloud-tally")).toBeNull()
    })
  })
})
