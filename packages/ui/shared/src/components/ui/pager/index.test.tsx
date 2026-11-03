/**
 * `usePager` on a rendered deck (GES5): it attaches to the node its
 * `attach` lands on, fills a measuring hook's ref with the same node, turns
 * the card as the deck's latest render says, and lets go of the node when it
 * goes. jsdom's touches prove the wiring, not a phone's (CK7, #2386).
 */
import type { JSX, RefObject } from "react"
import { createRef } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { usePager } from "."
import type { Turn } from "../../../lib/pager"

const Deck = ({
  held,
  onPage,
  shareRef,
}: {
  held: boolean
  onPage: (to: Turn) => void
  shareRef: RefObject<HTMLElement | null>
}): JSX.Element => {
  const { attach } = usePager({
    canPrev: false,
    canNext: true,
    held,
    onPage,
    shareRef,
  })
  return (
    <div ref={attach} data-testid="deck">
      card
    </div>
  )
}

function swipe(on: Element, dx: number): void {
  const at = (x: number): { touches: Array<Partial<Touch>> } => ({
    touches: [{ clientX: x, clientY: 100, identifier: 0 }],
  })
  fireEvent.touchStart(on, at(200))
  fireEvent.touchMove(on, at(200 + dx / 2))
  fireEvent.touchMove(on, at(200 + dx))
  fireEvent.touchEnd(on, { touches: [] })
}

describe("usePager (GES5)", () => {
  it("turns the card as the latest render says, and shares its node", () => {
    const onPage = vi.fn()
    const shareRef = createRef<HTMLElement>()
    const props = { onPage, shareRef }
    const { rerender, unmount } = render(<Deck {...props} held={false} />)
    const deck = screen.getByTestId("deck")
    expect(shareRef.current).toBe(deck)
    swipe(deck, -90)
    expect(onPage).toHaveBeenCalledWith("next")
    rerender(<Deck {...props} held />)
    swipe(deck, -90)
    expect(onPage).toHaveBeenCalledTimes(1)
    unmount()
    expect(shareRef.current).toBeNull()
  })
})
