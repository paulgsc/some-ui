import { act, cleanup, render, screen } from "@testing-library/react"
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
  const props = {
    deck: STARTER_SET,
    stepMs: null,
    stepKey: 1,
    reported: false,
    playing: false,
    short: false,
    onStuck: noop,
    onSkip: noop,
    onResume: noop,
  }
  const reason = (): string | null =>
    document.querySelector('[data-slot="read-aloud-reason"]')?.textContent ??
    null

  it("says a return is back because the learner marked it stuck, at every step", () => {
    const { rerender } = render(
      <RepCard {...props} entry={{ item: JAN, role: "return" }} step="turn" />
    )
    expect(reason()).toBe("Back: you marked it stuck")
    rerender(
      <RepCard {...props} entry={{ item: JAN, role: "return" }} step="echo" />
    )
    expect(reason()).toBe("Back: you marked it stuck")
  })

  it("says a second read at the echo, and nothing at the other steps of a rep", () => {
    const { rerender } = render(
      <RepCard {...props} entry={{ item: JAN, role: "rep" }} step="echo" />
    )
    expect(reason()).toBe("Second read")
    for (const step of ["glyphs", "turn", "audio", "gloss"] as const) {
      rerender(
        <RepCard {...props} entry={{ item: JAN, role: "rep" }} step={step} />
      )
      expect(reason()).toBeNull()
    }
  })

  it("keeps the mark and the step's label on one line", () => {
    render(
      <RepCard {...props} entry={{ item: JAN, role: "return" }} step="echo" />
    )
    const mark = document.querySelector('[data-slot="read-aloud-reason"]')
    expect(mark?.parentElement?.className).toContain("whitespace-nowrap")
    expect(mark?.parentElement?.textContent).toBe(
      "Say it againBack: you marked it stuck"
    )
  })

  it("draws the bar from what the sitting has shown, and none without it", () => {
    const { rerender } = render(
      <RepCard
        {...props}
        entry={{ item: JAN, role: "rep" }}
        step="turn"
        pool={{ shown: 3, of: 12 }}
      />
    )
    const bar = screen.getByRole("meter", {
      name: "Different sentences shown this sitting",
    })
    expect(bar.getAttribute("aria-valuenow")).toBe("3")
    expect(bar.getAttribute("aria-valuemax")).toBe("12")
    rerender(
      <RepCard
        {...props}
        entry={{ item: JAN, role: "rep" }}
        step="turn"
        pool={{ shown: 0, of: 0 }}
      />
    )
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
