// @vitest-environment jsdom
import { useMemo } from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import fc from "fast-check"
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
 * A `ceiling` and a self-rescheduling `settle` fix that - and several rounds
 * of review, each against the *fix itself* rather than the original bug,
 * kept finding a new way for the ceiling to be wrong. The two that mattered
 * most both trace to the same misstep: the first two fixes tried to answer
 * "did the content change" by watching signals in the caller's React state
 * (an item array's identity, a page index), and that question has no
 * reliable answer from the caller's side alone - it read a merely-rebuilt
 * array as new content for `PromptPanel` (which does not memoize its rows;
 * see the `unmemoizedItems` cases below) and missed a real content change
 * that touched neither the array nor the page (a badge's presence changing
 * how a row wraps; see the `extra` cases). The hook's own doc comment now
 * explains why the fix that actually holds asks a different question
 * entirely - not "what changed", but "does this exact growth attempt still
 * overflow, measured" - and does not depend on any caller's memoization
 * discipline for that to be true.
 *
 * jsdom has no ResizeObserver and no real layout, so both are faked: a
 * FakeResizeObserver the test fires by hand (mirroring
 * use-resize-observer.test.tsx's fake) for changes this hook does not cause
 * itself, and per-row heights read live off `data-h` via a `scrollHeight`
 * getter, so the "content" really does grow and shrink as `pageItems`
 * changes shape.
 *
 * `requestAnimationFrame` is faked too, but deliberately *not* synchronously:
 * `settle` can now schedule another frame itself mid-call, and a synchronous
 * rAF would run that nested call before React has flushed the state update
 * that produced it - a "Maximum call stack size exceeded" a real browser
 * never sees, because a real frame always waits for the next paint. The fake
 * queues callbacks and only runs the ones due *right now* per `flushFrame`
 * call, exactly like one real frame does.
 *
 * Two tiers, each earning its keep for a different reason - not for the same
 * one twice:
 *
 *   - The named `it`s below pin the actual incident and every defect a
 *     review found in a fix along the way, at their exact real numbers (a
 *     200px box against 100+150, a same-length item swap, a box that grows,
 *     a nonzero page, an unmemoized item array, a badge-sized row). They are
 *     what a future reader checks against "is this the bug that happened,"
 *     and what a stack trace against a regression points back to.
 *   - The `fast-check` property block further down asks the question those
 *     named cases cannot: does convergence hold for row-height combinations
 *     nobody picked by hand? The oscillation's root cause is that *some*
 *     short-then-tall combination defeats an average-based guess - fixing
 *     the one combination that happened to ship (a card with a badge and a
 *     wrapped hint) and calling it done is exactly the kind of fix that
 *     leaves the next combination for the next screenshot. Only a property
 *     over the whole shape generalizes past the instance.
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
  /**
   * Rebuild `items` fresh every render instead of memoizing it - mirrors
   * `PromptPanel` (`evidenceRowsOf(blocks)`, called unmemoized in its render
   * body). The hook's ceiling must not care: it is keyed on measured DOM
   * numbers, not on `items`' identity, precisely so a caller with this shape
   * is not silently unprotected.
   */
  unmemoizedItems?: boolean
  /**
   * An extra row whose height comes from outside the paged array entirely -
   * stands in for something like `activity-picker-step.tsx`'s count badge,
   * which changes a card's rendered height (by changing what wraps) without
   * touching `visible` or the current page at all.
   */
  extra?: number
  /**
   * Pass `getItemKey` through to `useFittedPage`, keyed on each item's own
   * value (`items` here are the identity indices `heights.map((_, i) => i)`,
   * so the value doubles as a stable per-item key) - lets a test simulate a
   * caller like `ConfigureStep` that rebuilds the whole array to mutate one
   * item in place, without losing per-item identity across that rebuild.
   */
  getItemKey?: boolean
  /**
   * Explicit per-position keys, overriding `getItemKey`'s numeric default -
   * lets a test control exactly how a key sequence changes across a rerender
   * (e.g. two different sequences that would collide if joined into a
   * string), rather than being tied to each item's own value.
   */
  keys?: ReadonlyArray<string>
}

/**
 * Wires real `clientHeight` / `scrollHeight` readings to plain numbers a test
 * can control: the viewport's height is fixed at `available`, and the
 * content's height is the live sum of whichever rows `pageItems` currently
 * holds (plus `extra`, if given) - so paging really does change what the
 * hook measures, the same way a real card mounting or unmounting does.
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
}: HarnessProps): React.JSX.Element => {
  const memoized = useMemo(() => heights.map((_, index) => index), [heights])
  const items = unmemoizedItems ? heights.map((_, index) => index) : memoized
  const { viewportRef, contentRef, pageItems, perPage, page, next } =
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

type SettleResult = {
  /** Every value read after a frame that actually ran a callback. */
  readings: Array<number>
  /**
   * True the moment a `flushFrame` finds nothing pending - i.e. the previous
   * frame's `settle` decided there was nothing left to change and did not
   * schedule another. False means `maxFrames` ran out while a frame was
   * still being scheduled every time, which is exactly the shape an
   * unbounded oscillation has and never resolves to `true` on its own.
   */
  converged: boolean
}

