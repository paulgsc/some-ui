// @vitest-environment jsdom
import { useMemo } from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import fc from "fast-check"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useFittedPage } from "./use-fitted-page"

/**
 * Pins the fit against non-uniform rows, where "is there room for one more"
 * estimated from the rows on screen oscillated between two counts forever.
 *
 * jsdom has no ResizeObserver or layout, so both are faked: a
 * FakeResizeObserver fired by hand for changes the hook does not cause, and
 * row heights read live off `data-h` via a `scrollHeight` getter.
 *
 * `requestAnimationFrame` is faked asynchronously: `settle` schedules frames
 * mid-call, and a synchronous rAF would recurse before React flushes (a stack
 * overflow no browser sees). `flushFrame` runs only the callbacks due now.
 *
 * Named cases pin specific shapes; the fast-check block checks convergence
 * for row-height combinations nobody picked by hand.
 */

type Entry = { contentRect: { width: number; height: number } }
type Callback = (entries: Array<Entry>) => void

class FakeResizeObserver {
  static instances: Array<FakeResizeObserver> = []
  private disconnected = false

  constructor(private readonly cb: Callback) {
    FakeResizeObserver.instances.push(this)
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true
  }
  fire(): void {
    if (this.disconnected) return
    this.cb([{ contentRect: { width: 0, height: 0 } }])
  }
}

let pendingFrames: Map<number, FrameRequestCallback>
let nextFrameId: number

beforeEach(() => {
  FakeResizeObserver.instances = []
  vi.stubGlobal("ResizeObserver", FakeResizeObserver)

  pendingFrames = new Map()
  nextFrameId = 0
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
    nextFrameId += 1
    pendingFrames.set(nextFrameId, cb)
    return nextFrameId
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
    pendingFrames.delete(id)
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Runs every frame queued *as of now* - mirrors one real animation frame. */
function flushFrame(): boolean {
  const due = Array.from(pendingFrames.values())
  pendingFrames.clear()
  for (const cb of due) cb(0)
  return due.length > 0
}

type HarnessProps = {
  heights: ReadonlyArray<number>
  available: number
  minPerPage?: number
  maxPerPage?: number
  /** Rebuild `items` every render, like `PromptPanel`'s unmemoized rows. */
  unmemoizedItems?: boolean
  /** A row outside the paged array, like activity-picker-step.tsx's count badge. */
  extra?: number
  /** Key each item by its own value (items are the indices of `heights`). */
  getItemKey?: boolean
  /** Explicit per-position keys, overriding `getItemKey`. */
  keys?: ReadonlyArray<string>
  /** Width a classic scrollbar takes from `clientWidth` while content overflows. */
  scrollbar?: number
  /** Height a pager takes from the box while there is more than one page. */
  pager?: number
}

const VIEWPORT_WIDTH = 358

/**
 * The viewport's height is `available` (less the pager, when shown); the
 * content's height is the live sum of the rows `pageItems` holds.
 */
const Harness = ({
  heights,
  available,
  minPerPage,
  maxPerPage,
  unmemoizedItems,
  extra,
  getItemKey,
  keys,
  scrollbar = 0,
  pager = 0,
}: HarnessProps): React.JSX.Element => {
  const memoized = useMemo(() => heights.map((_, index) => index), [heights])
  const items = unmemoizedItems ? heights.map((_, index) => index) : memoized
  const { viewportRef, contentRef, pageItems, perPage, pageCount, page, next } =
    useFittedPage(items, {
      minPerPage,
      maxPerPage,
      getItemKey: keys
        ? (_item, index): string => keys[index] ?? String(index)
        : getItemKey
          ? (item): number => item
          : undefined,
    })

  return (
    <div
      ref={(node) => {
        viewportRef.current = node
        if (node) {
          const boxHeight = available - (pageCount > 1 ? pager : 0)
          Object.defineProperty(node, "clientHeight", {
            configurable: true,
            value: boxHeight,
          })
          Object.defineProperty(node, "offsetWidth", {
            configurable: true,
            value: VIEWPORT_WIDTH,
          })
          Object.defineProperty(node, "clientWidth", {
            configurable: true,
            get(this: HTMLElement) {
              const content = this.firstElementChild
              const overflows =
                content !== null && content.scrollHeight > boxHeight
              return VIEWPORT_WIDTH - (overflows ? scrollbar : 0)
            },
          })
        }
      }}
    >
      <div
        ref={(node) => {
          contentRef.current = node
          if (node && !Object.getOwnPropertyDescriptor(node, "scrollHeight")) {
            Object.defineProperty(node, "scrollHeight", {
              configurable: true,
              get(this: HTMLElement) {
                return Array.from(
                  this.querySelectorAll<HTMLElement>("[data-h]")
                ).reduce((sum, child) => sum + Number(child.dataset.h), 0)
              },
            })
          }
        }}
      >
        {extra !== undefined && <div data-h={extra} />}
        {pageItems.map((index) => (
          <div key={index} data-h={heights[index]} data-idx={index} />
        ))}
      </div>
      <span data-testid="per-page">{perPage}</span>
      <span data-testid="page">{page}</span>
      <button type="button" data-testid="next-page" onClick={next}>
        next
      </button>
    </div>
  )
}

function readPerPage(): number {
  return Number(screen.getByTestId("per-page").textContent)
}

function readPage(): string | null {
  return screen.getByTestId("page").textContent
}

function shownIndices(): Array<string | undefined> {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-idx]")).map(
    (el) => el.dataset.idx
  )
}

