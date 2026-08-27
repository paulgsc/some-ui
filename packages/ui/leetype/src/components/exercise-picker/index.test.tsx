import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ExercisePicker } from "."
import type { ExercisePickerItem } from "./types"

/**
 * `useIsMobile` reads `window.matchMedia` through `useSyncExternalStore`.
 * jsdom implements the API but never evaluates the query, so every call
 * comes back `matches: false` unless this replaces it — the same technique
 * `components/leetype/index.test.tsx` uses for the same reason.
 */
function setViewport(mobile: boolean): void {
  const matchMedia = (query: string): MediaQueryList => ({
    matches: mobile,
    media: query,
    onchange: null,
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    addListener: (): void => {},
    removeListener: (): void => {},
    dispatchEvent: (): boolean => false,
  })
  vi.stubGlobal("matchMedia", matchMedia)
}

const ITEMS: ReadonlyArray<ExercisePickerItem> = [
  { id: "a", title: "Exercise A" },
  { id: "b", title: "Exercise B", badge: { tone: "popular", count: 42 } },
  { id: "c", title: "Exercise C", badge: { tone: "starved", count: 0 } },
]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("ExercisePicker", () => {
  it("lists every item's title, on either layout", () => {
    for (const mobile of [false, true]) {
      setViewport(mobile)
      const { unmount } = render(
        <ExercisePicker items={ITEMS} onSelect={() => {}} />
      )
      for (const item of ITEMS) {
        expect(screen.getByText(item.title)).toBeInTheDocument()
      }
      unmount()
    }
  })

  it("calls onSelect with the chosen item's id", () => {
    setViewport(false)
    const onSelect = vi.fn()
    render(<ExercisePicker items={ITEMS} onSelect={onSelect} />)

    fireEvent.click(screen.getByText("Exercise B"))
    expect(onSelect).toHaveBeenCalledWith("b")
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it("renders a badge only for the items the caller supplied one for", () => {
    setViewport(false)
    render(<ExercisePicker items={ITEMS} onSelect={() => {}} />)

    expect(screen.getByText("42")).toBeInTheDocument()
    expect(screen.getByText("0")).toBeInTheDocument()
    // Exercise A carries no badge — nothing to find for it beyond its title.
    const tileA = screen.getByText("Exercise A").closest("button")
    expect(tileA?.textContent).toBe("Exercise A")
  })

  it("switches to the mobile layout's single column under the breakpoint", () => {
    setViewport(true)
    const { container } = render(
      <ExercisePicker items={ITEMS} onSelect={() => {}} />
    )
    expect(
      container.querySelector('[data-scroll-intent="picker-list"]')
    ).toBeInTheDocument()
  })

  it("never mounts the mobile scroll container on the desktop layout", () => {
    setViewport(false)
    const { container } = render(
      <ExercisePicker items={ITEMS} onSelect={() => {}} />
    )
    expect(
      container.querySelector('[data-scroll-intent="picker-list"]')
    ).not.toBeInTheDocument()
  })
})
