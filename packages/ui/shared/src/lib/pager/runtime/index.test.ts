/**
 * The pager's runtime over a real deck node's touches (GES5): what it reads
 * at each touch (a surface that claims the pointer, the card's scroller), the
 * click it swallows, and what it leaves on the node once detached. jsdom's
 * touches prove the wiring, not a phone's (CK7, #2386); `step`'s family is
 * `../index.test.ts`'s.
 */
import { fireEvent } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CLAIMS_POINTER, claimsAxis, createPager, edgeOf } from "."
import type { Turn } from "../"

const touch = (x: number): { touches: Array<Partial<Touch>> } => ({
  touches: [{ clientX: x, clientY: 100, identifier: 0 }],
})

function swipe(on: Element, dx: number): void {
  fireEvent.touchStart(on, touch(200))
  fireEvent.touchMove(on, touch(200 + dx / 2))
  fireEvent.touchMove(on, touch(200 + dx))
  fireEvent.touchEnd(on, { touches: [] })
}

function mount(): {
  node: HTMLElement
  pages: Array<Turn>
  detach: () => void
} {
  const node = document.createElement("div")
  node.innerHTML = `<button type="button">Say it</button><div ${CLAIMS_POINTER}="both"><span>drag me</span></div>`
  document.body.append(node)
  const pages: Array<Turn> = []
  const pager = createPager({
    deck: () => ({
      orientation: "horizontal",
      canPrev: true,
      canNext: true,
      held: false,
    }),
    page: (to) => pages.push(to),
  })
  const detach = pager.attach(node, "horizontal")
  return { node, pages, detach }
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("the pager's runtime (GES5)", () => {
  it("turns the card on a sideways swipe, either way", () => {
    const { node, pages } = mount()
    swipe(node, -90)
    swipe(node, 90)
    expect(pages).toEqual(["next", "prev"])
  })

  it("marks the deck as claiming its axis and lets the page scroll across it", () => {
    const { node, detach } = mount()
    expect(node.getAttribute(CLAIMS_POINTER)).toBe("x")
    expect(node.style.touchAction).toBe("pan-y")
    detach()
    expect(node.hasAttribute(CLAIMS_POINTER)).toBe(false)
    expect(node.style.touchAction).not.toBe("pan-y")
  })

  it("leaves a touch on a surface that claims the pointer to that surface", () => {
    const { node, pages } = mount()
    const dragged = node.querySelector("span")
    if (dragged === null) throw new Error("no drag surface")
    swipe(dragged, -90)
    expect(pages).toEqual([])
  })

  it("swallows the click a swipe on a button ends in, and the next tap is a tap", () => {
    const { node, pages } = mount()
    const button = node.querySelector("button")
    if (button === null) throw new Error("no button")
    const tapped = vi.fn()
    button.addEventListener("click", tapped)
    swipe(button, -90)
    fireEvent.click(button)
    expect(pages).toEqual(["next"])
    expect(tapped).not.toHaveBeenCalled()
    fireEvent.touchStart(button, touch(200))
    fireEvent.touchEnd(button, { touches: [] })
    fireEvent.click(button)
    expect(tapped).toHaveBeenCalledTimes(1)
  })

  it("hears nothing once detached", () => {
    const { node, pages, detach } = mount()
    detach()
    swipe(node, -90)
    expect(pages).toEqual([])
  })
})

describe("what the runtime reads under the finger", () => {
  it("finds a claim between the finger and the deck, and none past it", () => {
    const deck = document.createElement("div")
    deck.setAttribute(CLAIMS_POINTER, "x")
    deck.innerHTML = `<div ${CLAIMS_POINTER}="y"><b></b></div><i></i>`
    document.body.append(deck)
    const inner = deck.querySelector("b")
    const plain = deck.querySelector("i")
    expect(claimsAxis(inner, "y", deck)).toBe(true)
    expect(claimsAxis(inner, "x", deck)).toBe(false)
    // The deck's own claim is the deck's, not a surface inside it.
    expect(claimsAxis(plain, "x", deck)).toBe(false)
    // Up to the document, the deck's claim counts.
    expect(claimsAxis(plain, "x")).toBe(true)
  })

  it("reads where an overflowing scroller stands, and both ends for none", () => {
    const deck = document.createElement("div")
    const card = document.createElement("div")
    deck.append(card)
    document.body.append(deck)
    expect(edgeOf(card, deck, "y")).toEqual({ start: true, end: true })
    Object.defineProperties(card, {
      scrollHeight: { value: 900 },
      clientHeight: { value: 300 },
    })
    expect(edgeOf(card, deck, "y")).toEqual({ start: true, end: false })
    card.scrollTop = 600
    expect(edgeOf(card, deck, "y")).toEqual({ start: false, end: true })
  })
})