function clickNext(): void {
  act(() => {
    screen.getByTestId("next-page").click()
  })
}

function fireResize(): void {
  act(() => {
    FakeResizeObserver.instances[0]!.fire()
  })
}

const last = (readings: ReadonlyArray<number>): number | undefined =>
  readings[readings.length - 1]

type SettleResult = {
  /** Every value read after a frame that actually ran a callback. */
  readings: Array<number>
  /**
   * True once a frame finds nothing pending. False means `maxFrames` ran out
   * with a frame still scheduled every time: the shape of an oscillation.
   */
  converged: boolean
}

/** Advances frames one at a time until none is pending or `maxFrames` is spent. */
function settleAndReadPerPage(
  maxFrames: number,
  read: () => number = readPerPage
): SettleResult {
  const readings: Array<number> = []
  for (let frame = 0; frame < maxFrames; frame += 1) {
    let advanced: boolean = false
    act(() => {
      advanced = flushFrame()
    })
    // Reassigned inside `act`'s callback, which the linter's control-flow
    // analysis cannot see into, so it narrows `advanced` to `false`.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!advanced) return { readings, converged: true }
    readings.push(read())
  }
  return { readings, converged: false }
}

/** Settles, asserts a fixed point was reached, and returns the readings. */
function settle(maxFrames = 20): Array<number> {
  const { readings, converged } = settleAndReadPerPage(maxFrames)
  expect(
    converged,
    `never reached a fixed point within the frame budget: ${JSON.stringify(readings)}. ` +
      `A page that keeps re-proposing a count it measured as too tall is a ` +
      `live render loop, not "still converging".`
  ).toBe(true)
  return readings
}

describe("useFittedPage: settles on the fitted count from a cold mount", () => {
  it.each<[string, HarnessProps, number]>([
    // 100 alone looks like room for another 100px row; 100 + 150 > 200.
    [
      "settles on one row rather than oscillating between one and two",
      { heights: [100, 150, 100, 100], available: 200 },
      1,
    ],
    [
      "fits every row when all are short relative to the box",
      { heights: [50, 50, 50, 50], available: 200 },
      4,
    ],
    // Four growth steps with the ResizeObserver never fired: each step must
    // schedule the next itself.
    [
      "reaches multi-step growth with no resize notification",
      { heights: [40, 40, 40, 40, 40], available: 250 },
      5,
    ],
    // Mirrors `PromptPanel`, whose rows are rebuilt unmemoized every render.
    [
      "converges when the caller rebuilds its item array every render",
      { heights: [100, 150, 100, 100], available: 200, unmemoizedItems: true },
      1,
    ],
    [
      "never drops below minPerPage even when that count cannot fit",
      { heights: [100, 150], available: 200, minPerPage: 2 },
      2,
    ],
    // An average after row 0 (100px, 50px left) says no; 100 + 40 fits.
    [
      "probes for the fit rather than trusting an average row height",
      { heights: [100, 40, 40], available: 150 },
      2,
    ],
    // The scrollbar the third row's overflow brings narrows `clientWidth`.
    [
      "does not treat a scrollbar the probe causes as a new box",
      { heights: [100, 100, 100], available: 250, scrollbar: 4 },
      2,
    ],
    // Two rows overflow the lone page's 621px; one fits the 569px left beside
    // the pager that two pages bring.
    [
      "does not treat a pager the count brings as a new box",
      { heights: [300, 340], available: 621, pager: 52 },
      1,
    ],
  ])("%s", (_title, props, expected) => {
    render(<Harness {...props} />)
    expect(last(settle(30))).toBe(expected)
  })
})