/**
 * Advances real frames one at a time until a frame is due that finds
 * nothing pending, or `maxFrames` is spent - whichever comes first.
 */
function settleAndReadPerPage(maxFrames: number): SettleResult {
  const readings: Array<number> = []
  for (let frame = 0; frame < maxFrames; frame += 1) {
    let advanced: boolean = false
    act(() => {
      advanced = flushFrame()
    })
    // Genuinely reassigned above (confirmed: `tsc --noEmit` is clean, and
    // deliberately oscillating fixture data in the tests below exercises
    // both branches) - the linter's control-flow analysis just cannot see
    // through `act`'s opaque callback to know the assignment inside it runs
    // before this line, so it narrows `advanced` to its initializer's
    // literal `false` and reads the check as always true.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!advanced) return { readings, converged: true }
    readings.push(readPerPage())
  }
  return { readings, converged: false }
}

describe("useFittedPage: convergence with non-uniform row heights", () => {
  it("settles on one row rather than oscillating between one and two forever", () => {
    // Row 0 alone (100px) leaves 100px of the 200px box unaccounted for -
    // enough, by row 0's own average, to look like room for another 100px
    // row. Row 1 is 150px: together they are 250px, over the 200px box.
    render(<Harness heights={[100, 150, 100, 100]} available={200} />)

    const { readings, converged } = settleAndReadPerPage(30)

    expect(
      converged,
      `never reached a fixed point within the frame budget: ${JSON.stringify(readings)}. ` +
        `A page that never stops re-proposing a count it already measured as ` +
        `too tall is a live render loop, not "still converging".`
    ).toBe(true)
    expect(readings[readings.length - 1]).toBe(1)
  })

  it("still fits comfortably when every row is short relative to the box", () => {
    render(<Harness heights={[50, 50, 50, 50]} available={200} />)

    const { readings, converged } = settleAndReadPerPage(30)

    expect(converged).toBe(true)
    // 4 * 50 = 200 <= 200: all four genuinely fit in one page.
    expect(readings[readings.length - 1]).toBe(4)
  })

  it("reaches multi-step growth on its own schedule, with no resize notification ever firing", () => {
    // Five equal rows needs four separate growth steps (1 -> 2 -> 3 -> 4 ->
    // 5) to reach the true fit. The FakeResizeObserver above is never
    // fired anywhere in this test - if a step's own re-render happened not
    // to change `content`'s measured height (the case a review caught: a
    // grid column filling in beside an equally tall neighbor), and `settle`
    // relied on the observer alone to notice, convergence would stall
    // wherever that first happened instead of reaching 5.
    render(<Harness heights={[40, 40, 40, 40, 40]} available={250} />)

    const { readings, converged } = settleAndReadPerPage(30)

    expect(converged).toBe(true)
    expect(readings[readings.length - 1]).toBe(5)
  })

  it("re-measures rather than staying capped once the box actually grows", () => {
    // Same shape as the oscillation case - it settles on 1 at available=200 -
    // but the box is then given enough room for both rows, and growth has to
    // be reachable again rather than permanently capped by the earlier
    // rejection.
    const heights = [100, 150]
    const { rerender } = render(<Harness heights={heights} available={200} />)
    const before = settleAndReadPerPage(20)
    expect(before.converged).toBe(true)
    expect(before.readings[before.readings.length - 1]).toBe(1)

    rerender(<Harness heights={heights} available={300} />)
    act(() => {
      FakeResizeObserver.instances[0]!.fire()
    })
    const after = settleAndReadPerPage(20)

    expect(after.converged).toBe(true)
    expect(after.readings[after.readings.length - 1]).toBe(2)
  })

  it("does not let a stale ceiling survive a same-length item swap with shorter content", () => {
    // A search replacing the catalogue with a different, same-length result
    // set: `items.length` is unchanged (so the effect that would otherwise
    // reset everything never reruns), but the actual rows are shorter. The
    // rejection learned from the first set must not keep blocking growth for
    // the second.
    //
    // Deliberately *not* firing the fake ResizeObserver after the swap - a
    // real browser gives no such notification here (nothing about the box's
    // own size changed), and a review caught an earlier version of this test
    // masking exactly that by firing it manually anyway. `settleAndReadPerPage`
    // alone has to be enough, driven by the hook noticing the item array
    // itself changed.
    const { rerender } = render(
      <Harness heights={[100, 150]} available={200} />
    )
    const before = settleAndReadPerPage(20)
    expect(before.converged).toBe(true)
    expect(before.readings[before.readings.length - 1]).toBe(1)

    rerender(<Harness heights={[60, 60]} available={200} />)
    const after = settleAndReadPerPage(20)

    expect(
      after.converged,
      `never reached a fixed point after the swap: ${JSON.stringify(after.readings)}.`
    ).toBe(true)
    expect(
      after.readings[after.readings.length - 1],
      "60 + 60 = 120 <= 200 fits, but a ceiling learned from the taller " +
        "[100, 150] set would wrongly cap this at 1 if it were not " +
        "invalidated by the item-array swap."
    ).toBe(2)
  })

  it("does not grow past what keeps a nonzero page's own index valid", () => {
    // A review caught this precisely: two items settle at one per page
    // (100 + 150 = 250 > 200), and the same-length swap above is exactly
    // what earns a retry - but from page 1 (viewing the second of only two
    // items), growing to two-per-page would collapse `pageCount` to 1,
    // which cannot hold a page index of 1. `used` was measured for the
    // one-item slice page 1 already held; growing changes *which* slice
    // page 1 is (`start = safePage * perPage`), and here it stops being a
    // page at all. That is the "Next flashes and lands back on page 1" -
    // sorry, page 0 - defect this hook exists to prevent, reached through a
    // same-length swap instead of a partial last page.
    const { rerender } = render(
      <Harness heights={[100, 150]} available={200} />
    )
    const before = settleAndReadPerPage(20)
    expect(before.converged).toBe(true)
    expect(before.readings[before.readings.length - 1]).toBe(1)

    act(() => {
      screen.getByTestId("next-page").click()
    })
    expect(screen.getByTestId("page").textContent).toBe("1")

    // Same shape as the swap test above (a same-length replacement with
    // shorter content, which earns a retry) - but now viewed from page 1.
    rerender(<Harness heights={[60, 60]} available={200} />)
    const after = settleAndReadPerPage(20)

    expect(
      after.converged,
      `never reached a fixed point after the swap on a nonzero page: ${JSON.stringify(after.readings)}.`
    ).toBe(true)
    expect(
      readPerPage(),
      "growing to 2 makes pageCount 1, which cannot hold page index 1 - " +
        "the retry a genuine content swap earns must not be allowed to " +
        "invalidate the page it is being viewed from."
    ).toBe(1)
    expect(
      screen.getByTestId("page").textContent,
      "the page index must not be silently invalidated by a growth attempt"
    ).toBe("1")
  })

  it("does not silently reshuffle a nonzero page's content when growth keeps its index valid", () => {
    // The subtler sibling of the test above, found by checking whether a
    // page-count guard alone actually closes the gap it was written for -
    // it doesn't. Five items settle at two per page (a third overflows),
    // landing on page 1 (items 2 and 3, a genuinely full page: page 0 holds
    // items 0-1, page 2 holds item 4 alone). A same-length swap earns the
    // retry from there; growing to three per page keeps page 1 *valid*
    // (pageCount becomes 2, and 1 is still in range) - so a check that only
    // asks "does this page index still exist" says yes and allows it. But
    // the slice at page 1, size 3, is items 3 and 4 - not items 2 and 3 -
    // because `start = safePage * perPage` moved out from under it. The
    // reader's page index stays "1" throughout, silently showing different
    // content instead of visibly bouncing to page 0: no less wrong for
    // being quieter.
    const { rerender } = render(
      <Harness heights={[10, 10, 90, 10, 10]} available={100} />
    )
    const before = settleAndReadPerPage(20)
    expect(before.converged).toBe(true)
    expect(before.readings[before.readings.length - 1]).toBe(2)

    act(() => {
      screen.getByTestId("next-page").click()
    })
    expect(screen.getByTestId("page").textContent).toBe("1")

    // A same-length swap, small enough that three items would comfortably
    // fit if growth were ever evidenced by the page it will actually land
    // on rather than the one already on screen.
    rerender(<Harness heights={[10, 10, 10, 10, 10]} available={100} />)
    const after = settleAndReadPerPage(20)

    expect(
      after.converged,
      `never reached a fixed point after the swap: ${JSON.stringify(after.readings)}.`
    ).toBe(true)
    expect(
      screen.getByTestId("page").textContent,
      "the page index is a red herring here - it stays valid throughout, " +
        "which is exactly how this defect hides from a check that only " +
        "asks whether the index is still in range"
    ).toBe("1")

    const shownIndices = Array.from(
      document.querySelectorAll<HTMLElement>("[data-idx]")
    ).map((el) => el.dataset.idx)
    expect(
      shownIndices,
      "growth substituted items 3-4 for items 2-3 at the same page index " +
        "(perPage grew to 3, moving start = 1 * 3 = 3) - the reader's page " +
        "number never moved, but what it shows did, and item 2 vanished " +
        "from view entirely without ever being paged past."
    ).toEqual(["2", "3"])
  })

  it("retries growth when a same-length swap changes only the hidden candidate", () => {
    // A review caught this precisely: the swap above ([100, 150] -> [60, 60])
    // happens to also change the *shown* row (100 -> 60), so the ceiling's
    // own baseline naturally differs without needing anything extra. This
    // uses [100, 150] -> [100, 50] instead - row 0, the one actually shown at
    // perPage 1, is untouched, so the measured baseline the ceiling compares
    // against is identical before and after. Only the hidden candidate (row
    // 1) got shorter, and nothing about a measured baseline can see that
    // until it is actually tried.
    const { rerender } = render(
      <Harness heights={[100, 150]} available={200} />
    )
    const before = settleAndReadPerPage(20)
    expect(before.converged).toBe(true)
    expect(
      before.readings[before.readings.length - 1],
      "expected the 2-row attempt (100 + 150 = 250 > 200) to be tried and " +
        "rejected before settling back to 1, so the ceiling this test is " +
        "about actually gets set"
    ).toBe(1)

    rerender(<Harness heights={[100, 50]} available={200} />)
    const after = settleAndReadPerPage(20)

    expect(
      after.converged,
      `never reached a fixed point after the hidden candidate shrank: ${JSON.stringify(after.readings)}.`
    ).toBe(true)
    expect(
      after.readings[after.readings.length - 1],
      "100 + 50 = 150 <= 200 fits both rows now, but a ceiling that only " +
        "compares the measured baseline (identical before and after - row 0 " +
        "never changed) would never re-try the now-shorter row 1."
    ).toBe(2)
  })

  it("does not grant a retry when a same-length rebuild keeps the same item keys", () => {
    // Stands in for `ConfigureStep`'s `handleFieldChange`: editing one field
    // rebuilds the whole array via `.map()` even though the set of
    // instances, their order, and every card's rendered height are all
    // unchanged - the same *shape* of update as the same-length swap above,
    // but not the same *event*. `getItemKey` is how the hook is meant to
    // tell them apart; without it, this would read exactly like that swap
    // and hand back a retry mid-edit, regrowing `perPage` past a count
    // already measured too tall and reshuffling which card is on screen.
    const heights = [100, 150]
    const { rerender } = render(
      <Harness heights={heights} available={200} getItemKey />
    )
    const before = settleAndReadPerPage(20)
    expect(before.converged).toBe(true)
    expect(before.readings[before.readings.length - 1]).toBe(1)

    // A fresh `heights` reference, same values, same order - the shape a
    // `.map()` over one edited field produces for every *other* item.
    rerender(<Harness heights={[...heights]} available={200} getItemKey />)
    const after = settleAndReadPerPage(20)

    expect(
      after.converged,
      `never reached a fixed point after the value-only rebuild: ${JSON.stringify(after.readings)}.`
    ).toBe(true)
    // Checking only the *final* value here would pass whether or not this
    // fix works: 100 + 150 = 250 always overflows a 200px box, so an
    // erroneous regrant that regrows to 2 gets caught and corrected back to
    // 1 on the very next frame regardless. `readPerPage()` after settling
    // cannot tell "never regrew" from "regrew and recovered" - only the
    // frame-by-frame trace can, which is what actually distinguishes this
    // test from passing on the exact bug it was written to catch (confirmed
    // by running it against `getItemKey` wired to a no-op: it stayed green).
    expect(
      after.readings,
      "a rebuild that keeps the same item keys regrew perPage to 2 before " +
        "settling back to 1 - the transient itself is the defect (it slides " +
        "a different card under the one being edited), and it is invisible " +
        "to a check on the converged value alone."
    ).not.toContain(2)
    expect(readPerPage()).toBe(1)
  })

  it("treats a per-position key change as a swap even when the joined strings would collide", () => {
    // A review caught this: joining keys with "|" is not injective -
    // ["a|b", "c"] and ["a", "b|c"] join to the identical "a|b|c" even
    // though every position's own key changed. A signature built that way
    // would read this as "nothing changed" and withhold the retry a genuine
    // swap earns.
    const { rerender } = render(
      <Harness heights={[100, 150]} available={200} keys={["a|b", "c"]} />
    )
    const before = settleAndReadPerPage(20)
    expect(before.converged).toBe(true)
    expect(before.readings[before.readings.length - 1]).toBe(1)

    rerender(<Harness heights={[60, 60]} available={200} keys={["a", "b|c"]} />)
    const after = settleAndReadPerPage(20)

    expect(
      after.converged,
      `never reached a fixed point after the colliding-signature swap: ${JSON.stringify(after.readings)}.`
    ).toBe(true)
    expect(
      readPerPage(),
      "60 + 60 = 120 <= 200 fits, but a joined-string signature identical " +
        'before and after ("a|b|c" both times) would wrongly withhold the ' +
        "retry this same-length swap earns and leave the floor learned from " +
        "the taller [100, 150] set in place."
    ).toBe(2)
  })

  it("does not let a rejection on a nonzero page reintroduce the oscillation", () => {
    // A review caught this precisely: `start = safePage * perPage`, so on a
    // page other than the first, a rejection that shrinks `perPage` changes
    // `start` as a pure side effect of the formula - even though the logical
    // page never moved - and a ceiling keyed on that offset reads as "the
    // content changed" and discards itself the instant it was set. Page 0
    // above (heights 100/150) at minPerPage 1 shrinks straight to 1 and never
    // exercises this, since `start` is 0 on every page there regardless of
    // `perPage`. This needs page 1 or later to matter at all.
    //
    // maxPerPage: 2 keeps page 0 uneventful (it settles at the cap, having
    // rejected nothing) so the *first* rejection anywhere happens on page 1,
    // where 100 + 150 = 250 overflows the 200px box.
    render(
      <Harness
        heights={[50, 50, 100, 150]}
        available={200}
        minPerPage={1}
        maxPerPage={2}
      />
    )
    const onPageZero = settleAndReadPerPage(20)
    expect(onPageZero.converged).toBe(true)
    expect(onPageZero.readings[onPageZero.readings.length - 1]).toBe(2)

    act(() => {
      screen.getByTestId("next-page").click()
    })
    expect(screen.getByTestId("page").textContent).toBe("1")

    const onPageOne = settleAndReadPerPage(20)

    expect(
      onPageOne.converged,
      `never reached a fixed point on page 1: ${JSON.stringify(onPageOne.readings)}. ` +
        `A ceiling keyed on the slice offset rather than the page index would ` +
        `discard itself the moment the rejection below shrank perPage, and ` +
        `regrow straight back into the same 100 + 150 = 250px overflow forever.`
    ).toBe(true)
    expect(onPageOne.readings[onPageOne.readings.length - 1]).toBe(1)
  })

  it("converges even when the caller rebuilds its item array every render", () => {
    // A review caught this against a real, already-shipped consumer:
    // `PromptPanel` calls `evidenceRowsOf(blocks)` straight in its render
    // body, unmemoized. Keying the ceiling on `items`' identity (as an
    // earlier version of this fix did, to invalidate it on a genuine content
    // swap) reads that as "different content" on every single settle-driven
    // re-render and never lets the ceiling stick at all - reproducing the
    // exact oscillation this file opened with, permanently, for that
    // consumer. The ceiling has to hold using only measured DOM numbers,
    // which do not care whether `items` is the same reference twice.
    render(
      <Harness heights={[100, 150, 100, 100]} available={200} unmemoizedItems />
    )

    const { readings, converged } = settleAndReadPerPage(30)

    expect(
      converged,
      `never reached a fixed point with an unmemoized item array: ${JSON.stringify(readings)}.`
    ).toBe(true)
    expect(readings[readings.length - 1]).toBe(1)
  })

  it("retries growth once externally-driven content shrinks, with items and page unchanged", () => {
    // Stands in for activity-picker-step.tsx's count badge: `visible` (the
    // paged array) and the page both stay exactly the same, but a badge
    // disappearing un-wraps a row and the box's real content genuinely gets
    // shorter. A ceiling keyed on items/page (an earlier version of this fix)
    // sees nothing it tracks change and stays wrongly capped forever; one
    // keyed on the measured height sees a smaller number and retries.
    //
    // `heights` is hoisted to one stable reference used in both renders -
    // otherwise a fresh array literal on the `rerender` call would make
    // `items` a new reference too, and this would end up re-testing the
    // *previous* finding (an items-identity change) instead of isolating
    // this one (no items or page change at all, only the extra row).
    const heights = [40, 105]
    const { rerender } = render(
      <Harness heights={heights} available={150} extra={10} />
    )
    // Row 0 (40) + the "badge" (10) = 50, comfortably under 150: growth to
    // both rows is attempted. Row 0 + row 1 + the badge = 40 + 105 + 10 =
    // 155 > 150: that attempt overflows, and gets rejected - a real ceiling,
    // set from a real measurement, exactly as it would be without `extra`
    // involved at all.
    const before = settleAndReadPerPage(20)
    expect(before.converged).toBe(true)
    expect(
      before.readings[before.readings.length - 1],
      "expected the 2-row attempt to be tried and rejected before settling " +
        "back to 1, so the ceiling this test is about actually gets set"
    ).toBe(1)

    // The "badge" goes away: 40 + 105 + 0 = 145 <= 150 now fits, with
    // `heights` (hence `items`) and the page both exactly as they were.
    rerender(<Harness heights={heights} available={150} extra={0} />)
    act(() => {
      FakeResizeObserver.instances[0]!.fire()
    })
    const after = settleAndReadPerPage(20)

    expect(
      after.converged,
      `never reached a fixed point after the external content shrank: ${JSON.stringify(after.readings)}.`
    ).toBe(true)
    expect(
      after.readings[after.readings.length - 1],
      "40 + 105 = 145 <= 150 fits both rows now that the badge is gone, but " +
        "a ceiling keyed on items/page would see nothing it tracks change " +
        "and wrongly keep this capped at 1."
    ).toBe(2)
  })

  it("never drops below minPerPage even when that count cannot fit", () => {
    render(<Harness heights={[100, 150]} available={200} minPerPage={2} />)

    const { readings, converged } = settleAndReadPerPage(30)

    // minPerPage: 2 forces an unfittable page rather than oscillating -
    // that floor is a deliberate, documented tradeoff (see the Options doc
    // comment), and it must still settle on a *stable* 2, not a
    // 2-vs-something-else flicker.
    expect(converged).toBe(true)
    expect(readings[readings.length - 1]).toBe(2)
  })

  it("does not read a partial last page's spare space as room for one more per page", () => {
    // The composer's picker, to scale: four activities, three fit the box.
    // Page 1 then holds a single card in a box sized for three, so two
    // cards' worth of space is empty - for the sole reason that the list ran
    // out. Reading that as "room for a fourth per page" grew `perPage` to 4,
    // which collapsed `pageCount` to 1, which clamped the page index back to
    // 0: pressing Next flashed the last page and then landed back on the
    // first one. The button looked dead and the flash looked like a bug in
    // the pager, and neither was where the defect was.
    render(<Harness heights={[100, 100, 100, 60]} available={320} />)

    const onPageZero = settleAndReadPerPage(20)
    expect(onPageZero.converged).toBe(true)
    expect(onPageZero.readings[onPageZero.readings.length - 1]).toBe(3)

    act(() => {
      screen.getByTestId("next-page").click()
    })

    const onPageOne = settleAndReadPerPage(20)

    expect(onPageOne.converged).toBe(true)
    expect(
      screen.getByTestId("page").textContent,
      "growth driven by a partial page collapses pageCount to 1 and clamps " +
        "the index straight back to 0 - the 'Next does nothing' report."
    ).toBe("1")
    expect(readPerPage()).toBe(3)
  })

  it("probes for the fit rather than trusting an average row height", () => {
    // 100 + 40 = 140 fits the 150px box, but the average row height after
    // the first row alone is 100 and the room left is 50, so an estimate
    // says no and the page stays at one row forever. Rows are not uniform
    // and the grid they sit in is not necessarily one column - in a
    // `sm:grid-cols-2` catalogue the next card frequently costs no extra
    // height at all, because it joins the row already on screen - so the
    // estimate is not merely imprecise, it is answering a question about a
    // layout the caller may not have. Trying is what settles it; the floor
    // learned from a rejection is what stops trying from repeating itself.
    render(<Harness heights={[100, 40, 40]} available={150} />)

    const { readings, converged } = settleAndReadPerPage(30)

    expect(converged).toBe(true)
    expect(readings[readings.length - 1]).toBe(2)
  })

  it("does not re-propose on a later page a count an earlier page rejected", () => {
    // `perPage` is one number governing every page, so a count that
    // overflowed page 0 is wrong for the list, not wrong for page 0. Page 1
    // here holds two short rows with room to spare, and would happily grow
    // back into the 100 + 150 = 250px overflow page 0 just rejected if the
    // rejection were remembered per-page rather than per-list.
    render(<Harness heights={[100, 150, 20, 20, 20, 20]} available={200} />)

    const onPageZero = settleAndReadPerPage(20)
    expect(onPageZero.converged).toBe(true)
    expect(onPageZero.readings[onPageZero.readings.length - 1]).toBe(1)

    act(() => {
      screen.getByTestId("next-page").click()
    })

    const onPageOne = settleAndReadPerPage(20)

    expect(onPageOne.converged).toBe(true)
    expect(readPerPage()).toBe(1)
    expect(screen.getByTestId("page").textContent).toBe("1")
  })
})

describe("useFittedPage: convergence holds for the whole family, not the one incident", () => {
  // Bounded generously above the largest input this generates (8 rows) so a
  // genuine non-convergence fails loudly rather than by exhausting the
  // budget and reading as "close enough."
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
          const readings: Array<number> = []
          let converged = false
          for (let frame = 0; frame < MAX_FRAMES; frame += 1) {
            let advanced: boolean = false
            act(() => {
              advanced = flushFrame()
            })
            // See `settleAndReadPerPage`'s identical pattern for why this is
            // a linter limitation (confirmed clean under `tsc --noEmit`),
            // not an actually-unnecessary check.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (!advanced) {
              converged = true
              break
            }
            readings.push(readPerPageHere())
          }

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

          // The hook's own documented contract (see the Options doc comment
          // on `minPerPage`): every fixed point either genuinely fits, or is
          // pinned at the floor because nothing smaller was allowed. Anything
          // else is a fixed point that should not have been possible to land
          // on - room left over that was never grown into, or an overflow
          // that was never given back.
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
