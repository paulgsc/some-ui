/**
 * @vitest-environment jsdom
 *
 * The dashboard shell must never let the *page* scroll sideways.
 *
 * This pins a one-class fix whose absence is invisible in code review and
 * catastrophic in layout: `SidebarInset` is the flexible child of
 * `SidebarProvider`'s flex row, and a flex item's default `min-width: auto`
 * refuses to shrink below its content's min-content width. Without `min-w-0`,
 * a single un-shrinkable descendant anywhere in any route grows `<main>` past
 * the viewport and the whole document scrolls horizontally, instead of the
 * offending box handling its own overflow.
 *
 * That is exactly what `fits-the-box/no-unshrinkable-flex-child` exists to
 * catch (#899, `docs/ui-fit`) — the rule had simply never been pointed at this
 * shared primitive, so every consumer inherited the defect. It surfaced as
 * 499px of `scrollWidth` against a 390px viewport on `/sessions`.
 *
 * jsdom computes no layout, so this asserts the class rather than the
 * geometry; the geometry was verified in Chromium at 390px across `/app`,
 * `/sessions`, `/profile` and `/settings`.
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
