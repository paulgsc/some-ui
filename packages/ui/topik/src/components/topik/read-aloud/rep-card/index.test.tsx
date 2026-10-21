import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { RepCard } from "@topik/components/topik/read-aloud/rep-card"
import { STARTER_SET } from "@topik/lib/topik/read-aloud/repo-sets"
import type { SetItem } from "@topik/lib/topik/read-aloud/set-builder"
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
        deck={STARTER_SET}
        entry={{ item: JAN, role: "rep" }}
        step="turn"
        stepMs={3000}
        stepKey={7}
        reported={false}
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
      deck: STARTER_SET,
      entry: { item: JAN, role: "rep" as const },
      step: "audio" as const,
      stepMs: null,
      stepKey: 8,
      reported: false,
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

describe("RepCard's reason and pool bar", () => {
  it("says why a return is back, and draws the bar from what the sitting has shown", () => {
    const { rerender } = render(
      <RepCard
        deck={STARTER_SET}
        entry={{ item: JAN, role: "return" }}
        step="echo"
        stepMs={null}
        stepKey={1}
        reported={false}
        playing={false}
        pool={{ shown: 3, of: 12 }}
        short={false}
        onStuck={noop}
        onSkip={noop}
        onResume={noop}
      />
    )
    expect(
      document.querySelector('[data-slot="read-aloud-reason"]')?.textContent
    ).toBe("Back: you marked it stuck")
    const bar = screen.getByRole("meter", {
      name: "Different sentences shown this sitting",
    })
    expect(bar.getAttribute("aria-valuenow")).toBe("3")
    expect(bar.getAttribute("aria-valuemax")).toBe("12")
    rerender(
      <RepCard
        deck={STARTER_SET}
        entry={{ item: JAN, role: "rep" }}
        step="turn"
        stepMs={null}
        stepKey={1}
        reported={false}
        playing={false}
        pool={{ shown: 0, of: 0 }}
        short={false}
        onStuck={noop}
        onSkip={noop}
        onResume={noop}
      />
    )
    expect(document.querySelector('[data-slot="read-aloud-reason"]')).toBeNull()
    expect(screen.queryByRole("meter")).toBeNull()
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
        deck={STARTER_SET}
        entry={{ item: oneCup, role: "rep" }}
        step="turn"
        stepMs={5000}
        stepKey={9}
        reported={false}
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

describe("RepCard's New or Seen before", () => {
  const SENTENCE: SetItem = {
    kind: "sentence",
    key: "s:cafe-order",
    lineId: "cafe-order",
    text: "한 잔 주세요.",
    syllables: 5,
    wordIds: [],
  }
  const props = {
    deck: STARTER_SET,
    entry: { item: SENTENCE, role: "rep" as const },
    step: "glyphs" as const,
    stepMs: null,
    stepKey: 1,
    reported: false,
    playing: false,
    short: false,
    onStuck: noop,
    onSkip: noop,
    onResume: noop,
  }
  const chip = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('[data-slot="read-aloud-mark"]')

  it("shows a hollow ring and New, or dots and Seen before, and nothing when it has no mark", () => {
    const { rerender } = render(<RepCard {...props} />)
    expect(chip()).toBeNull()
    rerender(<RepCard {...props} exposure={{ kind: "new" }} />)
    expect(chip()?.textContent).toBe("New")
    expect(chip()?.dataset["mark"]).toBe("new")
    expect(chip()?.querySelector(".border-2")).not.toBeNull()
    rerender(<RepCard {...props} exposure={{ kind: "seen" }} />)
    expect(chip()?.textContent).toBe("Seen before")
    expect(chip()?.querySelectorAll(".bg-current")).toHaveLength(3)
  })

  it("stays out of the live region, so a step change does not announce it", () => {
    render(<RepCard {...props} exposure={{ kind: "seen" }} />)
    const live = document.querySelector('[aria-live="polite"]')
    expect(live?.textContent).toBe("Read it aloud")
    expect(live?.contains(chip())).toBe(false)
  })

  it("is a button that opens the facts only when it can, and plain text otherwise", () => {
    const onOpen = vi.fn()
    const { rerender } = render(
      <RepCard {...props} exposure={{ kind: "new", onOpen }} />
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "New. See what is kept about this sentence",
      })
    )
    expect(onOpen).toHaveBeenCalledOnce()
    rerender(<RepCard {...props} exposure={{ kind: "new" }} />)
    expect(screen.queryByRole("button", { name: /^new/i })).toBeNull()
    expect(chip()?.tagName).toBe("SPAN")
  })
})
