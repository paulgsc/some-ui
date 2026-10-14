import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { RepCard } from "@topik/components/topik/read-aloud/rep-card"
import type { Lens, LensAnswer } from "@topik/lib/topik/read-aloud/lens"
import type { SetItem } from "@topik/lib/topik/read-aloud/set-builder"
import { STARTER_DECK } from "@topik/lib/topik/read-aloud/starter"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const JAN: SetItem = {
  kind: "word",
  key: "w:jan:잔",
  wordId: "jan",
  text: "잔",
  lineId: "cafe-order",
  syllables: 1,
}

const noop = (): void => undefined

const marked = (): Array<string> =>
  Array.from(document.querySelectorAll("[data-marked]"), (el) =>
    el.textContent.trim()
  )

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("RepCard's mark", () => {
  it("keeps a one-syllable word marked for its whole turn", () => {
    render(
      <RepCard
        deck={STARTER_DECK}
        entry={{ item: JAN, role: "rep" }}
        step="turn"
        stepMs={3000}
        stepKey={7}
        reported={false}
        answer={null}
        revealed={false}
        onAnswer={noop}
        playing={false}
        short={false}
        onStuck={noop}
        onSkip={noop}
        onResume={noop}
      />
    )
    expect(marked()).toEqual(["잔"])
    act(() => {
      vi.advanceTimersByTime(2900)
    })
    expect(marked()).toEqual(["잔"])
  })

  it("waits for the sound before marking the audio", () => {
    const props = {
      deck: STARTER_DECK,
      entry: { item: JAN, role: "rep" as const },
      step: "audio" as const,
      stepMs: null,
      stepKey: 8,
      reported: false,
      answer: null,
      revealed: false,
      onAnswer: noop,
      short: false,
      onStuck: noop,
      onSkip: noop,
      onResume: noop,
    }
    const { rerender } = render(<RepCard {...props} playing={false} />)
    expect(marked()).toEqual([])
    rerender(<RepCard {...props} playing />)
    expect(marked()).toEqual(["잔"])
  })
})

describe("a sentence's mark", () => {
  it("holds a longer word for longer", () => {
    // 한 잔 주세요: one, one, then three syllables over a 5s turn.
    const oneCup: SetItem = {
      kind: "sentence",
      key: "s:cafe-order-tail",
      lineId: "none",
      text: "한 잔 주세요.",
      syllables: 5,
      wordIds: [],
    }
    render(
      <RepCard
        deck={STARTER_DECK}
        entry={{ item: oneCup, role: "rep" }}
        step="turn"
        stepMs={5000}
        stepKey={9}
        reported={false}
        answer={null}
        revealed={false}
        onAnswer={noop}
        playing={false}
        short={false}
        onStuck={noop}
        onSkip={noop}
        onResume={noop}
      />
    )
    const at = (ms: number): Array<string> => {
      act(() => {
        vi.advanceTimersByTime(ms)
      })
      return marked()
    }
    expect(marked()).toEqual(["한"])
    expect(at(1000)).toEqual(["잔"])
    expect(at(1000)).toEqual(["주세요"])
    expect(at(2500)).toEqual(["주세요"])
  })
})

describe("a grammar lens", () => {
  // 저는 아침마다 커피를 한 잔 마셔요: six written words.
  const coffee = (lens: Lens): SetItem => ({
    kind: "sentence",
    key: "s:morning-coffee",
    lineId: "morning-coffee",
    text: "저는 아침마다 커피를 한 잔 마셔요.",
    syllables: 14,
    wordIds: ["jeo", "achim", "keopi", "hana", "jan", "masida"],
    lens,
  })

  const card = (
    lens: Lens,
    step: "turn" | "gloss",
    answer: LensAnswer | null,
    onAnswer: (answer: LensAnswer) => void = noop
  ): void => {
    render(
      <RepCard
        deck={STARTER_DECK}
        entry={{ item: coffee(lens), role: "rep" }}
        step={step}
        stepMs={5000}
        stepKey={3}
        reported={false}
        answer={answer}
        revealed={false}
        onAnswer={onAnswer}
        playing={false}
        short={false}
        onStuck={noop}
        onSkip={noop}
        onResume={noop}
      />
    )
  }

  const flagged = (flag: string): Array<string> =>
    Array.from(document.querySelectorAll(`[data-${flag}]`), (el) =>
      el.textContent.trim()
    )

  it("asks a role in Korean and takes a word of the line as the answer", () => {
    const onAnswer = vi.fn()
    card({ kind: "role", role: "object", word: 2 }, "turn", null, onAnswer)
    expect(screen.getByText("Find what is acted on")).toBeTruthy()
    expect(
      document.querySelector("[data-slot=read-aloud-lens] [lang=ko]")
        ?.textContent
    ).toBe("무엇을")
    fireEvent.click(screen.getByRole("button", { name: "커피를" }))
    expect(onAnswer).toHaveBeenCalledWith({ kind: "word", word: 2 })
    expect(screen.queryByRole("button", { name: "past" })).toBeNull()
  })

  it("shows the answer at the gloss, and strikes a wrong pick", () => {
    card({ kind: "role", role: "object", word: 2 }, "gloss", {
      kind: "word",
      word: 1,
    })
    expect(screen.queryByRole("button", { name: "커피를" })).toBeNull()
    expect(flagged("answer")).toEqual(["커피를"])
    // The particle is what the role is read from: it takes the lens's hue.
    const ending = document.querySelectorAll("[data-answer] [data-ending]")
    expect(Array.from(ending, (el) => el.textContent)).toEqual(["를"])
    expect(ending[0]?.className).toContain("text-orange")
    expect(flagged("missed")).toEqual(["아침마다"])
    expect(
      document
        .querySelector("[data-slot=read-aloud-lens]")
        ?.getAttribute("data-outcome")
    ).toBe("missed")
  })

  it("shows the answer at the gloss when none came", () => {
    card({ kind: "role", role: "object", word: 2 }, "gloss", null)
    expect(flagged("answer")).toEqual(["커피를"])
    expect(flagged("missed")).toEqual([])
  })

  it("names no tense until the gloss, then marks the verb from its form", () => {
    const onAnswer = vi.fn()
    const lens: Lens = { kind: "tense", tense: "present", from: 5 }
    card(lens, "turn", null, onAnswer)
    expect(screen.getByText("Which tense?")).toBeTruthy()
    expect(screen.queryAllByRole("button", { name: "마셔요" })).toEqual([])
    fireEvent.click(screen.getByRole("button", { name: "past" }))
    expect(onAnswer).toHaveBeenCalledWith({ kind: "tense", tense: "past" })
    cleanup()

    card(lens, "gloss", { kind: "tense", tense: "present" })
    expect(screen.getByText("The tense: present")).toBeTruthy()
    expect(flagged("answer")).toEqual(["마셔요"])
    expect(
      screen.getByRole("button", { name: "present" }).hasAttribute("disabled")
    ).toBe(true)
  })
})