describe("useFittedPage: when the floor is reset", () => {
  it.each<[string, HarnessProps, HarnessProps, number, number, number]>([
    [
      "re-measures once the box grows",
      { heights: [100, 150], available: 200 },
      { heights: [100, 150], available: 300 },
      1,
      2,
      20,
    ],
    [
      "forgets a rejection when the box changes size despite a scrollbar",
      { heights: [100, 100, 100], available: 250, scrollbar: 4 },
      { heights: [100, 100, 100], available: 320, scrollbar: 4 },
      2,
      3,
      30,
    ],
    [
      "grows when the window gets taller despite a pager",
      { heights: [300, 340], available: 621, pager: 52 },
      { heights: [300, 340], available: 760, pager: 52 },
      1,
      2,
      30,
    ],
  ])("%s", (_title, initial, grown, before, after, frames) => {
    const { rerender } = render(<Harness {...initial} />)
    expect(last(settle(frames))).toBe(before)
    expect(readPerPage()).toBe(before)
    rerender(<Harness {...grown} />)
    fireResize()
    expect(last(settle(frames))).toBe(after)
    expect(readPerPage()).toBe(after)
  })

  it("lets a same-length item swap with shorter content grow, with no resize fired", () => {
    // A real browser sends no resize here: the hook must notice the swap.
    const { rerender } = render(
      <Harness heights={[100, 150]} available={200} />
    )
    expect(last(settle())).toBe(1)

    rerender(<Harness heights={[60, 60]} available={200} />)
    expect(
      last(settle()),
      "60 + 60 fits; the floor learned from [100, 150] must not survive the swap"
    ).toBe(2)
  })

  it("retries growth when a same-length swap changes only the hidden candidate", () => {
    // Row 0 (the one shown at perPage 1) is unchanged, so no measured
    // baseline differs; only the hidden row 1 got shorter.
    const { rerender } = render(
      <Harness heights={[100, 150]} available={200} />
    )
    expect(
      last(settle()),
      "the 2-row attempt (250 > 200) must be tried and rejected first"
    ).toBe(1)

    rerender(<Harness heights={[100, 50]} available={200} />)
    expect(last(settle()), "100 + 50 = 150 fits both rows now").toBe(2)
  })

  it("does not grant a retry when a same-length rebuild keeps the same item keys", () => {
    // `ConfigureStep` editing one field rebuilds the array via `.map()`;
    // `getItemKey` tells that apart from a swap.
    const heights = [100, 150]
    const { rerender } = render(
      <Harness heights={heights} available={200} getItemKey />
    )
    expect(last(settle())).toBe(1)

    rerender(<Harness heights={[...heights]} available={200} getItemKey />)
    // The final value cannot tell "never regrew" from "regrew to 2 and was
    // rejected next frame"; only the trace can.
    expect(
      settle(),
      "a rebuild that keeps the same keys regrew perPage to 2 transiently"
    ).not.toContain(2)
    expect(readPerPage()).toBe(1)
  })

  it("treats a per-position key change as a swap even when the joined strings would collide", () => {
    // ["a|b", "c"] and ["a", "b|c"] both join to "a|b|c".
    const { rerender } = render(
      <Harness heights={[100, 150]} available={200} keys={["a|b", "c"]} />
    )
    expect(last(settle())).toBe(1)

    rerender(<Harness heights={[60, 60]} available={200} keys={["a", "b|c"]} />)
    settle()
    expect(
      readPerPage(),
      "60 + 60 = 120 fits once the swap earns a retry"
    ).toBe(2)
  })

  it("retries growth once externally-driven content shrinks, with items and page unchanged", () => {
    // `extra` stands in for activity-picker-step.tsx's count badge. One
    // stable `heights` reference keeps `items` identity out of the picture.
    const heights = [40, 105]
    const { rerender } = render(
      <Harness heights={heights} available={150} extra={10} />
    )
    // 40 + 105 + 10 = 155 > 150: two rows are tried and rejected.
    expect(last(settle())).toBe(1)

    rerender(<Harness heights={heights} available={150} extra={0} />)
    fireResize()
    expect(last(settle()), "40 + 105 = 145 fits once the badge is gone").toBe(2)
  })
})

