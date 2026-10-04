import type { Speaker } from "@some-ui/speech"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReadAloudSessionProps } from "@topik/components/topik/read-aloud/read-aloud-session"
import { ReadAloudSession } from "@topik/components/topik/read-aloud/read-aloud-session"
import type { ReadAloudRecordEvent } from "@topik/lib/topik/adapter/hooks/use-read-aloud"
import { STARTER_DECK } from "@topik/lib/topik/read-aloud/starter"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const SPOKEN_MS = 800

function fakeSpeech(): Speaker {
  return {
    available: true,
    say: (_text, options): Promise<void> => {
      options.onStart?.()
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, SPOKEN_MS)
        options.signal?.addEventListener("abort", () => {
          clearTimeout(timer)
          reject(new DOMException("aborted", "AbortError"))
        })
      })
    },
    stop: () => undefined,
    muted: false,
    speaking: false,
    subscribe: () => () => undefined,
    describe: () => ({
      platform: "browser",
      voice: null,
      speaksLanguage: true,
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
      deck={STARTER_DECK}
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
    expect(screen.getByText("Level 1")).toBeTruthy()
    await advance(60_000)
    expect(rep()).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /start/i }))
    expect(stepOf()).toBe("glyphs")
  })

  it("is not offered without a voice (Cor. 4.6)", () => {
    renderSession({ speech: null })
    expect(screen.getByText(/no voice to play it with/i)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /start/i })).toBeNull()
  })

  it("says so, and offers a way back, when the level has nothing to read", () => {
    const { onExit } = renderSession({
      deck: {
        ...STARTER_DECK,
        lines: STARTER_DECK.lines.filter((line) => line.level === 3),
      },
    })
    fireEvent.click(screen.getByRole("button", { name: /start/i }))
    expect(screen.getByText(/nothing at this level/i)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /start/i })).toBeNull()
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
    fireEvent.click(screen.getByRole("button", { name: /start/i }))
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
    fireEvent.click(screen.getByRole("button", { name: /start/i }))
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
    fireEvent.click(screen.getByRole("button", { name: /start/i }))
    await runUntil(
      () => stepOf() === "gloss" && rep()?.dataset["kind"] === "sentence"
    )
    const basket = screen.getByRole("list", { name: /words in this sentence/i })
    expect(basket.querySelectorAll("li").length).toBeGreaterThan(0)
  })

  it("starts a paused rep over on resume", async () => {
    renderSession()
    fireEvent.click(screen.getByRole("button", { name: /start/i }))
    await runUntil(() => stepOf() === "echo")
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    expect(stepOf()).toBe("paused")
    fireEvent.click(screen.getAllByRole("button", { name: /resume/i })[0]!)
    expect(stepOf()).toBe("glyphs")
  })

  it("closes a set with its count, then moves on to the next", async () => {
    const { records } = renderSession()
    fireEvent.click(screen.getByRole("button", { name: /start/i }))
    await runUntil(
      () => document.querySelector('[data-slot="read-aloud-summary"]') !== null
    )
    expect(screen.getByText("10 read aloud")).toBeTruthy()
    expect(records.filter((event) => event.type === "rep")).toHaveLength(10)
    fireEvent.click(screen.getByRole("button", { name: /next set/i }))
    expect(stepOf()).toBe("glyphs")
  })

  it("stops when the learner closes it", () => {
    const { onExit } = renderSession()
    fireEvent.click(screen.getByRole("button", { name: /start/i }))
    fireEvent.click(screen.getByRole("button", { name: /stop reading aloud/i }))
    expect(onExit).toHaveBeenCalledOnce()
  })
})
