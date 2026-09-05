// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useFittedPage } from "./use-fitted-page"

/**
 * The bug this file pins (found via a real screenshot, not inferred): the
 * composer's activity picker on a phone showed a card's content painted over
 * the pager below it. The picker's box measured 288px available against 354px
 * of two real cards - one short, one carrying a maturity badge and an input
 * hint that wraps at phone width. `minPerPage: 2` explains why it never
 * shrank below two cards (see activity-picker-step.tsx); what surprised on
 * top of that is what this file is about - lowering the floor to 1 did not
 * settle on 1, it *oscillated between 1 and 2 forever*, one settle pass per
 * animation frame, because "is there room for one more" is estimated from
 * the row(s) already shown. Shown alone, the short card's average makes room
 * look available; the instant the tall card renders alongside it, the page
 * overflows and is given back - leaving the short card's average exactly as
 * it was, so the very same guess fires again next frame.
 *
 * jsdom has no ResizeObserver and no real layout, so both are faked: a
 * FakeResizeObserver the test fires by hand (mirroring
 * use-resize-observer.test.tsx's fake), and per-row heights read off
 * `data-h` via a live `scrollHeight` getter, so the "content" really does
 * grow and shrink as `pageItems` changes shape.
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

beforeEach(() => {
  FakeResizeObserver.instances = []
  vi.stubGlobal("ResizeObserver", FakeResizeObserver)
  // Deterministic and synchronous, so a `fire()` resolves its whole settle
  // pass (including any state update and re-render) before the next line of
  // the test runs - no fake timers, no waiting on a real frame.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
    cb(0)
    return 0
  })
  vi.stubGlobal("cancelAnimationFrame", (): void => {})
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

type HarnessProps = {
  heights: ReadonlyArray<number>
  available: number
  minPerPage?: number
  maxPerPage?: number
}

/**
 * Wires real `clientHeight` / `scrollHeight` readings to plain numbers a test
 * can control: the viewport's height is fixed at `available`, and the
 * content's height is the live sum of whichever rows `pageItems` currently
 * holds - so paging really does change what the hook measures, the same way
 * a real card mounting or unmounting does.
 */
const Harness = ({
  heights,
  available,
  minPerPage,
  maxPerPage,
}: HarnessProps): React.JSX.Element => {
  const items = heights.map((_, index) => index)
  const { viewportRef, contentRef, pageItems, perPage } = useFittedPage(items, {
    minPerPage,
    maxPerPage,
  })

  return (
    <div
      ref={(node) => {
        viewportRef.current = node
        if (node) {
          Object.defineProperty(node, "clientHeight", {
            configurable: true,
            value: available,
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
        {pageItems.map((index) => (
          <div key={index} data-h={heights[index]} />
        ))}
      </div>
      <span data-testid="per-page">{perPage}</span>
    </div>
  )
}

/** Pumps the fake observer until `perPage` stops changing, or gives up. */
function settleAndReadPerPage(maxTicks: number): Array<number> {
  const observer = FakeResizeObserver.instances[0]!
  const readings: Array<number> = [
    Number(screen.getByTestId("per-page").textContent),
  ]
  for (let tick = 0; tick < maxTicks; tick += 1) {
    act(() => observer.fire())
    readings.push(Number(screen.getByTestId("per-page").textContent))
  }
  return readings
}

describe("useFittedPage: convergence with non-uniform row heights", () => {
  it("settles on one row rather than oscillating between one and two forever", () => {
    // Row 0 alone (100px) leaves 100px of the 200px box unaccounted for -
    // enough, by row 0's own average, to look like room for another 100px
    // row. Row 1 is 150px: together they are 250px, over the 200px box.
    render(<Harness heights={[100, 150, 100, 100]} available={200} />)

    const readings = settleAndReadPerPage(30)
    const tail = readings.slice(-6)

    expect(
      new Set(tail).size,
      `perPage kept changing across the last few settle passes: ${JSON.stringify(tail)}. ` +
        `It must reach a fixed point and stay there - a page that never stops ` +
        `re-proposing a count it already measured as too tall is a live render ` +
        `loop, not "still converging".`
    ).toBe(1)
    expect(tail[tail.length - 1]).toBe(1)
  })

  it("still fits comfortably when every row is short relative to the box", () => {
    render(<Harness heights={[50, 50, 50, 50]} available={200} />)

    const readings = settleAndReadPerPage(30)
    const tail = readings.slice(-6)

    expect(new Set(tail).size).toBe(1)
    // 4 * 50 = 200 <= 200: all four genuinely fit in one page.
    expect(tail[tail.length - 1]).toBe(4)
  })

  it("re-measures rather than staying capped once the box actually grows", () => {
    // Same shape as the oscillation case - it settles on 1 at available=200 -
    // but the box is then given enough room for both rows, and growth has to
    // be reachable again rather than permanently capped by the earlier
    // rejection.
    const heights = [100, 150]
    const { rerender } = render(<Harness heights={heights} available={200} />)
    settleAndReadPerPage(20)
    expect(Number(screen.getByTestId("per-page").textContent)).toBe(1)

    rerender(<Harness heights={heights} available={300} />)
    const readings = settleAndReadPerPage(20)
    const tail = readings.slice(-6)

    expect(new Set(tail).size).toBe(1)
    expect(tail[tail.length - 1]).toBe(2)
  })

  it("never drops below minPerPage even when that count cannot fit", () => {
    render(<Harness heights={[100, 150]} available={200} minPerPage={2} />)

    const readings = settleAndReadPerPage(30)
    const tail = readings.slice(-6)

    // minPerPage: 2 forces an unfittable page rather than oscillating -
    // that floor is a deliberate, documented tradeoff (see the Options doc
    // comment), and it must still be a *stable* 2, not a 2-vs-something-else
    // flicker.
    expect(new Set(tail).size).toBe(1)
    expect(tail[tail.length - 1]).toBe(2)
  })
})
