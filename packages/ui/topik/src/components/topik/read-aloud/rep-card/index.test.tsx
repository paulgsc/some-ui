import { act, cleanup, render } from "@testing-library/react"
import { RepCard } from "@topik/components/topik/read-aloud/rep-card"
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
