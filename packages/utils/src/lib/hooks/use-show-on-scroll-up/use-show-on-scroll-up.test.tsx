// @vitest-environment jsdom
import { useRef } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useShowOnScrollUp } from "./use-show-on-scroll-up"

afterEach(cleanup)

const Harness = ({ resetKey }: { resetKey: string }): React.JSX.Element => {
  const scope = useRef<HTMLDivElement | null>(null)
  const shown = useShowOnScrollUp(scope, resetKey)
  return (
    <div ref={scope}>
      <div data-testid="scroller" />
      <output data-testid="shown">{String(shown)}</output>
    </div>
  )
}

/** `scrollTop` and the box's range, set the way a laid-out browser would. */
function scrollTo(top: number, range = 800): void {
  const scroller = screen.getByTestId("scroller")
  Object.defineProperty(scroller, "scrollTop", {
    configurable: true,
    value: top,
  })
  Object.defineProperty(scroller, "clientHeight", {
    configurable: true,
    value: 300,
  })
  Object.defineProperty(scroller, "scrollHeight", {
    configurable: true,
    value: 300 + range,
  })
  fireEvent.scroll(scroller)
}

const shown = (): string => screen.getByTestId("shown").textContent

describe("useShowOnScrollUp", () => {
  it("hides on the way down and returns on the way up", () => {
    render(<Harness resetKey="a" />)
    expect(shown()).toBe("true")

    scrollTo(120)
    expect(shown()).toBe("false")
    scrollTo(60)
    expect(shown()).toBe("true")
  })

  it("comes back at the top of the box", () => {
    render(<Harness resetKey="a" />)
    scrollTo(200)
    expect(shown()).toBe("false")

    scrollTo(0)
    expect(shown()).toBe("true")
  })

  it("does not read a jitter as a direction", () => {
    render(<Harness resetKey="a" />)
    scrollTo(100)
    expect(shown()).toBe("false")

    scrollTo(96)
    expect(shown()).toBe("false")
  })

  it("comes back when the pane changes", () => {
    const { rerender } = render(<Harness resetKey="a" />)
    scrollTo(200)
    expect(shown()).toBe("false")

    rerender(<Harness resetKey="b" />)
    expect(shown()).toBe("true")
  })

  it("is not driven by a box with barely anything to scroll", () => {
    // Hiding the bar would give this box the height it lacks: it would stop
    // scrolling, `scrollTop` would clamp to 0, and the bar would come back.
    render(<Harness resetKey="a" />)

    scrollTo(40, 60)
    expect(shown()).toBe("true")
    scrollTo(60, 60)
    expect(shown()).toBe("true")
  })

  it("still lets a box with little to scroll bring the bar back", () => {
    render(<Harness resetKey="a" />)
    scrollTo(300)
    expect(shown()).toBe("false")

    // A different, shorter box scrolling up.
    scrollTo(200, 60)
    expect(shown()).toBe("true")
  })
})
