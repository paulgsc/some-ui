/**
 * @vitest-environment jsdom
 *
 * The dashboard shell must never let the *page* scroll sideways.
 *
 * `SidebarInset` is the flex child of `SidebarProvider`'s row, and a flex
 * item's default `min-width: auto` won't shrink below its content: without
 * `min-w-0`, one un-shrinkable descendant scrolls the whole document
 * (`fits-the-box/no-unshrinkable-flex-child`, `docs/ui-fit`). jsdom has no
 * layout, so this asserts the class, not the geometry.
 */

import type { JSX } from "react"
import { SidebarInset, SidebarProvider } from "@some-ui/shared"
import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

beforeEach(() => {
  // `SidebarProvider` reads `useIsMobile`, and jsdom implements no matchMedia.
  const matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    addListener: (): void => {},
    removeListener: (): void => {},
    dispatchEvent: (): boolean => false,
  })
  vi.stubGlobal("matchMedia", matchMedia)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const mount = (): JSX.Element | null => {
  render(
    <SidebarProvider>
      <SidebarInset>
        <p>content</p>
      </SidebarInset>
    </SidebarProvider>
  )
  return null
}

describe("the dashboard shell's flexible column", () => {
  it("can shrink below its content, so the page never scrolls sideways", () => {
    mount()
    const main = document.querySelector("main")

    expect(main).not.toBeNull()
    expect(main?.className).toContain("min-w-0")
    // Both halves matter: `min-w-0` is only meaningful on a flex item, and
    // `flex-1` is only safe with it.
    expect(main?.className).toContain("flex-1")
  })
})