describe("useFittedPage: growth on a nonzero page", () => {
  it("does not grow past what keeps a nonzero page's own index valid", () => {
    // Growing to two from page 1 of two items would collapse pageCount to 1.
    const { rerender } = render(
      <Harness heights={[100, 150]} available={200} />
    )
    expect(last(settle())).toBe(1)
    clickNext()
    expect(readPage()).toBe("1")

    rerender(<Harness heights={[60, 60]} available={200} />)
    settle()
    expect(readPerPage()).toBe(1)
    expect(readPage()).toBe("1")
  })

  it("does not silently reshuffle a nonzero page's content when growth keeps its index valid", () => {
    // Page 1 at two per page is items 2-3; at three per page it would be
    // items 3-4 under the same page index.
    const { rerender } = render(
      <Harness heights={[10, 10, 90, 10, 10]} available={100} />
    )
    expect(last(settle())).toBe(2)
    clickNext()
    expect(readPage()).toBe("1")

    rerender(<Harness heights={[10, 10, 10, 10, 10]} available={100} />)
    settle()
    expect(readPage()).toBe("1")
    expect(shownIndices()).toEqual(["2", "3"])
  })

  it("does not grow at all on a nonzero page, even when the grown slice would be entirely real items", () => {
    // growthFillsThisPage(page 1, proposed 2) = 1*2+2 = 4 <= 4 holds, so only
    // the page-0 restriction keeps item 1 on screen.
    const { rerender } = render(
      <Harness heights={[50, 50, 50, 50]} available={60} />
    )
    expect(last(settle()), "any two rows (100 > 60) overflow").toBe(1)
    clickNext()
    expect(readPage()).toBe("1")

    rerender(<Harness heights={[10, 10, 10, 10]} available={60} />)
    settle()
    expect(readPerPage()).toBe(1)
    expect(shownIndices()).toEqual(["1"])
  })

  it("does not let a rejection on a nonzero page reintroduce the oscillation", () => {
    // Shrinking `perPage` on page 1 moves `start`; a floor keyed on the
    // offset would discard itself. maxPerPage 2 makes page 1 the site of the
    // first rejection (100 + 150 > 200).
    render(
      <Harness
        heights={[50, 50, 100, 150]}
        available={200}
        minPerPage={1}
        maxPerPage={2}
      />
    )
    expect(last(settle())).toBe(2)
    clickNext()
    expect(readPage()).toBe("1")
    expect(last(settle())).toBe(1)
  })

  it("does not read a partial last page's spare space as room for one more per page", () => {
    // Growing to 4 would collapse pageCount to 1 and bounce Next back to 0.
    render(<Harness heights={[100, 100, 100, 60]} available={320} />)
    expect(last(settle())).toBe(3)
    clickNext()
    settle()
    expect(readPage()).toBe("1")
    expect(readPerPage()).toBe(3)
  })

  it("does not re-propose on a later page a count an earlier page rejected", () => {
    render(<Harness heights={[100, 150, 20, 20, 20, 20]} available={200} />)
    expect(last(settle())).toBe(1)
    clickNext()
    settle()
    expect(readPerPage()).toBe(1)
    expect(readPage()).toBe("1")
  })
})

describe("useFittedPage: a scrollbar the probe itself causes is not a new box", () => {
  it("keeps rejecting an overflowing count once the scrollbar has come and gone", () => {
    render(<Harness heights={[100, 100, 100]} available={250} scrollbar={15} />)
    expect(settleAndReadPerPage(30).converged).toBe(true)

    for (let frame = 0; frame < 10; frame += 1) {
      act(() => {
        for (const observer of FakeResizeObserver.instances) observer.fire()
        flushFrame()
      })
      expect(readPerPage()).toBe(2)
    }
  })
})

describe("useFittedPage: convergence holds for the whole family, not the one incident", () => {
  // Well above what 8 rows need, so non-convergence fails loudly.
  const MAX_FRAMES = 60

  it("always reaches a fixed point that fits, or is pinned at the floor", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 500 }), {
          minLength: 1,
          maxLength: 8,
        }),
        fc.integer({ min: 1, max: 1000 }),
        (heights, available) => {
          const { unmount, getByTestId } = render(
            <Harness heights={heights} available={available} />
          )

          const readPerPageHere = (): number =>
            Number(getByTestId("per-page").textContent)
          const { readings, converged } = settleAndReadPerPage(
            MAX_FRAMES,
            readPerPageHere
          )

          const finalPerPage = readPerPageHere()
          const usedAtFinal = heights
            .slice(0, finalPerPage)
            .reduce((sum, height) => sum + height, 0)
          unmount()

          expect(
            converged,
            `[heights=${JSON.stringify(heights)}, available=${available}] never ` +
              `reached a fixed point within ${MAX_FRAMES} frames: ${JSON.stringify(readings)}.`
          ).toBe(true)

          // Every fixed point fits, or is pinned at the floor (`minPerPage`).
          expect(
            usedAtFinal <= available || finalPerPage === 1,
            `[heights=${JSON.stringify(heights)}, available=${available}] settled on ` +
              `perPage=${finalPerPage} (uses ${usedAtFinal}px of ${available}px) without ` +
              `either fitting or being pinned at the floor of 1.`
          ).toBe(true)
        }
      ),
      { numRuns: 200 }
    )
  })
})
